"""Default hall map layout seed and helpers."""
from __future__ import annotations

import copy
import math
import re
from typing import Any

from .map_seed_data import DEFAULT_LAYOUT, TRACK_TOTAL_FRONT_M

ALLOWED_AREAS = (4, 6, 8, 12)
# Auto „Zmień podział…” — without 12 m² (rare; only via manual dialog)
AUTO_ALLOWED_AREAS = (4, 6, 8)
DEPTH_M = 2.0
Point = tuple[float, float]


def front_m(area_m2: int) -> float:
    return area_m2 / DEPTH_M


def default_layout() -> dict[str, Any]:
    return copy.deepcopy(DEFAULT_LAYOUT)


def track_total_front(letter: str) -> float:
    return float(TRACK_TOTAL_FRONT_M[letter])


def validate_track_segments(letter: str, segments: list[dict]) -> None:
    total = sum(front_m(int(s["area_m2"])) for s in segments)
    expected = track_total_front(letter)
    if abs(total - expected) > 0.01:
        raise ValueError(
            f"Track {letter}: front sum {total} m != budget {expected} m"
        )
    for s in segments:
        if int(s["area_m2"]) not in ALLOWED_AREAS:
            raise ValueError(f"Invalid area_m2={s['area_m2']} for {s.get('label')}")


def parse_label(label: str) -> tuple[str, int, str]:
    m = re.match(r"^([A-Z]+)(\d+)([a-z]?)$", label)
    if not m:
        raise ValueError(f"Bad label {label}")
    return m.group(1), int(m.group(2)), m.group(3) or ""


def _parse_points(s: str) -> list[Point]:
    nums = [float(n) for n in re.findall(r"[-+]?\d*\.?\d+", s)]
    return [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]


def shape_to_polygon(shape: dict) -> list[Point]:
    """Return open ring (no duplicate closing point)."""
    if shape["type"] == "polygon":
        pts = _parse_points(shape["points"])
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        return pts
    x, y, w, h = shape["x"], shape["y"], shape["width"], shape["height"]
    corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    # Ignore SVG transform for now (E10 was converted to polygon in seed)
    return corners


def polygon_centroid(pts: list[Point]) -> Point:
    if not pts:
        return (0.0, 0.0)
    return (
        sum(p[0] for p in pts) / len(pts),
        sum(p[1] for p in pts) / len(pts),
    )


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _lerp(a: Point, b: Point, t: float) -> Point:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _unit(dx: float, dy: float) -> Point:
    L = math.hypot(dx, dy) or 1.0
    return (dx / L, dy / L)


def _extreme_face(poly: list[Point], axis: Point, take_max: bool) -> tuple[Point, Point]:
    """
    Face of the booth at the min/max end along `axis`.
    Uses vertices near the extreme projection (handles dense SVG polygons).
    """
    dx, dy = axis
    # Degenerate axis → fall back to X
    if abs(dx) < 1e-12 and abs(dy) < 1e-12:
        dx, dy = 1.0, 0.0
    projs = [p[0] * dx + p[1] * dy for p in poly]
    target = max(projs) if take_max else min(projs)
    span = max(projs) - min(projs)
    tol = max(0.5, span * 0.08) if span > 1e-9 else 0.5
    face = [p for p, pr in zip(poly, projs) if abs(pr - target) <= tol]
    if len(face) < 2:
        ranked = sorted(zip(projs, poly), key=lambda t: t[0], reverse=take_max)
        face = [ranked[0][1], ranked[min(1, len(ranked) - 1)][1]]
    px, py = -dy, dx
    face = sorted(face, key=lambda p: p[0] * px + p[1] * py)
    return face[0], face[-1]


def _longest_edge_dir(poly: list[Point]) -> Point:
    """Strip axis for a single booth ≈ direction of its longest edge."""
    best_L = -1.0
    best = (1.0, 0.0)
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        if L > best_L:
            best_L = L
            best = _unit(dx, dy)
    return best


def _strip_axis(
    polys: list[list[Point]],
    before: list[Point] | None = None,
    after: list[Point] | None = None,
) -> Point:
    if len(polys) >= 2:
        c0 = polygon_centroid(polys[0])
        c1 = polygon_centroid(polys[-1])
        dx, dy = c1[0] - c0[0], c1[1] - c0[1]
        if math.hypot(dx, dy) > 1e-6:
            return _unit(dx, dy)
    # Single booth: cut along the long side → roughly square halves
    # (C1 40×20 → dwa kwadraty obok siebie; B6 20×40 → dwa jedno nad drugim).
    # Neighbour direction would follow the track (C1→C2 w górę) and yield
    # thin horizontal strips — looks wrong.
    _ = before, after
    return _longest_edge_dir(polys[0])


