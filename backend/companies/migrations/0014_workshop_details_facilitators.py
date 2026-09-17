from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0013_workshop_conscious_choice'),
    ]

    operations = [
        migrations.AddField(
            model_name='workshop',
            name='title',
            field=models.CharField(blank=True, default='', max_length=255, verbose_name='nazwa warsztatu'),
        ),
        migrations.AddField(
            model_name='workshop',
            name='description',
            field=models.TextField(blank=True, default='', verbose_name='opis warsztatu'),
        ),
        migrations.AddField(
            model_name='workshop',
            name='skills',
            field=models.TextField(blank=True, default='', verbose_name='praktyczne umiejętności'),
        ),
        migrations.AddField(
            model_name='workshop',
            name='study_majors',
            field=models.TextField(blank=True, default='', verbose_name='mile widziane kierunki studiów'),
        ),
        migrations.AddField(
            model_name='workshop',
            name='room_projector',
            field=models.BooleanField(default=False, verbose_name='rzutnik'),
        ),
        migrations.AddField(
            model_name='workshop',
            name='room_hdmi',
            field=models.BooleanField(default=False, verbose_name='kabel HDMI'),
        ),
        migrations.AddField(
            model_name='workshop',
            name='room_other',
            field=models.CharField(blank=True, default='', max_length=255, verbose_name='inne udogodnienia sali'),
        ),
        migrations.AddField(
            model_name='workshop',
            name='contact_phone',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='telefon ds. warsztatów'),
        ),
        migrations.AddField(
            model_name='workshop',
            name='contact_phone_same_as_facilitator',
            field=models.BooleanField(
                default=False,
                verbose_name='telefon kontaktowy taki sam jak u prowadzącego',
            ),
        ),
        migrations.CreateModel(
            name='WorkshopFacilitator',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, verbose_name='Imię')),
                ('surname', models.CharField(max_length=100, verbose_name='Nazwisko')),
                ('phone_number', models.CharField(max_length=20, verbose_name='Numer telefonu')),
                ('description', models.TextField(blank=True, default='', verbose_name='opis prowadzącego')),
                ('workshop', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='facilitators',
                    to='companies.workshop',
                )),
            ],
            options={
                'ordering': ['id'],
            },
        ),
    ]
