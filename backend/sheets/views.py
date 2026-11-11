from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import IsAdmin

from .definitions import CATALOG
from .definitions.common import user_display
from .models import SheetCellChange, SheetLayoutDefault
from .service import (
    SheetPermissionError,
    SheetValidationError,
    apply_cell_styles,
    apply_changes,
    build_tab_payload,
    company_queryset,
    parse_changes,
    visible_columns,
)
from .values import present
from .xlsx import build_xlsx, build_xlsx_workbook


class HasAnyStaffRole(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.get_staff_roles())


def _resolve(user, sheet_key, tab_key):
    sheet = CATALOG.sheets.get(sheet_key)
    if sheet is None or not sheet.accessible_by(user):
        return None, None
    tab = sheet.tab(tab_key)
    if tab is None or tab not in sheet.tabs_for(user):
        return sheet, None
    return sheet, tab


class SheetCatalogView(APIView):
    """GET /api/sheets/ — sheets and tabs available to the current user."""

    permission_classes = [IsAuthenticated, HasAnyStaffRole]

    def get(self, request):
        user = request.user
        return Response([
            {
                'key': sheet.key,
                'title': sheet.title,
                'scoped': sheet.is_scoped_for(user),
                'tabs': [{'key': tab.key, 'title': tab.title} for tab in sheet.tabs_for(user)],
            }
            for sheet in CATALOG.sheets_for(user)
        ])


class SheetLayoutDefaultView(APIView):
    """
    GET  /api/sheets/<sheet>/layout/ — default column widths for this sheet (any staff).
    PUT  /api/sheets/<sheet>/layout/ — publish current widths as the sheet default (admin only).
    Body PUT: {"column_widths": {"company.name": 180, ...}}
    """

    def get_permissions(self):
        if self.request.method == 'PUT':
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated(), HasAnyStaffRole()]

    def get(self, request, sheet_key):
        sheet = CATALOG.sheets.get(sheet_key)
        if sheet is None or not sheet.accessible_by(request.user):
            return Response({'detail': 'Nie znaleziono arkusza.'}, status=status.HTTP_404_NOT_FOUND)
        layout = SheetLayoutDefault.objects.filter(sheet_key=sheet_key).first()
        if layout is None:
            return Response({'column_widths': {}, 'updated_at': None, 'updated_by': None})
        return Response({
            'column_widths': layout.column_widths or {},
            'updated_at': layout.updated_at.isoformat() if layout.updated_at else None,
            'updated_by': user_display(layout.updated_by) if layout.updated_by_id else None,
        })

    def put(self, request, sheet_key):
        sheet = CATALOG.sheets.get(sheet_key)
        if sheet is None or not sheet.accessible_by(request.user):
            return Response({'detail': 'Nie znaleziono arkusza.'}, status=status.HTTP_404_NOT_FOUND)
        raw = request.data.get('column_widths')
        if not isinstance(raw, dict):
            return Response({'detail': 'Oczekiwano column_widths (obiekt).'}, status=status.HTTP_400_BAD_REQUEST)
        cleaned: dict[str, int] = {}
        for key, value in raw.items():
            if not isinstance(key, str) or not key or len(key) > 100:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                continue
            width = int(value)
            if 40 <= width <= 800:
                cleaned[key] = width
        layout, _ = SheetLayoutDefault.objects.update_or_create(
            sheet_key=sheet_key,
            defaults={'column_widths': cleaned, 'updated_by': request.user},
        )
        return Response({
            'column_widths': layout.column_widths,
            'updated_at': layout.updated_at.isoformat(),
            'updated_by': user_display(request.user),
        })