def _fmt_points(pts: list[Point]) -> str:
    parts = []
    for x, y in pts:
        parts.append(f"{round(x, 2):g} {round(y, 2):g}")
    if pts:
        parts.append(f"{round(pts[0][0], 2):g} {round(pts[0][1], 2):g}")
    return " ".join(parts)


def _oriented_faces(
    poly: list[Point], axis: Point
) -> tuple[Point, Point, Point, Point]:
    """Start (a,b) and end (a,b) faces of a booth along axis, winding matched."""
    sa, sb = _extreme_face(poly, axis, take_max=False)
    ea, eb = _extreme_face(poly, axis, take_max=True)
    if _dist(sa, ea) + _dist(sb, eb) > _dist(sa, eb) + _dist(sb, ea):
        ea, eb = eb, ea
    if _dist(sa, ea) < 1e-6 and _dist(sb, eb) < 1e-6:
        axis = _longest_edge_dir(poly)
        sa, sb = _extreme_face(poly, axis, take_max=False)
        ea, eb = _extreme_face(poly, axis, take_max=True)
        if _dist(sa, ea) + _dist(sb, eb) > _dist(sa, eb) + _dist(sb, ea):
            ea, eb = eb, ea
    return sa, sb, ea, eb


def _poly_area(pts: list[Point]) -> float:
    a = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return abs(a) * 0.5


def _dedup_ring(ring: list[Point]) -> list[Point]:
    if not ring:
        return ring
    dedup: list[Point] = [ring[0]]
    for p in ring[1:]:
        if _dist(p, dedup[-1]) > 1e-6:
            dedup.append(p)
    if len(dedup) > 1 and _dist(dedup[0], dedup[-1]) <= 1e-6:
        dedup.pop()
    return dedup


def _seg_intersect_proper(p1: Point, p2: Point, p3: Point, p4: Point) -> bool:
    """True if segments p1–p2 and p3–p4 cross (not just touch at an endpoint)."""

    def orient(a: Point, b: Point, c: Point) -> float:
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    o1 = orient(p1, p2, p3)
    o2 = orient(p1, p2, p4)
    o3 = orient(p3, p4, p1)
    o4 = orient(p3, p4, p2)
    return o1 * o2 < 0 and o3 * o4 < 0


def _ring_self_intersects(pts: list[Point]) -> bool:
    n = len(pts)
    if n < 4:
        return False
    for i in range(n):
        a1, a2 = pts[i], pts[(i + 1) % n]
        for j in range(i + 1, n):
            if j == i or (j + 1) % n == i or (i + 1) % n == j:
                continue
            b1, b2 = pts[j], pts[(j + 1) % n]
            if _seg_intersect_proper(a1, a2, b1, b2):
                return True
    return False


def _align_quad_chain(quads: list[list[Point]]) -> list[list[Point]]:
    """
    Ensure each next quad continues from the previous end face.
    A 180°-flipped strip (last booth aimed at an L-corner neighbour) shows up
    as start/end reversed — flip that quad before merging.
    """
    if len(quads) < 2:
        return quads
    out: list[list[Point]] = [list(quads[0])]
    for q in quads[1:]:
        prev = out[-1]
        d_fwd = _dist(prev[3], q[0]) + _dist(prev[2], q[1])
        d_rev = _dist(prev[3], q[3]) + _dist(prev[2], q[2])
        if d_rev + 1e-6 < d_fwd:
            q = [q[3], q[2], q[1], q[0]]
        out.append(list(q))
    return out


