"""Business logic for hall map layout editing."""
from __future__ import annotations

import copy
import logging
from typing import Any

from django.db import transaction

from .map_seed import (
    apply_repartition,
    default_layout,
    parse_label,
    validate_track_segments,
)
from .models import MapLayout, Stand

logger = logging.getLogger(__name__)

TEMP_REMAP_PREFIX = "__remap__"


def get_day_layout(layout: MapLayout, day: str) -> dict:
    if day not in ("day1", "day2"):
        raise ValueError("day must be day1 or day2")
    data = getattr(layout, day) or {}
    if "tracks" not in data:
        return default_layout()
    return data


def area_to_stand_size(area_m2: int) -> str:
    if area_m2 <= 4:
        return "podstawowy"
    if area_m2 <= 6:
        return "standardowy"
    if area_m2 <= 8:
        return "rozszerzony"
    return "12m2"


def find_stand_conflicts(labels: set[str], days: list[str] | None = None) -> list[dict]:
    days = days or ["day1", "day2"]
    qs = (
        Stand.objects.filter(stand_number__in=labels, day__in=days)
        .exclude(stand_number__in=["", "brak"])
        .select_related("company", "company__fr_resp")
    )
    warnings = []
    for stand in qs:
        fr = stand.company.fr_resp
        fr_name = None
        if fr:
            fr_name = (f"{fr.first_name} {fr.last_name}".strip() or fr.username)
        warnings.append(
            {
                "day": stand.day,
                "stand_number": stand.stand_number,
                "company_id": stand.company_id,
                "company_name": stand.company.name,
                "fr_resp_id": fr.id if fr else None,
                "fr_resp_name": fr_name,
                "message": (
                    f"Stoisko {stand.stand_number} ({stand.day}) jest przypisane do "
                    f"„{stand.company.name}”. Skonsultuj zmianę z opiekunem FR"
                    + (f" ({fr_name})" if fr_name else "")
                    + "."
                ),
            }
        )
    return warnings


def build_label_remap(
    selected_labels: list[str], new_labels: list[str]
) -> dict[str, str]:
    """
    Map each old selected booth label → new label after repartition.
    Equal length → positional zip; otherwise prefer surviving / collapsed base.
    """
    if not selected_labels:
        return {}
    if selected_labels == new_labels:
        return {lab: lab for lab in selected_labels}
    if len(selected_labels) == len(new_labels):
        return dict(zip(selected_labels, new_labels))

    new_set = set(new_labels)
    remap: dict[str, str] = {}
    n_old = len(selected_labels)
    n_new = len(new_labels) or 1
    for i, old in enumerate(selected_labels):
        if old in new_set:
            remap[old] = old
            continue
        letter, num, _suf = parse_label(old)
        base = f"{letter}{num}"
        if base in new_set:
            remap[old] = base
            continue
        if n_old == 1:
            remap[old] = new_labels[0]
        else:
            j = round(i * (n_new - 1) / (n_old - 1)) if n_new > 1 else 0
            j = max(0, min(j, n_new - 1))
            remap[old] = new_labels[j]
    return remap


