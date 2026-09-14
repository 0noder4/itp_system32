# Generated manually for stage 5 final data fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0005_invitation_expiry_reminder_recipient'),
    ]

    operations = [
        migrations.AddField(
            model_name='finaldata',
            name='lunches_declined',
            field=models.BooleanField(default=False, verbose_name='rezygnacja z obiadów'),
        ),
        migrations.AddField(
            model_name='finaldata',
            name='no_other_delegates',
            field=models.BooleanField(default=False, verbose_name='brak innych delegatów'),
        ),
        migrations.AddField(
            model_name='finaldata',
            name='main_rep_name',
            field=models.CharField(
                blank=True,
                default='',
                max_length=100,
                verbose_name='imię głównego przedstawiciela',
            ),
        ),
        migrations.AddField(
            model_name='finaldata',
            name='main_rep_surname',
            field=models.CharField(
                blank=True,
                default='',
                max_length=100,
                verbose_name='nazwisko głównego przedstawiciela',
            ),
        ),
        migrations.AddField(
            model_name='finaldata',
            name='main_rep_phone',
            field=models.CharField(
                blank=True,
                default='',
                max_length=20,
                verbose_name='telefon głównego przedstawiciela',
            ),
        ),
        migrations.AddField(
            model_name='finaldata',
            name='main_rep_attendance',
            field=models.CharField(
                blank=True,
                choices=[
                    ('both', 'Oba dni'),
                    ('day1', 'Pierwszy dzień'),
                    ('day2', 'Drugi dzień'),
                    ('none', 'Nie będzie mnie osobiście'),
                ],
                default='',
                max_length=10,
                verbose_name='obecność głównego przedstawiciela',
            ),
        ),
        migrations.AddField(
            model_name='exhibitor',
            name='attendance',
            field=models.CharField(
                blank=True,
                choices=[
                    ('both', 'Oba dni'),
                    ('day1', 'Pierwszy dzień'),
                    ('day2', 'Drugi dzień'),
                    ('none', 'Nie będzie mnie osobiście'),
                ],
                default='',
                max_length=10,
                verbose_name='obecność delegata',
            ),
        ),
    ]