def _merge_strip_quads(quads: list[list[Point]]) -> dict:
    """
    Join consecutive strip quads into one polygon that follows turns (L-corners).
    Each quad is [p0, p1, p2, p3] with p0–p1 start face, p3–p2 end face.
    Picks a non-self-intersecting ring whose area is closest to the sum of
    part areas (bowties from bad winding used to win on a fluke).
    """
    if len(quads) == 1:
        return {"type": "polygon", "points": _fmt_points(quads[0])}
    quads = _align_quad_chain(quads)
    parts_area = sum(_poly_area(q) for q in quads)

    def ring_a() -> list[Point]:
        # Continue along side-b of next quad (p1→p2)
        r: list[Point] = [quads[0][0], quads[0][1], quads[0][2]]
        for q in quads[1:]:
            r.append(q[1])
            r.append(q[2])
        r.append(quads[-1][3])
        for q in reversed(quads[1:]):
            r.append(q[0])
        r.append(quads[0][3])
        return _dedup_ring(r)

    def ring_b() -> list[Point]:
        # Enter next quad at p0 (side-a), traverse opposite way
        r: list[Point] = [quads[0][0], quads[0][1], quads[0][2]]
        for q in quads[1:]:
            r.append(q[0])
            r.append(q[3])
            r.append(q[2])
            r.append(q[1])
        r.append(quads[0][3])
        return _dedup_ring(r)

    def ring_chain() -> list[Point]:
        # Collinear / same-winding strip: outer boundary only
        r: list[Point] = [quads[0][0], quads[0][1]]
        for q in quads:
            r.append(q[2])
        for q in reversed(quads):
            r.append(q[3])
        return _dedup_ring(r)

    candidates = [ring_a(), ring_b(), ring_chain()]
    scored: list[tuple[float, list[Point]]] = []
    for r in candidates:
        if len(r) < 3:
            continue
        area_err = abs(_poly_area(r) - parts_area)
        # Heavy penalty for hourglass / bowtie rings
        if _ring_self_intersects(r):
            area_err += parts_area + 1.0
        elif parts_area > 1e-6 and _poly_area(r) < parts_area * 0.5:
            area_err += parts_area
        scored.append((area_err, r))
    if not scored:
        return {"type": "polygon", "points": _fmt_points(quads[0])}
    best = min(scored, key=lambda t: t[0])[1]
    return {"type": "polygon", "points": _fmt_points(best)}


def split_strip_polygons(
    selected: list[dict],
    areas: list[int],
    *,
    before_shape: dict | None = None,
    after_shape: dict | None = None,
) -> list[dict]:
    """
    Split contiguous selection into new polygons along the booth chain.

    Multi-booth: axis = direction along the selection chain (centroids).
    Using longest-edge per booth fails after splits — a 4 m² slice of a
    vertical 6/8 m² booth is often wider than tall, so longest-edge is
    perpendicular to the track and merge produces hourglass polygons
    (seen on D7a+D7b+D8 → 4+8).

    Single booth: axis = longest edge (square-ish halves for C1 / B6).
    """
    polys = [shape_to_polygon(s["shape"]) for s in selected]
    before = shape_to_polygon(before_shape) if before_shape else None
    after = shape_to_polygon(after_shape) if after_shape else None
    n = len(polys)

    # Per-booth strip: local axis + start/end faces
    strips: list[dict[str, Any]] = []
    old_fronts: list[float] = []
    for i, poly in enumerate(polys):
        prev_p = polys[i - 1] if i > 0 else before
        next_p = polys[i + 1] if i + 1 < n else after
        c = polygon_centroid(poly)
        if n >= 2:
            # Chain direction between this booth and its selected neighbour.
            # Do NOT aim at outside track neighbours (before/after): the booth
            # after a selection can sit on an L-corner (B2b→B3) and flipping
            # the last strip 180° makes merge build an hourglass.
            if i + 1 < n:
                c1 = polygon_centroid(polys[i + 1])
                dx, dy = c1[0] - c[0], c1[1] - c[1]
            else:
                c0 = polygon_centroid(polys[i - 1])
                dx, dy = c[0] - c0[0], c[1] - c0[1]
            if math.hypot(dx, dy) > 1e-6:
                axis = _unit(dx, dy)
            else:
                axis = _longest_edge_dir(poly)
        else:
            axis = _strip_axis([poly], prev_p, next_p)
            # Single booth: orient toward outside neighbour when present
            aim: Point | None = None
            if next_p is not None:
                ca = polygon_centroid(next_p)
                aim = (ca[0] - c[0], ca[1] - c[1])
            elif prev_p is not None:
                cb = polygon_centroid(prev_p)
                aim = (c[0] - cb[0], c[1] - cb[1])
            if aim and math.hypot(*aim) > 1e-6:
                u = _unit(*aim)
                if axis[0] * u[0] + axis[1] * u[1] < 0:
                    axis = (-axis[0], -axis[1])
        sa, sb, ea, eb = _oriented_faces(poly, axis)
        strips.append({"sa": sa, "sb": sb, "ea": ea, "eb": eb})
        old_fronts.append(front_m(int(selected[i]["area_m2"])))

    # Match winding at joints (do not replace faces — L-corners have a gap).
    # Swapping only the start face would cross the parallelogram sides — swap end too.
    for i in range(n - 1):
        ea, eb = strips[i]["ea"], strips[i]["eb"]
        sa, sb = strips[i + 1]["sa"], strips[i + 1]["sb"]
        if _dist(ea, sa) + _dist(eb, sb) > _dist(ea, sb) + _dist(eb, sa):
            strips[i + 1]["sa"], strips[i + 1]["sb"] = sb, sa
            strips[i + 1]["ea"], strips[i + 1]["eb"] = (
                strips[i + 1]["eb"],
                strips[i + 1]["ea"],
            )

    new_fronts = [front_m(a) for a in areas]
    total_front = sum(old_fronts) or 1.0
    shapes: list[dict] = []
    t0 = 0.0
    for ai, nf in enumerate(new_fronts):
        t1 = total_front if ai == len(new_fronts) - 1 else t0 + nf
        quads: list[list[Point]] = []
        acc = 0.0
        for strip, fr in zip(strips, old_fronts):
            seg0, seg1 = acc, acc + fr
            o0, o1 = max(seg0, t0), min(seg1, t1)
            if o1 > o0 + 1e-9 and fr > 1e-9:
                lt0 = (o0 - seg0) / fr
                lt1 = (o1 - seg0) / fr
                p0 = _lerp(strip["sa"], strip["ea"], lt0)
                p1 = _lerp(strip["sb"], strip["eb"], lt0)
                p2 = _lerp(strip["sb"], strip["eb"], lt1)
                p3 = _lerp(strip["sa"], strip["ea"], lt1)
                quads.append([p0, p1, p2, p3])
            acc += fr
        if not quads:
            # Degenerate fallback: tiny sliver on first strip
            s0 = strips[0]
            quads = [[s0["sa"], s0["sb"], s0["sb"], s0["sa"]]]
        shapes.append(_merge_strip_quads(quads))
        t0 = t1
    return shapes


