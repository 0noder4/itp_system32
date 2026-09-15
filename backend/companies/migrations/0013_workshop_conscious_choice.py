from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0012_equipmentitem_code_choices'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workshop',
            name='workshop',
            field=models.BooleanField(
                blank=True,
                default=None,
                help_text='Jawny wybór: True = prowadzą warsztat, False = nie potrzebują. Null = brak decyzji.',
                null=True,
                verbose_name='Poprowadzenie warsztatów',
            ),
        ),
    ]
