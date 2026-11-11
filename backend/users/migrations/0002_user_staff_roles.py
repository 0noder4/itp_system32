from django.db import migrations, models


def grant_fr_to_existing_staff(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(type='staff').update(staff_roles=['fr'])


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='staff_roles',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Tylko dla kont typu staff. Admin ma wszystkie role automatycznie.',
                verbose_name='role staff',
            ),
        ),
        migrations.RunPython(grant_fr_to_existing_staff, migrations.RunPython.noop),
    ]