def collapse_ab_labels(labels: list[str]) -> list[str]:
    """A8a+A8b → A8; leaves unpaired labels as base numbers."""
    out: list[str] = []
    i = 0
    while i < len(labels):
        letter, num, suf = parse_label(labels[i])
        if suf == "a" and i + 1 < len(labels):
            l2, n2, s2 = parse_label(labels[i + 1])
            if l2 == letter and n2 == num and s2 == "b":
                out.append(f"{letter}{num}")
                i += 2
                continue
        out.append(f"{letter}{num}" if suf else labels[i])
        i += 1
    return out


def label_variants(
    base_labels: list[str], areas: list[int]
) -> list[dict[str, Any]]:
    if not base_labels:
        return []
    letter, start_num, _ = parse_label(base_labels[0])
    n_base = len(base_labels)
    n_new = len(areas)
    variants = []
    collapsed = collapse_ab_labels(base_labels)
    _, collapsed_start, _ = parse_label(collapsed[0])

    if n_new == n_base:
        # Keep current labels (incl. a/b) so we don't invent bare A8 next to existing A8b
        labels = list(base_labels)
        variants.append(
            {
                "id": "keep",
                "labels": labels,
                "description": " + ".join(labels),
            }
        )
        return variants

    if n_new == n_base + 1 and n_base >= 1:
        # Split uses base number without leftover a/b on the piece being split
        base0 = collapsed[0] if collapsed else base_labels[0]
        bl, bn, _ = parse_label(base0)
        rest = collapsed[1:] if len(collapsed) == n_base else base_labels[1:]
        labels_a = [f"{bl}{bn}a", f"{bl}{bn}b"] + rest
        variants.append(
            {
                "id": "split-first",
                "labels": labels_a,
                "description": " + ".join(labels_a),
            }
        )
        if n_base >= 2:
            last = collapsed[-1] if len(collapsed) == n_base else base_labels[-1]
            ll, ln, _ = parse_label(last)
            head = collapsed[:-1] if len(collapsed) == n_base else base_labels[:-1]
            labels_b = head + [f"{ll}{ln}a", f"{ll}{ln}b"]
            if labels_b != labels_a:
                variants.append(
                    {
                        "id": "split-last",
                        "labels": labels_b,
                        "description": " + ".join(labels_b),
                    }
                )
        return variants

    if n_new == n_base - 1 and n_base >= 2:
        # A8a+A8b+A9 → A8+A9; A8a+A8b → A8
        if len(collapsed) == n_new:
            labels = collapsed
        elif len(collapsed) == n_base:
            labels = collapsed[:n_new]
        else:
            labels = collapsed[:n_new]
            while len(labels) < n_new:
                labels.append(f"{letter}{collapsed_start + len(labels)}")
        variants.append(
            {
                "id": "merge",
                "labels": labels,
                "description": " + ".join(labels),
            }
        )
        return variants

    # Fallback for larger merges (e.g. 3→1): use collapsed then truncate
    labels = collapsed[:n_new]
    while len(labels) < n_new:
        labels.append(f"{letter}{collapsed_start + len(labels)}")
    variants.append(
        {
            "id": "sequential",
            "labels": labels,
            "description": " + ".join(labels),
        }
    )
    return variants


