# Generated manually for stage 5 low-power electrical devices option

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0006_stage5_final_data_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='finaldata',
            name='el_low_power',
            field=models.BooleanField(
                default=False,
                help_text='Zaznacz, jeśli łączna moc urządzeń to około 100 W lub mniej — wtedy nie trzeba podawać szczegółów.',
                verbose_name='niska moc (około 100 W lub mniej)',
            ),
        ),
        migrations.AlterField(
            model_name='finaldata',
            name='el_devices',
            field=models.CharField(
                blank=True,
                default='',
                max_length=255,
                verbose_name='urządzenia elektryczne w trakcie targów',
            ),
        ),
        migrations.AlterField(
            model_name='finaldata',
            name='el_power',
            field=models.CharField(
                blank=True,
                default='',
                max_length=255,
                verbose_name='łączna moc urządzeń',
            ),
        ),
    ]
