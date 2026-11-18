import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sheets', '0004_staff_meal'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('companies', '0030_carpet_mandatory_default_892'),
    ]

    operations = [
        migrations.CreateModel(
            name='SheetCellComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('column_key', models.CharField(max_length=100)),
                ('sheet_key', models.CharField(max_length=50)),
                ('tab_key', models.CharField(max_length=50)),
                ('body', models.TextField(max_length=2000)),
                ('resolved', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('author', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='authored_sheet_comments',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('company', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sheet_comments',
                    to='companies.company',
                )),
                ('mentions', models.ManyToManyField(
                    blank=True,
                    related_name='mentioned_in_sheet_comments',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('staff_user', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sheet_row_comments',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'komentarz komórki arkusza',
                'verbose_name_plural': 'komentarze komórek arkuszy',
                'ordering': ['created_at'],
            },
        ),
        migrations.CreateModel(
            name='SheetNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('read_at', models.DateTimeField(blank=True, null=True)),
                ('comment', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notifications',
                    to='sheets.sheetcellcomment',
                )),
                ('recipient', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sheet_notifications',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'powiadomienie arkusza',
                'verbose_name_plural': 'powiadomienia arkuszy',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='sheetcellcomment',
            constraint=models.CheckConstraint(
                check=(
                    models.Q(('company__isnull', False), ('staff_user__isnull', True))
                    | models.Q(('company__isnull', True), ('staff_user__isnull', False))
                ),
                name='sheetcomment_company_xor_staff',
            ),
        ),
        migrations.AddIndex(
            model_name='sheetcellcomment',
            index=models.Index(fields=['company', 'column_key', '-created_at'], name='sheetcomment_co_col'),
        ),
        migrations.AddIndex(
            model_name='sheetcellcomment',
            index=models.Index(fields=['staff_user', 'column_key', '-created_at'], name='sheetcomment_u_col'),
        ),
        migrations.AddConstraint(
            model_name='sheetnotification',
            constraint=models.UniqueConstraint(
                fields=('recipient', 'comment'),
                name='uniq_sheet_notification_recipient_comment',
            ),
        ),
        migrations.AddIndex(
            model_name='sheetnotification',
            index=models.Index(fields=['recipient', '-created_at'], name='sheetnotif_recipient_created'),
        ),
    ]
