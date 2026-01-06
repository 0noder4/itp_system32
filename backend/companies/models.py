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
    ('accepted', 'zaakceptowano'),
    ('rejected', 'wymagane poprawki')
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

STAND_TYPE_CHOICES = [
    ('provided_stand', 'Provided Stand'),
    ('self_construction', 'Self Construction'),
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
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_invitations',
        verbose_name='Created by'
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

class Form(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='form')
    current_stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default='stage_1')
    stage_1_completed = models.BooleanField(default=False)
    stage_2_completed = models.BooleanField(default=False)
    stage_3_completed = models.BooleanField(default=False)
    stage_4_completed = models.BooleanField(default=False)
    stage_5_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def can_access_stage_2(self):
        return self.stage_1_completed

    def can_access_stage_3(self):
        return self.stage_1_completed and self.stage_2_completed

    def can_access_stage_4(self):
        return self.stage_1_completed and self.stage_2_completed and self.stage_3_completed

    def can_access_stage_5(self):
        return self.stage_1_completed and self.stage_2_completed and self.stage_3_completed and self.stage_4_completed

    def __str__(self):
        return f'Form for {self.company.name} - Stage: {self.current_stage}'

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

    
class StandDetails(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='stand_details')
    stand_type = models.CharField(max_length=20, choices=STAND_TYPE_CHOICES, default='provided_stand', verbose_name="typ stanowiska")
    sc_details = models.CharField(max_length=255, verbose_name="z czego się składa własna zabudowa", blank=True)
    name_sign_text = models.CharField(max_length=255, verbose_name="napis na fryz", blank=True)
    logo_sign_file = models.FileField(upload_to='logos', verbose_name="Logotyp na fryz", blank=True)
    fire_cert = models.FileField(upload_to="fire_certs", verbose_name="certyfikat o niepalności", blank=True)
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class EquipmentItem(models.Model):
    name_en = models.CharField(max_length=255, verbose_name="nazwa (angielski)")
    name_pl = models.CharField(max_length=255, verbose_name="nazwa (polski)")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="cena")
    is_basic = models.BooleanField(default=False, verbose_name="wyposażenie podstawowe")
    included_quantity = models.IntegerField(default=0, verbose_name="ilość wliczona (darmowa)")
    category = models.CharField(max_length=100, blank=True, verbose_name="kategoria")
    is_active = models.BooleanField(default=True, verbose_name="aktywne")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name_en

    class Meta:
        ordering = ['category', 'name_en']


class EquipmentSelection(models.Model):
    stand_details = models.ForeignKey(StandDetails, on_delete=models.CASCADE, related_name='equipment_selections')
    equipment_item = models.ForeignKey(EquipmentItem, on_delete=models.CASCADE)
    quantity = models.IntegerField(default=1, verbose_name="ilość")

    def __str__(self):
        return f"{self.stand_details.company.name} - {self.equipment_item.name_pl} x{self.quantity}"

    class Meta:
        unique_together = ['stand_details', 'equipment_item']

class Jobwall(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="jobwalls")
    name = models.CharField(max_length=255, verbose_name="nazwa stanowiska")
    form = models.CharField(max_length=50, choices=FORM_OPT)
    workload = models.CharField(max_length=50, choices=WORKLOAD_OPT)
    contract = models.CharField(max_length=50, choices=CONTRACT_OPT)
    description = models.TextField(verbose_name="opis stanowiska")
    benefits = models.TextField(verbose_name="co jest oferowane")
    requirements = models.TextField(verbose_name="wymagania")
    url = models.CharField(max_length=500, verbose_name="application URL or email")
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class Workshop(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='workshops')
    workshop = models.BooleanField(verbose_name="Poprowadzenie warsztatów", default=False)
    notes = models.TextField(verbose_name="dodatkowe uwagi", blank=True)
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class Description(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='description')
    descr = models.TextField(verbose_name="opis firmy")
    logo_file = models.FileField(upload_to='catalogue_logos', verbose_name="Logotyp do katalogu", blank=True)
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class FinalData(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='finaldata')
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

class Settings(models.Model):
    """
    System-wide settings. Uses singleton pattern - only one instance should exist.
    """
    jobwall_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        verbose_name="cena za ogłoszenie jobwall",
        default=0.00,
        help_text="Cena za jedno ogłoszenie jobwall"
    )
    stage_1_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="termin etapu 1",
        help_text="Globalny termin dla etapu 1 (Dane podstawowe)"
    )
    stage_2_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="termin etapu 2",
        help_text="Globalny termin dla etapu 2 (Wyposażenie)"
    )
    stage_3_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="termin etapu 3",
        help_text="Globalny termin dla etapu 3 (Warsztaty)"
    )
    stage_4_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="termin etapu 4",
        help_text="Globalny termin dla etapu 4 (Jobwall)"
    )
    stage_5_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="termin etapu 5",
        help_text="Globalny termin dla etapu 5 (Inne dane)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Settings"
        verbose_name_plural = "Settings"

    def __str__(self):
        return "System Settings"

    @classmethod
    def get_settings(cls):
        """Get or create the singleton settings instance"""
        settings, created = cls.objects.get_or_create(pk=1)
        return settings


