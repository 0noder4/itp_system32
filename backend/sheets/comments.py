"""Sheet cell comments, @mentions, proposed cell changes and in-panel notifications."""
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from companies.models import Company
from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG, User

from .definitions import CATALOG
from .definitions.common import user_display
from .definitions.extras import STAFF_MEAL_FIELDS
from .edit_parts import edit_part_columns
from .form_writes import normalize_form_value
from .models import SheetCellComment, SheetCellDraft, SheetCellValue, SheetCustomColumn, SheetNotification, StaffMeal
from .registry import EDITABLE_SOURCES, KIND_BOOL, ROW_COMPANY, ROW_STAFF, SOURCE_EXTRA, SOURCE_STAFF
from .service import (
    CellChange,
    MODE_COMMIT,
    MODE_EDIT,
    SheetPermissionError,
    SheetValidationError,
    _custom_column_def,
    _displayed_value,
    _opiekun_accounts,
    apply_changes,
    company_queryset,
    delete_cell_drafts,
    staff_field_value,
    visible_columns,
)
from .values import CellValueError, normalize, values_equal

COMMENT_STATUSES = SheetCellComment.STATUS_VALUES
MATRIX_COMMENT_COLUMN = 'care.slot'


def comment_count_key(*, company_id: int | None = None, staff_user_id: int | None = None, column_key: str) -> str:
    if company_id is not None:
        return f'c:{company_id}|{column_key}'
    if staff_user_id is not None:
        return f'u:{staff_user_id}|{column_key}'
    raise ValueError('company_id or staff_user_id required')


def user_can_access_company(user, company_id: int) -> bool:
    if not user.get_staff_roles():
        return False
    for sheet in CATALOG.sheets_for(user):
        for tab in sheet.tabs_for(user):
            if tab.row_source != ROW_COMPANY:
                continue
            if company_queryset(sheet, tab, user).filter(id=company_id).exists():
                return True
    return False


def user_can_access_staff_row(user, staff_user_id: int) -> bool:
    """Same visibility as Obiady Beściaków on the Opiekun sheet."""
    sheet = CATALOG.sheets.get('opiekun')
    if sheet is None or not sheet.accessible_by(user):
        return False
    return staff_user_id in {account.id for account in _opiekun_accounts(sheet, user)}


def _parse_target(company_id, staff_user_id) -> tuple[int | None, int | None]:
    has_company = company_id is not None and company_id != ''
    has_staff = staff_user_id is not None and staff_user_id != ''
    if has_company == has_staff:
        raise SheetValidationError([{'detail': 'Podaj dokładnie jedno: company_id albo staff_user_id.'}])
    if has_company:
        try:
            cid = int(company_id)
        except (TypeError, ValueError) as exc:
            raise SheetValidationError([{'detail': 'company_id musi być liczbą.'}]) from exc
        return cid, None
    try:
        uid = int(staff_user_id)
    except (TypeError, ValueError) as exc:
        raise SheetValidationError([{'detail': 'staff_user_id musi być liczbą.'}]) from exc
    return None, uid


def assert_can_access_target(user, company_id: int | None, staff_user_id: int | None) -> None:
    if company_id is not None:
        if not user_can_access_company(user, company_id):
            raise SheetPermissionError('Brak dostępu do tej firmy.')
        return
    if staff_user_id is not None:
        if not user_can_access_staff_row(user, staff_user_id):
            raise SheetPermissionError('Brak dostępu do tego wiersza.')
        return
    raise SheetPermissionError('Brak celu komentarza.')


def assert_can_see_comment(user, comment: SheetCellComment) -> None:
    assert_can_access_target(user, comment.company_id, comment.staff_user_id)


