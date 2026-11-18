from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sheets', '0007_comment_propose_change'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffmeal',
            name='note',
            field=models.TextField(blank=True, default=''),
        ),
    ]
