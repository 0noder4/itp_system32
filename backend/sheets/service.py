"""Reading sheet tabs and applying cell edits."""
from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from companies.models import Company, CompanyInvitation, Settings
from users.models import STAFF_ROLE_OPIEKUN, User

from .definitions.common import user_display
from .mail_deadlines import decorate_mail_group, decorate_mail_help, mail_send_labels
from .definitions.extras import (
    ARRIVAL_SLOTS,
    MONTAGE_DATES,
    SLOT_CAP,
    SLOT_KEY,
    STAFF_MEAL_FIELDS,
    matrix_fill_color,
    matrix_label,
    own_build_status,
)
from .definitions.form_columns import _own_build
from .edit_parts import compose_part_display, edit_part_columns
from .form_writes import display_from_draft, normalize_form_value
from .models import (
    SheetCellChange,
    SheetCellComment,
    SheetCellDraft,
    SheetCellFormOverride,
    SheetCellStyle,
    SheetCellValue,
    StaffMeal,
    StaffMealChange,
)
from .registry import (
    KIND_BOOL,
    KIND_FILE,
    ROW_COMPANY,
    ROW_STAFF,
    SOURCE_CUSTOM,
    SOURCE_EXTRA,
    SOURCE_STAFF,
    SOURCE_SYSTEM,
    TONE_ANY_DAY,
    TONE_DAY1,
    TONE_DAY2,
    TONE_OWN_BUILD,
    TONE_PROTOCOL,
    VIEW_GRID,
    VIEW_MATRIX,
    ColumnDef,
    RowContext,
    SheetDef,
    TabDef,
)
from .values import CellValueError, normalize, normalize_lenient, public_file_name, serialize, values_equal

# Modes for PATCH .../cells/
MODE_EDIT = 'edit'
MODE_DRAFT = 'draft'
MODE_COMMIT = 'commit'
CELL_MODES = frozenset({MODE_EDIT, MODE_DRAFT, MODE_COMMIT})

# Montage placement: day + slot must stay consistent when both arrive in one PATCH.
CARE_PAIR_KEYS = frozenset({'care.arrival_day', SLOT_KEY})

# Excel-like fill swatches allowed via the styles API.
ALLOWED_CELL_BG = frozenset({
    '',
    '#FEF08A',  # yellow
    '#BBF7D0',  # green
    '#BFDBFE',  # blue
    '#FBCFE8',  # pink
    '#FED7AA',  # orange
    '#E5E7EB',  # gray
})


class SheetPermissionError(Exception):
    pass


class SheetValidationError(Exception):
    def __init__(self, errors: list[dict]):
        super().__init__('invalid cell changes')
        self.errors = errors


def columns_for_write(tab: TabDef, user) -> dict[str, ColumnDef]:
    """Visible columns plus form fields edited from a composite cell on this tab."""
    visible = visible_columns(tab, user)
    found = {col.key: col for col in visible}
    parts_by_key = edit_part_columns()
    for col in visible:
        for part in parts_by_key.get(col.key, ()):
            found.setdefault(part.key, part)
    return found


def visible_columns(tab: TabDef, user) -> list[ColumnDef]:
    from .definitions.form_columns import EQUIPMENT_QTY_INSERT_BEFORE, build_equipment_qty_columns

    columns = [c for c in tab.columns if c.visible_to(user)]
    # Dynamic quantity columns from EquipmentItem catalog for any tab that includes the marker.
    if not any(c.key == EQUIPMENT_QTY_INSERT_BEFORE for c in columns):
        return columns
    qty_cols = [c for c in build_equipment_qty_columns() if c.visible_to(user)]
    if not qty_cols:
        return columns
    result: list[ColumnDef] = []
    for col in columns:
        if col.key == EQUIPMENT_QTY_INSERT_BEFORE:
            result.extend(qty_cols)
        result.append(col)
    return result


def company_queryset(sheet: SheetDef, tab: TabDef, user):
    qs = (
        Company.objects.select_related('fr_resp', 'opiekun', *tab.select_related)
        .prefetch_related('feedback', 'stand_all', *tab.prefetch_related)
        .order_by('name')
    )
    if tab.row_filter is not None:
        qs = tab.row_filter(qs)
    if sheet.is_scoped_for(user):
        qs = qs.filter(opiekun=user)
    return qs


def _stored_cells_by_company(
    company_ids, columns: list[ColumnDef]
) -> dict[int, dict[str, SheetCellValue]]:
    """SheetCellValue rows for SOURCE_EXTRA columns."""
    keys = [c.key for c in columns if c.source == SOURCE_EXTRA]
    result: dict[int, dict[str, SheetCellValue]] = {}
    if not keys or not company_ids:
        return result
    cells = SheetCellValue.objects.filter(
        company_id__in=company_ids, column_key__in=keys
    ).select_related('updated_by')
    for cell in cells:
        result.setdefault(cell.company_id, {})[cell.column_key] = cell
    return result


def _invitation_info(names) -> tuple[set[str], dict[str, str]]:
    """Latest invitation per company name: resignation flag and language."""
    resigned: set[str] = set()
    language: dict[str, str] = {}
    if not names:
        return resigned, language
    invites = CompanyInvitation.objects.filter(company_name__in=names).order_by('id')
    for invite in invites:
        if invite.is_resigned:
            resigned.add(invite.company_name)
        if invite.language:
            language[invite.company_name] = invite.language
    return resigned, language


def _slot_counts() -> dict:
    counts: Counter = Counter()
    for value in SheetCellValue.objects.filter(column_key=SLOT_KEY).values_list('value', flat=True):
        if value:
            counts[value] += 1
    return dict(counts)


def _shared_context(columns: list[ColumnDef]) -> dict:
    settings_obj = Settings.get_settings()
    shared = {
        'now': timezone.now(),
        'deadlines': {stage: getattr(settings_obj, f'stage_{stage}_deadline') for stage in range(1, 6)},
        'lunch_price': settings_obj.lunch_price,
        'jobwall_price': settings_obj.jobwall_price,
        'jobwall_free': settings_obj.jobwall_free_count,
        'slot_counts': {},
    }
    if any(col.key == 'care.slot_count' for col in columns):
        shared['slot_counts'] = _slot_counts()
    return shared


def _tab_meta(tab: TabDef) -> dict:
    return {
        'key': tab.key,
        'title': tab.title,
        'frozen_columns': tab.frozen_columns,
        'view': tab.view,
        'row_source': tab.row_source,
    }


def _on_day(company: Company, day: str) -> bool:
    return any(stand.day == day for stand in company.stand_all.all())


def _auto_tone(col: ColumnDef, ctx: RowContext, value) -> str | None:
    rule = col.tone
    if rule is None:
        return None
    if rule == TONE_OWN_BUILD:
        return own_build_status(ctx)
    if rule == TONE_DAY1 and not _on_day(ctx.company, 'day1'):
        return 'na'
    if rule == TONE_DAY2 and not _on_day(ctx.company, 'day2'):
        return 'na'
    if rule == TONE_ANY_DAY and not (_on_day(ctx.company, 'day1') or _on_day(ctx.company, 'day2')):
        return 'na'
    if rule in (TONE_PROTOCOL, TONE_DAY1, TONE_DAY2, TONE_ANY_DAY):
        return 'ok' if value is True else 'todo'
    return None


