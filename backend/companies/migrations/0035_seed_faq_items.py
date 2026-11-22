from django.db import migrations


INITIAL_FAQ_ITEMS = [
    # General
    {
        'category': 'general',
        'order': 10,
        'question_pl': 'Gdzie odbywają się targi?',
        'answer_pl': 'Inżynierskie Targi Pracy odbywają się w Gmachu Głównym Politechniki Warszawskiej przy Placu Politechniki 1 w Warszawie.',
        'question_en': 'Where is the fair taking place?',
        'answer_en': 'The Engineering Job Fair takes place at the Main Building of Warsaw University of Technology at Plac Politechniki 1, Warsaw.',
    },
    {
        'category': 'general',
        'order': 20,
        'question_pl': 'Kiedy odbywają się targi?',
        'answer_pl': 'Targi odbywają się w dniach 09–10 marca 2027 r. Wydarzenie trwa w godzinach 9:00–16:00 w obu dniach. Oficjalne otwarcie odbędzie się 9 marca o godzinie 10:00.',
        'question_en': 'When is the fair taking place?',
        'answer_en': 'The fair takes place on March 9–10, 2027. The fair starts at 9:00 AM and ends at 4:00 PM on both days. The official opening is on March 9 at 10:00 AM.',
    },
    {
        'category': 'general',
        'order': 30,
        'question_pl': 'Jakie jest hasło do Wi-Fi?',
        'answer_pl': 'Hasło do Wi-Fi zostanie przekazane wystawcom w dniu targów przez przydzielonego opiekuna.',
        'question_en': 'What is the Wi-Fi password?',
        'answer_en': 'The Wi-Fi password will be provided to exhibitors on the fair day by their assigned supervisor.',
    },
    # Logistics
    {
        'category': 'logistics',
        'order': 10,
        'question_pl': 'Gdzie można rozładować materiały?',
        'answer_pl': 'W celu rozładunku samochodu możliwy jest krótki postój (5 min) przy Gmachu Głównym od strony ulicy Noakowskiego. Wjazd na Plac odbywa się od strony ulicy Stanisława Noakowskiego.',
        'question_en': 'Where can we unload materials?',
        'answer_en': 'For unloading your vehicle, a short stop (5 min) is possible at the Main Building from Noakowskiego Street. Entry to the Square is from Stanisława Noakowskiego Street.',
    },
    {
        'category': 'logistics',
        'order': 20,
        'question_pl': 'Czy organizator zapewnia miejsca parkingowe?',
        'answer_pl': 'Nie zapewniamy miejsc parkingowych. W okolicy Gmachu Głównego Politechniki Warszawskiej dostępne są płatne parkingi. Szczegółowe informacje o lokalizacji i cenach znajdują się w odpowiedzi na pytanie o ceny parkingów.',
        'question_en': 'Do you provide parking spaces?',
        'answer_en': 'We do not provide parking spaces. Paid parking lots are available near the Main Building of Warsaw University of Technology.',
    },
    {
        'category': 'logistics',
        'order': 30,
        'question_pl': 'Jakie są ceny parkingów w okolicy?',
        'answer_pl': (
            '1. Parkingi Płatne Miasta (z parkometrami):\n'
            '   - Pierwsza godzina: 4,50 zł\n'
            '   - Druga godzina: 5,40 zł\n'
            '   - Trzecia godzina: 6,40 zł\n'
            '   - Każda kolejna godzina: 4,50 zł\n\n'
            '2. CPG Parking Podziemny Strzeżony przy ulicy Progi 1:\n'
            '   - Cena za godzinę: 6 zł\n'
            '   - Cena za dobę: 50 zł\n\n'
            '3. Parking Hala Koszyki Evend, Koszykowa 63:\n'
            '   - Pierwsza godzina: 10 zł\n'
            '   - Każda kolejna rozpoczęta godzina: 10 zł\n\n'
            '4. Interparking Piękna 20:\n'
            '   - Cena za godzinę: 7 zł\n'
            '   - Przy rezerwacji online: 50 zł za dobę'
        ),
        'question_en': 'What are the parking prices in the area?',
        'answer_en': (
            '1. City Paid Parking (with parking meters):\n'
            '   - First hour: 4.50 PLN\n'
            '   - Second hour: 5.40 PLN\n'
            '   - Third hour: 6.40 PLN\n'
            '   - Each additional hour: 4.50 PLN\n\n'
            '2. CPG Underground Guarded Parking at Progi 1:\n'
            '   - Price per hour: 6 PLN\n'
            '   - Price per day: 50 PLN\n\n'
            '3. Hala Koszyki Evend Parking, Koszykowa 63:\n'
            '   - First hour: 10 PLN\n'
            '   - Each additional started hour: 10 PLN\n\n'
            '4. Interparking Piękna 20:\n'
            '   - Price per hour: 7 PLN\n'
            '   - With online reservation: 50 PLN per day'
        ),
    },
    # Promotional materials & stand
    {
        'category': 'materials',
        'order': 10,
        'question_pl': 'Kiedy można rozstawić materiały promocyjne?',
        'answer_pl': 'W dniu targowym istnieje możliwość pojawienia się od godziny 6:30 w celu rozstawienia materiałów promocyjnych (roll-up, ścianki, plakaty, gadżety).',
        'question_en': 'When can promotional materials be set up?',
        'answer_en': 'On the fair day, it is possible to arrive from 6:30 AM to set up promotional materials (roll-ups, walls, posters, gadgets).',
    },
    {
        'category': 'materials',
        'order': 20,
        'question_pl': 'Czy można przyklejać materiały na ściankach zabudowy?',
        'answer_pl': 'Na ściankach zabudowy nie można przyklejać materiałów drukowanych – prowadzi to do zniszczenia ścianki. W przypadku zniszczenia ścianki wynikającego z naklejenia na nią materiałów promocyjnych, firma poniesie dodatkowy koszt.',
        'question_en': 'Can materials be glued to the construction walls?',
        'answer_en': 'Printed materials cannot be glued to construction walls – this damages the wall. In case of wall damage resulting from sticking promotional materials on it, the company will incur an additional cost.',
    },
    # Own construction
    {
        'category': 'ownConstruction',
        'order': 10,
        'question_pl': 'Kiedy można rozstawić własną zabudowę?',
        'answer_pl': 'Wystawcy posiadający własną zabudowę, którzy wystawiają się pierwszego dnia, mogą rozstawiać ją 9 marca. Wystawcy obecni jedynie drugiego dnia mogą rozkładać swoją zabudowę 10 marca. Szczegóły i dokładne godziny należy ustalić z opiekunem firmy.',
        'question_en': 'When can own construction be set up?',
        'answer_en': 'Exhibitors who have their own construction and are exhibiting on the first day can set it up on March 9. Exhibitors who are only exhibiting on the second day can set up their construction on March 10. Specific timeslots should be agreed upon with your assigned supervisor.',
    },
    # Workshops
    {
        'category': 'workshops',
        'order': 10,
        'question_pl': 'Kto może zorganizować warsztat i jak go zgłosić?',
        'answer_pl': 'Warsztaty są dostępne dla firm w pakietach Partner oraz Partner Główny (w ramach pakietu przysługuje jeden darmowy warsztat). Zgłoszenie warsztatu odbywa się w Etapie 3 formularza zgłoszeniowego — prosimy podać nazwę i tematykę warsztatu, preferowany dzień oraz zapotrzebowanie na wyposażenie sali.',
        'question_en': 'Who can organize a workshop and how do we apply?',
        'answer_en': 'Workshops are available to companies with Partner or Main Partner packages (one free workshop is included in the package). You can apply for a workshop in Stage 3 of the application form by providing the workshop title, description, preferred day, and room equipment needs.',
    },
    # Support & Catering
    {
        'category': 'support',
        'order': 10,
        'question_pl': 'Czy firma będzie miała przydzielonego opiekuna?',
        'answer_pl': 'Tak, podczas trwania wydarzenia będą mieli Państwo przydzielonego opiekuna firmy z grona organizatorów. Osoba ta będzie do Państwa dyspozycji w przypadku pytań bądź uwag dotyczących przebiegu Inżynierskich Targów Pracy. Prosimy o zapisanie kontaktu do przydzielonego Państwu opiekuna oraz kontaktowanie się z nim w razie problemów.',
        'question_en': 'Will our company have an assigned supervisor?',
        'answer_en': 'Yes, during the event you will have an assigned company supervisor from among the organizers. This person will be at your disposal for questions or comments regarding the Engineering Job Fair. Please save their contact details and reach out in case of any issues.',
    },
    {
        'category': 'support',
        'order': 20,
        'question_pl': 'Czy obiad jest wliczony w pakiet?',
        'answer_pl': 'Tak, w ramach pakietu przewidziane są darmowe obiady na każdy dzień targów (Wystawca: 2 dziennie, Partner: 6 dziennie, Partner Główny: 10 dziennie; dodatkowe obiady można dokupić w formularzu zgłoszeniowym lub w czasie targów przez opiekuna firmy). W zestawie powitalnym znajdą Państwo bony, które można wymienić na obiad w Stołówce Centralnej Politechniki Warszawskiej „Bistro Chochelka” (ul. Rektorska 2). Przewidziane godziny na obiad to 12:00–15:00.',
        'question_en': 'Is lunch included in the package?',
        'answer_en': 'Yes, free hot lunches for each fair day are included according to your package (Exhibitor: 2/day, Partner: 6/day, Main Partner: 10/day; additional lunches can be purchased in the application form or during the fair through your supervisor). The welcome package contains vouchers exchangeable for lunch at Warsaw University of Technology Central Canteen "Bistro Chochelka" (2 Rektorska St.). Scheduled lunch hours are 12:00–15:00.',
    },
    {
        'category': 'support',
        'order': 30,
        'question_pl': 'Czy będzie dostępny coffee point?',
        'answer_pl': 'Tak, podczas targów będzie dostępny coffee point z kawą i słodkim poczęstunkiem.',
        'question_en': 'Will there be a coffee point available?',
        'answer_en': 'Yes, a coffee point with coffee and sweet treats will be available during the fair.',
    },
    # PDI Gala
    {
        'category': 'pdiVenue',
        'order': 10,
        'question_pl': 'Kiedy odbędzie się Gala Plebiscytu Pracodawca Dla Inżyniera?',
        'answer_pl': 'Tegoroczna gala prezentująca wyniki plebiscytu Pracodawca dla Inżyniera odbędzie się 9 marca 2027 r. w Małej Auli Gmachu Głównego Politechniki Warszawskiej. Podczas gali zostaną zaprezentowane wyniki badania dotyczącego oczekiwań studentów i absolwentów uczelni technicznych wobec rynku pracy.',
        'question_en': 'When is the Employer for Engineer Gala taking place?',
        'answer_en': 'This year\'s gala presenting the results of the Employer for Engineer survey will take place on March 9, 2027 in the Small Hall of the Main Building of Warsaw University of Technology. During the gala, the results of the study on the expectations of students and graduates of technical universities regarding the job market will be presented.',
    },
]


def seed_faq_items(apps, schema_editor):
    FAQItem = apps.get_model('companies', 'FAQItem')
    if FAQItem.objects.exists():
        return
    for entry in INITIAL_FAQ_ITEMS:
        FAQItem.objects.create(**entry, is_active=True)


def unseed_faq_items(apps, schema_editor):
    FAQItem = apps.get_model('companies', 'FAQItem')
    FAQItem.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('companies', '0034_faqitem'),
    ]

    operations = [
        migrations.RunPython(seed_faq_items, unseed_faq_items),
    ]
