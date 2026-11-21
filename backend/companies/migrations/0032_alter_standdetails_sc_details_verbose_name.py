from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0031_settings_mail_send_by'),
    ]

    operations = [
        migrations.AlterField(
            model_name='standdetails',
            name='sc_details',
            field=models.CharField(
                blank=True,
                max_length=255,
                verbose_name='wymiary własnej zabudowy',
            ),
        ),
    ]