def sensible_partitions(total: int, n_base: int) -> list[list[int]]:
    """
    Limited, realistic partitions for auto variants (no 12 m²).
    Merge (-1), same count, split (+1 for single booth only).
    """
    results: list[list[int]] = []
    pool = AUTO_ALLOWED_AREAS

    def compositions(remain: int, parts: int) -> list[list[int]]:
        if parts == 1:
            return [[remain]] if remain in pool else []
        out: list[list[int]] = []
        for a in pool:
            if a >= remain:
                continue
            for rest in compositions(remain - a, parts - 1):
                out.append([a] + rest)
        return out

    allowed_ns = [n_base - 1, n_base]
    # Split +1: one booth → two, or two → three (np. B1+B2 → 6+6+4)
    if n_base + 1 <= MAX_SELECTION:
        allowed_ns.append(n_base + 1)
    # Allow merge-all to one booth when total is an auto-allowed area
    if n_base >= 3 and total in pool:
        allowed_ns.append(1)
    for n in allowed_ns:
        if n < 1:
            continue
        for comp in compositions(total, n):
            if max(comp) > 2 * min(comp):
                continue
            results.append(comp)

    uniq = {tuple(p): list(p) for p in results}
    return sorted(uniq.values(), key=lambda p: (len(p), p))


# Max gap (SVG units) between booth polygons still treated as touching.
# D6–D7 ≈ 40 (separate islands); true neighbours ≈ 0; slight slant gaps ≈ 8.
GEOM_TOUCH_TOL = 12.0


def _min_polygon_distance(a: list[Point], b: list[Point]) -> float:
    best = float("inf")
    for p in a:
        for q in b:
            best = min(best, _dist(p, q))
    return best


def selection_geometrically_contiguous(segments: list[dict]) -> bool:
    """True if each consecutive selected booth touches the next on the map."""
    if len(segments) <= 1:
        return True
    polys = [shape_to_polygon(s["shape"]) for s in segments]
    for i in range(len(polys) - 1):
        if _min_polygon_distance(polys[i], polys[i + 1]) > GEOM_TOUCH_TOL:
            return False
    return True


# Vertex↔edge proximity for shared-side detection (tighter than GEOM_TOUCH_TOL).
# At 8, B2↔B3 / D9↔D10 look like a long side; at 5 they stay point-touch.
CONTACT_VERTEX_TOL = 5.0
# Shared-edge contact needs at least this span (SVG units); pure corner ≈ 0.
MIN_EDGE_CONTACT = 8.0


def _point_seg_dist(p: Point, a: Point, b: Point) -> float:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 < 1e-12:
        return _dist(p, a)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _near_boundary(pts: list[Point], poly: list[Point], tol: float) -> list[Point]:
    """Vertices of `pts` that lie within `tol` of any edge of `poly`."""
    n = len(poly)
    out: list[Point] = []
    for p in pts:
        for i in range(n):
            if _point_seg_dist(p, poly[i], poly[(i + 1) % n]) <= tol:
                out.append(p)
                break
    return out


def _point_set_diameter(pts: list[Point]) -> float:
    if len(pts) < 2:
        return 0.0
    best = 0.0
    for i, p in enumerate(pts):
        for q in pts[i + 1 :]:
            best = max(best, _dist(p, q))
    return best


def _contact_span(a: list[Point], b: list[Point], tol: float = CONTACT_VERTEX_TOL) -> float:
    """
    How long a shared side the two polygons have (SVG units).
    Uses each polygon's vertices near the other's boundary so T-junctions
    (mid-edge of neighbour) still count — vertex↔vertex alone misses those.
    Pure corner touch → ~0; full booth side → ~20.
    """
    return max(
        _point_set_diameter(_near_boundary(a, b, tol)),
        _point_set_diameter(_near_boundary(b, a, tol)),
    )


def selection_has_corner_turn(segments: list[dict]) -> bool:
    """
    True when consecutive selected booths meet only at a corner
    (no shared edge) — joining them is blocked (B2↔B3, D9↔D10).

    Do not use longest-edge axes: after a split (B2→B2a/B2b) half-booths
    get a perpendicular long side and falsely look like an L-corner next
    to B1 on the same strip.
    """
    if len(segments) < 2:
        return False
    polys = [shape_to_polygon(s["shape"]) for s in segments]
    for i in range(len(polys) - 1):
        if _contact_span(polys[i], polys[i + 1]) < MIN_EDGE_CONTACT:
            return True
    return False


CORNER_JOIN_MSG = (
    "Te stoiska spotykają się w rogu (np. B2+B3, D9+D10) — nie da się ich łączyć."
)