def column_meta(col: ColumnDef, user, mail_labels: dict[int, str] | None = None) -> dict:
    labels = mail_labels or {}
    meta = {
        'key': col.key,
        'label': col.label,
        'kind': col.kind,
        'source': col.source,
        'group': decorate_mail_group(col.group, labels),
        'editable': col.editable_by(user),
        'options': [{'value': code, 'label': label} for code, label in col.resolve_options()],
        'width': col.width,
        'aggregate': col.aggregate,
        'aggregate_by_day': col.aggregate_by_day,
        'highlight': col.highlight,
        'highlight_above': col.highlight_above,
        'help': decorate_mail_help(col.help, labels),
    }
    if col.can_draft(user):
        meta['can_draft'] = True
    if col.can_commit(user):
        meta['can_commit'] = True
    parts = edit_part_columns().get(col.key, ())
    if col.is_proposable or (parts and all(part.is_proposable for part in parts)):
        meta['proposable'] = True
    if parts:
        if all(part.can_draft(user) for part in parts):
            meta['can_draft'] = True
            meta['can_commit'] = True
        meta['edit_parts'] = [
            {
                'key': part.key,
                'label': part.label.replace('\n', ' '),
                'kind': part.kind,
                'options': [{'value': code, 'label': label} for code, label in part.resolve_options()],
            }
            for part in parts
        ]
    if col.list_schema:
        meta['list_schema'] = col.list_schema
    return meta


def _columns_meta(columns, user) -> list[dict]:
    labels = mail_send_labels()
    return [column_meta(col, user, labels) for col in columns]


def build_tab_payload(sheet: SheetDef, tab: TabDef, user) -> dict:
    if tab.view == VIEW_MATRIX:
        return _build_matrix_payload(sheet, tab, user)
    if tab.row_source == ROW_STAFF:
        return _build_staff_payload(sheet, tab, user)
    columns = visible_columns(tab, user)
    companies = list(company_queryset(sheet, tab, user))
    company_ids = [c.id for c in companies]
    column_keys = [col.key for col in columns]
    parts_by_key = edit_part_columns()
    part_keys = [
        part.key
        for col in columns
        for part in parts_by_key.get(col.key, ())
    ]
    lookup_keys = list(dict.fromkeys([*column_keys, *part_keys]))
    stored = _stored_cells_by_company(company_ids, columns)
    drafts = {
        (d.company_id, d.column_key): d
        for d in SheetCellDraft.objects.filter(company_id__in=company_ids, column_key__in=lookup_keys)
    } if company_ids and lookup_keys else {}
    overrides = {
        (o.company_id, o.column_key): o
        for o in SheetCellFormOverride.objects.filter(company_id__in=company_ids, column_key__in=lookup_keys)
    } if company_ids and lookup_keys else {}
    resigned, languages = _invitation_info([c.name for c in companies])
    shared = _shared_context(columns)
    extra_keys = {c.key for c in columns if c.source == SOURCE_EXTRA}

    draft_flags: dict[str, bool] = {}
    override_flags: dict[str, bool] = {}
    form_values: dict[str, Any] = {}
    part_values: dict[str, dict[str, Any]] = {}
    structured: dict[str, Any] = {}
    rows = []
    for company in companies:
        cells_meta = stored.get(company.id, {})
        extras_only = {
            key: cell.value for key, cell in cells_meta.items() if key in extra_keys
        }
        ctx = RowContext(
            company=company,
            extras=extras_only,
            resigned=company.name in resigned,
            invitation_language=languages.get(company.name, ''),
            shared=shared,
        )
        cells: dict[str, Any] = {}
        for col in columns:
            key = f'{company.id}|{col.key}'
            live = serialize(col.read(ctx))
            draft = drafts.get((company.id, col.key))
            if draft is not None:
                cells[col.key] = display_from_draft(col.list_schema, draft.value)
                draft_flags[key] = True
                form_values[key] = live
                if col.list_schema:
                    structured[key] = draft.value if isinstance(draft.value, list) else []
            else:
                cells[col.key] = live
                if col.list_reader is not None:
                    structured[key] = col.list_reader(company)
            parts = parts_by_key.get(col.key, ())
            if parts:
                shown_parts = {}
                any_part_draft = False
                for part in parts:
                    live_part = serialize(part.read(ctx))
                    part_draft = drafts.get((company.id, part.key))
                    if part_draft is not None:
                        shown_parts[part.key] = display_from_draft(None, part_draft.value)
                        any_part_draft = True
                        form_values[f'{company.id}|{part.key}'] = live_part
                    else:
                        shown_parts[part.key] = live_part
                part_values[key] = shown_parts
                if any_part_draft:
                    draft_flags[key] = True
                    form_values[key] = live
                    composed = compose_part_display(col.key, shown_parts)
                    if composed is not None:
                        cells[col.key] = composed
                if any((company.id, part.key) in overrides for part in parts):
                    override_flags[key] = True
                for part in parts:
                    part_id = f'{company.id}|{part.key}'
                    if (company.id, part.key) in drafts:
                        draft_flags[part_id] = True
                    if (company.id, part.key) in overrides:
                        override_flags[part_id] = True
            if (company.id, col.key) in overrides:
                override_flags[key] = True
        row_payload = {
            'company_id': company.id,
            'resigned': ctx.resigned,
            'mine': company.fr_resp_id == user.id,
            'cells': cells,
        }
        tones = {}
        for col in columns:
            tone = _auto_tone(col, ctx, cells.get(col.key))
            if tone:
                tones[col.key] = tone
        if tones:
            row_payload['tones'] = tones
        rows.append(row_payload)

    styles = {}
    if company_ids and column_keys:
        for style in SheetCellStyle.objects.filter(
            company_id__in=company_ids,
            column_key__in=column_keys,
        ).exclude(bg_color=''):
            styles[f'{style.company_id}|{style.column_key}'] = style.bg_color

    from .comments import comment_counts_for_companies

    return {
        'sheet': {'key': sheet.key, 'title': sheet.title},
        'tab': _tab_meta(tab),
        'columns': _columns_meta(columns, user),
        'rows': rows,
        'cell_styles': styles,
        'drafts': draft_flags,
        'form_overrides': override_flags,
        'form_values': form_values,
        'part_values': part_values,
        'structured': structured,
        'comment_counts': comment_counts_for_companies(company_ids, column_keys),
        'generated_at': timezone.now().isoformat(),
    }


def apply_cell_styles(sheet: SheetDef, tab: TabDef, user, items: list[dict]) -> dict:
    """Set or clear background colours for cells visible on this tab."""
    if tab.row_source != ROW_COMPANY or tab.view != VIEW_GRID:
        raise SheetPermissionError('Ten widok nie ma ręcznego koloru komórek.')
    columns = {c.key for c in visible_columns(tab, user)}
    qs = company_queryset(sheet, tab, user)
    allowed_ids = set(qs.values_list('id', flat=True))
    applied = []
    with transaction.atomic():
        for raw in items:
            if not isinstance(raw, dict):
                raise SheetValidationError([{'detail': 'Nieprawidłowy styl.'}])
            company_id = raw.get('company_id')
            column_key = raw.get('column_key')
            bg_color = raw.get('bg_color', '')
            if not isinstance(company_id, int) or isinstance(company_id, bool):
                raise SheetValidationError([{'detail': 'company_id musi być liczbą.'}])
            if not isinstance(column_key, str) or column_key not in columns:
                raise SheetValidationError([{'detail': f'Nieznana kolumna: {column_key}'}])
            if company_id not in allowed_ids:
                raise SheetPermissionError(f'Brak dostępu do firmy {company_id}.')
            if not isinstance(bg_color, str) or bg_color not in ALLOWED_CELL_BG:
                raise SheetValidationError([{'detail': f'Niedozwolony kolor: {bg_color}'}])
            if bg_color:
                SheetCellStyle.objects.update_or_create(
                    company_id=company_id,
                    column_key=column_key,
                    defaults={'bg_color': bg_color, 'updated_by': user},
                )
            else:
                SheetCellStyle.objects.filter(company_id=company_id, column_key=column_key).delete()
            applied.append({'company_id': company_id, 'column_key': column_key, 'bg_color': bg_color})
    return {'applied': applied}


@dataclass
class CellChange:
    company_id: int
    column_key: str
    value: Any
    base: Any
    mode: str = MODE_EDIT


