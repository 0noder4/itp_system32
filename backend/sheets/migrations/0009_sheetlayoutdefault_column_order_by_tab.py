from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sheets', '0008_staffmeal_note'),
    ]

    operations = [
        migrations.AddField(
            model_name='sheetlayoutdefault',
            name='column_order_by_tab',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
