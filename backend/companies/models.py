from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
import copy
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
    ('day1', '09.03.2027'),
    ('day2', '10.03.2027')
]

ATTENDANCE_OPT = [
    ('both', 'Oba dni'),
    ('day1', 'Pierwszy dzień'),
    ('day2', 'Drugi dzień'),
    ('none', 'Nie będzie mnie osobiście'),
]

DIET_OPT = [
    ('meat', 'Mięsna (zwykła)'),
    ('vegetarian', 'Wegetariańska'),
    ('vegan', 'Wegańska'),
]

SIZE_OPT = [
    ('podstawowy', '4m2'),
    ('standardowy', '6m2'),
    ('rozszerzony', '8m2'),
    ('12m2', '12m2'),
]

PLANNED_DAYS_CHOICES = [
    (1, '1 dzień'),
    (2, '2 dni'),
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

CARPET_CHOICE_RIPS = 'rips'
CARPET_CHOICE_WELUR = 'welur'
# Legacy value — rejected on write; migrated to default RIPS 892.
CARPET_CHOICE_NONE = 'none'

CARPET_CHOICE_CHOICES = [
    (CARPET_CHOICE_RIPS, 'RIPS EXPO'),
    (CARPET_CHOICE_WELUR, 'WELUR EXPO'),
]

# Mandatory default for non-partners (and backfill of former "none").
DEFAULT_CARPET_CHOICE = CARPET_CHOICE_RIPS
DEFAULT_CARPET_COLOR = '892'


def company_chooses_carpet(company) -> bool:
    """Partners / main partners pick carpet colour; everyone else gets the default."""
    return bool(company is not None and company.status in (STATUS_MAIN, STATUS_PARTENER))


def apply_default_carpet(stand_details_data: dict) -> None:
    stand_details_data['carpet_choice'] = DEFAULT_CARPET_CHOICE
    stand_details_data['carpet_color'] = DEFAULT_CARPET_COLOR

# Hardcoded IMAWEX palette (catalog image is separate in Settings).
# Keep in sync with frontend/lib/carpetCatalog.ts (CARPET_COLORS_RIPS / WELUR).
# FE cannot import this file; update both when the supplier catalog changes.
CARPET_COLORS_RIPS = [
    ('005', 'biały'),
    ('035', 'żółty'),
    ('033', 'pomarańcz'),
    ('037', 'czerwony'),
    ('313', 'bordo'),
    ('042', 'różowy'),
    ('029', 'fiolet'),
    ('946', 'miodowy'),
    ('912', 'beż'),
    ('248', 'c.brąz'),
    ('065', 'zielony'),
    ('602', 'c. zielony'),
    ('054', 'niebieski'),
    ('055', 'c. niebieski'),
    ('543', 'granat'),
    ('022', 'j. szary'),
    ('892', 'szary'),
    ('940', 'grafit'),
    ('890', 'antracyt'),
    ('021', 'czarny'),
]

CARPET_COLORS_WELUR = [
    ('V005', 'biały'),
    ('V810', 'żółty'),
    ('V800', 'pomarańcz'),
    ('V372', 'czerwony'),
    ('V320', 'bordo'),
    ('V322', 'fuksja'),
    ('V250', 'j. beż'),
    ('V549', 'niebieski'),
    ('V551', 'c. niebieski'),
    ('V560', 'granat'),
    ('V254', 'beż'),
    ('V171', 'lemon'),
    ('V650', 'zielony'),
    ('V643', 'c. zielony'),
    ('V228', 'j. szary'),
    ('V202', 'szary'),
    ('V234', 'grafit'),
    ('V215', 'antracyt'),
    ('V217', 'czarny'),
]

CARPET_COLOR_CODES_BY_CHOICE = {
    CARPET_CHOICE_RIPS: {code for code, _ in CARPET_COLORS_RIPS},
    CARPET_CHOICE_WELUR: {code for code, _ in CARPET_COLORS_WELUR},
}


def carpet_color_label(choice: str | None, color_code: str | None) -> str:
    """Human-readable color label for export/UI, or empty string."""
    if not choice or not color_code:
        return ''
    palette = CARPET_COLORS_RIPS if choice == CARPET_CHOICE_RIPS else (
        CARPET_COLORS_WELUR if choice == CARPET_CHOICE_WELUR else []
    )
    for code, name in palette:
        if code == color_code:
            return f'{code} {name}'
    return color_code

TV_MOUNT_CHOICES = [
    ('stand', 'Na stojaku'),
    ('wall', 'Na ścianie'),
]

EQUIPMENT_SPECIAL_CODE_CHOICES = [
    ('hanger', 'hanger — wieszak (1 w pakiecie; ukryty przy własnej zabudowie)'),
    ('trashbin', 'trashbin — kosz (zawsze 1 w pakiecie)'),
    ('tv', 'tv — wybór montażu stojak/ściana'),
    ('square_table', 'square_table — stolik kwadrat'),
    ('arc_counter', 'arc_counter — ostrzeżenie: głównie stoiska narożne'),
]

class Company(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="nazwa firmy")
    email = models.EmailField(verbose_name="e-mail")
    representative = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        related_name="comp_repr",
        verbose_name="przedstawiciel",
    )
    fr_resp = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="fr_resp",
        verbose_name="opiekun FR",
    )
    opiekun = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opiekun_companies",
        verbose_name="opiekun firmy",
        help_text="Konto staff z rolą Opiekun przypisane do firmy.",
    )

    status = models.CharField(
        max_length=10,
        choices=COMPANY_STATUS_CHOICES,
        default=STATUS_BASIC,
        verbose_name="pakiet",
    )
    planned_stand_size = models.CharField(
        max_length=11,
        choices=SIZE_OPT,
        blank=True,
        default="",
        verbose_name="planowany rozmiar stoiska",
    )
    planned_days_count = models.PositiveSmallIntegerField(
        choices=PLANNED_DAYS_CHOICES,
        null=True,
        blank=True,
        verbose_name="planowana liczba dni",
    )
    extra_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="dodatkowe koszty (netto)",
    )
    extra_cost_description = models.CharField(
        max_length=500,
        blank=True,
        default="",
        verbose_name="opis dodatkowych kosztów",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="utworzono")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="zmodyfikowano")

    class Meta:
        verbose_name = "firma"
        verbose_name_plural = "firmy"

    def __str__(self):
        return self.name


