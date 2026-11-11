"""Minimal xlsx (Office Open XML) writer with fills/bold/widths. Stdlib only — no openpyxl."""
from __future__ import annotations

import io
import re
import zipfile
from xml.sax.saxutils import escape

_HEX_RE = re.compile(r'^#?[0-9A-Fa-f]{6}$')
_BAD_SHEET_CHARS = re.compile(r'[\\/*?:\[\]]')


def _col_name(index: int) -> str:
    name = ''
    n = index + 1
    while n:
        n, rem = divmod(n - 1, 26)
        name = chr(65 + rem) + name
    return name


def _normalize_hex(value: str | None) -> str | None:
    if not value or not isinstance(value, str):
        return None
    raw = value.strip()
    if not _HEX_RE.match(raw):
        return None
    if not raw.startswith('#'):
        raw = f'#{raw}'
    return raw.upper()


def _rgb(hex_color: str) -> str:
    """Excel wants AARRGGBB."""
    return 'FF' + hex_color.lstrip('#').upper()


def _merge_ranges(group_row: list[str]) -> list[str]:
    merges: list[str] = []
    start = 0
    while start < len(group_row):
        label = group_row[start]
        end = start
        while end + 1 < len(group_row) and group_row[end + 1] == label:
            end += 1
        if label and end > start:
            merges.append(f'{_col_name(start)}1:{_col_name(end)}1')
        start = end + 1
    return merges


def sanitize_sheet_name(name: str, used: set[str]) -> str:
    cleaned = _BAD_SHEET_CHARS.sub('-', (name or 'Arkusz').strip()) or 'Arkusz'
    cleaned = cleaned[:31]
    base = cleaned
    n = 2
    while cleaned.lower() in used:
        suffix = f'_{n}'
        cleaned = base[: 31 - len(suffix)] + suffix
        n += 1
    used.add(cleaned.lower())
    return cleaned


class _StyleBook:
    def __init__(self) -> None:
        self.fill_xml: list[str] = [
            '<fill><patternFill patternType="none"/></fill>',
            '<fill><patternFill patternType="gray125"/></fill>',
        ]
        self.fill_by_hex: dict[str, int] = {}
        self.xfs_xml: list[str] = [
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
        ]
        self.xfs_by_key: dict[tuple[int, int], int] = {(0, 0): 0}

    def fill_id(self, hex_color: str | None) -> int:
        normalized = _normalize_hex(hex_color)
        if not normalized:
            return 0
        existing = self.fill_by_hex.get(normalized)
        if existing is not None:
            return existing
        idx = len(self.fill_xml)
        self.fill_by_hex[normalized] = idx
        self.fill_xml.append(
            f'<fill><patternFill patternType="solid">'
            f'<fgColor rgb="{_rgb(normalized)}"/></patternFill></fill>'
        )
        return idx

    def style_id(self, fill_hex: str | None, is_bold: bool) -> int:
        fid = self.fill_id(fill_hex)
        font_id = 1 if is_bold else 0
        key = (font_id, fid)
        existing = self.xfs_by_key.get(key)
        if existing is not None:
            return existing
        idx = len(self.xfs_xml)
        self.xfs_by_key[key] = idx
        attrs = ''
        if font_id:
            attrs += ' applyFont="1"'
        if fid:
            attrs += ' applyFill="1"'
        self.xfs_xml.append(
            f'<xf numFmtId="0" fontId="{font_id}" fillId="{fid}" borderId="0" xfId="0"{attrs}/>'
        )
        return idx

    def xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="2">'
            '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>'
            '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>'
            '</fonts>'
            f'<fills count="{len(self.fill_xml)}">{"".join(self.fill_xml)}</fills>'
            '<borders count="1">'
            '<border><left/><right/><top/><bottom/><diagonal/></border>'
            '</borders>'
            '<cellStyleXfs count="1">'
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
            '</cellStyleXfs>'
            f'<cellXfs count="{len(self.xfs_xml)}">{"".join(self.xfs_xml)}</cellXfs>'
            '</styleSheet>'
        )


