# Arrival time per fair day (stage 5)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0024_maplayout'),
    ]

    operations = [
        migrations.AddField(
            model_name='finaldata',
            name='arrival_time_day1',
            field=models.TimeField(
                blank=True,
                help_text='Planowana godzina przyjazdu na montaż / rozładunek w dniu 1.',
                null=True,
                verbose_name='godzina przyjazdu — dzień 1',
            ),
        ),
        migrations.AddField(
            model_name='finaldata',
            name='arrival_time_day2',
            field=models.TimeField(
                blank=True,
                help_text='Planowana godzina przyjazdu na montaż / rozładunek w dniu 2.',
                null=True,
                verbose_name='godzina przyjazdu — dzień 2',
            ),
        ),
    ]