def parse_changes(payload) -> list[CellChange]:
    if not isinstance(payload, dict) or not isinstance(payload.get('changes'), list):
        raise SheetValidationError([{'detail': 'Oczekiwano {"changes": [...]}'}])
    raw_changes = payload['changes']
    if not raw_changes:
        raise SheetValidationError([{'detail': 'Brak zmian.'}])
    if len(raw_changes) > 2000:
        raise SheetValidationError([{'detail': 'Za dużo zmian naraz (max 2000).'}])
    default_mode = payload.get('mode') or MODE_EDIT
    if default_mode not in CELL_MODES:
        raise SheetValidationError([{'detail': f'Nieznany mode: {default_mode}'}])
    changes = []
    for raw in raw_changes:
        if not isinstance(raw, dict):
            raise SheetValidationError([{'detail': 'Nieprawidłowa zmiana.'}])
        company_id, column_key = raw.get('company_id'), raw.get('column_key')
        if not isinstance(company_id, int) or isinstance(company_id, bool) or not isinstance(column_key, str):
            raise SheetValidationError([{'detail': 'Zmiana wymaga company_id (int) i column_key (str).'}])
        mode = raw.get('mode') or default_mode
        if mode not in CELL_MODES:
            raise SheetValidationError([{'detail': f'Nieznany mode: {mode}'}])
        changes.append(CellChange(company_id, column_key, raw.get('value'), raw.get('base'), mode))
    return changes


def _form_value(col: ColumnDef, company: Company) -> Any:
    return col.read(RowContext(company=company, extras={}))


def _displayed_value(col: ColumnDef, company: Company, cell: SheetCellValue | None) -> Any:
    """Value shown in the grid: extras from SheetCellValue, else form / custom getter."""
    if col.source == SOURCE_EXTRA:
        return cell.value if cell else None
    return _form_value(col, company)


def _conflict_meta(
    cell: SheetCellValue | None,
    company_id: int,
    column_key: str,
) -> tuple[str, str | None]:
    """Who last changed this cell — SheetCellValue for extras, else audit log."""
    if cell is not None:
        return (
            user_display(cell.updated_by) if cell.updated_by_id else '',
            cell.updated_at.isoformat() if cell.updated_at else None,
        )
    last = (
        SheetCellChange.objects.filter(company_id=company_id, column_key=column_key)
        .select_related('changed_by')
        .order_by('-changed_at')
        .first()
    )
    if last is None:
        return '', None
    return (
        user_display(last.changed_by) if last.changed_by_id else '',
        last.changed_at.isoformat() if last.changed_at else None,
    )


def _authorize_change(col: ColumnDef, user, mode: str) -> None:
    if mode == MODE_EDIT:
        if not col.editable_by(user):
            raise SheetPermissionError(f'Brak uprawnień do edycji kolumny {col.key}.')
        return
    if mode == MODE_DRAFT:
        if not col.can_draft(user):
            raise SheetPermissionError(f'Brak uprawnień do wersji roboczej kolumny {col.key}.')
        return
    if mode == MODE_COMMIT:
        if not col.can_commit(user):
            raise SheetPermissionError(f'Brak uprawnień do zapisu kolumny {col.key} do bazy.')
        return
    raise SheetPermissionError(f'Nieobsługiwany mode: {mode}')


def _snapshot_for_override(col: ColumnDef, company: Company) -> Any:
    """Value stored as previous_value / override value (list or scalar)."""
    if col.list_reader is not None:
        return col.list_reader(company)
    return normalize_lenient(col, _form_value(col, company))


def _apply_form_setter(col: ColumnDef, company: Company, value: Any) -> None:
    if col.list_schema:
        if not isinstance(value, list):
            raise SheetValidationError([{
                'company_id': company.id,
                'column_key': col.key,
                'detail': 'Oczekiwano listy pozycji.',
            }])
        col.setter(company, value)
        return
    col.setter(company, value)


def _opiekun_accounts(sheet: SheetDef, user) -> list[User]:
    """Staff accounts that actually have the opiekun role (admins are viewers, not rows)."""
    people = [
        account for account in User.objects.filter(type='staff', is_active=True).order_by(
            'first_name', 'last_name', 'username',
        )
        if STAFF_ROLE_OPIEKUN in (account.staff_roles or [])
    ]
    if sheet.is_scoped_for(user):
        return [account for account in people if account.id == user.id]
    return people


def staff_field_value(meal: StaffMeal | None, col) -> Any:
    """Value shown for a StaffMeal column. Empty note is None, same as other text cells."""
    field = STAFF_MEAL_FIELDS[col.key]
    if col.kind == KIND_BOOL:
        return bool(getattr(meal, field)) if meal else False
    text = getattr(meal, field) if meal else ''
    return text or None


def _staff_stored(col, new_value) -> Any:
    if col.kind == KIND_BOOL:
        return bool(new_value)
    return new_value or ''


def _build_staff_payload(sheet: SheetDef, tab: TabDef, user) -> dict:
    columns = visible_columns(tab, user)
    people = _opiekun_accounts(sheet, user)
    meals = {
        meal.user_id: meal
        for meal in StaffMeal.objects.filter(user_id__in=[account.id for account in people])
    }
    rows = []
    for account in people:
        meal = meals.get(account.id)
        cells = {'staff.name': user_display(account)}
        for col in columns:
            if col.key in STAFF_MEAL_FIELDS:
                cells[col.key] = staff_field_value(meal, col)
        rows.append({
            'company_id': account.id,
            'entity': 'user',
            'resigned': False,
            'mine': account.id == user.id,
            'cells': cells,
        })
    from .comments import comment_counts_for_staff

    user_ids = [account.id for account in people]
    column_keys = [col.key for col in columns]
    return {
        'sheet': {'key': sheet.key, 'title': sheet.title},
        'tab': _tab_meta(tab),
        'columns': _columns_meta(columns, user),
        'rows': rows,
        'cell_styles': {},
        'comment_counts': comment_counts_for_staff(user_ids, column_keys),
        'generated_at': timezone.now().isoformat(),
    }


def _apply_staff_changes(sheet: SheetDef, tab: TabDef, user, changes: list[CellChange]) -> dict:
    columns = {c.key: c for c in visible_columns(tab, user)}
    errors = []
    normalized: list[tuple[CellChange, ColumnDef, Any]] = []
    for change in changes:
        col = columns.get(change.column_key)
        if col is None or col.source != SOURCE_STAFF or change.column_key not in STAFF_MEAL_FIELDS:
            raise SheetPermissionError(f'Brak uprawnień do edycji kolumny {change.column_key}.')
        if change.mode != MODE_EDIT:
            raise SheetPermissionError('Obiady Beściaków zapisuje się zwykłą edycją.')
        if not col.editable_by(user):
            raise SheetPermissionError(f'Brak uprawnień do edycji kolumny {col.key}.')
        try:
            normalized.append((change, col, normalize(col, change.value)))
        except CellValueError as exc:
            errors.append({
                'company_id': change.company_id,
                'column_key': change.column_key,
                'detail': str(exc),
            })
    if errors:
        raise SheetValidationError(errors)

    allowed = {account.id for account in _opiekun_accounts(sheet, user)}
    if {change.company_id for change in changes} - allowed:
        raise SheetPermissionError('Brak dostępu do co najmniej jednej osoby.')

    applied, conflicts = [], []
    batch_id = uuid.uuid4()
    with transaction.atomic():
        meals = {
            meal.user_id: meal
            for meal in StaffMeal.objects.select_for_update().filter(
                user_id__in={change.company_id for change in changes},
            )
        }
        for change, col, new_value in normalized:
            field = STAFF_MEAL_FIELDS[col.key]
            meal = meals.get(change.company_id)
            current = staff_field_value(meal, col)
            if not values_equal(col, current, change.base):
                who = user_display(meal.updated_by) if meal and meal.updated_by_id else ''
                when = meal.updated_at.isoformat() if meal and meal.updated_at else None
                conflicts.append({
                    'company_id': change.company_id,
                    'column_key': col.key,
                    'current': serialize(current),
                    'updated_by': who,
                    'updated_at': when,
                })
                continue
            stored = _staff_stored(col, new_value)
            displayed = bool(stored) if col.kind == KIND_BOOL else (stored or None)
            if meal is None:
                meal = StaffMeal(user_id=change.company_id)
                meals[change.company_id] = meal
            if not values_equal(col, current, displayed):
                setattr(meal, field, stored)
                meal.updated_by = user
                meal.save()
                StaffMealChange.objects.create(
                    user_id=change.company_id,
                    column_key=col.key,
                    old_value=current,
                    new_value=displayed,
                    changed_by=user,
                    batch_id=batch_id,
                )
            applied.append({
                'company_id': change.company_id,
                'column_key': col.key,
                'value': serialize(displayed),
                'mode': MODE_EDIT,
            })
    return {'applied': applied, 'conflicts': conflicts, 'batch_id': str(batch_id)}


