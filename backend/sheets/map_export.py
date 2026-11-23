"""Emergency Excel hall map export: FR-style flattened 2D grid + tabular stand directory."""
from __future__ import annotations

import math
from typing import Any

from companies.map_layout_service import get_day_layout
from companies.map_seed import parse_label, polygon_centroid, shape_to_polygon
from companies.models import MapLayout, Settings, Stand

from .xlsx import _col_name

_FREE_FILL = '#D1FAE5'
_OCCUPIED_FILL = {
    'basic': '#FECACA',
    'partner': '#FDE68A',
    'main': '#DDD6FE',
}
_AREA_FILL = {
    4: '#BBF7D0',
    6: '#BFDBFE',
    8: '#FEF08A',
    12: '#E9D5FF',
}
_HEADER_FILL = '#D1D5DB'
_BANNER_FILL = '#E5E7EB'

_PACKAGE_LABEL = {
    'basic': 'Wystawca',
    'partner': 'Partner',
    'main': 'Partner Główny',
}

# 19 columns (0..18): Col 0 = Day banner; cols 2, 5, 8, 11, 14, 17 = narrow aisles.
_GRID_COLS = 19
_GRID_COL_WIDTHS = [
    14.0,  # 0: Dzień
    16.0,  # 1: A_side
    3.2,   # 2: alejka
    16.0,  # 3: B_left_L
    16.0,  # 4: B_left_R
    3.2,   # 5: alejka
    16.0,  # 6: B_right_L
    16.0,  # 7: B_right_R
    3.2,   # 8: alejka
    16.0,  # 9: C_L
    16.0,  # 10: C_R
    3.2,   # 11: alejka
    16.0,  # 12: D_left_L
    16.0,  # 13: D_left_R
    3.2,   # 14: alejka
    16.0,  # 15: D_right_L
    16.0,  # 16: D_right_R
    3.2,   # 17: alejka
    16.0,  # 18: E_side
]
_A_TOP_COLS = (1, 3, 4, 6, 7)
_E_TOP_COLS = (12, 13, 15, 16, 18)


def _user_name(user) -> str:
    if not user:
        return ''
    full = f'{user.first_name or ""} {user.last_name or ""}'.strip()
    return full or user.username


def _seg_geom(seg: dict[str, Any]) -> dict[str, Any]:
    poly = shape_to_polygon(seg['shape'])
    cx, cy = polygon_centroid(poly)
    max_y = max((p[1] for p in poly), default=cy)
    return {
        'label': str(seg['label']),
        'area_m2': int(seg['area_m2']),
        'cx': cx,
        'cy': cy,
        'max_y': max_y,
    }


