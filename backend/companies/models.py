from django.db import models
from django.conf import settings
import uuid
import datetime
import django.utils

STATUS_MAIN = 'main'
STATUS_PARTENER = 'partner'
STATUS_BASIC = 'basic'


COMPANY_STATUS_CHOICES = [
    (STATUS_MAIN, STATUS_MAIN),
    (STATUS_PARTENER, STATUS_PARTENER),
    (STATUS_BASIC, STATUS_BASIC),
]

DAY_OPT = [
    ('day1', '10.03.2025'),
    ('day2', '11.03.2025')
]

SIZE_OPT = [
    ('podstawowy', '4m2'),
    ('standardowy', '6m2'),
    ('rozszerzony', '8m2')
]

STATE_OPT = [
    ('pending', 'oczekiwanie na akceptację'),
    ('akcept', 'zaakceptowano'),
    ('odrzucenie', 'wymagane poprawki')
]

FORM_OPT = [
    ('s', 'stacjonarnie'),
    ('z', 'zdalnie'),
    ('h', 'hybrydowo'),
    ('k', 'konkurs'),
    ('m', 'mobilnie')
]

WORKLOAD_OPT = [
    ('pelen', 'pełen etat'),
    ('pol', ' 1/2 etatu'),
    ('trzyczwarte', '3/4 etatu'),
    ('el', 'elastyczny')
]

CONTRACT_OPT = [
    ('uop', 'umowa o pracę'),
    ('uoz', 'umowa o zlecenie'),
    ('uod', 'umowa o dzieło'),
    ('b2b', 'kontrakt b2b'),
    ('uos', 'umowa o staż/praktyki'),
]

STAGE_CHOICES = [
    ('stage_1', 'Dane podstawowe'),
    ('stage_2', 'Wyposażenie'),
    ('stage_3', 'Warsztaty'),
    ('stage_4', 'Jobwall'),
    ('stage_5', 'Inne dane'),
    ('completed', 'Zakończone'),
]

class Company(models.Model):
    name = models.CharField(max_length=100, unique=True)
    email = models.EmailField()
    representative = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        related_name="comp_repr"
    )
    fr_resp = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="fr_resp"
    )

    status = models.CharField(
        max_length=10,
        choices=COMPANY_STATUS_CHOICES,
        default=STATUS_BASIC,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


def get_expiry_time():
    return django.utils.timezone.now() + datetime.timedelta(days=7)

class CompanyInvitation(models.Model):
    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('pl', 'Polish'),
    ]
    
    email = models.EmailField()
    company_name = models.CharField(max_length=255)
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(blank=True, default=get_expiry_time())
    is_accepted = models.BooleanField(default=False)
    language = models.CharField(
        max_length=5,
        choices=LANGUAGE_CHOICES,
        default='en',
    )

    company_status = models.CharField(
        max_length=10,
        choices=COMPANY_STATUS_CHOICES,
        default=STATUS_BASIC,
    )

    def is_expired(self):
        return django.utils.timezone.now() > self.expires_at

    def get_invitation_status(self):
        if self.is_accepted:
            return "accepted"
        elif self.is_expired():
            return "expired"
        else:
            return "not accepted"

    def __str__(self):
        return f'Company name: {self.company_name} is {self.get_invitation_status()}'

    # blank=True -> pole w formularzu moze byc puste
    # null=True -> pole w bazie moze przyjmowac null

class Stand(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='stand_all')
    day = models.CharField(max_length=15, choices=DAY_OPT)
    stand_number = models.CharField(max_length=10, blank=True, default='brak')
    stand_size = models.CharField(max_length=11, choices=SIZE_OPT)


class Deadline(models.Model):
    dl = models.DateTimeField()

class Feedback(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="feedback")
    form = models.CharField(max_length=50, verbose_name="etap formularza")  # lista etapów?
    status = models.CharField(max_length=30, choices=STATE_OPT, default='pending')
    comment = models.TextField(verbose_name="komentarz", blank=True)

# FORMULARZE:
class BasicData(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='basic_data')
    full_name = models.CharField(max_length=255, verbose_name="pełna nazwa firmy")
    nip = models.CharField(max_length=20, verbose_name="nip firmy")
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)


class Address(models.Model):
    form = models.OneToOneField(BasicData, on_delete=models.CASCADE, related_name='adress')
    street = models.CharField(max_length=255, verbose_name="ulica")
    home_number = models.CharField(max_length=10, verbose_name="numer domu")
    apt_number = models.CharField(max_length=10, verbose_name="numer lokalu", blank=True)  # optional
    city = models.CharField(max_length=100, verbose_name="miasto")
    country = models.CharField(max_length=100, verbose_name="kraj")
    postal_code = models.CharField(max_length=20, verbose_name="kod pocztowy")


