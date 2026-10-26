"""Close A/D/E numbering gaps after default 8m2 merges (continuous A1–A10, D1–D11, E1–E10)."""

import logging

from django.db import migrations

logger = logging.getLogger(__name__)

STAND_NUMBER_REMAP = {
    "A7": "A6",
    "A8": "A7",
    "A10": "A8",
    "A11": "A9",
    "A12": "A10",
    "D12": "D11",
    "E9": "E8",
    "E10": "E9",
    "E12": "E10",
}


def remap_stand_numbers(apps, schema_editor):
    Stand = apps.get_model("companies", "Stand")
    TEMP_PREFIX = "__remap_ade__"

    stands = list(Stand.objects.exclude(stand_number__in=["", "brak"]).all())
    planned = []
    for stand in stands:
        old = (stand.stand_number or "").strip()
        new = STAND_NUMBER_REMAP.get(old)
        if new is None or new == old:
            continue
        planned.append((stand, old, new))

    by_target = {}
    for stand, old, new in planned:
        key = (stand.day, new)
        by_target.setdefault(key, []).append((stand, old))

    conflict_keys = {
        k for k, rows in by_target.items() if len({r[0].company_id for r in rows}) > 1
    }
    for key in conflict_keys:
        rows = by_target[key]
        logger.warning(
            "Stand ADE remap conflict day=%s new=%s: %s",
            key[0],
            key[1],
            [(s.id, s.company_id, old) for s, old in rows],
        )

    for stand, old, new in planned:
        if (stand.day, new) in conflict_keys:
            continue
        stand.stand_number = f"{TEMP_PREFIX}{stand.pk}"
        stand.save(update_fields=["stand_number"])

    for stand, old, new in planned:
        if (stand.day, new) in conflict_keys:
            continue
        stand.stand_number = new
        stand.save(update_fields=["stand_number"])
        logger.info("ADE remapped Stand id=%s %s → %s", stand.pk, old, new)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("companies", "0022_remap_stand_numbers_map_canon"),
    ]

    operations = [
        migrations.RunPython(remap_stand_numbers, noop_reverse),
    ]
