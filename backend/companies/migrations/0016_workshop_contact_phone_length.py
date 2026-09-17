from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0015_workshop_preferred_day_time'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workshop',
            name='contact_phone',
            field=models.CharField(
                blank=True,
                default='',
                max_length=255,
                verbose_name='telefon ds. warsztatów',
            ),
        ),
        migrations.AlterField(
            model_name='workshop',
            name='contact_phone_same_as_facilitator',
            field=models.BooleanField(
                default=False,
                verbose_name='telefon kontaktowy z numerów prowadzących',
            ),
        ),
    ]
