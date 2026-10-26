import copy

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_map_layout(apps, schema_editor):
    MapLayout = apps.get_model("companies", "MapLayout")
    if MapLayout.objects.exists():
        return
    # Import seed at runtime from project module
    from companies.map_seed import default_layout

    layout = default_layout()
    MapLayout.objects.create(
        sync_days=True,
        day1=layout,
        day2=copy.deepcopy(layout),
    )


def unseed_map_layout(apps, schema_editor):
    MapLayout = apps.get_model("companies", "MapLayout")
    MapLayout.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("companies", "0023_remap_stand_numbers_continuous_ade"),
    ]

    operations = [
        migrations.CreateModel(
            name="MapLayout",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "sync_days",
                    models.BooleanField(
                        default=True,
                        verbose_name="synchronizuj dzień 2 z dniem 1",
                    ),
                ),
                (
                    "day1",
                    models.JSONField(default=dict, verbose_name="layout dzień 1"),
                ),
                (
                    "day2",
                    models.JSONField(default=dict, verbose_name="layout dzień 2"),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="map_layouts_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Map layout",
                "verbose_name_plural": "Map layouts",
            },
        ),
        migrations.RunPython(seed_map_layout, unseed_map_layout),
    ]