def _resolve_sheet_tab(user, sheet_key: str, tab_key: str):
    sheet = CATALOG.sheets.get(sheet_key)
    if sheet is None or not sheet.accessible_by(user):
        raise SheetPermissionError('Brak dostępu do arkusza.')
    tab = sheet.tab(tab_key)
    if tab is None or tab not in sheet.tabs_for(user):
        raise SheetValidationError([{'detail': 'Nie znaleziono zakładki.'}])
    return sheet, tab


def _column_on_tab(sheet, tab, user, column_key: str):
    columns = {col.key: col for col in visible_columns(tab, user, sheet_key=sheet.key)}
    col = columns.get(column_key)
    if col is None:
        raise SheetValidationError([{'detail': f'Kolumna {column_key} nie jest dostępna.'}])
    return col


def _part_columns_by_key(column_key: str) -> tuple:
    return edit_part_columns().get(column_key, ())


def column_is_proposable(col) -> bool:
    if col.is_proposable:
        return True
    parts = _part_columns_by_key(col.key)
    return bool(parts) and all(part.is_proposable for part in parts)


def _user_can_commit_sheets(user) -> bool:
    return getattr(user, 'type', None) == 'admin' or user.has_staff_role(STAFF_ROLE_LG, STAFF_ROLE_FR)


def _can_write_column(user, col) -> bool:
    return col.editable_by(user) if col.source in EDITABLE_SOURCES else col.can_commit(user)


def user_can_manage_proposal(
    user,
    comment: SheetCellComment,
    *,
    target_access_verified: bool = False,
) -> bool:
    """True when the user may apply or discard a proposed cell change (ignores status)."""
    if comment.proposed_value is None:
        return False
    if not _user_can_commit_sheets(user):
        return False
    try:
        _sheet, tab = _resolve_sheet_tab(user, comment.sheet_key, comment.tab_key)
        col = _column_on_tab(_sheet, tab, user, comment.column_key)
    except (SheetPermissionError, SheetValidationError):
        return False
    if not column_is_proposable(col):
        return False
    parts = _part_columns_by_key(col.key)
    if parts:
        can_write = all(_can_write_column(user, part) for part in parts)
    else:
        can_write = _can_write_column(user, col)
    if not can_write:
        return False
    if not target_access_verified:
        assert_can_access_target(user, comment.company_id, comment.staff_user_id)
    return True


def user_can_apply_comment(
    user,
    comment: SheetCellComment,
    *,
    target_access_verified: bool = False,
) -> bool:
    if comment.status == SheetCellComment.STATUS_REJECTED:
        return False
    return user_can_manage_proposal(
        user, comment, target_access_verified=target_access_verified,
    )


def serialize_mention(user: User) -> dict:
    return {
        'id': user.id,
        'label': user_display(user),
        'username': user.username,
    }


def serialize_comment(
    comment: SheetCellComment,
    viewer=None,
    *,
    target_access_verified: bool = False,
) -> dict:
    mentions = [serialize_mention(u) for u in comment.mentions.all()]
    payload = {
        'id': comment.id,
        'company_id': comment.company_id,
        'staff_user_id': comment.staff_user_id,
        'column_key': comment.column_key,
        'sheet_key': comment.sheet_key,
        'tab_key': comment.tab_key,
        'body': comment.body,
        'status': comment.status,
        'proposed_value': comment.proposed_value,
        'author': serialize_mention(comment.author) if comment.author_id else None,
        'mentions': mentions,
        'created_at': comment.created_at.isoformat(),
        'updated_at': comment.updated_at.isoformat(),
        'can_apply': False,
        'can_delete': False,
    }
    if viewer is not None:
        is_author = comment.author_id == viewer.id
        is_admin = getattr(viewer, 'type', None) == 'admin'
        can_manage = False
        if comment.proposed_value is not None:
            try:
                can_manage = user_can_manage_proposal(
                    viewer,
                    comment,
                    target_access_verified=target_access_verified,
                )
            except SheetPermissionError:
                can_manage = False
            payload['can_apply'] = (
                can_manage and comment.status != SheetCellComment.STATUS_REJECTED
            )
        payload['can_delete'] = is_author or is_admin or can_manage
    return payload