def staff_cell_history(sheet: SheetDef, tab: TabDef, user, user_id: int, column_key: str) -> list[dict]:
    column = next((col for col in visible_columns(tab, user) if col.key == column_key), None)
    if column is None or column.source != SOURCE_STAFF:
        return None
    if user_id not in {account.id for account in _opiekun_accounts(sheet, user)}:
        return None
    changes = (
        StaffMealChange.objects.filter(user_id=user_id, column_key=column_key)
        .select_related('changed_by')[:40]
    )
    return [
        {
            'old': present(column, change.old_value),
            'new': present(column, change.new_value),
            'by': user_display(change.changed_by),
            'at': change.changed_at.isoformat(),
        }
        for change in changes
    ]


def _build_matrix_payload(sheet: SheetDef, tab: TabDef, user) -> dict:
    """
    Read-only grid of own-build firms for one montage day.
    Placement is edited through the same care.arrival_day / care.slot extras as Główny
    (frontend PATCHes that tab); matrix cells themselves stay non-editable.
    """
    from .definitions.extras import CARE_ARRIVAL_DAY, CARE_SLOT

    index = int(tab.key.rsplit('_', 1)[-1]) - 1
    day_iso = MONTAGE_DATES[index].isoformat()
    columns = visible_columns(tab, user)
    companies = list(company_queryset(sheet, tab, user))
    extra_keys = (SLOT_KEY, 'care.arrival_day', 'care.car_make', 'care.car_registration')
    stored: dict[int, dict] = {}
    if companies:
        for cell in SheetCellValue.objects.filter(
            company_id__in=[company.id for company in companies],
            column_key__in=extra_keys,
        ):
            stored.setdefault(cell.company_id, {})[cell.column_key] = cell.value

    def _entry(company: Company, extras: dict) -> dict:
        ctx = RowContext(company=company, extras=extras)
        make = extras.get('care.car_make')
        reg = extras.get('care.car_registration')
        return {
            'company_id': company.id,
            'name': company.name,
            'label': matrix_label(ctx),
            'make': make.strip() if isinstance(make, str) and make.strip() else None,
            'registration': reg.strip() if isinstance(reg, str) and reg.strip() else None,
            'color': matrix_fill_color(company.id),
            'arrival_day': extras.get('care.arrival_day') if isinstance(extras.get('care.arrival_day'), str) else None,
            'slot': (
                extras.get(SLOT_KEY).strip()
                if isinstance(extras.get(SLOT_KEY), str) and extras.get(SLOT_KEY).strip()
                else None
            ),
        }

    buckets: dict[str, list[dict]] = {slot: [] for slot in ARRIVAL_SLOTS}
    unmatched: list[dict] = []
    candidates: list[dict] = []
    own_build_total = 0
    for company in companies:
        extras = stored.get(company.id, {})
        ctx = RowContext(company=company, extras=extras)
        if not _own_build(ctx):
            continue
        own_build_total += 1
        entry = _entry(company, extras)
        arrival = entry['arrival_day']
        slot_text = entry['slot'] or ''
        if arrival != day_iso:
            reason = 'missing_day' if not arrival else 'other_day'
            candidates.append({**entry, 'reason': reason})
            continue
        if slot_text in ARRIVAL_SLOTS:
            buckets[slot_text].append(entry)
        else:
            unmatched.append(entry)
            candidates.append({**entry, 'reason': 'bad_slot' if slot_text else 'missing_slot'})

    kept: dict[str, list[dict]] = {}
    overflow: list[dict] = []
    over_capacity: dict[str, bool] = {}
    for slot in ARRIVAL_SLOTS:
        ordered = sorted(buckets[slot], key=lambda item: item['name'].casefold())
        over_capacity[slot] = len(ordered) > SLOT_CAP
        kept[slot] = ordered[:SLOT_CAP]
        overflow.extend(ordered[SLOT_CAP:])
    no_items = sorted(unmatched, key=lambda item: item['name'].casefold())
    no_items.extend(overflow)
    # Overflow from capped slots can still be reassigned from the candidate list.
    for item in overflow:
        candidates.append({**item, 'reason': 'overflow'})

    height = max(SLOT_CAP, len(no_items))
    rows = []
    cell_styles: dict[str, str] = {}
    for index_row in range(height):
        row_id = -(index_row + 1)
        cells: dict[str, Any] = {
            'matrix.pos': str(index_row + 1) if index_row < SLOT_CAP else None,
        }
        tones = {}
        for slot in ARRIVAL_SLOTS:
            key = f'matrix.slot.{slot}'
            item = kept[slot][index_row] if index_row < len(kept[slot]) else None
            cells[key] = item['label'] if item else None
            if item:
                cell_styles[f'{row_id}|{key}'] = item['color']
            if over_capacity[slot]:
                tones[key] = 'warn'
        no_item = no_items[index_row] if index_row < len(no_items) else None
        cells['matrix.slot.NO'] = no_item['label'] if no_item else None
        if no_item:
            cell_styles[f'{row_id}|matrix.slot.NO'] = no_item['color']
        row = {
            'company_id': row_id,
            'entity': 'matrix',
            'resigned': False,
            'cells': cells,
        }
        if tones:
            row['tones'] = tones
        rows.append(row)

    placements = {slot: kept[slot] for slot in ARRIVAL_SLOTS}
    placements['NO'] = no_items
    candidates.sort(key=lambda item: item['name'].casefold())

    from .comments import MATRIX_COMMENT_COLUMN, comment_counts_for_companies

    placed_company_ids = [
        item['company_id']
        for slot_items in (*kept.values(), no_items)
        for item in slot_items
    ]
    return {
        'sheet': {'key': sheet.key, 'title': sheet.title},
        'tab': _tab_meta(tab),
        'columns': _columns_meta(columns, user),
        'rows': rows,
        'cell_styles': cell_styles,
        'comment_counts': comment_counts_for_companies(placed_company_ids, [MATRIX_COMMENT_COLUMN]),
        'matrix': {
            'day': day_iso,
            'editable': CARE_SLOT.editable_by(user) and CARE_ARRIVAL_DAY.editable_by(user),
            'edit_tab': 'glowny',
            'comment_column': column_meta(CARE_SLOT, user),
            'own_build_total': own_build_total,
            'placed_count': sum(len(kept[slot]) for slot in ARRIVAL_SLOTS) + len(no_items),
            'placements': placements,
            'candidates': candidates,
        },
        'generated_at': timezone.now().isoformat(),
    }


def _current_shown_value(
    col: ColumnDef,
    company: Company,
    cell: SheetCellValue | None,
    draft: SheetCellDraft | None,
) -> Any:
    if draft is not None:
        return display_from_draft(col.list_schema, draft.value)
    return _displayed_value(col, company, cell)


