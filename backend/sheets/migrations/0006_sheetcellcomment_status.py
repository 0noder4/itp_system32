from django.db import migrations, models


def forwards_resolved_to_status(apps, schema_editor):
    Comment = apps.get_model('sheets', 'SheetCellComment')
    Comment.objects.filter(resolved=True).update(status='done')
    Comment.objects.filter(resolved=False).update(status='open')


def backwards_status_to_resolved(apps, schema_editor):
    Comment = apps.get_model('sheets', 'SheetCellComment')
    Comment.objects.filter(status='done').update(resolved=True)
    Comment.objects.exclude(status='done').update(resolved=False)


class Migration(migrations.Migration):

    dependencies = [
        ('sheets', '0005_sheet_comments_notifications'),
    ]

    operations = [
        migrations.AddField(
            model_name='sheetcellcomment',
            name='status',
            field=models.CharField(
                choices=[
                    ('open', 'Do zrobienia'),
                    ('progress', 'W toku'),
                    ('done', 'Załatwione'),
                    ('blocked', 'Problem'),
                ],
                db_index=True,
                default='open',
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards_resolved_to_status, backwards_status_to_resolved),
        migrations.RemoveField(
            model_name='sheetcellcomment',
            name='resolved',
        ),
    ]