def comment_deeplink(comment: SheetCellComment) -> str:
    params = [f'tab={comment.tab_key}', f'col={comment.column_key}']
    if comment.company_id:
        params.append(f'company={comment.company_id}')
    else:
        params.append(f'user={comment.staff_user_id}')
    return f'/panel/staff/sheets/{comment.sheet_key}?{"&".join(params)}'


def list_comments(user, *, company_id=None, staff_user_id=None, column_key: str) -> list[dict]:
    company_id, staff_user_id = _parse_target(company_id, staff_user_id)
    if not column_key or len(column_key) > 100:
        raise SheetValidationError([{'detail': 'Podaj column_key.'}])
    assert_can_access_target(user, company_id, staff_user_id)
    qs = (
        SheetCellComment.objects.filter(column_key=column_key)
        .select_related('author', 'company', 'staff_user')
        .prefetch_related('mentions')
        .order_by('created_at', 'id')
    )
    if company_id is not None:
        qs = qs.filter(company_id=company_id, staff_user__isnull=True)
    else:
        qs = qs.filter(staff_user_id=staff_user_id, company__isnull=True)
    return [serialize_comment(c, viewer=user, target_access_verified=True) for c in qs]


def _resolve_mention_users(raw_ids, author) -> list[User]:
    if raw_ids is None:
        return []
    if not isinstance(raw_ids, list):
        raise SheetValidationError([{'detail': 'mentions musi być listą id.'}])
    ids: list[int] = []
    seen: set[int] = set()
    for item in raw_ids:
        try:
            uid = int(item)
        except (TypeError, ValueError) as exc:
            raise SheetValidationError([{'detail': 'mentions musi zawierać liczby.'}]) from exc
        if uid in seen:
            continue
        seen.add(uid)
        ids.append(uid)
    if not ids:
        return []
    users = list(
        User.objects.filter(id__in=ids, is_active=True).filter(Q(type='staff') | Q(type='admin'))
    )
    if len(users) != len(ids):
        raise SheetValidationError([{'detail': 'Niektóre oznaczone osoby nie istnieją.'}])
    # Self-@ is intentional — author can notify themselves.
    return users


def _notify_new_mentions(comment: SheetCellComment, mention_users: list[User], previous_ids: set[int]) -> None:
    for person in mention_users:
        if person.id in previous_ids:
            continue
        SheetNotification.objects.get_or_create(recipient=person, comment=comment)


def _sync_company_draft_from_proposals(
    company_id: int | None,
    column_key: str,
    *,
    fallback_user=None,
    expected_value: Any = ...,
) -> None:
    if company_id is None:
        return
    parts = _part_columns_by_key(column_key)
    latest = (
        SheetCellComment.objects.filter(
            company_id=company_id,
            column_key=column_key,
            status=SheetCellComment.STATUS_PROGRESS,
            proposed_value__isnull=False,
        )
        .order_by('-created_at', '-id')
        .first()
    )
    if latest is not None:
        if parts and isinstance(latest.proposed_value, dict):
            for part in parts:
                if part.key in latest.proposed_value:
                    SheetCellDraft.objects.update_or_create(
                        company_id=company_id,
                        column_key=part.key,
                        defaults={
                            'value': latest.proposed_value[part.key],
                            'updated_by': latest.author or fallback_user,
                        },
                    )
            return
        SheetCellDraft.objects.update_or_create(
            company_id=company_id,
            column_key=column_key,
            defaults={
                'value': latest.proposed_value,
                'updated_by': latest.author or fallback_user,
            },
        )
        return
    if parts:
        for part in parts:
            qs = SheetCellDraft.objects.filter(company_id=company_id, column_key=part.key)
            if isinstance(expected_value, dict):
                if part.key not in expected_value:
                    continue
                draft = qs.first()
                if draft is None or draft.value != expected_value[part.key]:
                    continue
            qs.delete()
        return
    qs = SheetCellDraft.objects.filter(company_id=company_id, column_key=column_key)
    if expected_value is not ...:
        draft = qs.first()
        if draft is None or draft.value != expected_value:
            return
    qs.delete()