INVITATION_VALIDITY_DAYS_FALLBACK = 7


def get_expiry_time():
    return django.utils.timezone.now() + datetime.timedelta(days=INVITATION_VALIDITY_DAYS_FALLBACK)


def compute_invitation_expires_at():
    days = Settings.get_settings().invitation_validity_days or INVITATION_VALIDITY_DAYS_FALLBACK
    return django.utils.timezone.now() + datetime.timedelta(days=days)

class CompanyInvitation(models.Model):
    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('pl', 'Polish'),
    ]
    
    email = models.EmailField(verbose_name="e-mail")
    company_name = models.CharField(max_length=255, verbose_name="nazwa firmy")
    token = models.UUIDField(default=uuid.uuid4, unique=True, verbose_name="token")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="utworzono")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="zmodyfikowano")
    expires_at = models.DateTimeField(blank=True, default=get_expiry_time, verbose_name="wygasa")
    is_accepted = models.BooleanField(default=False, verbose_name="zaakceptowane")
    is_cancelled = models.BooleanField(default=False, verbose_name="anulowane")
    is_resigned = models.BooleanField(
        default=False,
        verbose_name="rezygnacja firmy",
        help_text="Wymaga zaznaczenia anulowania zaproszenia.",
    )
    language = models.CharField(
        max_length=5,
        choices=LANGUAGE_CHOICES,
        default='en',
        verbose_name="język",
    )

    company_status = models.CharField(
        max_length=10,
        choices=COMPANY_STATUS_CHOICES,
        default=STATUS_BASIC,
        verbose_name="pakiet",
    )
    planned_stand_size = models.CharField(
        max_length=11,
        choices=SIZE_OPT,
        blank=True,
        default="",
        verbose_name="planowany rozmiar stoiska",
    )
    planned_days_count = models.PositiveSmallIntegerField(
        choices=PLANNED_DAYS_CHOICES,
        null=True,
        blank=True,
        verbose_name="planowana liczba dni",
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_invitations',
        verbose_name='utworzone przez'
    )

    class Meta:
        verbose_name = "zaproszenie firmy"
        verbose_name_plural = "zaproszenia firm"

    def is_expired(self):
        return django.utils.timezone.now() > self.expires_at

    def clean(self):
        if self.is_resigned and not self.is_cancelled:
            raise ValidationError({
                "is_resigned": (
                    "Oznaczenie rezygnacji wymaga anulowanego zaproszenia "
                    "(is_cancelled)."
                ),
            })

    def get_invitation_status(self):
        # Resign is a logistics subtype of cancel — never without is_cancelled.
        if self.is_cancelled and self.is_resigned:
            return "resigned"
        elif self.is_cancelled:
            return "cancelled"
        elif self.is_accepted:
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
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='form', verbose_name="firma")
    current_stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default='stage_1', verbose_name="aktualny etap")
    stage_1_completed = models.BooleanField(default=False, verbose_name="etap 1 ukończony")
    stage_2_completed = models.BooleanField(default=False, verbose_name="etap 2 ukończony")
    stage_3_completed = models.BooleanField(default=False, verbose_name="etap 3 ukończony")
    stage_4_completed = models.BooleanField(default=False, verbose_name="etap 4 ukończony")
    stage_5_completed = models.BooleanField(default=False, verbose_name="etap 5 ukończony")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="utworzono")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="zmodyfikowano")

    class Meta:
        verbose_name = "postęp formularza"
        verbose_name_plural = "postęp formularzy"

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


