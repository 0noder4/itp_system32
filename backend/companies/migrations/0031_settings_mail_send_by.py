import datetime

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0030_carpet_mandatory_default_892'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='mail_1_send_by',
            field=models.DateField(
                default=datetime.date(2027, 2, 25),
                help_text='Do kiedy wysłać Mail #1 (potwierdzenie zamówienia). Widać w nagłówku grupy w arkuszu.',
                verbose_name='termin wysyłki maila 1',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='mail_2_send_by',
            field=models.DateField(
                default=datetime.date(2027, 2, 27),
                help_text='Do kiedy wysłać Mail #2 (zaproszenie na galę PDI). Widać w nagłówku grupy w arkuszu.',
                verbose_name='termin wysyłki maila 2',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='mail_3_send_by',
            field=models.DateField(
                default=datetime.date(2027, 3, 3),
                help_text='Do kiedy wysłać Mail #3 (informator i parking). Widać w nagłówku grupy w arkuszu.',
                verbose_name='termin wysyłki maila 3',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='mail_4_send_by',
            field=models.DateField(
                default=datetime.date(2027, 3, 5),
                help_text='Do kiedy wysłać Mail #4 (osobiste zaproszenie na PDI). Widać w nagłówku grupy w arkuszu.',
                verbose_name='termin wysyłki maila 4',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='mail_5_send_by',
            field=models.DateField(
                default=datetime.date(2027, 3, 9),
                help_text='Kiedy wysłać Mail #5 (powitanie na targach). Widać w nagłówku grupy w arkuszu.',
                verbose_name='termin wysyłki maila 5',
            ),
        ),
    ]
