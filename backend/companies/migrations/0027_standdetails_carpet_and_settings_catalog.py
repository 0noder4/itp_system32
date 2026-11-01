from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0026_companyinvitation_is_resigned'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='carpet_catalog_image',
            field=models.ImageField(
                blank=True,
                help_text=(
                    'Rozpiska RIPS/WELUR (JPG/PNG/WebP) pokazywana partnerom w dużym dialogu Etapu 2. '
                    'Podmiana w adminie bez redeployu frontendu.'
                ),
                null=True,
                upload_to='carpet_catalog',
                verbose_name='katalog wykładzin (obraz)',
            ),
        ),
        migrations.AddField(
            model_name='standdetails',
            name='carpet_choice',
            field=models.CharField(
                blank=True,
                choices=[
                    ('rips', 'RIPS EXPO'),
                    ('welur', 'WELUR EXPO'),
                    ('none', 'Nie chcemy wykładziny'),
                ],
                help_text='Tylko partner / partner główny. null = jeszcze nie wybrano.',
                max_length=10,
                null=True,
                verbose_name='wykładzina — wybór',
            ),
        ),
        migrations.AddField(
            model_name='standdetails',
            name='carpet_color',
            field=models.CharField(
                blank=True,
                help_text='Kod koloru z palety RIPS/WELUR (np. 005, V005). Puste przy rezygnacji.',
                max_length=10,
                verbose_name='wykładzina — kolor',
            ),
        ),
    ]