class MapLayout(models.Model):
    """Singleton hall map layout for day1/day2 (editable by staff)."""

    sync_days = models.BooleanField(
        default=True,
        verbose_name="synchronizuj dzień 2 z dniem 1",
    )
    day1 = models.JSONField(default=dict, verbose_name="layout dzień 1")
    day2 = models.JSONField(default=dict, verbose_name="layout dzień 2")
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="map_layouts_updated",
    )

    class Meta:
        verbose_name = "układ mapy"
        verbose_name_plural = "układy mapy"

    def __str__(self):
        return f"MapLayout(sync={self.sync_days})"

    @classmethod
    def get_solo(cls):
        from .map_seed import default_layout

        obj = cls.objects.first()
        if obj is None:
            layout = default_layout()
            obj = cls.objects.create(sync_days=True, day1=layout, day2=copy.deepcopy(layout))
        return obj


class Deadline(models.Model):
    dl = models.DateTimeField()

class Feedback(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="feedback", verbose_name="firma")
    form = models.CharField(max_length=50, verbose_name="etap formularza")  # lista etapów?
    status = models.CharField(max_length=30, choices=STATE_OPT, default='pending', verbose_name="status")
    comment = models.TextField(verbose_name="komentarz", blank=True)

    class Meta:
        verbose_name = "ocena etapu"
        verbose_name_plural = "oceny etapów"

# FORMULARZE:
class BasicData(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='basic_data')
    full_name = models.CharField(max_length=255, verbose_name="pełna nazwa firmy")
    nip = models.CharField(max_length=20, verbose_name="nip firmy")
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class Address(models.Model):
    form = models.OneToOneField(BasicData, on_delete=models.CASCADE, related_name='adress')
    street = models.CharField(max_length=255, verbose_name="ulica")
    home_number = models.CharField(max_length=10, verbose_name="numer domu", blank=True)
    apt_number = models.CharField(max_length=10, verbose_name="numer lokalu", blank=True)
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
    el_power_acknowledged = models.BooleanField(
        default=False,
        verbose_name="potwierdzenie: moc elektryczna w etapie 5",
        help_text="Firma przyjmuje do wiadomości, że moc elektryczną należy podać w etapie 5.",
    )
    sc_details = models.CharField(max_length=255, verbose_name="wymiary własnej zabudowy", blank=True)
    brought_equipment = models.TextField(blank=True, verbose_name="sprzęt przywożony przez firmę")
    name_sign_text = models.CharField(max_length=255, verbose_name="napis na fryz", blank=True)
    logo_sign_file = models.FileField(upload_to='logos', verbose_name="Logotyp na fryz", blank=True)
    fire_cert = models.FileField(upload_to="fire_certs", verbose_name="certyfikat o niepalności", blank=True)
    stand_visualization = models.FileField(
        upload_to="stand_visualizations",
        blank=True,
        verbose_name="wizualizacja stoiska",
    )
    carpet_choice = models.CharField(
        max_length=10,
        choices=CARPET_CHOICE_CHOICES,
        blank=True,
        null=True,
        verbose_name="wykładzina — wybór",
        help_text="Obowiązkowa dla każdej firmy. Partnerzy wybierają kolor; pozostali dostają RIPS 892.",
    )
    carpet_color = models.CharField(
        max_length=10,
        blank=True,
        verbose_name="wykładzina — kolor",
        help_text="Kod koloru z palety RIPS/WELUR (np. 005, V005). Domyślnie 892 dla niepartnerów.",
    )
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class EquipmentItem(models.Model):
    name_en = models.CharField(max_length=255, verbose_name="nazwa (angielski)")
    name_pl = models.CharField(max_length=255, verbose_name="nazwa (polski)")
    code = models.CharField(
        max_length=50,
        choices=EQUIPMENT_SPECIAL_CODE_CHOICES,
        blank=True,
        null=True,
        unique=True,
        verbose_name="kod specjalnych właściwości",
        help_text="Opcjonalna reguła specjalna dla pozycji w formularzu Etapu 2.",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="cena")
    is_basic = models.BooleanField(default=False, verbose_name="wyposażenie podstawowe")
    included_quantity = models.IntegerField(default=0, verbose_name="ilość wliczona (darmowa)")
    category = models.CharField(max_length=100, blank=True, verbose_name="kategoria")
    is_active = models.BooleanField(default=True, verbose_name="aktywne")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="utworzono")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="zmodyfikowano")

    def __str__(self):
        return self.name_en

    class Meta:
        ordering = ['category', 'name_en']
        verbose_name = "pozycja wyposażenia"
        verbose_name_plural = "pozycje wyposażenia"


