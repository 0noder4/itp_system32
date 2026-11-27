"""Server-side high-resolution PNG hall map renderer (mirrors MapCanvas.tsx + mapExport.ts)."""
from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from companies.map_layout_service import get_day_layout
from companies.map_seed import shape_to_polygon
from companies.models import MapLayout, Stand

VIEWBOX_W = 534.8
VIEWBOX_H = 297.8
EXPORT_WIDTH = 2140
EXPORT_HEIGHT = round(EXPORT_WIDTH * (VIEWBOX_H / VIEWBOX_W))  # 1192
SUPERSAMPLE = 2

_BG_HEX = '#f8fafc'
_ACCENT_HEX = '#F55718'
_PARTNER_FILL_HEX = '#F4A6A6'
_PARTNER_STROKE_HEX = '#c45c5c'
_SIZE_COLORS = {
    4: '#A9D08E',
    6: '#9DC3E6',
    8: '#F4B183',
    12: '#D0A9F5',
}

_FONT_REGULAR_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    r'C:\Windows\Fonts\segoeui.ttf',
    r'C:\Windows\Fonts\arial.ttf',
)
_FONT_BOLD_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    r'C:\Windows\Fonts\segoeuib.ttf',
    r'C:\Windows\Fonts\arialbd.ttf',
)

# Global staff views matching frontend/app/panel/staff/map/page.tsx (excluding user-specific "mine").
GLOBAL_MAP_VIEWS: tuple[dict[str, Any], ...] = (
    {'suffix': '', 'stand_sizes': False, 'partners': False, 'clean': False},
    {'suffix': '-rozmiary', 'stand_sizes': True, 'partners': False, 'clean': False},
    {'suffix': '-partnerzy', 'stand_sizes': False, 'partners': True, 'clean': False},
    {'suffix': '-rozmiary-partnerzy', 'stand_sizes': True, 'partners': True, 'clean': False},
    {'suffix': '-czysty', 'stand_sizes': False, 'partners': False, 'clean': True},
)


def _hex_to_rgba(hex_color: str, opacity: float = 1.0) -> tuple[int, int, int, int]:
    h = hex_color.lstrip('#')
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    a = max(0, min(255, round(opacity * 255)))
    return (r, g, b, a)


def _load_font(size: int, *, bold: bool) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = _FONT_BOLD_CANDIDATES if bold else _FONT_REGULAR_CANDIDATES
    for path in candidates:
        if Path(path).is_file():
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _size_color_for_area(area_m2: int) -> str:
    if area_m2 in _SIZE_COLORS:
        return _SIZE_COLORS[area_m2]
    if area_m2 <= 4:
        return _SIZE_COLORS[4]
    if area_m2 <= 6:
        return _SIZE_COLORS[6]
    if area_m2 <= 8:
        return _SIZE_COLORS[8]
    return _SIZE_COLORS[12]


def _get_legend_items(view: dict[str, Any]) -> list[tuple[str, str]]:
    if view['clean'] or (not view['stand_sizes'] and not view['partners']):
        return []
    items: list[tuple[str, str]] = []
    if view['stand_sizes']:
        items.extend([
            (_SIZE_COLORS[4], '4 m²'),
            (_SIZE_COLORS[6], '6 m²'),
            (_SIZE_COLORS[8], '8 m²'),
            (_SIZE_COLORS[12], '12 m²'),
        ])
    if view['partners']:
        items.append((_PARTNER_FILL_HEX, 'Partner'))
    return items


def _resolve_paint(
    seg: dict[str, Any],
    stand: Stand | None,
    view: dict[str, Any],
) -> dict[str, Any]:
    if view['clean']:
        return {
            'fill': _hex_to_rgba('#ffffff', 0.02),
            'stroke': _hex_to_rgba('#000000', 1.0),
            'stroke_width': 1.0,
            'emphasized': False,
            'text_color': _hex_to_rgba('#000000', 1.0),
        }

    if view['stand_sizes'] or view['partners']:
        status = stand.company.status if (stand and stand.company) else None
        if view['partners'] and status in ('partner', 'main'):
            return {
                'fill': _hex_to_rgba(_PARTNER_FILL_HEX, 0.85),
                'stroke': _hex_to_rgba(_PARTNER_STROKE_HEX, 1.0),
                'stroke_width': 1.5,
                'emphasized': True,
                'text_color': _hex_to_rgba('#000000', 1.0),
            }
        if view['stand_sizes']:
            area_m2 = int(seg.get('area_m2') or 4)
            return {
                'fill': _hex_to_rgba(_size_color_for_area(area_m2), 0.90),
                'stroke': _hex_to_rgba('#000000', 1.0),
                'stroke_width': 1.0,
                'emphasized': True,
                'text_color': _hex_to_rgba('#000000', 1.0),
            }
        return {
            'fill': _hex_to_rgba('#ffffff', 0.02),
            'stroke': _hex_to_rgba('#000000', 1.0),
            'stroke_width': 1.0,
            'emphasized': False,
            'text_color': _hex_to_rgba('#000000', 1.0),
        }

    # Default view
    if stand and stand.company:
        accent = _hex_to_rgba(_ACCENT_HEX, 1.0)
        return {
            'fill': _hex_to_rgba(_ACCENT_HEX, 0.30),
            'stroke': accent,
            'stroke_width': 2.0,
            'emphasized': True,
            'text_color': accent,
        }
    return {
        'fill': _hex_to_rgba('#ffffff', 0.02),
        'stroke': _hex_to_rgba('#000000', 1.0),
        'stroke_width': 1.0,
        'emphasized': False,
        'text_color': _hex_to_rgba('#000000', 1.0),
    }


