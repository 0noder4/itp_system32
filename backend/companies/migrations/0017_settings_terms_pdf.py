from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0016_workshop_contact_phone_length'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='terms_pdf',
            field=models.FileField(
                blank=True,
                help_text='PDF regulaminu pokazywany firmom przy zapisie etapu 1. Podmiana w adminie bez redeployu frontendu.',
                null=True,
                upload_to='terms',
                verbose_name='regulamin (PDF)',
            ),
        ),
    ]
