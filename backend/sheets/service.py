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
from .models import SheetCellChange, SheetCellStyle, SheetCellValue, StaffMeal, StaffMealChange
from .registry import (
    ROW_COMPANY,
    ROW_STAFF,
    SOURCE_CUSTOM,
    SOURCE_EXTRA,
    SOURCE_STAFF,
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
from .values import CellValueError, normalize, normalize_lenient, serialize, values_equal

# Modes for PATCH .../cells/ (edit only — form cells are read-only in sheets)
MODE_EDIT = 'edit'
CELL_MODES = frozenset({MODE_EDIT})

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


def column_meta(col: ColumnDef, user) -> dict:
    return {
        'key': col.key,
        'label': col.label,
        'kind': col.kind,
        'source': col.source,
        'group': col.group,
        'editable': col.editable_by(user),
        'options': [{'value': code, 'label': label} for code, label in col.resolve_options()],
        'width': col.width,
        'aggregate': col.aggregate,
        'aggregate_by_day': col.aggregate_by_day,
        'highlight': col.highlight,
        'highlight_above': col.highlight_above,
        'help': col.help,
    }


def build_tab_payload(sheet: SheetDef, tab: TabDef, user) -> dict:
    if tab.view == VIEW_MATRIX:
        return _build_matrix_payload(sheet, tab, user)
    if tab.row_source == ROW_STAFF:
        return _build_staff_payload(sheet, tab, user)
    columns = visible_columns(tab, user)
    companies = list(company_queryset(sheet, tab, user))
    stored = _stored_cells_by_company([c.id for c in companies], columns)
    resigned, languages = _invitation_info([c.name for c in companies])
    shared = _shared_context(columns)
    extra_keys = {c.key for c in columns if c.source == SOURCE_EXTRA}

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
            cells[col.key] = serialize(col.read(ctx))
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

    company_ids = [c.id for c in companies]
    column_keys = [col.key for col in columns]
    styles = {}
    if company_ids and column_keys:
        for style in SheetCellStyle.objects.filter(
            company_id__in=company_ids,
            column_key__in=column_keys,
        ).exclude(bg_color=''):
            styles[f'{style.company_id}|{style.column_key}'] = style.bg_color

    return {
        'sheet': {'key': sheet.key, 'title': sheet.title},
        'tab': _tab_meta(tab),
        'columns': [column_meta(col, user) for col in columns],
        'rows': rows,
        'cell_styles': styles,
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
    if mode != MODE_EDIT:
        raise SheetPermissionError(f'Nieobsługiwany mode: {mode}')
    if not col.editable_by(user):
        raise SheetPermissionError(f'Brak uprawnień do edycji kolumny {col.key}.')


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
        cells = {
            'staff.name': user_display(account),
            'staff.meal.day1': bool(meal.day1) if meal else False,
            'staff.meal.day2': bool(meal.day2) if meal else False,
        }
        rows.append({
            'company_id': account.id,
            'entity': 'user',
            'resigned': False,
            'mine': account.id == user.id,
            'cells': cells,
        })
    return {
        'sheet': {'key': sheet.key, 'title': sheet.title},
        'tab': _tab_meta(tab),
        'columns': [column_meta(col, user) for col in columns],
        'rows': rows,
        'cell_styles': {},
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
            current = bool(getattr(meal, field)) if meal else False
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
            if meal is None:
                meal = StaffMeal(user_id=change.company_id)
                meals[change.company_id] = meal
            if bool(getattr(meal, field)) != bool(new_value):
                old = bool(getattr(meal, field)) if meal.pk else False
                setattr(meal, field, bool(new_value))
                meal.updated_by = user
                meal.save()
                StaffMealChange.objects.create(
                    user_id=change.company_id,
                    column_key=col.key,
                    old_value=old,
                    new_value=bool(new_value),
                    changed_by=user,
                    batch_id=batch_id,
                )
            applied.append({
                'company_id': change.company_id,
                'column_key': col.key,
                'value': serialize(bool(new_value)),
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

    return {
        'sheet': {'key': sheet.key, 'title': sheet.title},
        'tab': _tab_meta(tab),
        'columns': [column_meta(col, user) for col in columns],
        'rows': rows,
        'cell_styles': cell_styles,
        'matrix': {
            'day': day_iso,
            'editable': CARE_SLOT.editable_by(user) and CARE_ARRIVAL_DAY.editable_by(user),
            'edit_tab': 'glowny',
            'own_build_total': own_build_total,
            'placed_count': sum(len(kept[slot]) for slot in ARRIVAL_SLOTS) + len(no_items),
            'placements': placements,
            'candidates': candidates,
        },
        'generated_at': timezone.now().isoformat(),
    }


def apply_changes(sheet: SheetDef, tab: TabDef, user, changes: list[CellChange]) -> dict:
    """
    Validate everything first (403/400 reject the whole batch), then apply cell by cell.
    A cell whose current value differs from the client's `base` is a conflict: it is
    skipped and reported, the rest of the batch is still applied.

    Exception: when both care.arrival_day and care.slot for the same company are in the
    batch, they are all-or-nothing — a conflict on either blocks both (montage placement).

    Only editable extra/custom columns. Form (SOURCE_SYSTEM) cells are read-only here.
    Staff-meal tabs write StaffMeal. The montage matrix is read-only.
    """
    if tab.row_source == ROW_STAFF:
        return _apply_staff_changes(sheet, tab, user, changes)
    if tab.view == VIEW_MATRIX:
        raise SheetPermissionError('Harmonogram montażu jest tylko do odczytu.')
    columns = {c.key: c for c in visible_columns(tab, user)}
    errors = []
    normalized: list[tuple[CellChange, ColumnDef, Any]] = []
    for change in changes:
        col = columns.get(change.column_key)
        if col is None:
            raise SheetPermissionError(f'Brak uprawnień do edycji kolumny {change.column_key}.')
        _authorize_change(col, user, change.mode)
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

        pair_keys_by_company: dict[int, set[str]] = {}
        for change, col, _ in normalized:
            if col.key in CARE_PAIR_KEYS:
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
            current = _displayed_value(col, company, cell)

            if not values_equal(col, current, change.base):
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
            applied.append({
                'company_id': change.company_id,
                'column_key': col.key,
                'value': serialize(new_value) if new_value is not None or col.source == SOURCE_EXTRA else new_value,
                'mode': MODE_EDIT,
            })

    return {'applied': applied, 'conflicts': conflicts, 'batch_id': str(batch_id)}