def _current_company_db_value(comment: SheetCellComment):
    sheet = CATALOG.sheets.get(comment.sheet_key)
    tab = sheet.tab(comment.tab_key) if sheet else None
    if tab is None:
        return None, None
    col = next((c for c in tab.columns if c.key == comment.column_key), None)
    if col is None:
        custom = SheetCustomColumn.objects.filter(
            sheet_key=comment.sheet_key,
            tab_key=comment.tab_key,
            key=comment.column_key,
        ).first()
        if custom is not None:
            col = _custom_column_def(custom)
    if col is None:
        return None, None
    if col.source == SOURCE_EXTRA:
        cell = SheetCellValue.objects.filter(company_id=comment.company_id, column_key=col.key).first()
        return col, (cell.value if cell else None)
    company = Company.objects.filter(id=comment.company_id).first()
    if company is None:
        return None, None
    cell = SheetCellValue.objects.filter(company_id=comment.company_id, column_key=col.key).first()
    return col, _displayed_value(col, company, cell)


def _restore_company_draft_for_accepted(comment: SheetCellComment, user) -> None:
    if comment.company_id is None or comment.proposed_value is None:
        return
    parts = _part_columns_by_key(comment.column_key)
    if parts and isinstance(comment.proposed_value, dict):
        company = Company.objects.filter(id=comment.company_id).first()
        part_keys = [part.key for part in parts]
        extra_cells = {
            c.column_key: c
            for c in SheetCellValue.objects.filter(company_id=comment.company_id, column_key__in=part_keys)
        }
        for part in parts:
            if part.key not in comment.proposed_value:
                continue
            proposed_part = comment.proposed_value[part.key]
            if part.source == SOURCE_EXTRA:
                cell = extra_cells.get(part.key)
                current_part_db = cell.value if cell else None
            elif company is not None:
                current_part_db = _displayed_value(part, company, extra_cells.get(part.key))
            else:
                current_part_db = None
            if company is not None and values_equal(part, current_part_db, proposed_part):
                continue
            SheetCellDraft.objects.update_or_create(
                company_id=comment.company_id,
                column_key=part.key,
                defaults={
                    'value': proposed_part,
                    'updated_by': comment.author or user,
                },
            )
        return
    col, current_db = _current_company_db_value(comment)
    if col is not None and values_equal(col, current_db, comment.proposed_value):
        return
    SheetCellDraft.objects.update_or_create(
        company_id=comment.company_id,
        column_key=comment.column_key,
        defaults={
            'value': comment.proposed_value,
            'updated_by': comment.author or user,
        },
    )