def seed_span_for_selection(
    letter: str, segments: list[dict], selected_labels: list[str]
) -> dict[str, Any] | None:
    """
    Seed booths covering the same front-budget span as the selection.
    Used as „forma pierwotna”.
    """
    idx = {s["label"]: i for i, s in enumerate(segments)}
    positions = sorted(idx[l] for l in selected_labels)
    front_before = sum(front_m(int(s["area_m2"])) for s in segments[: positions[0]])
    front_sel = sum(front_m(int(s["area_m2"])) for s in segments[positions[0] : positions[-1] + 1])
    seed = default_layout()["tracks"].get(letter) or []
    acc = 0.0
    start_i = None
    for i, s in enumerate(seed):
        if abs(acc - front_before) < 0.05:
            start_i = i
            break
        acc += front_m(int(s["area_m2"]))
    if start_i is None:
        return None
    taken: list[dict] = []
    acc2 = 0.0
    for s in seed[start_i:]:
        taken.append(copy.deepcopy(s))
        acc2 += front_m(int(s["area_m2"]))
        if abs(acc2 - front_sel) < 0.05:
            break
        if acc2 > front_sel + 0.05:
            return None
    if abs(acc2 - front_sel) > 0.05 or not taken:
        return None
    areas = [int(s["area_m2"]) for s in taken]
    labels = [s["label"] for s in taken]
    current = [segments[i] for i in positions]
    current_areas = [int(s["area_m2"]) for s in current]
    current_labels = [s["label"] for s in current]
    if areas == current_areas and labels == current_labels:
        # Same ids/areas — still offer if shapes differ (after bad split)
        same_shapes = all(
            s["shape"] == c["shape"] for s, c in zip(taken, current)
        )
        if same_shapes:
            return None
    return {
        "areas": areas,
        "labels": labels,
        "shapes": [s["shape"] for s in taken],
        "variant_id": "seed-original",
        "description": (
            f"Forma pierwotna: {' + '.join(str(a) for a in areas)} m² → "
            + " + ".join(labels)
        ),
        "total_m2": sum(areas),
    }


def _same_booth_family(a: str, b: str) -> bool:
    la, na, _ = parse_label(a)
    lb, nb, _ = parse_label(b)
    return la == lb and na == nb


def _adjacent_labels_ok(left: str, right: str) -> bool:
    """
    Same letter+number may only sit as a|b (in that order).
    Bare AN next to ANa/ANb (or duplicate suffixes) is never allowed.
    """
    if not _same_booth_family(left, right):
        return True
    _, _, ls = parse_label(left)
    _, _, rs = parse_label(right)
    return ls == "a" and rs == "b"


def _adjacent_labels_ok_manual(left: str, right: str) -> bool:
    """
    Manual editor: allow bare A8 next to A8b (recovery / fix names).
    Still forbid identical labels and same-suffix pairs (A8b|A8b, A8a|A8a).
    """
    if left == right:
        return False
    if not _same_booth_family(left, right):
        return True
    _, _, ls = parse_label(left)
    _, _, rs = parse_label(right)
    if ls and rs and ls == rs:
        return False
    if ls == "b" and rs == "a":
        return False
    return True


def labels_fit_selection_context(
    segments: list[dict],
    positions: list[int],
    new_labels: list[str],
    *,
    manual: bool = False,
) -> bool:
    """
    Reject options that collide with booths outside the selection or break
    a/b naming at the selection boundary.
    Duplicates with outside (e.g. second A8b) are always rejected.
    """
    if not new_labels:
        return False
    if len(new_labels) != len(set(new_labels)):
        return False
    outside = {
        s["label"]
        for i, s in enumerate(segments)
        if i < positions[0] or i > positions[-1]
    }
    if any(lab in outside for lab in new_labels):
        return False
    left = segments[positions[0] - 1]["label"] if positions[0] > 0 else None
    right = (
        segments[positions[-1] + 1]["label"]
        if positions[-1] + 1 < len(segments)
        else None
    )
    adj = _adjacent_labels_ok_manual if manual else _adjacent_labels_ok
    if left and not adj(left, new_labels[0]):
        return False
    if right and not adj(new_labels[-1], right):
        return False
    return True


def find_track_for_labels(
    layout_data: dict[str, Any], labels: list[str]
) -> str | None:
    """Return track letter whose segments contain all labels (ignores name prefix)."""
    tracks = layout_data.get("tracks") or {}
    need = set(labels)
    for letter, segs in tracks.items():
        names = {s["label"] for s in segs}
        if need <= names:
            return letter
    return None


MAX_SELECTION = 3
LABEL_RE = re.compile(r"^[A-Z]+\d+[a-z]?$")


