from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0003_invitation_notifications'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='general_contact_email',
            field=models.EmailField(
                default='best@best.pw.edu.pl',
                help_text='Adres w stopkach maili do wystawców/firm (zaproszenia, akceptacje, przypomnienia etapów itd.).',
                verbose_name='ogólny kontakt (maile do firm)',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='system_admin_email',
            field=models.EmailField(
                default='admin@example.com',
                help_text='Adres w stopkach maili do opiekunów FR i staff. Ustaw właściwy adres w panelu admina na produkcji.',
                verbose_name='administrator systemu (maile do staff/FR)',
            ),
        ),
    ]
