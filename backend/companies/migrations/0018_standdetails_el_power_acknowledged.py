from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0017_settings_terms_pdf'),
    ]

    operations = [
        migrations.AddField(
            model_name='standdetails',
            name='el_power_acknowledged',
            field=models.BooleanField(
                default=False,
                help_text='Firma przyjmuje do wiadomości, że moc elektryczną należy podać w etapie 5.',
                verbose_name='potwierdzenie: moc elektryczna w etapie 5',
            ),
        ),
    ]
