from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0011_equipmentitem_code_special_properties_labels'),
    ]

    operations = [
        migrations.AlterField(
            model_name='equipmentitem',
            name='code',
            field=models.CharField(
                blank=True,
                choices=[
                    ('hanger', 'hanger — wieszak (1 w pakiecie; ukryty przy własnej zabudowie)'),
                    ('trashbin', 'trashbin — kosz (zawsze 1 w pakiecie)'),
                    ('tv', 'tv — wybór montażu stojak/ściana'),
                    ('square_table', 'square_table — stolik kwadrat'),
                    ('arc_counter', 'arc_counter — ostrzeżenie: głównie stoiska narożne'),
                ],
                help_text=(
                    'Puste = zwykła pozycja bez ekstra reguł. '
                    'Wybierz co najwyżej jeden kod specjalnych właściwości.'
                ),
                max_length=50,
                null=True,
                unique=True,
                verbose_name='kod specjalnych właściwości',
            ),
        ),
    ]