def _build_sheet_xml(
    styles: _StyleBook,
    rows: list[list[str]],
    *,
    fills: list[list[str | None]] | None = None,
    bold: list[list[bool]] | None = None,
    col_widths: list[float] | None = None,
    freeze_rows: int = 0,
    freeze_cols: int = 0,
) -> str:
    if not rows:
        rows = [['']]

    body: list[str] = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    ]

    if freeze_rows > 0 or freeze_cols > 0:
        top_left = f'{_col_name(freeze_cols)}{freeze_rows + 1}'
        body.append('<sheetViews><sheetView workbookViewId="0">')
        body.append(
            f'<pane xSplit="{freeze_cols}" ySplit="{freeze_rows}" '
            f'topLeftCell="{top_left}" activePane="bottomRight" state="frozen"/>'
        )
        body.append('</sheetView></sheetViews>')

    if col_widths:
        body.append('<cols>')
        for index, width in enumerate(col_widths, start=1):
            try:
                w = float(width)
            except (TypeError, ValueError):
                continue
            w = max(4.0, min(60.0, w))
            body.append(f'<col min="{index}" max="{index}" width="{w:.2f}" customWidth="1"/>')
        body.append('</cols>')

    body.append('<sheetData>')
    width = max(len(row) for row in rows)
    for r_index, row in enumerate(rows):
        cells_xml: list[str] = []
        for c_index in range(width):
            text = row[c_index] if c_index < len(row) else ''
            if text is None:
                text = ''
            fill_hex = None
            is_bold = False
            if fills and r_index < len(fills) and c_index < len(fills[r_index]):
                fill_hex = fills[r_index][c_index]
            if bold and r_index < len(bold) and c_index < len(bold[r_index]):
                is_bold = bool(bold[r_index][c_index])
            sid = styles.style_id(fill_hex, is_bold)
            ref = f'{_col_name(c_index)}{r_index + 1}'
            style_attr = f' s="{sid}"' if sid else ''
            cells_xml.append(
                f'<c r="{ref}"{style_attr} t="inlineStr">'
                f'<is><t xml:space="preserve">{escape(str(text))}</t></is></c>'
            )
        body.append(f'<row r="{r_index + 1}">{"".join(cells_xml)}</row>')
    body.append('</sheetData>')

    if rows and fills and len(rows) >= 2:
        merges = _merge_ranges([str(c or '') for c in rows[0]])
        if merges and fills[0]:
            body.append(f'<mergeCells count="{len(merges)}">')
            for ref in merges:
                body.append(f'<mergeCell ref="{ref}"/>')
            body.append('</mergeCells>')

    body.append('</worksheet>')
    return ''.join(body)


def build_xlsx_workbook(sheets: list[dict]) -> bytes:
    """sheets: [{name, rows, fills?, bold?, col_widths?, freeze_rows?, freeze_cols?}, ...]"""
    if not sheets:
        sheets = [{'name': 'Arkusz', 'rows': [['']]}]

    styles = _StyleBook()
    used_names: set[str] = set()
    sheet_parts: list[tuple[str, str]] = []

    for raw in sheets[:40]:
        rows = raw.get('rows') or [['']]
        name = sanitize_sheet_name(str(raw.get('name') or 'Arkusz'), used_names)
        sheet_parts.append((
            name,
            _build_sheet_xml(
                styles,
                rows,
                fills=raw.get('fills'),
                bold=raw.get('bold'),
                col_widths=raw.get('col_widths'),
                freeze_rows=int(raw.get('freeze_rows') or 0),
                freeze_cols=int(raw.get('freeze_cols') or 0),
            ),
        ))

    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ]
    for index in range(1, len(sheet_parts) + 1):
        overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
            f'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{"".join(overrides)}'
        '</Types>'
    )

    workbook_sheets = [
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, (name, _) in enumerate(sheet_parts, start=1)
    ]
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(workbook_sheets)}</sheets>'
        '</workbook>'
    )

    rels = [
        f'<Relationship Id="rId{index}" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        f'Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, len(sheet_parts) + 1)
    ]
    styles_rid = len(sheet_parts) + 1
    rels.append(
        f'<Relationship Id="rId{styles_rid}" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        f'Target="styles.xml"/>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{"".join(rels)}'
        '</Relationships>'
    )

    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        '</Relationships>'
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', content_types)
        archive.writestr('_rels/.rels', root_rels)
        archive.writestr('xl/workbook.xml', workbook)
        archive.writestr('xl/_rels/workbook.xml.rels', workbook_rels)
        archive.writestr('xl/styles.xml', styles.xml())
        for index, (_, xml) in enumerate(sheet_parts, start=1):
            archive.writestr(f'xl/worksheets/sheet{index}.xml', xml)
    return buffer.getvalue()


def build_xlsx(
    rows: list[list[str]],
    *,
    fills: list[list[str | None]] | None = None,
    bold: list[list[bool]] | None = None,
    col_widths: list[float] | None = None,
    freeze_rows: int = 0,
    freeze_cols: int = 0,
    sheet_name: str = 'Arkusz',
) -> bytes:
    """Single-sheet helper (backward compatible)."""
    return build_xlsx_workbook([{
        'name': sheet_name,
        'rows': rows,
        'fills': fills,
        'bold': bold,
        'col_widths': col_widths,
        'freeze_rows': freeze_rows,
        'freeze_cols': freeze_cols,
    }])