class EquipmentSelection(models.Model):
    stand_details = models.ForeignKey(
        StandDetails,
        on_delete=models.CASCADE,
        related_name='equipment_selections',
        verbose_name="szczegóły stoiska",
    )
    equipment_item = models.ForeignKey(
        EquipmentItem,
        on_delete=models.CASCADE,
        verbose_name="pozycja wyposażenia",
    )
    quantity = models.IntegerField(default=1, verbose_name="ilość")
    mount_type = models.CharField(
        max_length=20,
        choices=TV_MOUNT_CHOICES,
        blank=True,
        null=True,
        verbose_name="typ montażu (TV)",
    )

    def __str__(self):
        return f"{self.stand_details.company.name} - {self.equipment_item.name_pl} x{self.quantity}"

    class Meta:
        unique_together = ['stand_details', 'equipment_item']
        verbose_name = "wybrane wyposażenie"
        verbose_name_plural = "wybrane wyposażenie"

class Jobwall(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="jobwalls")
    name = models.CharField(max_length=255, verbose_name="nazwa stanowiska")
    form = models.CharField(max_length=50, choices=FORM_OPT)
    workload = models.CharField(max_length=50, choices=WORKLOAD_OPT)
    contract = models.CharField(max_length=50, choices=CONTRACT_OPT)
    description = models.TextField(verbose_name="opis stanowiska")
    benefits = models.TextField(verbose_name="co jest oferowane")
    requirements = models.TextField(verbose_name="wymagania")
    url = models.CharField(max_length=500, verbose_name="link aplikacyjny lub e-mail")
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class Workshop(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='workshops')
    workshop = models.BooleanField(
        verbose_name="Poprowadzenie warsztatów",
        null=True,
        blank=True,
        default=None,
        help_text="Jawny wybór: True = prowadzą warsztat, False = nie potrzebują. Null = brak decyzji.",
    )
    title = models.CharField(max_length=255, verbose_name="nazwa warsztatu", blank=True, default="")
    description = models.TextField(verbose_name="opis warsztatu", blank=True, default="")
    preferred_day = models.CharField(
        max_length=15,
        choices=DAY_OPT,
        blank=True,
        default="",
        verbose_name="preferowany dzień warsztatu",
    )
    preferred_time = models.TimeField(
        null=True,
        blank=True,
        verbose_name="preferowana godzina warsztatu",
    )
    skills = models.TextField(verbose_name="praktyczne umiejętności", blank=True, default="")
    study_majors = models.TextField(verbose_name="mile widziane kierunki studiów", blank=True, default="")
    room_projector = models.BooleanField(default=False, verbose_name="rzutnik")
    room_hdmi = models.BooleanField(default=False, verbose_name="kabel HDMI")
    room_other = models.CharField(max_length=255, verbose_name="inne udogodnienia sali", blank=True, default="")
    contact_phone = models.CharField(max_length=255, verbose_name="telefon ds. warsztatów", blank=True, default="")
    contact_phone_same_as_facilitator = models.BooleanField(
        default=False,
        verbose_name="telefon kontaktowy z numerów prowadzących",
    )
    notes = models.TextField(verbose_name="dodatkowe uwagi", blank=True)
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)


class WorkshopFacilitator(Person):
    workshop = models.ForeignKey(Workshop, on_delete=models.CASCADE, related_name="facilitators")
    description = models.TextField(verbose_name="opis prowadzącego", blank=True, default="")

    class Meta:
        ordering = ['id']


def company_can_access_stage3(company) -> bool:
    """Stage 3 (workshops) is only for main/partner exhibitors; basic skips it."""
    return company.status in (STATUS_MAIN, STATUS_PARTENER)


def ensure_basic_workshop_skipped(company) -> Workshop:
    """
    For basic companies, ensure a Workshop row exists with workshop=False
    so Stage 4/5 gating (Workshop.exists) does not block progress.
    """
    workshop, _created = Workshop.objects.get_or_create(
        company=company,
        defaults={'workshop': False},
    )
    # Force skip even if the company was previously main/partner with workshop=True
    if company.status == STATUS_BASIC and workshop.workshop is not False:
        workshop.workshop = False
        workshop.save(update_fields=['workshop'])
    return workshop


