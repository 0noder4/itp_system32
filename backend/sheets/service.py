"""Reading sheet tabs and applying cell edits."""
from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from companies.models import Company, CompanyInvitation, Settings

from .definitions.common import user_display
from .definitions.extras import SLOT_KEY
from .models import SheetCellChange, SheetCellStyle, SheetCellValue
from .registry import SOURCE_EXTRA, ColumnDef, RowContext, SheetDef, TabDef
from .values import CellValueError, normalize, normalize_lenient, serialize, values_equal

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
    # LG Główny: dynamic quantity columns from EquipmentItem catalog (not frozen in registry).
    if tab.key != 'glowny':
        return columns
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


def _extras_by_company(company_ids, columns: list[ColumnDef]) -> dict[int, dict[str, SheetCellValue]]:
    extra_keys = [c.key for c in columns if c.source == SOURCE_EXTRA]
    result: dict[int, dict[str, SheetCellValue]] = {}
    if not extra_keys or not company_ids:
        return result
    cells = SheetCellValue.objects.filter(company_id__in=company_ids, column_key__in=extra_keys)
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
        'highlight': col.highlight,
        'highlight_above': col.highlight_above,
        'help': col.help,
    }


def build_tab_payload(sheet: SheetDef, tab: TabDef, user) -> dict:
    columns = visible_columns(tab, user)
    companies = list(company_queryset(sheet, tab, user))
    extras = _extras_by_company([c.id for c in companies], columns)
    resigned, languages = _invitation_info([c.name for c in companies])
    shared = _shared_context(columns)

    rows = []
    for company in companies:
        cells_meta = extras.get(company.id, {})
        ctx = RowContext(
            company=company,
            extras={key: cell.value for key, cell in cells_meta.items()},
            resigned=company.name in resigned,
            invitation_language=languages.get(company.name, ''),
            shared=shared,
        )
        rows.append({
            'company_id': company.id,
            'resigned': ctx.resigned,
            'mine': company.fr_resp_id == user.id,
            'cells': {col.key: serialize(col.read(ctx)) for col in columns},
        })

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
        'tab': {'key': tab.key, 'title': tab.title, 'frozen_columns': tab.frozen_columns},
        'columns': [column_meta(col, user) for col in columns],
        'rows': rows,
        'cell_styles': styles,
        'generated_at': timezone.now().isoformat(),
    }


def apply_cell_styles(sheet: SheetDef, tab: TabDef, user, items: list[dict]) -> dict:
    """Set or clear background colours for cells visible on this tab."""
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


def parse_changes(payload) -> list[CellChange]:
    if not isinstance(payload, dict) or not isinstance(payload.get('changes'), list):
        raise SheetValidationError([{'detail': 'Oczekiwano {"changes": [...]}'}])
    raw_changes = payload['changes']
    if not raw_changes:
        raise SheetValidationError([{'detail': 'Brak zmian.'}])
    if len(raw_changes) > 2000:
        raise SheetValidationError([{'detail': 'Za dużo zmian naraz (max 2000).'}])
    changes = []
    for raw in raw_changes:
        if not isinstance(raw, dict):
            raise SheetValidationError([{'detail': 'Nieprawidłowa zmiana.'}])
        company_id, column_key = raw.get('company_id'), raw.get('column_key')
        if not isinstance(company_id, int) or isinstance(company_id, bool) or not isinstance(column_key, str):
            raise SheetValidationError([{'detail': 'Zmiana wymaga company_id (int) i column_key (str).'}])
        changes.append(CellChange(company_id, column_key, raw.get('value'), raw.get('base')))
    return changes


def _current_value(col: ColumnDef, company: Company, cell: SheetCellValue | None) -> Any:
    if col.source == SOURCE_EXTRA:
        return cell.value if cell else None
    return col.read(RowContext(company=company, extras={}))


def _conflict_meta(
    cell: SheetCellValue | None,
    company_id: int,
    column_key: str,
) -> tuple[str, str | None]:
    """Who last changed this cell — SheetCellValue for extras, else audit log (custom/system)."""
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


def apply_changes(sheet: SheetDef, tab: TabDef, user, changes: list[CellChange]) -> dict:
    """
    Validate everything first (403/400 reject the whole batch), then apply cell by cell.
    A cell whose current value differs from the client's `base` is a conflict: it is
    skipped and reported, the rest of the batch is still applied.
    """
    columns = {c.key: c for c in visible_columns(tab, user)}
    errors = []
    normalized: list[tuple[CellChange, ColumnDef, Any]] = []
    for change in changes:
        col = columns.get(change.column_key)
        if col is None or not col.editable_by(user):
            raise SheetPermissionError(f'Brak uprawnień do edycji kolumny {change.column_key}.')
        try:
            normalized.append((change, col, normalize(col, change.value)))
        except CellValueError as exc:
            errors.append({'company_id': change.company_id, 'column_key': change.column_key, 'detail': str(exc)})
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
        companies = {c.id: c for c in Company.objects.select_for_update().filter(id__in=company_ids)}
        cells = {
            (cell.company_id, cell.column_key): cell
            for cell in SheetCellValue.objects.select_for_update().filter(
                company_id__in=company_ids, column_key__in={c.key for _, c, _ in normalized}
            ).select_related('updated_by')
        }
        for change, col, new_value in normalized:
            company = companies[change.company_id]
            cell = cells.get((change.company_id, col.key))
            current = _current_value(col, company, cell)

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
                else:
                    col.setter(company, new_value)
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
                'value': new_value,
            })

    return {'applied': applied, 'conflicts': conflicts, 'batch_id': str(batch_id)}