def create_comment(user, data: dict) -> dict:
    company_id, staff_user_id = _parse_target(data.get('company_id'), data.get('staff_user_id'))
    column_key = data.get('column_key') or ''
    if not isinstance(column_key, str) or not column_key or len(column_key) > 100:
        raise SheetValidationError([{'detail': 'Podaj column_key.'}])
    sheet_key = data.get('sheet_key') or ''
    tab_key = data.get('tab_key') or ''
    if not isinstance(sheet_key, str) or not sheet_key or len(sheet_key) > 50:
        raise SheetValidationError([{'detail': 'Podaj sheet_key.'}])
    if not isinstance(tab_key, str) or not tab_key or len(tab_key) > 50:
        raise SheetValidationError([{'detail': 'Podaj tab_key.'}])
    proposed_raw = data.get('proposed_value', ...)
    has_proposal = proposed_raw is not ... and proposed_raw is not None
    body = data.get('body')
    if body is None and has_proposal:
        body = ''
    if not isinstance(body, str):
        raise SheetValidationError([{'detail': 'Podaj treść komentarza.'}])
    body = body.strip()
    if not body and not has_proposal:
        raise SheetValidationError([{'detail': 'Treść komentarza nie może być pusta.'}])
    if len(body) > 2000:
        raise SheetValidationError([{'detail': 'Komentarz jest za długi (max 2000).'}])
    assert_can_access_target(user, company_id, staff_user_id)
    sheet, tab = _resolve_sheet_tab(user, sheet_key, tab_key)

    proposed_value = None
    parts = ()
    if has_proposal:
        col = _column_on_tab(sheet, tab, user, column_key)
        if not column_is_proposable(col):
            raise SheetValidationError([{
                'detail': 'Propozycja zmiany dotyczy tylko kolumn edytowalnych w arkuszu.',
            }])
        if tab.row_source == ROW_STAFF and company_id is not None:
            raise SheetValidationError([{'detail': 'Propozycja na wierszu Beściaka wymaga staff_user_id.'}])
        if tab.row_source != ROW_STAFF and staff_user_id is not None:
            raise SheetValidationError([{'detail': 'Propozycja na firmie wymaga company_id.'}])
        parts = _part_columns_by_key(col.key)
        if parts:
            if not isinstance(proposed_raw, dict):
                raise SheetValidationError([{'detail': 'Propozycja dla komórki złożonej wymaga pól składowych.'}])
            normalized_parts: dict[str, Any] = {}
            for part in parts:
                if part.key not in proposed_raw:
                    continue
                try:
                    if part.is_form_writable:
                        normalized_parts[part.key] = normalize_form_value(part, proposed_raw[part.key])
                    else:
                        normalized_parts[part.key] = normalize(part, proposed_raw[part.key])
                except CellValueError as exc:
                    raise SheetValidationError([{
                        'detail': f'Nieprawidłowa wartość pola „{part.label.replace(chr(10), " ")}”: {exc}',
                    }]) from exc
            if not normalized_parts:
                raise SheetValidationError([{'detail': 'Podaj przynajmniej jedno pole składowe.'}])
            proposed_value = normalized_parts
        else:
            try:
                if col.is_form_writable:
                    proposed_value = normalize_form_value(col, proposed_raw)
                else:
                    proposed_value = normalize(col, proposed_raw)
            except CellValueError as exc:
                raise SheetValidationError([{'detail': f'Nieprawidłowa wartość propozycji: {exc}'}]) from exc

    mention_users = _resolve_mention_users(data.get('mentions'), user)
    with transaction.atomic():
        comment = SheetCellComment.objects.create(
            company_id=company_id,
            staff_user_id=staff_user_id,
            column_key=column_key,
            sheet_key=sheet_key,
            tab_key=tab_key,
            author=user,
            body=body,
            proposed_value=proposed_value,
            status=SheetCellComment.STATUS_PROGRESS,
        )
        if mention_users:
            comment.mentions.set(mention_users)
            _notify_new_mentions(comment, mention_users, set())
        if proposed_value is not None and company_id is not None:
            if parts and isinstance(proposed_value, dict):
                for part_key, part_val in proposed_value.items():
                    SheetCellDraft.objects.update_or_create(
                        company_id=company_id,
                        column_key=part_key,
                        defaults={
                            'value': part_val,
                            'updated_by': user,
                        },
                    )
            else:
                SheetCellDraft.objects.update_or_create(
                    company_id=company_id,
                    column_key=column_key,
                    defaults={
                        'value': proposed_value,
                        'updated_by': user,
                    },
                )
    comment = (
        SheetCellComment.objects.select_related('author', 'company', 'staff_user')
        .prefetch_related('mentions')
        .get(pk=comment.pk)
    )
    return serialize_comment(comment, viewer=user, target_access_verified=True)


