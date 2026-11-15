from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sheets', '0002_layout_and_cell_styles'),
    ]

    operations = [
        migrations.AddField(
            model_name='sheetlayoutdefault',
            name='hidden_by_tab',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