def _classify_day_segments(day_layout: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    tracks = day_layout.get('tracks') or {}
    buckets: dict[str, list[dict[str, Any]]] = {
        'A_top': [],
        'A_side': [],
        'E_top': [],
        'E_side': [],
        'B_left_cap': [],
        'B_left_L': [],
        'B_left_R': [],
        'B_right_L': [],
        'B_right_R': [],
        'C_top_cap': [],
        'C_L': [],
        'C_R': [],
        'C_bot_cap': [],
        'D_left_L': [],
        'D_left_R': [],
        'D_right_cap': [],
        'D_right_L': [],
        'D_right_R': [],
        'F_left': [],
        'F_right': [],
        'overflow': [],
    }

    for seg in tracks.get('A', []):
        g = _seg_geom(seg)
        buckets['A_top' if g['cy'] < 120 else 'A_side'].append(g)

    for seg in tracks.get('E', []):
        g = _seg_geom(seg)
        buckets['E_top' if g['cy'] < 120 else 'E_side'].append(g)

    for seg in tracks.get('B', []):
        g = _seg_geom(seg)
        if g['cx'] < 145:
            if g['cy'] < 165 and g['max_y'] <= 168:
                buckets['B_left_cap'].append(g)
            elif g['cx'] < 107:
                buckets['B_left_L'].append(g)
            else:
                buckets['B_left_R'].append(g)
        else:
            buckets['B_right_L' if g['cx'] < 187.4 else 'B_right_R'].append(g)

    for seg in tracks.get('C', []):
        g = _seg_geom(seg)
        if g['cy'] < 118:
            buckets['C_top_cap'].append(g)
        elif g['cy'] > 227:
            buckets['C_bot_cap'].append(g)
        elif g['cx'] < 267.4:
            buckets['C_L'].append(g)
        else:
            buckets['C_R'].append(g)

    for seg in tracks.get('D', []):
        g = _seg_geom(seg)
        if g['cx'] < 385:
            buckets['D_left_L' if g['cx'] < 347.4 else 'D_left_R'].append(g)
        elif g['cy'] < 165 and g['max_y'] <= 168:
            buckets['D_right_cap'].append(g)
        elif g['cx'] < 430:
            buckets['D_right_L'].append(g)
        else:
            buckets['D_right_R'].append(g)

    for seg in tracks.get('F', []):
        g = _seg_geom(seg)
        buckets['F_left' if g['cx'] < 270 else 'F_right'].append(g)

    for track_key, segs in tracks.items():
        if track_key not in ('A', 'B', 'C', 'D', 'E', 'F'):
            for seg in segs:
                buckets['overflow'].append(_seg_geom(seg))

    for key in ('A_top', 'E_top', 'B_left_cap', 'C_top_cap', 'C_bot_cap', 'D_right_cap', 'F_left', 'F_right'):
        buckets[key].sort(key=lambda g: (g['cx'], g['cy']))
    for key in (
        'A_side', 'E_side', 'B_left_L', 'B_left_R', 'B_right_L', 'B_right_R',
        'C_L', 'C_R', 'D_left_L', 'D_left_R', 'D_right_L', 'D_right_R',
    ):
        buckets[key].sort(key=lambda g: (g['cy'], g['cx']))

    return buckets


class _GridCanvas:
    def __init__(self, width: int) -> None:
        self.width = width
        self.rows: list[list[str]] = []
        self.fills: list[list[str | None]] = []
        self.bold: list[list[bool]] = []
        self.borders: list[list[bool]] = []
        self.centered: list[list[bool]] = []
        self.wrap_text: list[list[bool]] = []
        self.row_heights: dict[int, float] = {}
        self.merges: list[str] = []

    def add_row(self, height: float | None = None) -> int:
        idx = len(self.rows)
        self.rows.append([''] * self.width)
        self.fills.append([None] * self.width)
        self.bold.append([False] * self.width)
        self.borders.append([False] * self.width)
        self.centered.append([False] * self.width)
        self.wrap_text.append([False] * self.width)
        if height is not None:
            self.row_heights[idx] = height
        return idx

    def set_cell(
        self,
        r: int,
        c: int,
        text: str,
        *,
        fill: str | None = None,
        is_bold: bool = False,
        border: bool = False,
        center: bool = False,
        wrap: bool = False,
    ) -> None:
        self.rows[r][c] = text
        self.fills[r][c] = fill
        self.bold[r][c] = is_bold
        self.borders[r][c] = border
        self.centered[r][c] = center
        self.wrap_text[r][c] = wrap

    def merge(self, r1: int, c1: int, r2: int, c2: int) -> None:
        self.merges.append(f'{_col_name(c1)}{r1 + 1}:{_col_name(c2)}{r2 + 1}')

    def paint_rect_border(self, r1: int, c1: int, r2: int, c2: int, fill: str | None = None) -> None:
        for r in range(r1, r2 + 1):
            for c in range(c1, c2 + 1):
                self.borders[r][c] = True
                if fill is not None:
                    self.fills[r][c] = fill


def _booth_cell(seg: dict[str, Any], stand: Stand | None) -> tuple[str, str, bool]:
    label = seg['label']
    area = seg['area_m2']
    if stand and stand.company:
        fill = _OCCUPIED_FILL.get(stand.company.status, _OCCUPIED_FILL['basic'])
        return f'{label} ({area} m²)\n{stand.company.name}', fill, True
    return f'{label} ({area} m²)', _FREE_FILL, False


def _place_booth(
    canvas: _GridCanvas,
    r: int,
    c: int,
    seg: dict[str, Any],
    stand_by_label: dict[str, Stand],
) -> None:
    text, fill, is_bold = _booth_cell(seg, stand_by_label.get(seg['label']))
    canvas.set_cell(r, c, text, fill=fill, is_bold=is_bold, border=True, center=True, wrap=True)


def _place_cap_group(
    canvas: _GridCanvas,
    r: int,
    col_left: int,
    col_right: int,
    caps: list[dict[str, Any]],
    stand_by_label: dict[str, Stand],
) -> int:
    """Place horizontal island caps (1 merges both columns; 2+ sit side-by-side)."""
    if not caps:
        return 0
    if len(caps) == 1:
        _place_booth(canvas, r, col_left, caps[0], stand_by_label)
        canvas.borders[r][col_right] = True
        canvas.fills[r][col_right] = canvas.fills[r][col_left]
        canvas.merge(r, col_left, r, col_right)
        return 1
    used_rows = 0
    for idx, seg in enumerate(caps):
        target_r = r + (idx // 2)
        while len(canvas.rows) <= target_r:
            canvas.add_row(height=34.0)
        target_c = col_left if idx % 2 == 0 else col_right
        _place_booth(canvas, target_r, target_c, seg, stand_by_label)
        used_rows = max(used_rows, (idx // 2) + 1)
    return used_rows


def _render_day_block(
    canvas: _GridCanvas,
    *,
    day_banner: str,
    day_title: str,
    day_layout: dict[str, Any],
    stand_by_label: dict[str, Stand],
) -> None:
    buckets = _classify_day_segments(day_layout)
    all_segs = [seg for segs in (day_layout.get('tracks') or {}).values() for seg in segs]
    occupied_count = sum(1 for seg in all_segs if str(seg['label']) in stand_by_label)
    free_count = max(0, len(all_segs) - occupied_count)

    banner_row = canvas.add_row(height=24.0)
    canvas.set_cell(
        banner_row,
        0,
        f'{day_title} — zajęte: {occupied_count} / {len(all_segs)} (wolne: {free_count})',
        fill=_HEADER_FILL,
        is_bold=True,
        border=True,
        center=False,
    )
    canvas.paint_rect_border(banner_row, 0, banner_row, _GRID_COLS - 1, fill=_HEADER_FILL)
    canvas.merge(banner_row, 0, banner_row, _GRID_COLS - 1)

    top_rows = max(
        1 if (buckets['A_top'] or buckets['E_top']) else 0,
        math.ceil(len(buckets['A_top']) / len(_A_TOP_COLS)) if buckets['A_top'] else 0,
        math.ceil(len(buckets['E_top']) / len(_E_TOP_COLS)) if buckets['E_top'] else 0,
    )
    top_start_row = len(canvas.rows)
    for idx in range(top_rows):
        r = canvas.add_row(height=34.0)
        chunk_a = buckets['A_top'][idx * 5 : (idx + 1) * 5]
        for seg, c in zip(chunk_a, _A_TOP_COLS):
            _place_booth(canvas, r, c, seg, stand_by_label)
        chunk_e = buckets['E_top'][idx * 5 : (idx + 1) * 5]
        for seg, c in zip(chunk_e, _E_TOP_COLS):
            _place_booth(canvas, r, c, seg, stand_by_label)

    # Aisle between upper diagonal arc (A6-A10 / E6-E10) and central hall islands.
    canvas.add_row(height=14.0)

    b_left_cap_rows = math.ceil(len(buckets['B_left_cap']) / 2) if buckets['B_left_cap'] else 0
    d_right_cap_rows = math.ceil(len(buckets['D_right_cap']) / 2) if buckets['D_right_cap'] else 0
    c_top_rows = math.ceil(len(buckets['C_top_cap']) / 2) if buckets['C_top_cap'] else 0
    c_bot_rows = math.ceil(len(buckets['C_bot_cap']) / 2) if buckets['C_bot_cap'] else 0

    main_rows = max(
        1,
        len(buckets['A_side']),
        len(buckets['E_side']),
        b_left_cap_rows + max(len(buckets['B_left_L']), len(buckets['B_left_R'])),
        max(len(buckets['B_right_L']), len(buckets['B_right_R'])),
        c_top_rows + max(len(buckets['C_L']), len(buckets['C_R'])) + c_bot_rows,
        max(len(buckets['D_left_L']), len(buckets['D_left_R'])),
        d_right_cap_rows + max(len(buckets['D_right_L']), len(buckets['D_right_R'])),
    )

    main_start_row = len(canvas.rows)
    for _ in range(main_rows):
        canvas.add_row(height=34.0)

    for i, seg in enumerate(buckets['A_side']):
        _place_booth(canvas, main_start_row + i, 1, seg, stand_by_label)
    for i, seg in enumerate(buckets['E_side']):
        _place_booth(canvas, main_start_row + i, 18, seg, stand_by_label)

    _place_cap_group(canvas, main_start_row, 3, 4, buckets['B_left_cap'], stand_by_label)
    for i, seg in enumerate(buckets['B_left_L']):
        _place_booth(canvas, main_start_row + b_left_cap_rows + i, 3, seg, stand_by_label)
    for i, seg in enumerate(buckets['B_left_R']):
        _place_booth(canvas, main_start_row + b_left_cap_rows + i, 4, seg, stand_by_label)

    for i, seg in enumerate(buckets['B_right_L']):
        _place_booth(canvas, main_start_row + i, 6, seg, stand_by_label)
    for i, seg in enumerate(buckets['B_right_R']):
        _place_booth(canvas, main_start_row + i, 7, seg, stand_by_label)

    _place_cap_group(canvas, main_start_row, 9, 10, buckets['C_top_cap'], stand_by_label)
    c_mid_len = max(len(buckets['C_L']), len(buckets['C_R']))
    for i, seg in enumerate(buckets['C_L']):
        _place_booth(canvas, main_start_row + c_top_rows + i, 9, seg, stand_by_label)
    for i, seg in enumerate(buckets['C_R']):
        _place_booth(canvas, main_start_row + c_top_rows + i, 10, seg, stand_by_label)
    _place_cap_group(canvas, main_start_row + c_top_rows + c_mid_len, 9, 10, buckets['C_bot_cap'], stand_by_label)

    for i, seg in enumerate(buckets['D_left_L']):
        _place_booth(canvas, main_start_row + i, 12, seg, stand_by_label)
    for i, seg in enumerate(buckets['D_left_R']):
        _place_booth(canvas, main_start_row + i, 13, seg, stand_by_label)

    _place_cap_group(canvas, main_start_row, 15, 16, buckets['D_right_cap'], stand_by_label)
    for i, seg in enumerate(buckets['D_right_L']):
        _place_booth(canvas, main_start_row + d_right_cap_rows + i, 15, seg, stand_by_label)
    for i, seg in enumerate(buckets['D_right_R']):
        _place_booth(canvas, main_start_row + d_right_cap_rows + i, 16, seg, stand_by_label)

    if buckets['F_left'] or buckets['F_right']:
        canvas.add_row(height=14.0)
        f_rows = max(
            1,
            math.ceil(len(buckets['F_left']) / 2),
            math.ceil(len(buckets['F_right']) / 2),
        )
        f_start = len(canvas.rows)
        for _ in range(f_rows):
            canvas.add_row(height=34.0)
        for i, seg in enumerate(buckets['F_left']):
            _place_booth(canvas, f_start + (i // 2), 6 + (i % 2), seg, stand_by_label)
        for i, seg in enumerate(buckets['F_right']):
            _place_booth(canvas, f_start + (i // 2), 12 + (i % 2), seg, stand_by_label)

    if buckets['overflow']:
        ov_cols = (1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16, 18)
        ov_rows = math.ceil(len(buckets['overflow']) / len(ov_cols))
        ov_start = len(canvas.rows)
        for _ in range(ov_rows):
            canvas.add_row(height=34.0)
        for i, seg in enumerate(buckets['overflow']):
            _place_booth(canvas, ov_start + (i // len(ov_cols)), ov_cols[i % len(ov_cols)], seg, stand_by_label)

    day_end_row = len(canvas.rows) - 1
    if day_end_row >= top_start_row:
        canvas.set_cell(
            top_start_row,
            0,
            day_banner,
            fill=_BANNER_FILL,
            is_bold=True,
            border=True,
            center=True,
            wrap=True,
        )
        canvas.paint_rect_border(top_start_row, 0, day_end_row, 0, fill=_BANNER_FILL)
        if day_end_row > top_start_row:
            canvas.merge(top_start_row, 0, day_end_row, 0)


def _build_visual_map_sheet(
    *,
    day1_label: str,
    day2_label: str,
    day1_layout: dict[str, Any],
    day2_layout: dict[str, Any],
    stands_d1: dict[str, Stand],
    stands_d2: dict[str, Stand],
) -> dict[str, Any]:
    canvas = _GridCanvas(_GRID_COLS)

    _render_day_block(
        canvas,
        day_banner=f'Dzień 1\n{day1_label}',
        day_title=f'Dzień 1 ({day1_label})',
        day_layout=day1_layout,
        stand_by_label=stands_d1,
    )
    canvas.add_row(height=16.0)
    _render_day_block(
        canvas,
        day_banner=f'Dzień 2\n{day2_label}',
        day_title=f'Dzień 2 ({day2_label})',
        day_layout=day2_layout,
        stand_by_label=stands_d2,
    )
    canvas.add_row(height=16.0)

    leg_hdr = canvas.add_row(height=22.0)
    canvas.set_cell(leg_hdr, 1, 'Legenda mapy hali', fill=_HEADER_FILL, is_bold=True, border=True)
    canvas.paint_rect_border(leg_hdr, 1, leg_hdr, 7, fill=_HEADER_FILL)
    canvas.merge(leg_hdr, 1, leg_hdr, 7)

    legend_items = (
        ('Wolne stoisko', _FREE_FILL),
        ('Zajęte — Wystawca', _OCCUPIED_FILL['basic']),
        ('Zajęte — Partner', _OCCUPIED_FILL['partner']),
        ('Zajęte — Partner Główny', _OCCUPIED_FILL['main']),
    )
    for label_text, color in legend_items:
        lr = canvas.add_row(height=22.0)
        canvas.set_cell(lr, 1, '', fill=color, border=True, center=True)
        canvas.set_cell(lr, 3, label_text, fill=None, border=True)
        canvas.paint_rect_border(lr, 3, lr, 7)
        canvas.merge(lr, 3, lr, 7)

    return {
        'name': 'Mapa wizualna',
        'rows': canvas.rows,
        'fills': canvas.fills,
        'bold': canvas.bold,
        'borders': canvas.borders,
        'centered': canvas.centered,
        'wrap_text': canvas.wrap_text,
        'col_widths': _GRID_COL_WIDTHS,
        'row_heights': canvas.row_heights,
        'merges': canvas.merges,
        'freeze_rows': 0,
        'freeze_cols': 1,
    }


def _sort_label_key(label: str) -> tuple[str, int, str, str]:
    try:
        letter, num, suffix = parse_label(label)
        return (letter, num, suffix, label)
    except ValueError:
        return ('ZZZ', 0, '', label)


def _build_stand_list_sheet(
    *,
    day1_label: str,
    day2_label: str,
    day1_layout: dict[str, Any],
    day2_layout: dict[str, Any],
    stands_d1: dict[str, Stand],
    stands_d2: dict[str, Stand],
) -> dict[str, Any]:
    seg_d1 = {
        str(s['label']): (track, int(s['area_m2']))
        for track, segs in (day1_layout.get('tracks') or {}).items()
        for s in segs
    }
    seg_d2 = {
        str(s['label']): (track, int(s['area_m2']))
        for track, segs in (day2_layout.get('tracks') or {}).items()
        for s in segs
    }
    all_labels = sorted(set(seg_d1) | set(seg_d2) | set(stands_d1) | set(stands_d2), key=_sort_label_key)

    headers = [
        'Tor',
        'Stoisko',
        f'Rozmiar D1 ({day1_label})',
        'Firma D1',
        'Pakiet D1',
        'Opiekun FR D1',
        'Opiekun D1',
        f'Rozmiar D2 ({day2_label})',
        'Firma D2',
        'Pakiet D2',
        'Opiekun FR D2',
        'Opiekun D2',
    ]
    width = len(headers)
    rows: list[list[str]] = [headers]
    fills: list[list[str | None]] = [[_HEADER_FILL] * width]
    bold: list[list[bool]] = [[True] * width]
    borders: list[list[bool]] = [[True] * width]
    centered: list[list[bool]] = [[True] * width]

    for label in all_labels:
        track = (seg_d1.get(label) or seg_d2.get(label) or (label[:1], 0))[0]
        area1 = seg_d1[label][1] if label in seg_d1 else None
        area2 = seg_d2[label][1] if label in seg_d2 else None
        st1 = stands_d1.get(label)
        st2 = stands_d2.get(label)

        def _day_cells(area: int | None, stand: Stand | None) -> tuple[list[str], list[str | None], list[bool]]:
            size_text = f'{area} m²' if area is not None else ''
            size_fill = _AREA_FILL.get(area) if area is not None else None
            if stand and stand.company:
                comp = stand.company
                comp_fill = _OCCUPIED_FILL.get(comp.status)
                return (
                    [
                        size_text,
                        comp.name,
                        _PACKAGE_LABEL.get(comp.status, comp.status),
                        _user_name(comp.fr_resp),
                        _user_name(comp.opiekun),
                    ],
                    [size_fill, comp_fill, None, None, None],
                    [False, True, False, False, False],
                )
            return ([size_text, '', '', '', ''], [size_fill, None, None, None, None], [False] * 5)

        d1_vals, d1_fills, d1_bold = _day_cells(area1, st1)
        d2_vals, d2_fills, d2_bold = _day_cells(area2, st2)

        rows.append([track, label, *d1_vals, *d2_vals])
        fills.append([_BANNER_FILL, None, *d1_fills, *d2_fills])
        bold.append([True, True, *d1_bold, *d2_bold])
        borders.append([True] * width)
        centered.append([True, True, True, False, False, False, False, True, False, False, False, False])

    return {
        'name': 'Lista stoisk',
        'rows': rows,
        'fills': fills,
        'bold': bold,
        'borders': borders,
        'centered': centered,
        'col_widths': [6.0, 10.0, 16.0, 24.0, 14.0, 18.0, 18.0, 16.0, 24.0, 14.0, 18.0, 18.0],
        'row_heights': {0: 24.0},
        'merges': [],
        'freeze_rows': 1,
        'freeze_cols': 2,
    }


def build_map_sheet_entries() -> list[dict[str, Any]]:
    """Build both map backup tabs: flattened 2D visual hall grid + full stand table."""
    layout = MapLayout.get_solo()
    day1_layout = get_day_layout(layout, 'day1')
    day2_layout = get_day_layout(layout, 'day2')

    settings_obj = Settings.get_settings()
    day1_label = settings_obj.get_day1_display_pl()
    day2_label = settings_obj.get_day2_display_pl()

    stands_d1: dict[str, Stand] = {}
    stands_d2: dict[str, Stand] = {}
    for stand in (
        Stand.objects.exclude(stand_number__in=['', 'brak'])
        .select_related('company', 'company__fr_resp', 'company__opiekun')
    ):
        num = (stand.stand_number or '').strip()
        if not num:
            continue
        if stand.day == 'day1':
            stands_d1[num] = stand
        elif stand.day == 'day2':
            stands_d2[num] = stand

    return [
        _build_visual_map_sheet(
            day1_label=day1_label,
            day2_label=day2_label,
            day1_layout=day1_layout,
            day2_layout=day2_layout,
            stands_d1=stands_d1,
            stands_d2=stands_d2,
        ),
        _build_stand_list_sheet(
            day1_label=day1_label,
            day2_label=day2_label,
            day1_layout=day1_layout,
            day2_layout=day2_layout,
            stands_d1=stands_d1,
            stands_d2=stands_d2,
        ),
    ]
