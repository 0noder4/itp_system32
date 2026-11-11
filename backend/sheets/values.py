"""Cell value normalization (incoming edits) and serialization (outgoing system values)."""
from __future__ import annotations

import datetime
import os
from decimal import Decimal
from typing import Any

from django.db.models.fields.files import FieldFile

from .registry import (
    KIND_BOOL,
    KIND_DATE,
    KIND_LONGTEXT,
    KIND_NUMBER,
    KIND_SELECT,
    KIND_TEXT,
    KIND_TIME,
    KIND_USER,
    ColumnDef,
)


class CellValueError(ValueError):
    pass


def present(column: ColumnDef, value: Any) -> str:
    """Plain text for history and xlsx (same words the grid shows)."""
    value = serialize(value)
    if value is None or value is False:
        return ''
    if value is True:
        return 'tak'
    if isinstance(value, dict):
        return str(value.get('name') or '')
    if column.kind in (KIND_SELECT, KIND_USER):
        for code, label in column.resolve_options():
            if str(value) == str(code):
                return label
    return str(value)


def serialize(value: Any) -> Any:
    """Convert model values to JSON-friendly cell values."""
    if isinstance(value, FieldFile):
        if not value:
            return None
        return {'url': value.url, 'name': os.path.basename(value.name)}
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, datetime.time):
        return value.strftime('%H:%M')
    if isinstance(value, Decimal):
        return float(value)
    return value


def normalize(column: ColumnDef, raw: Any) -> Any:
    """
    Validate and canonicalize a value for an editable column.
    Empty input becomes None (bool: False) so "" / None / missing compare equal.
    """
    kind = column.kind
    if kind == KIND_BOOL:
        if raw in (None, ''):
            return False
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str) and raw.strip().lower() in ('true', 'tak', '1', 'prawda'):
            return True
        if isinstance(raw, str) and raw.strip().lower() in ('false', 'nie', '0', 'fałsz'):
            return False
        raise CellValueError('Oczekiwano wartości tak/nie.')

    if raw is None or (isinstance(raw, str) and raw.strip() == ''):
        return None

    if kind in (KIND_TEXT, KIND_LONGTEXT):
        if not isinstance(raw, (str, int, float)) or isinstance(raw, bool):
            raise CellValueError('Oczekiwano tekstu.')
        text = str(raw)
        if kind == KIND_TEXT:
            text = text.replace('\r\n', ' ').replace('\n', ' ')
        text = text.strip()
        if len(text) > column.max_length:
            raise CellValueError(f'Tekst jest dłuższy niż {column.max_length} znaków.')
        return text or None

    if kind == KIND_NUMBER:
        if isinstance(raw, bool):
            raise CellValueError('Oczekiwano liczby.')
        if isinstance(raw, (int, float)):
            number = raw
        else:
            try:
                number = float(str(raw).strip().replace(',', '.').replace(' ', ''))
            except ValueError:
                raise CellValueError('Oczekiwano liczby.') from None
        if isinstance(number, float) and number.is_integer():
            number = int(number)
        return number

    if kind == KIND_SELECT:
        options = column.resolve_options()
        value = str(raw).strip()
        for code, label in options:
            if value == code:
                return code
        for code, label in options:
            if value.lower() == label.lower():
                return code
        raise CellValueError('Wartość spoza listy.')

    if kind == KIND_USER:
        options = column.resolve_options()
        value = str(raw).strip()
        for code, label in options:
            if value == code or value.lower() == label.lower():
                return int(code)
        raise CellValueError('Nieznana osoba.')

    if kind == KIND_DATE:
        value = str(raw).strip()
        for fmt in ('%Y-%m-%d', '%d.%m.%Y', '%d.%m.%y'):
            try:
                return datetime.datetime.strptime(value, fmt).date().isoformat()
            except ValueError:
                continue
        raise CellValueError('Oczekiwano daty (RRRR-MM-DD lub DD.MM.RRRR).')

    if kind == KIND_TIME:
        value = str(raw).strip().replace('.', ':')
        for fmt in ('%H:%M', '%H:%M:%S', '%H'):
            try:
                return datetime.datetime.strptime(value, fmt).strftime('%H:%M')
            except ValueError:
                continue
        raise CellValueError('Oczekiwano godziny (GG:MM).')

    raise CellValueError('Tej kolumny nie można edytować.')


def normalize_lenient(column: ColumnDef, raw: Any) -> Any:
    """Normalize a client-supplied `base` value; fall back to the raw value if invalid."""
    try:
        return normalize(column, raw)
    except CellValueError:
        return raw


def values_equal(column: ColumnDef, a: Any, b: Any) -> bool:
    return normalize_lenient(column, a) == normalize_lenient(column, b)
