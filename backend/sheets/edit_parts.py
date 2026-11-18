"""Display columns that edit several form fields in one dialog."""
from __future__ import annotations

from typing import Any

from .registry import ColumnDef


def compose_part_display(column_key: str, parts: dict[str, Any]) -> str | None:
    """Cell text while a composite column has a draft. None = leave the getter text."""
    if column_key != 'people.firemka':
        return None
    name = f"{parts.get('people.main_name') or ''} {parts.get('people.main_surname') or ''}".strip()
    phone = parts.get('people.main_phone') or ''
    phone = '' if phone is None else str(phone).strip()
    return ' | '.join(bit for bit in (name, phone) if bit)


def edit_part_columns() -> dict[str, tuple[ColumnDef, ...]]:
    from .definitions.form_columns import MAIN_REP_NAME, MAIN_REP_PHONE, MAIN_REP_SURNAME

    return {
        'people.firemka': (MAIN_REP_NAME, MAIN_REP_SURNAME, MAIN_REP_PHONE),
    }
