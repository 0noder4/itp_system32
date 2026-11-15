from django.db import migrations, models
from django.db.models import Q


def forwards_backfill_carpet(apps, schema_editor):
    StandDetails = apps.get_model('companies', 'StandDetails')
    StandDetails.objects.filter(carpet_choice='none').update(
        carpet_choice='rips',
        carpet_color='892',
    )
    StandDetails.objects.filter(Q(carpet_choice__isnull=True) | Q(carpet_choice='')).update(
        carpet_choice='rips',
        carpet_color='892',
    )
    # Former "none" cleared color; also fix empty color with a type already set to rips.
    StandDetails.objects.filter(carpet_choice='rips', carpet_color='').update(
        carpet_color='892',
    )


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0029_company_opiekun'),
    ]

    operations = [
        migrations.RunPython(forwards_backfill_carpet, backwards_noop),
        migrations.AlterField(
            model_name='standdetails',
            name='carpet_choice',
            field=models.CharField(
                blank=True,
                choices=[('rips', 'RIPS EXPO'), ('welur', 'WELUR EXPO')],
                help_text='Obowiązkowa dla każdej firmy. Partnerzy wybierają kolor; pozostali dostają RIPS 892.',
                max_length=10,
                null=True,
                verbose_name='wykładzina — wybór',
            ),
        ),
        migrations.AlterField(
            model_name='standdetails',
            name='carpet_color',
            field=models.CharField(
                blank=True,
                help_text='Kod koloru z palety RIPS/WELUR (np. 005, V005). Domyślnie 892 dla niepartnerów.',
                max_length=10,
                verbose_name='wykładzina — kolor',
            ),
        ),
    ]