def remap_stands_after_repartition(
    *,
    days: list[str],
    selected_labels: list[str],
    new_labels: list[str],
    areas: list[int],
) -> None:
    """
    Keep company↔booth links alive when map labels change.
    Unambiguous renames are updated; multi-company collisions on one new
    label are cleared (FR already confirmed via warnings).
    """
    remap = build_label_remap(selected_labels, new_labels)
    if not remap:
        return

    label_to_area = {
        lab: int(area) for lab, area in zip(new_labels, areas) if lab
    }

    for day in days:
        planned: list[tuple[Stand, str, str]] = []
        stands = list(
            Stand.objects.filter(day=day, stand_number__in=remap.keys()).exclude(
                stand_number__in=["", "brak"]
            )
        )
        for stand in stands:
            old = stand.stand_number
            new = remap.get(old, old)
            planned.append((stand, old, new))

        by_target: dict[str, list[Stand]] = {}
        for stand, _old, new in planned:
            by_target.setdefault(new, []).append(stand)

        conflict_targets = {
            target
            for target, rows in by_target.items()
            if len({s.company_id for s in rows}) > 1
        }

        # Collisions: clear so we do not leave dead old numbers or dual booking
        cleared_ids: set[int] = set()
        for target in conflict_targets:
            ids = [s.id for s in by_target[target]]
            cleared_ids.update(ids)
            logger.warning(
                "Stand remap collision day=%s → %s (ids=%s) — clearing",
                day,
                target,
                ids,
            )
            Stand.objects.filter(id__in=ids).delete()

        changing = [
            (stand, old, new)
            for stand, old, new in planned
            if stand.pk not in cleared_ids and new not in conflict_targets
        ]

        for stand, old, new in changing:
            if old == new:
                continue
            stand.stand_number = f"{TEMP_REMAP_PREFIX}{stand.pk}"
            stand.save(update_fields=["stand_number"])

        for stand, old, new in changing:
            if old != new:
                # Target still held by a firm that did not move away
                clash = (
                    Stand.objects.filter(day=day, stand_number=new)
                    .exclude(pk=stand.pk)
                    .exists()
                )
                if clash:
                    logger.warning(
                        "Stand remap blocked day=%s %s → %s (target occupied) — clearing id=%s",
                        day,
                        old,
                        new,
                        stand.pk,
                    )
                    Stand.objects.filter(pk=stand.pk).delete()
                    continue
            fields = ["stand_number"]
            stand.stand_number = new
            if new in label_to_area:
                stand.stand_size = area_to_stand_size(label_to_area[new])
                fields.append("stand_size")
            stand.save(update_fields=fields)
            if old != new:
                logger.info(
                    "Remapped Stand id=%s day=%s %s → %s",
                    stand.pk,
                    day,
                    old,
                    new,
                )

        # Size for labels that stayed put (no rename) or were already on new id
        for lab, area in label_to_area.items():
            size = area_to_stand_size(area)
            Stand.objects.filter(day=day, stand_number=lab).exclude(
                stand_size=size
            ).update(stand_size=size)


@transaction.atomic
def reset_layout(user) -> MapLayout:
    layout = MapLayout.get_solo()
    seed = default_layout()
    layout.day1 = seed
    layout.day2 = copy.deepcopy(seed)
    layout.sync_days = True
    layout.updated_by = user
    layout.save()
    Stand.objects.all().delete()
    return layout


@transaction.atomic
def apply_repartition_to_layout(
    *,
    day: str,
    track: str,
    selected_labels: list[str],
    areas: list[int],
    labels: list[str],
    confirm: bool = False,
    user=None,
    variant_id: str | None = None,
) -> tuple[MapLayout, list[dict], bool]:
    """
    Returns (layout, warnings, applied).
    If warnings and not confirm → applied=False, layout unchanged.

    Conflicts only for booths actually touched by the repartition
    (selection + resulting labels), not the whole track — syncing day2
    must not warn about unrelated occupied neighbours (e.g. A1 when editing A8).
    """
    if day not in ("day1", "day2"):
        raise ValueError("day must be day1 or day2")

    layout = MapLayout.get_solo()
    data = copy.deepcopy(get_day_layout(layout, day))
    if track not in data.get("tracks", {}):
        raise ValueError(f"Unknown track {track}")

    segments = data["tracks"][track]
    affected = set(selected_labels) | set(labels)
    warnings = find_stand_conflicts(affected, days=[day])

    new_segments = apply_repartition(
        segments,
        selected_labels,
        areas,
        labels,
        variant_id=variant_id,
        track_letter=track,
    )
    validate_track_segments(track, new_segments)

    other_day = "day2" if day == "day1" else "day1"
    should_write_other = False
    other_warnings = find_stand_conflicts(affected, days=[other_day])
    if layout.sync_days:
        # Either day: keep both layouts identical
        should_write_other = True
        warnings = warnings + other_warnings
    elif day == "day1":
        # sync off: still copy day1→day2 when safe / confirmed
        if not other_warnings or confirm:
            should_write_other = True
        warnings = warnings + other_warnings

    if warnings and not confirm:
        return layout, warnings, False

    data["tracks"][track] = new_segments
    setattr(layout, day, data)

    if should_write_other:
        other = copy.deepcopy(get_day_layout(layout, other_day))
        other.setdefault("tracks", {})[track] = copy.deepcopy(new_segments)
        setattr(layout, other_day, other)

    layout.updated_by = user
    layout.save()

    stand_days = [day]
    if should_write_other:
        stand_days.append(other_day)
    remap_stands_after_repartition(
        days=stand_days,
        selected_labels=selected_labels,
        new_labels=labels,
        areas=areas,
    )

    return layout, warnings, True


def serialize_layout(layout: MapLayout) -> dict[str, Any]:
    return {
        "id": layout.id,
        "sync_days": layout.sync_days,
        "day1": get_day_layout(layout, "day1"),
        "day2": get_day_layout(layout, "day2"),
        "updated_at": layout.updated_at.isoformat() if layout.updated_at else None,
    }