def suggest_labels_for_manual(
    segments: list[dict],
    selected_labels: list[str],
    areas: list[int],
    *,
    track_letter: str | None = None,
) -> list[str] | None:
    """Recommended labels for a custom area split within the selection."""
    idx = {s["label"]: i for i, s in enumerate(segments)}
    if any(l not in idx for l in selected_labels):
        return None
    positions = sorted(idx[l] for l in selected_labels)
    base_labels = [segments[i]["label"] for i in positions]
    letter = track_letter or parse_label(base_labels[0])[0]
    # Prefer seed names when areas match the default span (e.g. C12 → A8)
    seed_opt = seed_span_for_selection(letter, segments, selected_labels)
    if (
        seed_opt
        and seed_opt["areas"] == list(areas)
        and labels_fit_selection_context(
            segments, positions, seed_opt["labels"], manual=True
        )
    ):
        return list(seed_opt["labels"])
    for variant in label_variants(base_labels, areas):
        if labels_fit_selection_context(
            segments, positions, variant["labels"], manual=True
        ):
            suggested = list(variant["labels"])
            # Don't "recommend" the exact current names
            if suggested == base_labels and len(areas) == len(base_labels):
                continue
            return suggested
    return None


def validate_manual_partition(
    segments: list[dict],
    selected_labels: list[str],
    areas: list[int],
    labels: list[str],
) -> list[str]:
    """Human-readable validation errors for a custom partition."""
    errors: list[str] = []
    if not (1 <= len(selected_labels) <= MAX_SELECTION):
        errors.append(f"Zaznacz od 1 do {MAX_SELECTION} stoisk.")
        return errors
    if len(areas) != len(labels):
        errors.append("Liczba nazw i powierzchni musi być taka sama.")
        return errors
    if not (1 <= len(areas) <= MAX_SELECTION):
        errors.append(f"Podział na co najwyżej {MAX_SELECTION} stoiska.")
        return errors
    idx = {s["label"]: i for i, s in enumerate(segments)}
    if any(l not in idx for l in selected_labels):
        errors.append("Nieznane stoisko w zaznaczeniu.")
        return errors
    positions = sorted(idx[l] for l in selected_labels)
    if positions != list(range(positions[0], positions[-1] + 1)):
        errors.append("Zaznaczenie musi być ciągłe wzdłuż toru.")
        return errors
    selected_segs = [segments[i] for i in positions]
    if not selection_geometrically_contiguous(selected_segs):
        errors.append(
            "Zaznaczone stoiska nie stykają się na mapie (np. D6 z D7) — nie da się ich łączyć."
        )
        return errors
    if selection_has_corner_turn(selected_segs):
        errors.append(CORNER_JOIN_MSG)
        return errors
    total = sum(int(segments[i]["area_m2"]) for i in positions)
    if sum(areas) != total:
        errors.append(
            f"Suma powierzchni ({sum(areas)} m²) musi równać się zaznaczeniu ({total} m²)."
        )
    for a in areas:
        if a not in ALLOWED_AREAS:
            errors.append(f"Niedozwolona powierzchnia {a} m² (dozwolone: 4, 6, 8, 12).")
    for lab in labels:
        if not LABEL_RE.match(lab):
            errors.append(
                f"Nieprawidłowa nazwa „{lab}” (np. A8 lub A8a)."
            )
    if len(labels) != len(set(labels)):
        errors.append("Nazwy stoisk w podziale nie mogą się powtarzać.")
    if labels and not labels_fit_selection_context(
        segments, positions, labels, manual=True
    ):
        errors.append(
            "Nazwa koliduje z sąsiadem (np. drugie A8b obok istniejącego A8b)."
        )
    return errors


