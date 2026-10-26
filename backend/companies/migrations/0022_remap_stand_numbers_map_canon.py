"""Remap Stand.stand_number to canonical map IDs (WBS 4.5 chunk 0)."""

import logging

from django.db import migrations

logger = logging.getLogger(__name__)

# Old SVG / assignment IDs → new canonical IDs (day1 == day2).
STAND_NUMBER_REMAP = {
    # A
    "A0": "A1",
    "A2b": "A2",
    "A3": "A3",
    "A4": "A4",
    "A56": "A5",
    "A7a": "A6",
    "A7b": "A6",
    "A7": "A6",
    "A8": "A7",
    "A9": "A7",  # absorbed into merged A8→A7
    "A10a": "A8",
    "A10b": "A8",
    "A10": "A8",
    "A11": "A9",
    "A12": "A10",
    # A1 / A2a lived in C island → C7 (merged)
    "A1": "C7",
    "A2a": "C7",
    # B
    "B1": "B1",
    "B2": "B2",
    "B3": "B3",
    "B3a": "B3",
    "B3b": "B3",
    "B4": "B4",
    "B5": "B5",
    "B6": "B6",
    "B7": "B7",
    "B8a": "B8",
    "B8b": "B8",
    "B8": "B8",
    "B9": "B9",
    "B10": "B10",
    "B11": "B11",
    # C (clockwise renumber)
    "C1": "C1",
    "C2": "C2",
    "C8a": "C3",
    "C8b": "C3",
    "C8": "C3",
    "C5": "C4",
    "C6": "C5",
    "C7": "C6",
    "C4": "C8",
    # D
    "D1": "D1",
    "D2": "D2",
    "D3": "D3",
    "D3a": "D3",
    "D3b": "D3",
    "D4a": "D4",
    "D4b": "D4",
    "D4": "D4",
    "D5": "D5",
    "D6": "D6",
    "D7": "D7",
    "D8": "D8",
    "D9": "D9",
    "D10": "D10",
    "D11": "D10",  # absorbed into merged D10
    "D12": "D11",
    # E
    "E1": "E1",
    "E2": "E2",
    "E3": "E3",
    "E4": "E4",
    "E5a": "E5",
    "E5b": "E5",
    "E5": "E5",
    "E6": "E6",
    "E7": "E7",
    "E8": "E7",  # absorbed into merged E7
    "E9a": "E8",
    "E9b": "E8",
    "E9": "E8",
    "E10": "E9",
    "E11": "E9",  # absorbed into merged E10→E9
    "E12": "E10",
    # F
    "F2": "F1",
    "F3": "F2",
    "F4": "F3",
    "F5": "F4",
    "F1": "F1",
}


def remap_stand_numbers(apps, schema_editor):
    Stand = apps.get_model("companies", "Stand")
    # Two-phase update avoids collisions when old ID equals another booth's new ID
    # (e.g. C5→C4 while old C4→C8). Use a temporary prefix, then final values.
    TEMP_PREFIX = "__remap__"

    stands = list(Stand.objects.exclude(stand_number__in=["", "brak"]).all())
    planned = []
    for stand in stands:
        old = (stand.stand_number or "").strip()
        new = STAND_NUMBER_REMAP.get(old)
        if new is None or new == old:
            continue
        planned.append((stand, old, new))

    # Detect merge conflicts: two different companies → same day + same new number
    by_target = {}
    for stand, old, new in planned:
        key = (stand.day, new)
        by_target.setdefault(key, []).append((stand, old))

    conflict_keys = {k for k, rows in by_target.items() if len({r[0].company_id for r in rows}) > 1}
    for key in conflict_keys:
        rows = by_target[key]
        logger.warning(
            "Stand remap conflict day=%s new=%s: %s — leaving for manual fix",
            key[0],
            key[1],
            [(s.id, s.company_id, old) for s, old in rows],
        )

    # Phase 1: temp names for rows that will change and are not conflicted
    for stand, old, new in planned:
        key = (stand.day, new)
        if key in conflict_keys:
            continue
        stand.stand_number = f"{TEMP_PREFIX}{stand.pk}"
        stand.save(update_fields=["stand_number"])

    # Phase 2: final names
    for stand, old, new in planned:
        key = (stand.day, new)
        if key in conflict_keys:
            continue
        stand.stand_number = new
        stand.save(update_fields=["stand_number"])
        logger.info("Remapped Stand id=%s %s → %s", stand.pk, old, new)


def noop_reverse(apps, schema_editor):
    # Irreversible without storing prior values; map geometry is also forward-only.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("companies", "0021_settings_jobwall_free_count"),
    ]

    operations = [
        migrations.RunPython(remap_stand_numbers, noop_reverse),
    ]
