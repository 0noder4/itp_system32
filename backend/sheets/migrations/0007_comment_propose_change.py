from django.db import migrations, models


def forwards_map_statuses(apps, schema_editor):
    Comment = apps.get_model('sheets', 'SheetCellComment')
    Comment.objects.filter(status__in=('open', 'progress')).update(status='progress')
    Comment.objects.filter(status='done').update(status='accepted')
    Comment.objects.filter(status='blocked').update(status='rejected')


def backwards_map_statuses(apps, schema_editor):
    Comment = apps.get_model('sheets', 'SheetCellComment')
    Comment.objects.filter(status='accepted').update(status='done')
    Comment.objects.filter(status='rejected').update(status='blocked')
    # progress stays progress; open no longer exists


class Migration(migrations.Migration):

    dependencies = [
        ('sheets', '0006_sheetcellcomment_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='sheetcellcomment',
            name='proposed_value',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.RunPython(forwards_map_statuses, backwards_map_statuses),
        migrations.AlterField(
            model_name='sheetcellcomment',
            name='status',
            field=models.CharField(
                choices=[
                    ('progress', 'W toku'),
                    ('accepted', 'Zaakceptowane'),
                    ('rejected', 'Niezaakceptowane'),
                ],
                db_index=True,
                default='progress',
                max_length=20,
            ),
        ),
    ]
