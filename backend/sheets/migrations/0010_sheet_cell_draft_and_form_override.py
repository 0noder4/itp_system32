from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('companies', '0031_settings_mail_send_by'),
        ('sheets', '0009_sheetlayoutdefault_column_order_by_tab'),
    ]

    operations = [
        migrations.CreateModel(
            name='SheetCellDraft',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('column_key', models.CharField(max_length=100)),
                ('value', models.JSONField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sheet_cell_drafts',
                    to='companies.company',
                )),
                ('updated_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'wersja robocza komórki arkusza',
                'verbose_name_plural': 'wersje robocze komórek arkuszy',
            },
        ),
        migrations.CreateModel(
            name='SheetCellFormOverride',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('column_key', models.CharField(max_length=100)),
                ('previous_value', models.JSONField(blank=True, null=True)),
                ('value', models.JSONField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sheet_form_overrides',
                    to='companies.company',
                )),
                ('updated_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'nadpisanie pola formularza z arkusza',
                'verbose_name_plural': 'nadpisania pól formularza z arkuszy',
            },
        ),
        migrations.AddConstraint(
            model_name='sheetcelldraft',
            constraint=models.UniqueConstraint(
                fields=('company', 'column_key'),
                name='uniq_sheet_cell_draft_company_column',
            ),
        ),
        migrations.AddConstraint(
            model_name='sheetcellformoverride',
            constraint=models.UniqueConstraint(
                fields=('company', 'column_key'),
                name='uniq_sheet_form_override_company_column',
            ),
        ),
    ]
