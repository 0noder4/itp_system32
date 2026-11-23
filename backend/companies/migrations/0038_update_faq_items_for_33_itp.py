from django.db import migrations


OLD_NOAKOWSKIEGO_PL = "Wjazd na Plac odbywa się od strony ulicy Stanisława Noakowskiego."
NEW_NOAKOWSKIEGO_PL = (
    "W przypadku własnej zabudowy / wyposażenia dużych gabarytów istnieje możliwość "
    "wjazdu na Plac od strony ul. Noakowskiego."
)

OLD_NOAKOWSKIEGO_EN = "Entry to the Square is from Stanisława Noakowskiego Street."
NEW_NOAKOWSKIEGO_EN = (
    "For own stand construction or oversized equipment, vehicle access to the Square "
    "is possible from Noakowskiego Street."
)

NEW_OWN_SETUP_PL = (
    "Wystawcy posiadający własną zabudowę, którzy wystawiają się pierwszego dnia "
    "(wtorek, 9 marca), mogą rozstawić ją w poniedziałek 8 marca wieczorem, aby była "
    "gotowa na rozpoczęcie targów. Wystawcy obecni jedynie drugiego dnia (środa, 10 marca) "
    "mogą rozstawić własną zabudowę we wtorek 9 marca wieczorem. Szczegóły i dokładne "
    "sloty czasowe należy ustalić z opiekunem firmy."
)
NEW_OWN_SETUP_EN = (
    "Exhibitors with their own construction who are exhibiting on the first day "
    "(Tuesday, March 9) can set it up on Monday evening, March 8, so that it is ready "
    "for the opening of the fair. Exhibitors exhibiting only on the second day "
    "(Wednesday, March 10) can set up their construction on Tuesday evening, March 9. "
    "Specific timeslots should be agreed upon with your assigned supervisor."
)


def update_faq_items(apps, schema_editor):
    FAQItem = apps.get_model("companies", "FAQItem")

    for item in FAQItem.objects.filter(category="logistics"):
        changed = False
        if OLD_NOAKOWSKIEGO_PL in (item.answer_pl or ""):
            item.answer_pl = item.answer_pl.replace(OLD_NOAKOWSKIEGO_PL, NEW_NOAKOWSKIEGO_PL)
            changed = True
        if OLD_NOAKOWSKIEGO_EN in (item.answer_en or ""):
            item.answer_en = item.answer_en.replace(OLD_NOAKOWSKIEGO_EN, NEW_NOAKOWSKIEGO_EN)
            changed = True
        if changed:
            item.save(update_fields=["answer_pl", "answer_en"])

    for item in FAQItem.objects.filter(category="ownConstruction"):
        if "mogą rozstawiać ją 9 marca" in (item.answer_pl or ""):
            item.answer_pl = NEW_OWN_SETUP_PL
            item.answer_en = NEW_OWN_SETUP_EN
            item.save(update_fields=["answer_pl", "answer_en"])

    for item in FAQItem.objects.filter(category="general"):
        if "09–10 marca 2027 r." in (item.answer_pl or ""):
            item.answer_pl = item.answer_pl.replace("09–10 marca 2027 r.", "9–10 marca 2027 r.")
            item.save(update_fields=["answer_pl"])

    for item in FAQItem.objects.filter(
        category="pdiVenue",
        question_pl="Kiedy odbędzie się Gala Plebiscytu Pracodawca Dla Inżyniera?",
    ):
        item.question_pl = "Kiedy odbędzie się Gala Plebiscytu Pracodawca dla Inżyniera?"
        item.save(update_fields=["question_pl"])


class Migration(migrations.Migration):

    dependencies = [
        ("companies", "0037_websitepublication_content_published"),
    ]

    operations = [
        migrations.RunPython(update_faq_items, migrations.RunPython.noop),
    ]