class SheetCellStylesView(APIView):
    """PATCH .../styles/ — set fill colour on selected cells."""

    permission_classes = [IsAuthenticated, HasAnyStaffRole]

    def patch(self, request, sheet_key, tab_key):
        sheet, tab = _resolve(request.user, sheet_key, tab_key)
        if tab is None:
            return Response({'detail': 'Nie znaleziono arkusza.'}, status=status.HTTP_404_NOT_FOUND)
        items = request.data.get('styles')
        if not isinstance(items, list) or not items:
            return Response({'detail': 'Oczekiwano {"styles": [...]}'}, status=status.HTTP_400_BAD_REQUEST)
        if len(items) > 2000:
            return Response({'detail': 'Za dużo stylów naraz.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = apply_cell_styles(sheet, tab, request.user, items)
        except SheetPermissionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except SheetValidationError as exc:
            return Response({'errors': exc.errors}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class SheetTabView(APIView):
    """GET /api/sheets/<sheet>/<tab>/ — columns + rows for one tab."""

    permission_classes = [IsAuthenticated, HasAnyStaffRole]

    def get(self, request, sheet_key, tab_key):
        sheet, tab = _resolve(request.user, sheet_key, tab_key)
        if tab is None:
            return Response({'detail': 'Nie znaleziono arkusza.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(build_tab_payload(sheet, tab, request.user))


class SheetCellsView(APIView):
    """
    PATCH /api/sheets/<sheet>/<tab>/cells/
    Body: {"changes": [{"company_id", "column_key", "value", "base"}]}
    `base` = value the client saw before editing; a mismatch is reported as a conflict.
    """

    permission_classes = [IsAuthenticated, HasAnyStaffRole]

    def patch(self, request, sheet_key, tab_key):
        sheet, tab = _resolve(request.user, sheet_key, tab_key)
        if tab is None:
            return Response({'detail': 'Nie znaleziono arkusza.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = apply_changes(sheet, tab, request.user, parse_changes(request.data))
        except SheetPermissionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except SheetValidationError as exc:
            return Response({'errors': exc.errors}, status=status.HTTP_400_BAD_REQUEST)
        # Conflicts are per cell and the rest of the batch is applied, hence 200 + `conflicts` list.
        return Response(result)


class SheetCellHistoryView(APIView):
    """GET .../history/?company_id=&column_key= — newest edits of one cell."""

    permission_classes = [IsAuthenticated, HasAnyStaffRole]

    def get(self, request, sheet_key, tab_key):
        sheet, tab = _resolve(request.user, sheet_key, tab_key)
        if tab is None:
            return Response({'detail': 'Nie znaleziono arkusza.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            company_id = int(request.query_params.get('company_id', ''))
        except (TypeError, ValueError):
            return Response({'detail': 'Podaj company_id.'}, status=status.HTTP_400_BAD_REQUEST)
        column_key = request.query_params.get('column_key') or ''
        column = next((col for col in visible_columns(tab, request.user) if col.key == column_key), None)
        if column is None:
            return Response({'detail': 'Nie znaleziono kolumny.'}, status=status.HTTP_404_NOT_FOUND)
        if not company_queryset(sheet, tab, request.user).filter(id=company_id).exists():
            return Response({'detail': 'Nie znaleziono firmy.'}, status=status.HTTP_404_NOT_FOUND)
        changes = (
            SheetCellChange.objects.filter(company_id=company_id, column_key=column_key)
            .select_related('changed_by')[:40]
        )
        return Response([
            {
                'old': present(column, change.old_value),
                'new': present(column, change.new_value),
                'by': user_display(change.changed_by),
                'at': change.changed_at.isoformat(),
            }
            for change in changes
        ])


def _xlsx_file_response(content: bytes, filename: str) -> HttpResponse:
    response = HttpResponse(
        content,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}.xlsx"'
    return response


def _xlsx_response(
    matrix: list[list[str]],
    filename: str,
    *,
    fills: list[list[str | None]] | None = None,
    bold: list[list[bool]] | None = None,
    col_widths: list[float] | None = None,
    freeze_rows: int = 0,
    freeze_cols: int = 0,
) -> HttpResponse:
    return _xlsx_file_response(
        build_xlsx(
            matrix,
            fills=fills,
            bold=bold,
            col_widths=col_widths,
            freeze_rows=freeze_rows,
            freeze_cols=freeze_cols,
        ),
        filename,
    )


def _posted_sheet_entry(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    matrix = _posted_matrix(raw)
    if matrix is None:
        return None
    options = _posted_xlsx_options(raw, matrix)
    name = raw.get('name')
    if not isinstance(name, str) or not name.strip():
        name = 'Arkusz'
    return {
        'name': name.strip()[:80],
        'rows': matrix,
        **options,
    }


def _posted_matrix(payload) -> list[list[str]] | None:
    """Client sends the sheet as the user sees it (visible columns, active filters)."""
    if not isinstance(payload, dict) or not isinstance(payload.get('rows'), list):
        return None
    rows = payload['rows']
    if not rows or len(rows) > 5000:
        return None
    matrix: list[list[str]] = []
    width = None
    for row in rows:
        if not isinstance(row, list) or not row or len(row) > 80:
            return None
        if width is None:
            width = len(row)
        if len(row) != width:
            return None
        matrix.append(['' if cell is None else str(cell)[:5000] for cell in row])
    return matrix


def _posted_style_grid(payload, key: str, width: int, height: int, cast):
    raw = payload.get(key)
    if not isinstance(raw, list) or len(raw) != height:
        return None
    out = []
    for row in raw:
        if not isinstance(row, list) or len(row) != width:
            return None
        out.append([cast(cell) for cell in row])
    return out


def _posted_xlsx_options(payload, matrix: list[list[str]]) -> dict:
    height = len(matrix)
    width = len(matrix[0]) if matrix else 0
    fills = _posted_style_grid(
        payload,
        'fills',
        width,
        height,
        lambda cell: cell if isinstance(cell, str) and cell else None,
    )
    bold = _posted_style_grid(
        payload,
        'bold',
        width,
        height,
        lambda cell: bool(cell),
    )
    col_widths = None
    raw_widths = payload.get('col_widths')
    if isinstance(raw_widths, list) and len(raw_widths) == width:
        cleaned: list[float] = []
        ok = True
        for value in raw_widths:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                ok = False
                break
            cleaned.append(float(value))
        if ok:
            col_widths = cleaned
    freeze_rows = payload.get('freeze_rows', 0)
    freeze_cols = payload.get('freeze_cols', 0)
    if not isinstance(freeze_rows, int) or isinstance(freeze_rows, bool):
        freeze_rows = 0
    if not isinstance(freeze_cols, int) or isinstance(freeze_cols, bool):
        freeze_cols = 0
    # Clamp to the posted matrix — LG Główny freezes 7 columns; a hard cap of 5 broke that.
    freeze_rows = max(0, min(height, freeze_rows))
    freeze_cols = max(0, min(width, freeze_cols))
    return {
        'fills': fills,
        'bold': bold,
        'col_widths': col_widths,
        'freeze_rows': freeze_rows,
        'freeze_cols': freeze_cols,
    }


class SheetXlsxView(APIView):
    """
    GET  .../xlsx/ — the whole tab the user is allowed to see.
    POST .../xlsx/ — the rows the browser sends (what is on screen: hidden columns
    and filtered-out firms stay out).
    """

    permission_classes = [IsAuthenticated, HasAnyStaffRole]

    def get(self, request, sheet_key, tab_key):
        sheet, tab = _resolve(request.user, sheet_key, tab_key)
        if tab is None:
            return Response({'detail': 'Nie znaleziono arkusza.'}, status=status.HTTP_404_NOT_FOUND)
        payload = build_tab_payload(sheet, tab, request.user)
        columns = payload['columns']
        defs = visible_columns(tab, request.user)
        matrix = [[col['label'] for col in columns]]
        for row in payload['rows']:
            matrix.append([present(col, row['cells'].get(col.key)) for col in defs])
        return _xlsx_response(matrix, f'{sheet_key}-{tab_key}')

    def post(self, request, sheet_key, tab_key):
        _sheet, tab = _resolve(request.user, sheet_key, tab_key)
        if tab is None:
            return Response({'detail': 'Nie znaleziono arkusza.'}, status=status.HTTP_404_NOT_FOUND)

        raw_sheets = request.data.get('sheets') if isinstance(request.data, dict) else None
        if isinstance(raw_sheets, list) and raw_sheets:
            if len(raw_sheets) > 40:
                return Response({'detail': 'Za dużo arkuszy naraz.'}, status=status.HTTP_400_BAD_REQUEST)
            parsed = []
            for item in raw_sheets:
                entry = _posted_sheet_entry(item)
                if entry is None:
                    return Response(
                        {'detail': 'Oczekiwano sheets[].rows jako macierz.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                parsed.append(entry)
            return _xlsx_file_response(build_xlsx_workbook(parsed), f'{sheet_key}-{tab_key}')

        matrix = _posted_matrix(request.data)
        if matrix is None:
            return Response(
                {'detail': 'Oczekiwano {"rows": [[...]]} albo {"sheets": [...]}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        options = _posted_xlsx_options(request.data, matrix)
        return _xlsx_response(matrix, f'{sheet_key}-{tab_key}', **options)
