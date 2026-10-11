from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0020_settings_edition_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='jobwall_free_count',
            field=models.PositiveIntegerField(
                default=2,
                help_text='Ile pierwszych ogłoszeń jobwall jest darmowych (0 = wszystkie płatne).',
                verbose_name='liczba darmowych ogłoszeń jobwall',
            ),
        ),
    ]
