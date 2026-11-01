# Invitation cancel option: company resigns (logistics signal)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0025_finaldata_arrival_times'),
    ]

    operations = [
        migrations.AddField(
            model_name='companyinvitation',
            name='is_resigned',
            field=models.BooleanField(
                default=False,
                help_text='Zaproszenie anulowane z powodu rezygnacji firmy (sygnał dla logistyki).',
                verbose_name='firma rezygnuje',
            ),
        ),
    ]