def update_comment(user, comment_id: int, data: dict) -> dict:
    try:
        comment = (
            SheetCellComment.objects.select_related('author', 'company', 'staff_user')
            .prefetch_related('mentions')
            .get(pk=comment_id)
        )
    except SheetCellComment.DoesNotExist as exc:
        raise SheetPermissionError('Nie znaleziono komentarza.') from exc
    assert_can_see_comment(user, comment)

    body = data.get('body', ...)
    mentions_raw = data.get('mentions', ...)
    status = data.get('status', ...)

    changing_content = body is not ... or mentions_raw is not ...
    if changing_content and comment.author_id != user.id and user.type != 'admin':
        raise SheetPermissionError('Tylko autor może edytować treść komentarza.')

    previous_status = comment.status
    with transaction.atomic():
        if body is not ...:
            if not isinstance(body, str):
                raise SheetValidationError([{'detail': 'Podaj treść komentarza.'}])
            body = body.strip()
            if not body:
                raise SheetValidationError([{'detail': 'Treść komentarza nie może być pusta.'}])
            if len(body) > 2000:
                raise SheetValidationError([{'detail': 'Komentarz jest za długi (max 2000).'}])
            comment.body = body
        if status is not ...:
            if not isinstance(status, str) or status not in COMMENT_STATUSES:
                raise SheetValidationError([{
                    'detail': f'status musi być jednym z: {", ".join(sorted(COMMENT_STATUSES))}.',
                }])
            comment.status = status
        previous_ids = set(comment.mentions.values_list('id', flat=True))
        if mentions_raw is not ...:
            mention_users = _resolve_mention_users(mentions_raw, user)
            comment.mentions.set(mention_users)
            _notify_new_mentions(comment, mention_users, previous_ids)
        comment.save()
        if (
            status is not ...
            and comment.proposed_value is not None
            and comment.company_id is not None
        ):
            if comment.status == SheetCellComment.STATUS_ACCEPTED:
                if previous_status != SheetCellComment.STATUS_ACCEPTED:
                    _restore_company_draft_for_accepted(comment, user)
            else:
                _sync_company_draft_from_proposals(
                    comment.company_id,
                    comment.column_key,
                    fallback_user=user,
                    expected_value=comment.proposed_value,
                )
    comment = (
        SheetCellComment.objects.select_related('author', 'company', 'staff_user')
        .prefetch_related('mentions')
        .get(pk=comment.pk)
    )
    return serialize_comment(comment, viewer=user, target_access_verified=True)


def delete_comment(user, comment_id: int) -> None:
    try:
        comment = SheetCellComment.objects.get(pk=comment_id)
    except SheetCellComment.DoesNotExist as exc:
        raise SheetPermissionError('Nie znaleziono komentarza.') from exc
    assert_can_see_comment(user, comment)
    allowed = (
        comment.author_id == user.id
        or user.type == 'admin'
        or user_can_manage_proposal(user, comment, target_access_verified=True)
    )
    if not allowed:
        raise SheetPermissionError('Brak uprawnień do usunięcia komentarza.')
    with transaction.atomic():
        company_id = comment.company_id
        column_key = comment.column_key
        proposed_value = comment.proposed_value
        comment.delete()
        if proposed_value is not None and company_id is not None:
            _sync_company_draft_from_proposals(
                company_id,
                column_key,
                fallback_user=user,
                expected_value=proposed_value,
            )


