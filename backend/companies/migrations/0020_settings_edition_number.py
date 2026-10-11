from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0019_address_home_number_optional'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='edition_number',
            field=models.PositiveSmallIntegerField(
                default=33,
                help_text=(
                    'Numer edycji Targów Pracy (np. 33). Widoczny w nazwie systemu w panelu i tytule przeglądarki. '
                    'Zmiana w adminie bez redeployu frontendu.'
                ),
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(99),
                ],
                verbose_name='numer edycji',
            ),
        ),
    ]