class Person(models.Model):
    name = models.CharField(max_length=100, verbose_name="Imię")
    surname = models.CharField(max_length=100, verbose_name="Nazwisko")
    phone_number = models.CharField(max_length=20, verbose_name="Numer telefonu")

    class Meta:
        # Aby baza danych nie tworzyła tabeli "Person"
        abstract = True


class ContactPerson(Person):
    form = models.ForeignKey(BasicData, on_delete=models.CASCADE, related_name='contact_ppl')
    email = models.EmailField(verbose_name="Adres email")
    
class StandDetails(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='stand_details')
    self_construction = models.BooleanField(verbose_name="własna zabudowa", default=False)
    sc_details = models.CharField(max_length=255, verbose_name="z czego się składa własna zabudowa", blank=True)
    name_sign_text = models.CharField(max_length=255, verbose_name="napis na fryz", blank=True)  # trzeba zrobic walidację z basic equipment
    logo_sign_file = models.FileField(upload_to='logos', verbose_name="Logotyp na fryz", blank=True)  # jak wyzej
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class BasicEquipment(models.Model):
    form = models.OneToOneField(StandDetails, on_delete=models.CASCADE, related_name='basic_equipment')
    chair = models.IntegerField(verbose_name="ilość krzeseł", default=2)
    counter = models.BooleanField(verbose_name="lada zwykła", default=True)
    trashbin = models.BooleanField(verbose_name="śmietnik", default=True)
    hanger = models.BooleanField(verbose_name="wieszak", default=True) 

class ExtendedEquipment(models.Model):
    form = models.OneToOneField(StandDetails, on_delete=models.CASCADE, related_name='ext_equipment')
    counter = models.IntegerField(verbose_name="lada zwykła")
    arched_counter = models.IntegerField(verbose_name="lada łukowa")
    tv = models.IntegerField(verbose_name="telewizor")
    chair = models.IntegerField(verbose_name="krzesło")
    bar_table = models.IntegerField(verbose_name="stół barowy")
    bar_stool = models.IntegerField(verbose_name="krzesło barowe")
    leaflet_stand = models.IntegerField(verbose_name="stojak na ulotki")
    carpet_color = models.CharField(max_length=20, verbose_name="kolor wykładziny")

class Jobwall(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="jobwalls")
    name = models.CharField(max_length=255, verbose_name="nazwa stanowiska")
    form = models.CharField(max_length=50, choices=FORM_OPT)
    workload = models.CharField(max_length=50, choices=WORKLOAD_OPT)
    contract = models.CharField(max_length=50, choices=CONTRACT_OPT)
    description = models.TextField(verbose_name="opis stanowiska")
    benefits = models.TextField(verbose_name="co jest oferowane")
    requirements = models.TextField(verbose_name="wymagania")
    url = models.URLField()
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class Workshop(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='workshops')
    workshop = models.BooleanField(verbose_name="Poprowadzenie warsztatów", default=False)
    notes = models.TextField(verbose_name="dodatkowe uwagi", blank=True)
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class Description(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='description')
    descr = models.TextField(verbose_name="opis firmy")
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class FinalData(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='finaldata')
    fire_cert = models.FileField(upload_to="fire_certs", verbose_name="certyfikat o niepalności", blank=True)
    gg_parking = models.BooleanField(verbose_name="czy potrzebny wyjazd na parking")
    el_devices = models.CharField(max_length=255, verbose_name="urządzenia elektryczne w trakcie targów")
    el_power = models.CharField(max_length=255, verbose_name="łączna moc urządzeń")
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class Lunch(models.Model):
    form = models.ForeignKey(FinalData, on_delete=models.CASCADE, related_name="lunches")
    day = models.CharField(max_length=15, choices=DAY_OPT)
    lunch_quantity = models.IntegerField(verbose_name="liczba obiadów")  # dodać info że sa dodatkowo płatne??
    diet_info = models.CharField(max_length=255, verbose_name="informacje o dietach")

class PDI(models.Model):
    form = models.OneToOneField(FinalData, on_delete=models.CASCADE, related_name="pdis")
    tickets_quantity = models.IntegerField(verbose_name="liczba biletów na galę PDI")

class PDIAttendee(Person):
    form = models.ForeignKey(PDI, on_delete=models.CASCADE, related_name="pdiattendees")
    email = models.EmailField(verbose_name="Adres email")


class Exhibitor(Person):
    form = models.ForeignKey(PDI, on_delete=models.CASCADE, related_name="exhibitors")

# nie implementuje: CarData