def apply_proposed_change(user, comment_id: int) -> dict:
    """Write proposed_value into the sheet cell; requires edit or commit permission on the column."""
    try:
        comment = (
            SheetCellComment.objects.select_related('author', 'company', 'staff_user')
            .prefetch_related('mentions')
            .get(pk=comment_id)
        )
    except SheetCellComment.DoesNotExist as exc:
        raise SheetPermissionError('Nie znaleziono komentarza.') from exc
    assert_can_see_comment(user, comment)
    if comment.proposed_value is None:
        raise SheetValidationError([{'detail': 'Ten komentarz nie ma propozycji zmiany.'}])
    if comment.status == SheetCellComment.STATUS_REJECTED:
        raise SheetValidationError([{'detail': 'Odrzuconej propozycji nie można zapisać do bazy.'}])
    if not user_can_apply_comment(user, comment, target_access_verified=True):
        raise SheetPermissionError('Brak uprawnień do zastosowania propozycji.')

    sheet, tab = _resolve_sheet_tab(user, comment.sheet_key, comment.tab_key)
    col = _column_on_tab(sheet, tab, user, comment.column_key)

    row_id = comment.company_id if comment.company_id is not None else comment.staff_user_id
    if row_id is None:
        raise SheetValidationError([{'detail': 'Brak celu propozycji.'}])

    parts = _part_columns_by_key(col.key)
    if parts:
        if not isinstance(comment.proposed_value, dict):
            raise SheetValidationError([{'detail': 'Nieprawidłowa propozycja dla komórki złożonej.'}])
        company = Company.objects.filter(id=row_id).first()
        if company is None:
            raise SheetValidationError([{'detail': 'Nie znaleziono firmy.'}])
        part_keys = [p.key for p in parts if p.key in comment.proposed_value]
        if not part_keys:
            raise SheetValidationError([{'detail': 'Ten komentarz nie ma propozycji zmiany.'}])
        extra_cells = {
            c.column_key: c
            for c in SheetCellValue.objects.filter(company_id=row_id, column_key__in=part_keys)
        }
        changes = []
        for part in parts:
            if part.key not in comment.proposed_value:
                continue
            cell = extra_cells.get(part.key)
            base = (cell.value if cell else None) if part.source == SOURCE_EXTRA else _displayed_value(part, company, cell)
            mode = MODE_COMMIT if part.is_form_writable else MODE_EDIT
            changes.append(
                CellChange(
                    company_id=row_id,
                    column_key=part.key,
                    value=comment.proposed_value[part.key],
                    base=base,
                    mode=mode,
                )
            )
        draft_cleanup_keys = part_keys
    else:
        # Current displayed value as optimistic-concurrency base
        if tab.row_source == ROW_STAFF or col.source == SOURCE_STAFF:
            meal = StaffMeal.objects.filter(user_id=row_id).first()
            if col.key in STAFF_MEAL_FIELDS:
                base = staff_field_value(meal, col)
            else:
                base = False if col.kind == KIND_BOOL else None
        elif col.source == SOURCE_EXTRA:
            cell = SheetCellValue.objects.filter(company_id=row_id, column_key=col.key).first()
            base = cell.value if cell else None
        else:
            company = Company.objects.filter(id=row_id).first()
            if company is None:
                raise SheetValidationError([{'detail': 'Nie znaleziono firmy.'}])
            cell = SheetCellValue.objects.filter(company_id=row_id, column_key=col.key).first()
            base = _displayed_value(col, company, cell)

        mode = MODE_COMMIT if col.is_form_writable else MODE_EDIT
        changes = [
            CellChange(
                company_id=row_id,
                column_key=col.key,
                value=comment.proposed_value,
                base=base,
                mode=mode,
            )
        ]
        draft_cleanup_keys = [col.key]

    with transaction.atomic():
        result = apply_changes(sheet, tab, user, changes)
        if result.get('conflicts'):
            raise SheetValidationError([{
                'detail': 'Komórka zmieniła się w międzyczasie. Odśwież i spróbuj ponownie.',
                'conflicts': result['conflicts'],
            }])
        if comment.company_id is not None:
            for key in draft_cleanup_keys:
                delete_cell_drafts(comment.company_id, key)
        comment.status = SheetCellComment.STATUS_ACCEPTED
        comment.save(update_fields=['status', 'updated_at'])
    comment = (
        SheetCellComment.objects.select_related('author', 'company', 'staff_user')
        .prefetch_related('mentions')
        .get(pk=comment.pk)
    )
    return {
        'comment': serialize_comment(comment, viewer=user, target_access_verified=True),
        'applied': result.get('applied', []),
    }