def _resolve_proposal_comments(company_id: int, col: ColumnDef, final_value: Any) -> None:
    for prop in SheetCellComment.objects.filter(
        company_id=company_id,
        column_key=col.key,
        status=SheetCellComment.STATUS_PROGRESS,
        proposed_value__isnull=False,
    ):
        if col.is_form_writable and col.list_schema:
            matched = prop.proposed_value == final_value
        else:
            matched = values_equal(col, prop.proposed_value, final_value)
        prop.status = (
            SheetCellComment.STATUS_ACCEPTED if matched else SheetCellComment.STATUS_REJECTED
        )
        prop.save(update_fields=['status', 'updated_at'])


def _resolve_composite_proposal_comments(applied: list[dict]) -> None:
    if not applied:
        return
    parts_by_parent = edit_part_columns()
    if not parts_by_parent:
        return
    applied_by_company: dict[int, set[str]] = {}
    for entry in applied:
        if entry.get('mode') == MODE_DRAFT:
            continue
        cid = entry.get('company_id')
        ckey = entry.get('column_key')
        if isinstance(cid, int) and isinstance(ckey, str):
            applied_by_company.setdefault(cid, set()).add(ckey)
    for company_id, touched_keys in applied_by_company.items():
        company = None
        for parent_key, parts in parts_by_parent.items():
            part_keys = {p.key for p in parts}
            if not (part_keys & touched_keys):
                continue
            props = list(
                SheetCellComment.objects.filter(
                    company_id=company_id,
                    column_key=parent_key,
                    status=SheetCellComment.STATUS_PROGRESS,
                    proposed_value__isnull=False,
                )
            )
            if not props:
                continue
            if company is None:
                company = Company.objects.filter(id=company_id).first()
                if company is None:
                    break
            extra_cells = {
                c.column_key: c
                for c in SheetCellValue.objects.filter(company_id=company_id, column_key__in=part_keys)
            }
            live_by_part = {
                part.key: _displayed_value(part, company, extra_cells.get(part.key))
                for part in parts
            }
            for prop in props:
                if not isinstance(prop.proposed_value, dict):
                    continue
                matched = all(
                    values_equal(part, prop.proposed_value[part.key], live_by_part[part.key])
                    for part in parts
                    if part.key in prop.proposed_value
                )
                prop.status = (
                    SheetCellComment.STATUS_ACCEPTED if matched else SheetCellComment.STATUS_REJECTED
                )
                prop.save(update_fields=['status', 'updated_at'])


def apply_changes(sheet: SheetDef, tab: TabDef, user, changes: list[CellChange]) -> dict:
    """
    Validate everything first (403/400 reject the whole batch), then apply cell by cell.
    A cell whose current value differs from the client's `base` is a conflict: it is
    skipped and reported, the rest of the batch is still applied.

    Modes:
    - edit — extra/custom (and staff meals) as before
    - draft — SOURCE_SYSTEM with setter → SheetCellDraft only
    - commit — write draft (or provided value) into the company form + FormOverride
    """
    if tab.row_source == ROW_STAFF:
        return _apply_staff_changes(sheet, tab, user, changes)
    if tab.view == VIEW_MATRIX:
        raise SheetPermissionError('Harmonogram montażu jest tylko do odczytu.')
    columns = columns_for_write(tab, user)
    errors = []
    normalized: list[tuple[CellChange, ColumnDef, Any]] = []
    for change in changes:
        col = columns.get(change.column_key)
        if col is None:
            raise SheetPermissionError(f'Brak uprawnień do edycji kolumny {change.column_key}.')
        _authorize_change(col, user, change.mode)
        try:
            if change.mode in (MODE_DRAFT, MODE_COMMIT) and col.source == SOURCE_SYSTEM:
                value = normalize_form_value(col, change.value)
                normalized.append((change, col, value))
            else:
                normalized.append((change, col, normalize(col, change.value)))
        except CellValueError as exc:
            errors.append({
                'company_id': change.company_id,
                'column_key': change.column_key,
                'detail': str(exc),
            })
    if errors:
        raise SheetValidationError(errors)

    company_ids = {c.company_id for c in changes}
    allowed_ids = set(
        company_queryset(sheet, tab, user).filter(id__in=company_ids).values_list('id', flat=True)
    )
    if company_ids - allowed_ids:
        raise SheetPermissionError('Brak dostępu do co najmniej jednej firmy.')

    applied, conflicts = [], []
    batch_id = uuid.uuid4()
    with transaction.atomic():
        companies = {
            c.id: c for c in Company.objects.select_for_update().filter(id__in=company_ids)
        }
        cells = {
            (cell.company_id, cell.column_key): cell
            for cell in SheetCellValue.objects.select_for_update().filter(
                company_id__in=company_ids,
                column_key__in={c.key for _, c, _ in normalized},
            ).select_related('updated_by')
        }
        draft_rows = {
            (d.company_id, d.column_key): d
            for d in SheetCellDraft.objects.select_for_update().filter(
                company_id__in=company_ids,
                column_key__in={c.key for _, c, _ in normalized},
            )
        }
        override_rows = {
            (o.company_id, o.column_key): o
            for o in SheetCellFormOverride.objects.select_for_update().filter(
                company_id__in=company_ids,
                column_key__in={c.key for _, c, _ in normalized},
            )
        }

        pair_keys_by_company: dict[int, set[str]] = {}
        for change, col, _ in normalized:
            if change.mode == MODE_EDIT and col.key in CARE_PAIR_KEYS:
                pair_keys_by_company.setdefault(change.company_id, set()).add(col.key)
        paired_companies = {
            cid for cid, keys in pair_keys_by_company.items() if CARE_PAIR_KEYS <= keys
        }
        skip_keys: set[tuple[int, str]] = set()
        for company_id in paired_companies:
            company = companies[company_id]
            pair_items = [
                (change, col)
                for change, col, _ in normalized
                if change.company_id == company_id and col.key in CARE_PAIR_KEYS
            ]
            snapshots = []
            pair_conflict = False
            for change, col in pair_items:
                cell = cells.get((company_id, col.key))
                current = _displayed_value(col, company, cell)
                who, when = _conflict_meta(cell, company_id, col.key)
                if not values_equal(col, current, change.base):
                    pair_conflict = True
                snapshots.append((col.key, current, who, when))
            if pair_conflict:
                for key, current, who, when in snapshots:
                    skip_keys.add((company_id, key))
                    conflicts.append({
                        'company_id': company_id,
                        'column_key': key,
                        'current': serialize(current),
                        'updated_by': who,
                        'updated_at': when,
                    })

        for change, col, new_value in normalized:
            if (change.company_id, col.key) in skip_keys:
                continue
            company = companies[change.company_id]
            cell = cells.get((change.company_id, col.key))
            draft = draft_rows.get((change.company_id, col.key))

            if change.mode == MODE_DRAFT:
                current = _current_shown_value(col, company, cell, draft)
                # base for drafts compares against display text for lists
                if col.list_schema:
                    base_ok = True  # list editor sends structured base optionally; skip strict text compare
                else:
                    base_ok = values_equal(col, current, change.base)
                if not base_ok:
                    who, when = _conflict_meta(cell, change.company_id, col.key)
                    conflicts.append({
                        'company_id': change.company_id,
                        'column_key': col.key,
                        'current': serialize(current),
                        'updated_by': who,
                        'updated_at': when,
                    })
                    continue
                if draft is None:
                    draft = SheetCellDraft(company=company, column_key=col.key)
                    draft_rows[(change.company_id, col.key)] = draft
                draft.value = new_value
                draft.updated_by = user
                draft.save()
                shown = display_from_draft(col.list_schema, new_value)
                applied.append({
                    'company_id': change.company_id,
                    'column_key': col.key,
                    'value': shown,
                    'mode': MODE_DRAFT,
                    'draft': True,
                })
                continue

            if change.mode == MODE_COMMIT:
                # Prefer draft value if client didn't send a new one differing; use new_value.
                commit_value = new_value
                if draft is not None and change.value is None:
                    commit_value = draft.value
                previous = _snapshot_for_override(col, company)
                try:
                    _apply_form_setter(col, company, commit_value)
                except CellValueError as exc:
                    raise SheetValidationError([{
                        'company_id': change.company_id,
                        'column_key': col.key,
                        'detail': str(exc),
                    }]) from exc
                override = override_rows.get((change.company_id, col.key))
                if override is None:
                    override = SheetCellFormOverride(
                        company=company,
                        column_key=col.key,
                        previous_value=previous,
                    )
                    override_rows[(change.company_id, col.key)] = override
                if col.kind == KIND_FILE:
                    live_after = serialize(_form_value(col, company))
                else:
                    live_after = _snapshot_for_override(col, company)
                override.value = live_after
                override.updated_by = user
                override.save()
                if draft is not None:
                    delete_cell_drafts(company.id, col.key, draft)
                    draft_rows.pop((change.company_id, col.key), None)
                _resolve_proposal_comments(company.id, col, commit_value)
                shown = live_after
                if col.list_schema and isinstance(commit_value, list):
                    shown = display_from_draft(col.list_schema, commit_value)
                SheetCellChange.objects.create(
                    company=company,
                    column_key=col.key,
                    old_value=previous,
                    new_value=live_after,
                    changed_by=user,
                    batch_id=batch_id,
                )
                applied.append({
                    'company_id': change.company_id,
                    'column_key': col.key,
                    'value': shown,
                    'mode': MODE_COMMIT,
                    'form_override': True,
                })
                continue

            # MODE_EDIT
            current = _displayed_value(col, company, cell)
            shown_current = _current_shown_value(col, company, cell, draft) if draft is not None else current
            if not (
                values_equal(col, current, change.base)
                or (draft is not None and values_equal(col, shown_current, change.base))
            ):
                who, when = _conflict_meta(cell, change.company_id, col.key)
                conflicts.append({
                    'company_id': change.company_id,
                    'column_key': col.key,
                    'current': serialize(current),
                    'updated_by': who,
                    'updated_at': when,
                })
                continue

            if not values_equal(col, current, new_value):
                if col.source == SOURCE_EXTRA:
                    if cell is None:
                        cell = SheetCellValue(company=company, column_key=col.key)
                        cells[(change.company_id, col.key)] = cell
                    cell.value = new_value
                    cell.updated_by = user
                    cell.save()
                elif col.source == SOURCE_CUSTOM and col.setter is not None:
                    col.setter(company, new_value)
                else:
                    raise SheetPermissionError(
                        f'Kolumna {col.key} jest tylko do odczytu w arkuszu.'
                    )
                SheetCellChange.objects.create(
                    company=company,
                    column_key=col.key,
                    old_value=normalize_lenient(col, current),
                    new_value=new_value,
                    changed_by=user,
                    batch_id=batch_id,
                )
            if draft is not None:
                delete_cell_drafts(company.id, col.key, draft)
                draft_rows.pop((change.company_id, col.key), None)
            _resolve_proposal_comments(company.id, col, new_value)
            applied.append({
                'company_id': change.company_id,
                'column_key': col.key,
                'value': serialize(new_value) if new_value is not None or col.source == SOURCE_EXTRA else new_value,
                'mode': MODE_EDIT,
            })

    _resolve_composite_proposal_comments(applied)
    return {'applied': applied, 'conflicts': conflicts, 'batch_id': str(batch_id)}