def repartition_options(
    segments: list[dict],
    selected_labels: list[str],
    *,
    track_letter: str | None = None,
) -> list[dict]:
    if len(selected_labels) > MAX_SELECTION:
        raise ValueError(f"Zaznacz co najwyżej {MAX_SELECTION} stoiska naraz")
    idx = {s["label"]: i for i, s in enumerate(segments)}
    if any(l not in idx for l in selected_labels):
        raise ValueError("Unknown label in selection")
    positions = sorted(idx[l] for l in selected_labels)
    if positions != list(range(positions[0], positions[-1] + 1)):
        raise ValueError("Selection must be contiguous along the track")
    selected = [segments[i] for i in positions]
    if not selection_geometrically_contiguous(selected):
        raise ValueError(
            "Zaznaczone stoiska nie stykają się na mapie (nie da się ich łączyć)."
        )
    if selection_has_corner_turn(selected):
        raise ValueError(CORNER_JOIN_MSG)
    total = sum(int(s["area_m2"]) for s in selected)
    base_labels = [s["label"] for s in selected]
    n_base = len(base_labels)
    current = [int(s["area_m2"]) for s in selected]
    # Track key from layout (not label prefix — C12 may sit on track A)
    letter = track_letter or parse_label(base_labels[0])[0]

    options: list[dict] = []
    seed_opt = seed_span_for_selection(letter, segments, selected_labels)
    # Seed restore may need manual adjacency (A8 next to leftover A8b)
    if seed_opt and labels_fit_selection_context(
        segments, positions, seed_opt["labels"], manual=True
    ):
        options.append(
            {
                "areas": seed_opt["areas"],
                "labels": seed_opt["labels"],
                "variant_id": seed_opt["variant_id"],
                "description": seed_opt["description"],
                "total_m2": seed_opt["total_m2"],
            }
        )

    def touches_every_selected(new_labels: list[str], areas: list[int]) -> bool:
        """When 2+ booths selected, none may stay as the same label+area."""
        if n_base < 2:
            return True
        new_pairs = set(zip(new_labels, areas))
        for lab, area in zip(base_labels, current):
            if (lab, area) in new_pairs:
                return False
        return True

    for areas in sensible_partitions(total, n_base):
        if areas == current:
            continue
        # 12 m² only via manual dialog
        if 12 in areas:
            continue
        for variant in label_variants(base_labels, areas):
            if not labels_fit_selection_context(
                segments, positions, variant["labels"]
            ):
                continue
            if not touches_every_selected(variant["labels"], areas):
                continue
            if (
                seed_opt
                and variant["labels"] == seed_opt["labels"]
                and areas == seed_opt["areas"]
            ):
                continue
            options.append(
                {
                    "areas": areas,
                    "labels": variant["labels"],
                    "variant_id": variant["id"],
                    "description": (
                        f"{' + '.join(str(a) for a in areas)} m² → {variant['description']}"
                    ),
                    "total_m2": total,
                }
            )
    return options[:20]


def apply_repartition(
    segments: list[dict],
    selected_labels: list[str],
    areas: list[int],
    labels: list[str],
    *,
    variant_id: str | None = None,
    track_letter: str | None = None,
) -> list[dict]:
    if len(selected_labels) > MAX_SELECTION:
        raise ValueError(f"Zaznacz co najwyżej {MAX_SELECTION} stoiska naraz")
    if len(areas) != len(labels):
        raise ValueError("areas/labels length mismatch")
    idx_map = {s["label"]: i for i, s in enumerate(segments)}
    positions = sorted(idx_map[l] for l in selected_labels)
    if positions != list(range(positions[0], positions[-1] + 1)):
        raise ValueError("Selection must be contiguous")
    selected = [segments[i] for i in positions]
    if not selection_geometrically_contiguous(selected):
        raise ValueError(
            "Zaznaczone stoiska nie stykają się na mapie (nie da się ich łączyć)."
        )
    if selection_has_corner_turn(selected):
        raise ValueError(CORNER_JOIN_MSG)
    total_old = sum(int(s["area_m2"]) for s in selected)
    if sum(areas) != total_old:
        raise ValueError(
            f"New areas sum {sum(areas)} != selected total {total_old}"
        )
    # seed-original / manual may place bare A8 next to A8b
    allow_manual = variant_id in ("manual", "seed-original")
    if not labels_fit_selection_context(
        segments, positions, labels, manual=allow_manual
    ):
        raise ValueError(
            "Proponowane etykiety kolidują z sąsiadami poza zaznaczeniem"
        )

    if variant_id == "seed-original":
        letter = track_letter or parse_label(selected_labels[0])[0]
        seed_opt = seed_span_for_selection(letter, segments, selected_labels)
        if not seed_opt or seed_opt["labels"] != labels or seed_opt["areas"] != areas:
            raise ValueError("Forma pierwotna niedostępna dla tego zaznaczenia")
        new_segs = [
            {"label": lab, "area_m2": area, "shape": copy.deepcopy(shape)}
            for lab, area, shape in zip(
                seed_opt["labels"], seed_opt["areas"], seed_opt["shapes"]
            )
        ]
        return segments[: positions[0]] + new_segs + segments[positions[-1] + 1 :]

    before_shape = (
        segments[positions[0] - 1]["shape"] if positions[0] > 0 else None
    )
    after_shape = (
        segments[positions[-1] + 1]["shape"]
        if positions[-1] + 1 < len(segments)
        else None
    )
    shapes = split_strip_polygons(
        selected, areas, before_shape=before_shape, after_shape=after_shape
    )
    new_segs = [
        {"label": lab, "area_m2": area, "shape": shape}
        for lab, area, shape in zip(labels, areas, shapes)
    ]
    return segments[: positions[0]] + new_segs + segments[positions[-1] + 1 :]