def search_staff_users(user, q: str) -> list[dict]:
    if not user.get_staff_roles():
        raise SheetPermissionError('Brak uprawnień.')
    qs = User.objects.filter(is_active=True).filter(Q(type='staff') | Q(type='admin')).order_by(
        'first_name', 'last_name', 'username',
    )
    q = (q or '').strip()
    if q:
        qs = qs.filter(
            Q(username__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(email__icontains=q)
        )
    return [
        {
            **serialize_mention(account),
            'type': account.type,
            'roles': list(account.get_staff_roles()),
        }
        for account in qs[:20]
    ]


def serialize_notification(notif: SheetNotification) -> dict:
    comment = notif.comment
    if comment.company_id and comment.company:
        target_label = comment.company.name
    elif comment.staff_user_id:
        target_label = user_display(comment.staff_user)
    else:
        target_label = ''
    return {
        'id': notif.id,
        'created_at': notif.created_at.isoformat(),
        'read_at': notif.read_at.isoformat() if notif.read_at else None,
        'comment_id': comment.id,
        'body_preview': comment.body[:160],
        'column_key': comment.column_key,
        'target_label': target_label,
        'author': serialize_mention(comment.author) if comment.author_id else None,
        'url': comment_deeplink(comment),
        'sheet_key': comment.sheet_key,
        'tab_key': comment.tab_key,
        'company_id': comment.company_id,
        'staff_user_id': comment.staff_user_id,
    }


def list_notifications(user, *, limit: int = 40) -> dict:
    qs = (
        SheetNotification.objects.filter(recipient=user)
        .select_related('comment', 'comment__author', 'comment__company', 'comment__staff_user')
        .order_by('-created_at')[:limit]
    )
    items = list(qs)
    unread_count = SheetNotification.objects.filter(recipient=user, read_at__isnull=True).count()
    return {
        'unread_count': unread_count,
        'items': [serialize_notification(n) for n in items],
    }


def mark_notifications_read(user, *, ids=None, all_unread: bool = False) -> dict:
    qs = SheetNotification.objects.filter(recipient=user, read_at__isnull=True)
    if all_unread:
        updated = qs.update(read_at=timezone.now())
        return {'marked': updated}
    if not isinstance(ids, list) or not ids:
        raise SheetValidationError([{'detail': 'Podaj ids albo all=true.'}])
    clean: list[int] = []
    for item in ids:
        try:
            clean.append(int(item))
        except (TypeError, ValueError) as exc:
            raise SheetValidationError([{'detail': 'ids musi zawierać liczby.'}]) from exc
    updated = qs.filter(id__in=clean).update(read_at=timezone.now())
    return {'marked': updated}


def comment_counts_for_companies(company_ids: list[int], column_keys: list[str] | None = None) -> dict[str, int]:
    if not company_ids:
        return {}
    qs = (
        SheetCellComment.objects.filter(company_id__in=company_ids, staff_user__isnull=True)
        .values('company_id', 'column_key')
        .annotate(n=Count('id'))
    )
    if column_keys is not None:
        qs = qs.filter(column_key__in=column_keys)
    return {
        comment_count_key(company_id=row['company_id'], column_key=row['column_key']): row['n']
        for row in qs
    }


def comment_counts_for_staff(user_ids: list[int], column_keys: list[str] | None = None) -> dict[str, int]:
    if not user_ids:
        return {}
    qs = (
        SheetCellComment.objects.filter(staff_user_id__in=user_ids, company__isnull=True)
        .values('staff_user_id', 'column_key')
        .annotate(n=Count('id'))
    )
    if column_keys is not None:
        qs = qs.filter(column_key__in=column_keys)
    return {
        comment_count_key(staff_user_id=row['staff_user_id'], column_key=row['column_key']): row['n']
        for row in qs
    }