# Graphics columns writable via multipart. money.pdf stays computed/read-only.
FILE_UPLOAD_EXTENSIONS: dict[str, frozenset[str]] = {
    'sign.logo': frozenset({'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}),
    'sign.visualization': frozenset({'.pdf', '.png', '.jpg', '.jpeg'}),
    'sign.fire_cert': frozenset({'.pdf', '.png', '.jpg', '.jpeg'}),
    'catalogue.logo': frozenset({'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}),
}
FILE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024


_MANAGED_FILE_PREFIXES = ('sheet_file_drafts/', 'sheet_file_backups/')


def _managed_storage_path(
    value: Any,
    prefixes: tuple[str, ...] = _MANAGED_FILE_PREFIXES,
) -> str | None:
    path = ''
    if isinstance(value, dict) and isinstance(value.get('path'), str):
        path = value['path'].strip()
    elif isinstance(value, str):
        path = value.strip()
    if path and '..' not in path and path.startswith(prefixes):
        return path
    return None


def _delete_storage_path(path: str | None) -> None:
    if not path or '..' in path or not path.startswith(_MANAGED_FILE_PREFIXES):
        return
    from django.core.files.storage import default_storage

    try:
        if default_storage.exists(path):
            default_storage.delete(path)
    except Exception:
        pass


def _cleanup_storage_dir(dir_path: str, keep_paths: set[str] | None = None) -> None:
    if not dir_path or '..' in dir_path or not dir_path.startswith(_MANAGED_FILE_PREFIXES):
        return
    from django.core.files.storage import default_storage

    keep = keep_paths or set()
    base = dir_path.rstrip('/')
    try:
        _dirs, files = default_storage.listdir(base)
    except Exception:
        return
    for fname in files:
        full = f'{base}/{fname}'
        if full not in keep:
            _delete_storage_path(full)


def _flush_storage_cleanup(items: list[tuple[str | None, str]]) -> None:
    for path, dir_path in items:
        _delete_storage_path(path)
        _cleanup_storage_dir(dir_path)


def delete_cell_drafts(company_id: int, column_key: str, draft: SheetCellDraft | None = None) -> None:
    """Delete draft rows and, once the transaction commits, their sheet_file_drafts copies."""
    rows = (
        [draft]
        if draft is not None
        else list(SheetCellDraft.objects.filter(company_id=company_id, column_key=column_key))
    )
    dir_path = f'sheet_file_drafts/{company_id}/{column_key}'
    cleanup: list[tuple[str | None, str]] = []
    for row in rows:
        if row is None:
            continue
        path = _managed_storage_path(row.value, ('sheet_file_drafts/',))
        if path:
            cleanup.append((path, dir_path))
        if row.pk:
            row.delete()
    if not cleanup:
        return
    cleanup.append((None, dir_path))
    pending = list(cleanup)
    transaction.on_commit(lambda items=pending: _flush_storage_cleanup(items))


def _backup_file_field(field_file, company_id: int, column_key: str) -> dict | None:
    """Copy an existing FileField into sheet_file_backups/ and return {path, name}."""
    import os

    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    if not field_file or not getattr(field_file, 'name', None):
        return None
    display = public_file_name(field_file.name)
    dest = f'sheet_file_backups/{company_id}/{column_key}/{uuid.uuid4().hex}_{os.path.basename(display)}'
    with field_file.open('rb') as src:
        stored = default_storage.save(dest, ContentFile(src.read()))
    return {'path': stored, 'name': display}


def _draft_file_payload(path: str, display_name: str) -> dict:
    from django.core.files.storage import default_storage

    return {'url': default_storage.url(path), 'name': display_name, 'path': path}


def _store_draft_bytes(company_id: int, column_key: str, display_name: str, data: bytes) -> str:
    import os

    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    safe = os.path.basename(display_name) or 'plik'
    dest = f'sheet_file_drafts/{company_id}/{column_key}/{uuid.uuid4().hex}_{safe}'
    return default_storage.save(dest, ContentFile(data))


def _validate_upload_file(column: ColumnDef, uploaded) -> None:
    import os

    if uploaded is None:
        raise CellValueError('Brak pliku.')
    name = getattr(uploaded, 'name', '') or ''
    ext = os.path.splitext(name)[1].lower()
    allowed = FILE_UPLOAD_EXTENSIONS.get(column.key)
    if allowed is None:
        raise CellValueError('Tej kolumny nie można nadpisać plikiem z arkusza.')
    if ext not in allowed:
        raise CellValueError(
            f'Niedozwolony typ pliku ({ext or "brak rozszerzenia"}). '
            f'Dozwolone: {", ".join(sorted(allowed))}.'
        )
    size = getattr(uploaded, 'size', None)
    if isinstance(size, int) and size > FILE_UPLOAD_MAX_BYTES:
        raise CellValueError('Plik jest za duży (max 10 MB).')


def _checked_draft_path(company_id: int, column_key: str, draft_path: str) -> str:
    from django.core.files.storage import default_storage

    path = (draft_path or '').strip()
    prefix = f'sheet_file_drafts/{company_id}/{column_key}/'
    if not path.startswith(prefix) or '..' in path:
        raise CellValueError('Nieprawidłowa wersja robocza pliku.')
    if not default_storage.exists(path):
        raise CellValueError('Wersja robocza pliku nie jest już dostępna.')
    return path


def upload_cell_file(
    sheet: SheetDef,
    tab: TabDef,
    user,
    company_id: int,
    column_key: str,
    uploaded,
    mode: str = MODE_COMMIT,
    draft_path: str = '',
) -> dict:
    """
    Multipart file write for KIND_FILE form columns.

    draft — store the file in sheet_file_drafts and SheetCellDraft; the form stays unchanged.
    commit — write the uploaded file, or the current draft, onto the form FileField.
    """
    if mode not in (MODE_DRAFT, MODE_COMMIT):
        raise SheetValidationError([{'detail': 'Nieobsługiwany mode.'}])
    if tab.row_source != ROW_COMPANY or tab.view != VIEW_GRID:
        raise SheetPermissionError('Upload pliku dostępny tylko w siatce firm.')
    columns = columns_for_write(tab, user)
    col = columns.get(column_key)
    if col is None or col.kind != KIND_FILE or not col.can_commit(user):
        raise SheetPermissionError(f'Brak uprawnień do zapisu pliku w kolumnie {column_key}.')
    if mode == MODE_DRAFT and not col.can_draft(user):
        raise SheetPermissionError(f'Brak uprawnień do wersji roboczej kolumny {column_key}.')
    if column_key not in FILE_UPLOAD_EXTENSIONS:
        raise SheetPermissionError(f'Kolumna {column_key} nie przyjmuje uploadu z arkusza.')
    allowed_ids = set(
        company_queryset(sheet, tab, user).filter(id=company_id).values_list('id', flat=True)
    )
    if company_id not in allowed_ids:
        raise SheetPermissionError(f'Brak dostępu do firmy {company_id}.')

    if uploaded is not None:
        try:
            _validate_upload_file(col, uploaded)
        except CellValueError as exc:
            raise SheetValidationError([{
                'company_id': company_id,
                'column_key': column_key,
                'detail': str(exc),
            }]) from exc

    if mode == MODE_DRAFT:
        return _save_file_draft(user, company_id, column_key, col, uploaded, draft_path)
    return _commit_file(user, company_id, column_key, col, uploaded, draft_path)


def _save_file_draft(user, company_id: int, column_key: str, col: ColumnDef, uploaded, draft_path: str) -> dict:
    import os

    draft_dir = f'sheet_file_drafts/{company_id}/{column_key}'
    if uploaded is None and not draft_path:
        qs = SheetCellDraft.objects.filter(company_id=company_id, column_key=column_key)
        stale_paths = [_managed_storage_path(d.value, ('sheet_file_drafts/',)) for d in qs]
        qs.delete()
        for stale in stale_paths:
            _delete_storage_path(stale)
        _cleanup_storage_dir(draft_dir)
        company = Company.objects.get(id=company_id)
        shown = serialize(col.read(RowContext(company=company, extras={})))
        return {
            'applied': [{
                'company_id': company_id,
                'column_key': column_key,
                'value': shown,
                'mode': MODE_DRAFT,
                'draft': False,
            }],
            'conflicts': [],
            'batch_id': str(uuid.uuid4()),
        }

    try:
        if uploaded is not None:
            display = os.path.basename(getattr(uploaded, 'name', '') or '') or 'plik'
            data = uploaded.read()
            path = _store_draft_bytes(company_id, column_key, display, data)
        else:
            path = _checked_draft_path(company_id, column_key, draft_path)
            display = public_file_name(path)
            existing = SheetCellDraft.objects.filter(company_id=company_id, column_key=column_key).first()
            if existing is not None and isinstance(existing.value, dict) and existing.value.get('path') == path:
                display = existing.value.get('name') or display
    except CellValueError as exc:
        raise SheetValidationError([{
            'company_id': company_id,
            'column_key': column_key,
            'detail': str(exc),
        }]) from exc

    draft, _created = SheetCellDraft.objects.get_or_create(
        company_id=company_id,
        column_key=column_key,
    )
    prev_path = _managed_storage_path(draft.value, ('sheet_file_drafts/',))
    draft.value = {'path': path, 'name': display}
    draft.updated_by = user
    draft.save()
    if uploaded is not None:
        # Keep the current draft and one immediate predecessor for the modal's Undo button.
        _cleanup_storage_dir(draft_dir, keep_paths={p for p in (path, prev_path) if p})
    return {
        'applied': [{
            'company_id': company_id,
            'column_key': column_key,
            'value': _draft_file_payload(path, display),
            'mode': MODE_DRAFT,
            'draft': True,
        }],
        'conflicts': [],
        'batch_id': str(uuid.uuid4()),
    }


def _commit_file(user, company_id: int, column_key: str, col: ColumnDef, uploaded, draft_path: str) -> dict:
    import os

    source: Any
    if uploaded is not None:
        source = uploaded
    else:
        draft = SheetCellDraft.objects.filter(company_id=company_id, column_key=column_key).first()
        payload = draft.value if draft is not None and isinstance(draft.value, dict) else None
        path = ''
        name = ''
        if payload and isinstance(payload.get('path'), str):
            path = payload['path']
            name = str(payload.get('name') or '')
        elif draft_path:
            path = draft_path
        if not path:
            raise SheetValidationError([{
                'company_id': company_id,
                'column_key': column_key,
                'detail': 'Wybierz plik albo zapisz wersję roboczą.',
            }])
        try:
            path = _checked_draft_path(company_id, column_key, path)
        except CellValueError as exc:
            raise SheetValidationError([{
                'company_id': company_id,
                'column_key': column_key,
                'detail': str(exc),
            }]) from exc
        source = {'path': path, 'name': name or os.path.basename(path)}

    batch_id = uuid.uuid4()
    draft_paths: list[str] = []
    with transaction.atomic():
        company = Company.objects.select_for_update().get(id=company_id)
        override = SheetCellFormOverride.objects.select_for_update().filter(
            company=company, column_key=column_key,
        ).first()
        live = _form_value(col, company)
        previous = _backup_file_field(live, company_id, column_key) if override is None else None
        old_change_value = previous if override is None else serialize(live)
        try:
            col.setter(company, source)
        except CellValueError as exc:
            _delete_storage_path(_managed_storage_path(previous, ('sheet_file_backups/',)))
            raise SheetValidationError([{
                'company_id': company_id,
                'column_key': column_key,
                'detail': str(exc),
            }]) from exc

        if override is None:
            override = SheetCellFormOverride(
                company=company,
                column_key=column_key,
                previous_value=previous,
            )
        override.value = serialize(col.read(RowContext(company=company, extras={})))
        override.updated_by = user
        override.save()

        draft_qs = SheetCellDraft.objects.filter(company=company, column_key=column_key)
        for d in draft_qs:
            dp = _managed_storage_path(d.value, ('sheet_file_drafts/',))
            if dp:
                draft_paths.append(dp)
        if draft_path:
            dp = _managed_storage_path(draft_path, ('sheet_file_drafts/',))
            if dp:
                draft_paths.append(dp)
        draft_qs.delete()
        SheetCellChange.objects.create(
            company=company,
            column_key=column_key,
            old_value=old_change_value,
            new_value=override.value,
            changed_by=user,
            batch_id=batch_id,
        )
        committed_value = override.value

    for dp in draft_paths:
        _delete_storage_path(dp)
    _cleanup_storage_dir(f'sheet_file_drafts/{company_id}/{column_key}')
    return {
        'applied': [{
            'company_id': company_id,
            'column_key': column_key,
            'value': committed_value,
            'mode': MODE_COMMIT,
            'form_override': True,
        }],
        'conflicts': [],
        'batch_id': str(batch_id),
    }


def restore_form_overrides(sheet: SheetDef, tab: TabDef, user, cells: list[dict] | None) -> dict:
    """Restore previous_value into the form and clear override + draft. Admin / LG / FR."""
    if tab.row_source != ROW_COMPANY or tab.view != VIEW_GRID:
        raise SheetPermissionError('Przywracanie dostępne tylko w siatce firm.')
    columns = columns_for_write(tab, user)
    qs = company_queryset(sheet, tab, user)
    allowed_ids = set(qs.values_list('id', flat=True))

    if cells is None:
        targets = list(
            SheetCellFormOverride.objects.filter(
                company_id__in=allowed_ids,
                column_key__in=columns.keys(),
            )
        )
    else:
        if not isinstance(cells, list) or not cells:
            raise SheetValidationError([{'detail': 'Podaj cells albo pomiń, by przywrócić całą zakładkę.'}])
        targets = []
        for raw in cells:
            if not isinstance(raw, dict):
                raise SheetValidationError([{'detail': 'Nieprawidłowa komórka.'}])
            company_id, column_key = raw.get('company_id'), raw.get('column_key')
            if not isinstance(company_id, int) or isinstance(company_id, bool) or not isinstance(column_key, str):
                raise SheetValidationError([{'detail': 'company_id i column_key są wymagane.'}])
            if company_id not in allowed_ids:
                raise SheetPermissionError(f'Brak dostępu do firmy {company_id}.')
            col = columns.get(column_key)
            if col is None or not col.can_commit(user):
                raise SheetPermissionError(f'Brak uprawnień do przywrócenia kolumny {column_key}.')
            override = SheetCellFormOverride.objects.filter(
                company_id=company_id, column_key=column_key,
            ).first()
            if override is not None:
                targets.append(override)

    applied = []
    batch_id = uuid.uuid4()
    cleanup_files: list[tuple[str | None, str]] = []
    with transaction.atomic():
        for override in targets:
            col = columns.get(override.column_key)
            if col is None or not col.can_commit(user):
                continue
            company = Company.objects.select_for_update().get(id=override.company_id)
            previous = override.previous_value
            try:
                _apply_form_setter(col, company, previous)
            except CellValueError as exc:
                raise SheetValidationError([{
                    'company_id': company.id,
                    'column_key': col.key,
                    'detail': str(exc),
                }]) from exc
            draft_qs = SheetCellDraft.objects.filter(company=company, column_key=col.key)
            draft_paths = [_managed_storage_path(d.value, ('sheet_file_drafts/',)) for d in draft_qs]
            draft_qs.delete()
            SheetCellComment.objects.filter(
                company=company,
                column_key=col.key,
                status=SheetCellComment.STATUS_PROGRESS,
                proposed_value__isnull=False,
            ).update(status=SheetCellComment.STATUS_REJECTED, updated_at=timezone.now())
            SheetCellChange.objects.create(
                company=company,
                column_key=col.key,
                old_value=override.value,
                new_value=previous,
                changed_by=user,
                batch_id=batch_id,
            )
            backup_path = _managed_storage_path(previous, ('sheet_file_backups/',))
            override.delete()
            if col.kind == KIND_FILE:
                cleanup_files.append((backup_path, f'sheet_file_backups/{company.id}/{col.key}'))
                for dp in draft_paths:
                    cleanup_files.append((dp, f'sheet_file_drafts/{company.id}/{col.key}'))
                cleanup_files.append((None, f'sheet_file_drafts/{company.id}/{col.key}'))
            shown = serialize(col.read(RowContext(company=company, extras={})))
            if col.list_schema and isinstance(previous, list):
                shown = display_from_draft(col.list_schema, previous)
            applied.append({
                'company_id': company.id,
                'column_key': col.key,
                'value': shown,
            })
    for path, dir_path in cleanup_files:
        _delete_storage_path(path)
        _cleanup_storage_dir(dir_path)
    return {'applied': applied, 'batch_id': str(batch_id)}


def discard_drafts(sheet: SheetDef, tab: TabDef, user, cells: list[dict] | None) -> dict:
    """Delete sheet drafts for the given cells. Does not change the company form."""
    if tab.row_source != ROW_COMPANY or tab.view != VIEW_GRID:
        raise SheetPermissionError('Usuwanie wersji roboczej jest dostępne tylko w siatce firm.')
    columns = columns_for_write(tab, user)
    allowed_ids = set(company_queryset(sheet, tab, user).values_list('id', flat=True))
    if not isinstance(cells, list) or not cells:
        raise SheetValidationError([{'detail': 'Podaj cells z wersjami roboczymi do usunięcia.'}])

    parts_by_key = edit_part_columns()
    targets: list[tuple[int, str, ColumnDef, tuple[ColumnDef, ...]]] = []
    for raw in cells:
        if not isinstance(raw, dict):
            raise SheetValidationError([{'detail': 'Nieprawidłowa komórka.'}])
        company_id, column_key = raw.get('company_id'), raw.get('column_key')
        if not isinstance(company_id, int) or isinstance(company_id, bool) or not isinstance(column_key, str):
            raise SheetValidationError([{'detail': 'company_id i column_key są wymagane.'}])
        if company_id not in allowed_ids:
            raise SheetPermissionError(f'Brak dostępu do firmy {company_id}.')
        col = columns.get(column_key)
        parts = parts_by_key.get(column_key, ())
        can_discard = col is not None and (
            col.can_draft(user)
            or col.editable_by(user)
            or col.is_proposable
            or (bool(parts) and all(p.can_draft(user) or p.is_proposable for p in parts))
        )
        if not can_discard:
            raise SheetPermissionError(f'Brak uprawnień do wersji roboczej kolumny {column_key}.')
        targets.append((company_id, column_key, col, parts))

    discarded = []
    cleanup_files: list[tuple[str | None, str]] = []
    with transaction.atomic():
        for company_id, column_key, col, parts in targets:
            draft_keys = [p.key for p in parts] if parts else [column_key]
            draft_qs = SheetCellDraft.objects.filter(company_id=company_id, column_key__in=draft_keys)
            draft_paths = [_managed_storage_path(d.value, ('sheet_file_drafts/',)) for d in draft_qs]
            deleted, _ = draft_qs.delete()
            if deleted:
                discarded.append({'company_id': company_id, 'column_key': column_key})
                SheetCellComment.objects.filter(
                    company_id=company_id,
                    column_key__in=list(dict.fromkeys([column_key, *draft_keys])),
                    status=SheetCellComment.STATUS_PROGRESS,
                    proposed_value__isnull=False,
                ).update(status=SheetCellComment.STATUS_REJECTED, updated_at=timezone.now())
                if col.kind == KIND_FILE:
                    for dp in draft_paths:
                        cleanup_files.append((dp, f'sheet_file_drafts/{company_id}/{column_key}'))
                    cleanup_files.append((None, f'sheet_file_drafts/{company_id}/{column_key}'))
    for path, dir_path in cleanup_files:
        _delete_storage_path(path)
        _cleanup_storage_dir(dir_path)
    return {'discarded': discarded}
