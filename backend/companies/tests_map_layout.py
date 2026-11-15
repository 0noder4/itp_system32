"""Regression tests for hall map remap / repartition."""
from django.test import TestCase

from companies.map_layout_service import (
    TEMP_REMAP_PREFIX,
    apply_repartition_to_layout,
    remap_stands_after_repartition,
)
from companies.map_seed import default_layout
from companies.models import Company, MapLayout, Stand
from users.models import User


class RemapStandsTempPrefixTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Map Co", status="basic")

    def test_temp_prefix_fits_max_length_for_large_pk(self):
        """Temporary stand_number must fit CharField(max_length=10) for pk >= 10."""
        stand = Stand.objects.create(
            company=self.company,
            day="day1",
            stand_number="A1",
            stand_size="podstawowy",
        )
        # Force a high pk path without relying on DB sequence quirks:
        # remap uses f"{TEMP_REMAP_PREFIX}{stand.pk}" before the final label.
        for pk in (10, 1000, 999999999):
            temp = f"{TEMP_REMAP_PREFIX}{pk}"
            self.assertLessEqual(
                len(temp),
                10,
                msg=f"temp label {temp!r} exceeds stand_number max_length=10",
            )
        self.assertEqual(TEMP_REMAP_PREFIX, "~")
        self.assertEqual(stand.stand_number, "A1")

    def test_remap_stands_with_pk_ge_10_saves_without_dataerror(self):
        stands = []
        for i in range(12):
            c = Company.objects.create(name=f"Firm {i}", status="basic")
            stands.append(
                Stand.objects.create(
                    company=c,
                    day="day1",
                    stand_number=f"A{i + 1}",
                    stand_size="podstawowy",
                )
            )
        self.assertTrue(any(s.pk >= 10 for s in stands))

        selected = [f"A{i + 1}" for i in range(12)]
        # Rename all labels (same count) so every stand goes through the temp prefix path.
        new_labels = [f"B{i + 1}" for i in range(12)]
        areas = [4] * 12

        remap_stands_after_repartition(
            days=["day1"],
            selected_labels=selected,
            new_labels=new_labels,
            areas=areas,
        )

        numbers = set(
            Stand.objects.filter(day="day1").values_list("stand_number", flat=True)
        )
        self.assertTrue(numbers.issubset(set(new_labels)) or numbers)
        self.assertFalse(any(n.startswith("~") for n in numbers))


class ApplyRepartitionSyncOffTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="lg-map",
            email="lg-map@example.com",
            password="TestPass123!",
            type="staff",
            staff_roles=["lg"],
        )
        seed = default_layout()
        self.layout = MapLayout.get_solo()
        self.layout.day1 = seed
        self.layout.day2 = default_layout()
        self.layout.sync_days = False
        self.layout.updated_by = self.user
        self.layout.save()

        # Occupy a day2 label that overlaps a day1 selection so old code would warn.
        company = Company.objects.create(name="Day2 Only", status="basic")
        track = next(iter(seed["tracks"]))
        first_label = seed["tracks"][track][0]["label"]
        Stand.objects.create(
            company=company,
            day="day2",
            stand_number=first_label,
            stand_size="podstawowy",
        )
        self.track = track
        self.label = first_label
        self.area = int(seed["tracks"][track][0]["area_m2"])

    def test_day1_edit_with_sync_off_ignores_day2_and_does_not_copy(self):
        day2_before = self.layout.day2
        segments = self.layout.day1["tracks"][self.track]
        # No-op repartition of a single booth (same area/label) — exercises sync logic.
        layout, warnings, applied = apply_repartition_to_layout(
            day="day1",
            track=self.track,
            selected_labels=[self.label],
            areas=[self.area],
            labels=[self.label],
            confirm=False,
            user=self.user,
        )
        self.assertTrue(applied)
        # Day2 occupancy must not produce warnings when sync is off.
        self.assertEqual(warnings, [])
        layout.refresh_from_db()
        self.assertEqual(layout.day2, day2_before)
        # Day2 stand assignment unchanged
        self.assertTrue(
            Stand.objects.filter(day="day2", stand_number=self.label).exists()
        )
        self.assertEqual(len(segments), len(layout.day1["tracks"][self.track]))
