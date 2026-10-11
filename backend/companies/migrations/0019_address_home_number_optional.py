from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0018_standdetails_el_power_acknowledged'),
    ]

    operations = [
        migrations.AlterField(
            model_name='address',
            name='home_number',
            field=models.CharField(blank=True, max_length=10, verbose_name='numer domu'),
        ),
    ]