def _polygon_bbox_center(pts: list[tuple[float, float]]) -> tuple[float, float]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0)


def _render_map_png(
    day_layout: dict[str, Any],
    stands_by_label: dict[str, Stand],
    view: dict[str, Any],
) -> bytes:
    hi_w = EXPORT_WIDTH * SUPERSAMPLE
    hi_h = EXPORT_HEIGHT * SUPERSAMPLE
    scale_x = hi_w / VIEWBOX_W
    scale_y = hi_h / VIEWBOX_H
    scale = (scale_x + scale_y) / 2.0

    canvas = Image.new('RGBA', (hi_w, hi_h), _hex_to_rgba(_BG_HEX, 1.0))

    raw_segments = [
        seg
        for segs in (day_layout.get('tracks') or {}).values()
        for seg in segs
    ]

    prepared: list[tuple[int, dict[str, Any], dict[str, Any], list[tuple[float, float]]]] = []
    for seg in raw_segments:
        label = str(seg['label'])
        stand = stands_by_label.get(label)
        paint = _resolve_paint(seg, stand, view)
        poly = shape_to_polygon(seg['shape'])
        scaled_pts = [(px * scale_x, py * scale_y) for px, py in poly]
        order = 1 if paint['emphasized'] else 0
        prepared.append((order, seg, paint, scaled_pts))

    # Draw non-emphasized segments first so highlighted borders win over black neighbour edges.
    prepared.sort(key=lambda item: item[0])

    font_size = max(12, round(9.0 * scale))
    font_regular = _load_font(font_size, bold=False)
    font_bold = _load_font(font_size, bold=True)
    halo_width = max(1, round(0.35 * scale))

    for _order, seg, paint, scaled_pts in prepared:
        if len(scaled_pts) < 3:
            continue

        # Alpha-composite semi-transparent booth fill onto the map canvas.
        overlay = Image.new('RGBA', (hi_w, hi_h), (0, 0, 0, 0))
        ov_draw = ImageDraw.Draw(overlay, 'RGBA')
        ov_draw.polygon(scaled_pts, fill=paint['fill'])
        canvas = Image.alpha_composite(canvas, overlay)

        draw = ImageDraw.Draw(canvas, 'RGBA')
        stroke_px = max(1, round(paint['stroke_width'] * scale))
        closed_pts = [*scaled_pts, scaled_pts[0]]
        draw.line(closed_pts, fill=paint['stroke'], width=stroke_px, joint='curve')

        cx, cy = _polygon_bbox_center(scaled_pts)
        label_font = font_bold if paint['emphasized'] else font_regular
        draw.text(
            (cx, cy),
            str(seg['label']),
            font=label_font,
            fill=paint['text_color'],
            anchor='mm',
            stroke_width=halo_width,
            stroke_fill=(255, 255, 255, 255),
        )

    map_img = canvas.resize((EXPORT_WIDTH, EXPORT_HEIGHT), Image.Resampling.LANCZOS).convert('RGB')

    legend_items = _get_legend_items(view)
    if legend_items:
        legend_h = 84
        full_img = Image.new('RGB', (EXPORT_WIDTH, EXPORT_HEIGHT + legend_h), (255, 255, 255))
        full_img.paste(map_img, (0, 0))
        leg_draw = ImageDraw.Draw(full_img)
        leg_draw.rectangle([0, EXPORT_HEIGHT, EXPORT_WIDTH, EXPORT_HEIGHT + 1], fill=(203, 213, 225))

        leg_font = _load_font(26, bold=True)
        x = 40
        center_y = EXPORT_HEIGHT + legend_h // 2
        swatch_size = 28

        for color_hex, label_text in legend_items:
            y0 = center_y - swatch_size // 2
            y1 = y0 + swatch_size
            leg_draw.rectangle(
                [x, y0, x + swatch_size, y1],
                fill=color_hex,
                outline=(140, 140, 140),
                width=2,
            )
            x += swatch_size + 14
            leg_draw.text((x, center_y), label_text, font=leg_font, fill=(51, 65, 85), anchor='lm')
            bbox = leg_draw.textbbox((x, center_y), label_text, font=leg_font, anchor='lm')
            x = bbox[2] + 48

        final_img = full_img
    else:
        final_img = map_img

    buf = io.BytesIO()
    final_img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


def build_map_png_files() -> dict[str, bytes]:
    """Generate all 10 global staff map view PNGs (5 view variants x 2 days)."""
    layout = MapLayout.get_solo()
    day_layouts = {
        1: get_day_layout(layout, 'day1'),
        2: get_day_layout(layout, 'day2'),
    }

    stands_by_day: dict[int, dict[str, Stand]] = {1: {}, 2: {}}
    for stand in (
        Stand.objects.exclude(stand_number__in=['', 'brak'])
        .select_related('company')
    ):
        num = (stand.stand_number or '').strip()
        if not num:
            continue
        if stand.day == 'day1':
            stands_by_day[1][num] = stand
        elif stand.day == 'day2':
            stands_by_day[2][num] = stand

    files: dict[str, bytes] = {}
    for day_num in (1, 2):
        for view in GLOBAL_MAP_VIEWS:
            filename = f"mapa-itp-dzien-{day_num}{view['suffix']}.png"
            files[filename] = _render_map_png(
                day_layouts[day_num],
                stands_by_day[day_num],
                view,
            )
    return files
