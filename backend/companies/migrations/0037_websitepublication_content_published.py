from django.db import migrations, models


def backfill_published(apps, schema_editor):
    WebsitePublication = apps.get_model("companies", "WebsitePublication")
    WebsitePublication.objects.filter(
        last_exported_at__isnull=False,
    ).exclude(
        strapi_document_id="",
    ).update(content_published=True)


class Migration(migrations.Migration):

    dependencies = [
        ("companies", "0036_alter_company_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="websitepublication",
            name="content_published",
            field=models.BooleanField(
                default=False,
                help_text="True = karta firmy i oferty opublikowane publicznie; False = tylko szkic w Strapi.",
                verbose_name="opublikowana na stronie",
            ),
        ),
        migrations.RunPython(backfill_published, migrations.RunPython.noop),
    ]
