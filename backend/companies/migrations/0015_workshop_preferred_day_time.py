from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0014_workshop_details_facilitators'),
    ]

    operations = [
        migrations.AddField(
            model_name='workshop',
            name='preferred_day',
            field=models.CharField(
                blank=True,
                choices=[('day1', '09.03.2027'), ('day2', '10.03.2027')],
                default='',
                max_length=15,
                verbose_name='preferowany dzień warsztatu',
            ),
        ),
        migrations.AddField(
            model_name='workshop',
            name='preferred_time',
            field=models.TimeField(
                blank=True,
                null=True,
                verbose_name='preferowana godzina warsztatu',
            ),
        ),
    ]