class Description(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='description')
    descr = models.TextField(verbose_name="opis firmy")
    logo_file = models.FileField(upload_to='catalogue_logos', verbose_name="Logotyp do katalogu", blank=True)
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class FinalData(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='finaldata')
    el_devices = models.CharField(max_length=255, verbose_name="urządzenia elektryczne w trakcie targów", blank=True, default="")
    el_power = models.CharField(max_length=255, verbose_name="łączna moc urządzeń", blank=True, default="")
    el_low_power = models.BooleanField(
        default=False,
        verbose_name="niska moc (około 100 W lub mniej)",
        help_text="Zaznacz, jeśli łączna moc urządzeń to około 100 W lub mniej — wtedy nie trzeba podawać szczegółów.",
    )
    lunches_declined = models.BooleanField(default=False, verbose_name="rezygnacja z obiadów")
    no_other_delegates = models.BooleanField(default=False, verbose_name="brak innych delegatów")
    main_rep_name = models.CharField(max_length=100, blank=True, default="", verbose_name="imię głównego przedstawiciela")
    main_rep_surname = models.CharField(max_length=100, blank=True, default="", verbose_name="nazwisko głównego przedstawiciela")
    main_rep_phone = models.CharField(max_length=20, blank=True, default="", verbose_name="telefon głównego przedstawiciela")
    main_rep_attendance = models.CharField(
        max_length=10,
        choices=ATTENDANCE_OPT,
        blank=True,
        default="",
        verbose_name="obecność głównego przedstawiciela",
    )
    arrival_time_day1 = models.TimeField(
        null=True,
        blank=True,
        verbose_name="godzina przyjazdu — dzień 1",
        help_text="Planowana godzina przyjazdu na montaż / rozładunek w dniu 1.",
    )
    arrival_time_day2 = models.TimeField(
        null=True,
        blank=True,
        verbose_name="godzina przyjazdu — dzień 2",
        help_text="Planowana godzina przyjazdu na montaż / rozładunek w dniu 2.",
    )
    dl = models.ForeignKey(Deadline, on_delete=models.SET_NULL, null=True)

class Lunch(models.Model):
    form = models.ForeignKey(FinalData, on_delete=models.CASCADE, related_name="lunches")
    day = models.CharField(max_length=15, choices=DAY_OPT)
    lunch_quantity = models.IntegerField(verbose_name="liczba obiadów")  # dodać info że sa dodatkowo płatne??
    diet_info = models.CharField(max_length=255, verbose_name="informacje o dietach", blank=True, default="")

class PDI(models.Model):
    form = models.OneToOneField(FinalData, on_delete=models.CASCADE, related_name="pdis")
    tickets_quantity = models.IntegerField(verbose_name="liczba biletów na galę PDI")

class PDIAttendee(Person):
    form = models.ForeignKey(PDI, on_delete=models.CASCADE, related_name="pdiattendees")
    email = models.EmailField(verbose_name="Adres email")

class Exhibitor(Person):
    form = models.ForeignKey(PDI, on_delete=models.CASCADE, related_name="exhibitors")
    attendance = models.CharField(
        max_length=10,
        choices=ATTENDANCE_OPT,
        blank=True,
        default="",
        verbose_name="obecność delegata",
    )

def _default_jobwall_early_deadline():
    from datetime import date
    return date(2026, 12, 31)


