# Generated manually: limit invitation reminders to 3 (drop slots 4–5)

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0007_finaldata_el_low_power'),
    ]

    operations = [
        migrations.AlterField(
            model_name='settings',
            name='invitation_reminder_count',
            field=models.PositiveSmallIntegerField(
                default=2,
                help_text='Set to 0 to disable invitation expiry reminders. Max 3 reminders.',
                validators=[MinValueValidator(0), MaxValueValidator(3)],
                verbose_name='liczba przypomnień o wygaśnięciu',
            ),
        ),
        migrations.RemoveField(
            model_name='settings',
            name='invitation_reminder_4_days',
        ),
        migrations.RemoveField(
            model_name='settings',
            name='invitation_reminder_5_days',
        ),
    ]