class Settings(models.Model):
    """
    System-wide settings. Uses singleton pattern - only one instance should exist.
    """
    jobwall_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name="Cena pojedynczej oferty JobWall (netto)",
        default=0.00,
    )
    jobwall_free_count = models.PositiveIntegerField(
        default=2,
        verbose_name="Domyślny limit darmowych ofert JobWall",
    )
    lunch_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name="Cena dodatkowego obiadu (netto)",
        default=0.00,
    )

    # --- Stand pricing — Wystawca (Basic), netto ---
    stand_price_4m2_1d = models.DecimalField(
        max_digits=10, decimal_places=2, default=5950.00,
        verbose_name="Stoisko 4 m² — 1 dzień",
    )
    stand_price_4m2_2d = models.DecimalField(
        max_digits=10, decimal_places=2, default=10120.00,
        verbose_name="Stoisko 4 m² — 2 dni",
    )
    stand_price_6m2_1d = models.DecimalField(
        max_digits=10, decimal_places=2, default=8550.00,
        verbose_name="Stoisko 6 m² — 1 dzień",
    )
    stand_price_6m2_2d = models.DecimalField(
        max_digits=10, decimal_places=2, default=14530.00,
        verbose_name="Stoisko 6 m² — 2 dni",
    )
    stand_price_8m2_1d = models.DecimalField(
        max_digits=10, decimal_places=2, default=10710.00,
        verbose_name="Stoisko 8 m² — 1 dzień",
    )
    stand_price_8m2_2d = models.DecimalField(
        max_digits=10, decimal_places=2, default=18200.00,
        verbose_name="Stoisko 8 m² — 2 dni",
    )
    stand_price_12m2_1d = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        verbose_name="Stoisko 12 m² — 1 dzień",
        help_text="0 = wycena indywidualna.",
    )
    stand_price_12m2_2d = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        verbose_name="Stoisko 12 m² — 2 dni",
        help_text="0 = wycena indywidualna.",
    )

    # --- Partner packages (2 days, 8 m²), netto ---
    partner_package_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=24880.00,
        verbose_name="Pakiet Partner (2 dni, 8 m²)",
    )
    main_partner_package_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=28120.00,
        verbose_name="Pakiet Partner Główny (2 dni, 8 m²)",
    )

    # --- JobWall quotas & packs, netto ---
    jobwall_free_basic_early = models.PositiveIntegerField(
        default=1,
        verbose_name="Wystawca — darmowe oferty (wczesna rejestracja)",
    )
    jobwall_early_deadline = models.DateField(
        default=_default_jobwall_early_deadline,
        verbose_name="Termin wczesnej rejestracji",
        help_text="Włącznie z tym dniem obowiązuje wczesny limit dla Wystawcy.",
    )
    jobwall_free_basic_late = models.PositiveIntegerField(
        default=0,
        verbose_name="Wystawca — darmowe oferty (po terminie)",
    )
    jobwall_free_partner = models.PositiveIntegerField(
        default=4,
        verbose_name="Partner — darmowe oferty",
    )
    jobwall_free_main = models.PositiveIntegerField(
        default=7,
        verbose_name="Partner Główny — darmowe oferty",
    )
    jobwall_pack_2_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=480.00,
        verbose_name="Pakiet +2 oferty (netto)",
        help_text="Opłata za 1–2 dodatkowe oferty ponad limit pakietu.",
    )
    jobwall_pack_3_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=630.00,
        verbose_name="Pakiet +3 oferty (netto)",
        help_text="Opłata za 3 dodatkowe oferty ponad limit pakietu.",
    )
    jobwall_max_extra_offers = models.PositiveIntegerField(
        default=3,
        verbose_name="Limit dodatkowych płatnych ofert",
    )

    # --- Lunch quotas per day ---
    lunches_free_basic = models.PositiveIntegerField(
        default=2,
        verbose_name="Wystawca — darmowe obiady dziennie",
    )
    lunches_free_partner = models.PositiveIntegerField(
        default=6,
        verbose_name="Partner — darmowe obiady dziennie",
    )
    lunches_free_main = models.PositiveIntegerField(
        default=10,
        verbose_name="Partner Główny — darmowe obiady dziennie",
    )
    stage_1_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Etap 1 — Dane podstawowe",
    )
    stage_2_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Etap 2 — Wyposażenie stoiska",
    )
    stage_3_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Etap 3 — Warsztaty",
    )
    stage_4_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Etap 4 — Katalog i JobWall",
    )
    stage_5_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Etap 5 — Dane końcowe",
    )
    mail_1_send_by = models.DateField(
        default=datetime.date(2027, 2, 25),
        verbose_name="Mail #1 — potwierdzenie zamówienia",
    )
    mail_2_send_by = models.DateField(
        default=datetime.date(2027, 2, 27),
        verbose_name="Mail #2 — zaproszenie na galę PDI",
    )
    mail_3_send_by = models.DateField(
        default=datetime.date(2027, 3, 3),
        verbose_name="Mail #3 — informator i parking",
    )
    mail_4_send_by = models.DateField(
        default=datetime.date(2027, 3, 5),
        verbose_name="Mail #4 — imienne zaproszenie na PDI",
    )
    mail_5_send_by = models.DateField(
        default=datetime.date(2027, 3, 9),
        verbose_name="Mail #5 — powitanie na targach",
    )
    day1_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Dzień 1 targów",
    )
    day2_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Dzień 2 targów",
    )
    invitation_validity_days = models.PositiveSmallIntegerField(
        default=7,
        validators=[MinValueValidator(1), MaxValueValidator(30)],
        verbose_name="Ważność zaproszenia (dni)",
        help_text="Dotyczy nowo tworzonych zaproszeń (1–30 dni).",
    )
    invitation_reminder_count = models.PositiveSmallIntegerField(
        default=2,
        validators=[MinValueValidator(0), MaxValueValidator(3)],
        verbose_name="Liczba przypomnień (0–3)",
        help_text="0 wyłącza automatyczne przypomnienia o wygaśnięciu.",
    )
    invitation_reminder_1_days = models.PositiveSmallIntegerField(
        default=2,
        null=True,
        blank=True,
        verbose_name="Przypomnienie 1 (dni przed wygaśnięciem)",
    )
    invitation_reminder_2_days = models.PositiveSmallIntegerField(
        default=1,
        null=True,
        blank=True,
        verbose_name="Przypomnienie 2 (dni przed wygaśnięciem)",
    )
    invitation_reminder_3_days = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name="Przypomnienie 3 (dni przed wygaśnięciem)",
    )
    general_contact_email = models.EmailField(
        default="best@best.pw.edu.pl",
        verbose_name="Kontakt ogólny (maile do wystawców)",
    )
    system_admin_email = models.EmailField(
        default="admin@example.com",
        verbose_name="Administrator systemu (alerty i maile do staff)",
    )
    terms_pdf = models.FileField(
        upload_to="terms",
        blank=True,
        null=True,
        verbose_name="Regulamin targów (PDF)",
        help_text="Wyświetlany przy zapisie Etapu 1.",
    )
    carpet_catalog_image = models.ImageField(
        upload_to="carpet_catalog",
        blank=True,
        null=True,
        verbose_name="Katalog wykładzin (obraz)",
        help_text="Wzornik kolorów RIPS/WELUR dla partnerów w Etapie 2.",
    )
    edition_number = models.PositiveSmallIntegerField(
        default=33,
        validators=[MinValueValidator(1), MaxValueValidator(99)],
        verbose_name="Numer edycji",
        help_text="Wyświetlany w nazwie systemu i tytule karty przeglądarki.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "ustawienia systemu"
        verbose_name_plural = "ustawienia systemu"

    def __str__(self):
        return "Ustawienia systemu"

    @classmethod
    def get_settings(cls):
        """Get or create the singleton settings instance"""
        settings, created = cls.objects.get_or_create(pk=1)
        return settings
    
    def get_day_opt(self):
        """
        Get DAY_OPT format from settings dates.
        Returns list of tuples like [('day1', '10.03.2025'), ('day2', '11.03.2025')]
        Falls back to default values if dates are not set.
        """
        if self.day1_date and self.day2_date:
            return [
                ('day1', self.day1_date.strftime('%d.%m.%Y')),
                ('day2', self.day2_date.strftime('%d.%m.%Y'))
            ]
        # Fallback to defaults if not set
        return [
            ('day1', '09.03.2027'),
            ('day2', '10.03.2027')
        ]
    
    def get_day1_display_en(self):
        """Get English display format for day 1 (e.g., 'March 9, 2027')"""
        if self.day1_date:
            return self.day1_date.strftime('%B %d, %Y')
        return "March 9, 2027"
    
    def get_day1_display_pl(self):
        """Get Polish display format for day 1 (e.g., '09.03.2027')"""
        if self.day1_date:
            return self.day1_date.strftime('%d.%m.%Y')
        return "09.03.2027"
    
    def get_day2_display_en(self):
        """Get English display format for day 2 (e.g., 'March 10, 2027')"""
        if self.day2_date:
            return self.day2_date.strftime('%B %d, %Y')
        return "March 10, 2027"
    
    def get_day2_display_pl(self):
        """Get Polish display format for day 2 (e.g., '10.03.2027')"""
        if self.day2_date:
            return self.day2_date.strftime('%d.%m.%Y')
        return "10.03.2027"

    def reminder_day_slots(self):
        return [
            self.invitation_reminder_1_days,
            self.invitation_reminder_2_days,
            self.invitation_reminder_3_days,
        ]

    def get_invitation_reminder_days(self):
        if not self.invitation_reminder_count:
            return []
        days = [
            d for d in self.reminder_day_slots()[: self.invitation_reminder_count]
            if d is not None
        ]
        return sorted(set(days), reverse=True)

    def get_general_contact_email(self):
        return self.general_contact_email or "best@best.pw.edu.pl"

    def get_system_admin_email(self):
        return self.system_admin_email or "admin@example.com"

    def clean(self):
        super().clean()
        if self.invitation_reminder_count == 0:
            return

        slots = self.reminder_day_slots()
        active = []
        for index in range(self.invitation_reminder_count):
            value = slots[index]
            if value is None:
                raise ValidationError(
                    {
                        f"invitation_reminder_{index + 1}_days": (
                            "This reminder slot must be filled when reminder count is greater than 0."
                        )
                    }
                )
            if value < 1 or value >= self.invitation_validity_days:
                raise ValidationError(
                    {
                        f"invitation_reminder_{index + 1}_days": (
                            f"Must be between 1 and {self.invitation_validity_days - 1} "
                            "(less than invitation validity)."
                        )
                    }
                )
            active.append(value)

        if len(active) != len(set(active)):
            raise ValidationError("Active invitation reminder slots must not contain duplicate day values.")


class InvitationExpiryReminderSent(models.Model):
    RECIPIENT_EXHIBITOR = "exhibitor"
    RECIPIENT_STAFF = "staff"
    RECIPIENT_CHOICES = [
        (RECIPIENT_EXHIBITOR, "Wystawca"),
        (RECIPIENT_STAFF, "Opiekun FR"),
    ]

    invitation = models.ForeignKey(
        CompanyInvitation,
        on_delete=models.CASCADE,
        related_name="expiry_reminders_sent",
        verbose_name="zaproszenie",
    )
    days_before = models.PositiveSmallIntegerField(verbose_name="dni przed wygaśnięciem")
    recipient = models.CharField(max_length=20, choices=RECIPIENT_CHOICES, verbose_name="odbiorca")
    sent_at = models.DateTimeField(auto_now_add=True, verbose_name="wysłano")

    class Meta:
        verbose_name = "wysłane przypomnienie o zaproszeniu"
        verbose_name_plural = "wysłane przypomnienia o zaproszeniach"
        unique_together = ("invitation", "days_before", "recipient")

    def __str__(self):
        return f"{self.invitation.company_name} reminder {self.days_before}d ({self.recipient})"


class WebsitePublication(models.Model):
    """Tracks Strapi (targus) catalogue draft sync for a company."""

    company = models.OneToOneField(
        Company,
        on_delete=models.CASCADE,
        related_name="website_publication",
        verbose_name="firma",
    )
    strapi_document_id = models.CharField(max_length=64, blank=True, default="", verbose_name="ID dokumentu Strapi")
    strapi_logo_id = models.PositiveIntegerField(null=True, blank=True, verbose_name="ID logotypu Strapi")
    strapi_logo_sha256 = models.CharField(max_length=64, blank=True, default="", verbose_name="hash SHA-256 logotypu")
    # {"<Jobwall.id>": {"documentId": "...", "title": "..."}} for job offers pushed to the website.
    strapi_jobs = models.JSONField(default=dict, blank=True, verbose_name="oferty pracy w Strapi")
    payload_hash = models.CharField(max_length=64, blank=True, default="", verbose_name="hash danych")
    last_exported_at = models.DateTimeField(null=True, blank=True, verbose_name="ostatni eksport")
    content_published = models.BooleanField(
        default=False,
        verbose_name="opublikowana na stronie",
        help_text="True = karta firmy i oferty opublikowane publicznie; False = tylko szkic w Strapi.",
    )
    last_error = models.TextField(blank=True, default="", verbose_name="ostatni błąd")

    class Meta:
        verbose_name = "publikacja na stronie"
        verbose_name_plural = "publikacje na stronie"

    def __str__(self):
        return f"WebsitePublication({self.company_id}, {self.strapi_document_id or '—'})"


FAQ_CATEGORY_CHOICES = [
    ('general', 'Informacje ogólne'),
    ('logistics', 'Logistyka i dojazd'),
    ('materials', 'Materiały promocyjne i stoisko'),
    ('ownConstruction', 'Własna zabudowa'),
    ('workshops', 'Warsztaty'),
    ('support', 'Wsparcie i wyżywienie'),
    ('pdiVenue', 'Gala PDI'),
]


class FAQItem(models.Model):
    """Editable FAQ entries shown to exhibitors and managed by Admin / FR."""

    category = models.CharField(max_length=50, choices=FAQ_CATEGORY_CHOICES, default='general', verbose_name="kategoria")
    question_pl = models.CharField(max_length=500, verbose_name="pytanie (PL)")
    answer_pl = models.TextField(verbose_name="odpowiedź (PL)")
    question_en = models.CharField(max_length=500, verbose_name="pytanie (EN)")
    answer_en = models.TextField(verbose_name="odpowiedź (EN)")
    order = models.PositiveIntegerField(default=0, verbose_name="kolejność")
    is_active = models.BooleanField(default=True, verbose_name="aktywne")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="utworzono")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="zmodyfikowano")

    class Meta:
        ordering = ['category', 'order', 'id']
        verbose_name = "pytanie FAQ"
        verbose_name_plural = "pytania FAQ"

    def __str__(self):
        return f"[{self.category}] {self.question_pl[:60]}"


