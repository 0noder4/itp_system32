"""Editable cells shared by the Opiekun, LG and FR sheets (one value per company)."""
from __future__ import annotations

from datetime import date, timedelta

from django.db.utils import OperationalError, ProgrammingError

from companies.models import Settings
from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG, STAFF_ROLE_OPIEKUN

from ..registry import (
    KIND_BOOL,
    KIND_LONGTEXT,
    KIND_NUMBER,
    KIND_SELECT,
    KIND_TEXT,
    SOURCE_COMPUTED,
    SOURCE_EXTRA,
    SOURCE_STAFF,
    TONE_ANY_DAY,
    TONE_DAY1,
    TONE_DAY2,
    TONE_OWN_BUILD,
    TONE_PROTOCOL,
    ColumnDef,
    RowContext,
)
from .form_columns import (
    GROUP_COMPANY,
    LUNCH_DAY1,
    LUNCH_DAY2,
    SIGN_FIRE_CERT,
    SIGN_VISUAL,
    _own_build,
)

GROUP_CARE = 'OPIEKUN (edytowalne)'
GROUP_LG = 'LOGISTYKA (edytowalne)'
GROUP_BUILD = 'WŁASNA ZABUDOWA'
GROUP_MAIL1 = 'MAIL #1'
GROUP_MAIL2 = 'MAIL #2'
GROUP_MAIL3 = 'MAIL #3'
GROUP_MAIL4 = 'MAIL #4'
GROUP_MAIL5 = 'MAIL #5'
GROUP_FINAL = 'FINAŁ NZS'
GROUP_WELCOME = 'WELCOME PACKI'
GROUP_STAFF = 'OBIADY BEŚCIAKÓW'

# Montage days for own-build arrival (day before day 1, day 1, day 2).
DEFAULT_DAY1_DATE = date(2027, 3, 9)
DEFAULT_DAY2_DATE = date(2027, 3, 10)
MONTAGE_DATES = (date(2027, 3, 8), date(2027, 3, 9), date(2027, 3, 10))
ARRIVAL_SLOTS = ('14-16', '16-18', '18-20', '20-22')
PICKUP_SLOTS = ('14-15', '15-16', '16-17', '17-18')
SLOT_CAP = 5
_WEEKDAY_PL = ('poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela')
_TONE_LABEL = {'na': 'nie dotyczy', 'warn': 'braki', 'ok': 'komplet'}


def montage_dates() -> tuple[date, date, date]:
    """3 montage days derived from Settings.day1_date / day2_date: day1 - 1, day1, day2."""
    try:
        settings_obj = Settings.get_settings()
        day1 = settings_obj.day1_date or DEFAULT_DAY1_DATE
        day2 = settings_obj.day2_date or (day1 + timedelta(days=1))
    except (OperationalError, ProgrammingError):
        day1 = DEFAULT_DAY1_DATE
        day2 = DEFAULT_DAY2_DATE
    return (day1 - timedelta(days=1), day1, day2)

# Auto, kierowca, slot, odbiór i komentarz — opiekun, LG i FR (ustalenie z rozmowy).
EDIT_CARE = frozenset({STAFF_ROLE_OPIEKUN, STAFF_ROLE_LG, STAFF_ROLE_FR})
# Checklist opiekuna; FR tylko ogląda.
EDIT_LOGO = frozenset({STAFF_ROLE_OPIEKUN, STAFF_ROLE_LG})
EDIT_LG = frozenset({STAFF_ROLE_LG})

SLOT_KEY = 'care.slot'


def _slot_load(ctx: RowContext):
    slot = ctx.extras.get(SLOT_KEY)
    if not slot:
        return None
    return (ctx.shared.get('slot_counts') or {}).get(slot) or None


def _extra(key, label, kind=KIND_TEXT, width=160, edit_roles=EDIT_CARE, group=GROUP_CARE, **kwargs):
    return ColumnDef(
        key=key, label=label, kind=kind, source=SOURCE_EXTRA, group=group, width=width,
        edit_roles=edit_roles, **kwargs,
    )


def montage_tab_title(day: date) -> str:
    """e.g. Poniedziałek 8.03 — weekday from the calendar."""
    return f'{_WEEKDAY_PL[day.weekday()].capitalize()} {day.day}.{day.month:02d}'


def _montage_option_label(day: date) -> str:
    return f'{_WEEKDAY_PL[day.weekday()]} {day.day}.{day.month:02d}.{day.year}'


def arrival_day_options() -> tuple[tuple[str, str], ...]:
    return tuple((day.isoformat(), _montage_option_label(day)) for day in montage_dates())


def pickup_dates() -> tuple[date, date]:
    """2 fair days derived from Settings.day1_date / day2_date."""
    _, day1, day2 = montage_dates()
    return (day1, day2)


def pickup_day_options() -> tuple[tuple[str, str], ...]:
    return tuple((day.isoformat(), _montage_option_label(day)) for day in pickup_dates())


ARRIVAL_DAY_OPTIONS = tuple((day.isoformat(), _montage_option_label(day)) for day in MONTAGE_DATES)
ARRIVAL_SLOT_OPTIONS = tuple((slot, slot) for slot in ARRIVAL_SLOTS)
PICKUP_SLOT_OPTIONS = tuple((slot, slot) for slot in PICKUP_SLOTS)


def _text(value) -> str:
    if value is None:
        return ''
    return str(value).strip()


def _has_file(column: ColumnDef, ctx: RowContext) -> bool:
    value = column.read(ctx)
    if not value:
        return False
    if isinstance(value, dict):
        return bool(value.get('url') or value.get('name'))
    return True


def own_build_status(ctx: RowContext) -> str:
    """na = no own build; warn = missing viz, cert, car or slot; ok = complete."""
    if not _own_build(ctx):
        return 'na'
    slot = _text(ctx.extras.get(SLOT_KEY))
    complete = (
        _has_file(SIGN_VISUAL, ctx)
        and _has_file(SIGN_FIRE_CERT, ctx)
        and bool(_text(ctx.extras.get('care.car_registration')))
        and slot in ARRIVAL_SLOTS
    )
    return 'ok' if complete else 'warn'


def _build_tone_label(ctx: RowContext) -> str:
    return _TONE_LABEL[own_build_status(ctx)]


def _lunch_sum(ctx: RowContext):
    day1 = LUNCH_DAY1.read(ctx) or 0
    day2 = LUNCH_DAY2.read(ctx) or 0
    return int(day1) + int(day2)


def _firemka_contact(ctx: RowContext) -> str:
    """Excel Main „Dane do firemki”: imię, nazwisko i telefon głównego przedstawiciela."""
    final = ctx.related('finaldata')
    if final is None:
        return ''
    name = f'{final.main_rep_name} {final.main_rep_surname}'.strip()
    return ' | '.join(part for part in (name, final.main_rep_phone) if part)


# Excel montage blocks: one firm = one solid colour (stable per company id).
_MATRIX_FILL_COLORS = (
    '#FCA5A5',  # red
    '#93C5FD',  # blue
    '#86EFAC',  # green
    '#FDE047',  # yellow
    '#C4B5FD',  # violet
    '#F9A8D4',  # pink
    '#67E8F9',  # cyan
    '#FDBA74',  # orange
    '#A5B4FC',  # indigo
    '#6EE7B7',  # teal
)


def matrix_fill_color(company_id: int) -> str:
    return _MATRIX_FILL_COLORS[int(company_id) % len(_MATRIX_FILL_COLORS)]


def matrix_label(ctx: RowContext) -> str:
    """Excel-style cell: company on first line, then „Marka - REJESTRACJA”."""
    lines = [ctx.company.name]
    make = _text(ctx.extras.get('care.car_make'))
    reg = _text(ctx.extras.get('care.car_registration'))
    if make and reg:
        lines.append(f'{make} - {reg}')
    elif make or reg:
        lines.append(make or reg)
    return '\n'.join(lines)


CARE_CAR_REGISTRATION = _extra(
    'care.car_registration', 'Numer rejestracyjny', width=140, group=GROUP_BUILD,
    help='Numer rejestracyjny auta z zabudową (widać też w komórkach harmonogramu montażu).',
)
CARE_CAR_MAKE = _extra(
    'care.car_make', 'Marka auta', width=140, group=GROUP_BUILD,
    help='Marka auta, którym przywożą zabudowę.',
)
CARE_DRIVER = _extra(
    'care.driver', 'Kierowca (kontakt)', width=180, group=GROUP_BUILD,
    help='Imię, nazwisko i telefon kierowcy.',
)
CARE_ARRIVAL_DAY = _extra(
    'care.arrival_day', 'Dzień montażu', kind=KIND_SELECT, width=160, group=GROUP_BUILD,
    options=arrival_day_options,
    help=(
        'Dzień, w którym przywożą własną zabudowę (możliwy montaż już wieczorem dzień przed dniem 1., '
        'np. w poniedziałek). Godzina przyjazdu w dniu targów jest w kolumnie Przyjazd od 6:30.'
    ),
)
CARE_SLOT = _extra(
    SLOT_KEY, 'Slot przyjazdu', kind=KIND_SELECT, width=120, group=GROUP_BUILD,
    options=ARRIVAL_SLOT_OPTIONS,
    help=(
        'Przedział 2 godziny: 14–16, 16–18, 18–20 albo 20–22. W jednym przedziale najwyżej 5 firm. '
        'Inny zapis zostaje w komórce, a na harmonogramie montażu trafia do kolumny Bez godziny.'
    ),
)
CARE_SLOT_LOAD = ColumnDef(
    key='care.slot_count', label='Firm w slocie', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_BUILD, width=110, getter=_slot_load, highlight='over_five',
    help='Ile firm ma ten sam przedział godzin. Kolor ostrzega, gdy jest ich więcej niż 5.',
)
# Dawniej care.build_size = ręczne wymiary; wymiary są w stand.composition (formularz).
CARE_COMPOSITION = _extra(
    'care.composition', 'Z czego składa się zabudowa', kind=KIND_LONGTEXT, width=220, group=GROUP_BUILD,
    help=(
        'Jakie części zabudowy albo całość firma przywozi na stanowisko '
        '(ścianki, roll-upy, baner, lady…). Wymiary są w kolumnie Wymiary zabudowy.'
    ),
)
CARE_PICKUP = _extra(
    'care.pickup', 'Kiedy odbiór', kind=KIND_SELECT, width=160, group=GROUP_BUILD,
    options=pickup_day_options,
    help='Dzień odbioru własnej zabudowy (dzień 1. albo dzień 2. targów; bez czwartku po targach).',
)
CARE_PICKUP_TIME = _extra(
    'care.pickup_time', 'Godzina odbioru', kind=KIND_SELECT, width=120, group=GROUP_BUILD,
    options=PICKUP_SLOT_OPTIONS,
    help='Przedział godzinowy odbioru własnej zabudowy (14–15, 15–16, 16–17 albo 17–18).',
)
CARE_BUILD_TONE = ColumnDef(
    key='care.build_tone', label='Status zabudowy', kind=KIND_TEXT, source=SOURCE_COMPUTED,
    group=GROUP_BUILD, width=130, getter=_build_tone_label, tone=TONE_OWN_BUILD,
    help=(
        'Szary: brak własnej zabudowy. Pomarańczowy: brakuje wizualizacji, certyfikatu, auta albo slotu. '
        'Zielony: te rzeczy są. Osobno zaznacz Certyfikat sprawdzony, gdy ktoś obejrzał plik.'
    ),
)
CARE_FIRE_CERT_CHECKED = _extra(
    'care.fire_cert_checked', 'Certyfikat\nsprawdzony', kind=KIND_BOOL, width=130, group=GROUP_BUILD,
    aggregate='count_true', aggregate_by_day=True,
    help=(
        'Otwórz plik certyfikatu i potwierdź, że data oraz nazwa firmy się zgadzają. '
        'Sam plik obok nie oznacza, że ktoś go obejrzał.'
    ),
)
CARE_LOGO_APPROVED = _extra(
    'care.logo_approved', 'Logo zatwierdzone', kind=KIND_BOOL, width=130, edit_roles=EDIT_LOGO,
    aggregate='count_true', aggregate_by_day=True,
    help='Logistyka potwierdza, że logo na fryz nadaje się do druku. To nie jest ptaszek Logo sprawdzone z maila 1.',
)
CARE_COMMENT = _extra(
    'care.comment', 'Komentarz opiekuna', kind=KIND_LONGTEXT, width=240,
    help='Notatka opiekuna przy tej firmie.',
)
LG_EXTRA_ORDERS = _extra(
    'lg.extra_orders', 'Dodatkowe zamówienia', kind=KIND_LONGTEXT, width=220,
    edit_roles=EDIT_LG, group=GROUP_LG,
    help='Notatka logistyki poza katalogiem, np. wykładzina dla sponsora albo rezygnacja ze ścianek.',
)

CARE_COLUMNS = (
    CARE_CAR_REGISTRATION,
    CARE_CAR_MAKE,
    CARE_DRIVER,
    CARE_ARRIVAL_DAY,
    CARE_SLOT,
    CARE_SLOT_LOAD,
    CARE_COMPOSITION,
    CARE_PICKUP,
    CARE_PICKUP_TIME,
    CARE_BUILD_TONE,
    CARE_FIRE_CERT_CHECKED,
    CARE_LOGO_APPROVED,
    CARE_COMMENT,
)


def _check(key, label, group, kind=KIND_BOOL, width=110, by_day=True, **kwargs):
    return _extra(
        key, label, kind=kind, width=width, group=group,
        aggregate='count_true', aggregate_by_day=by_day, **kwargs,
    )


MAIL1_SENT = _check(
    'mail1.sent', 'Wysłany?', GROUP_MAIL1,
    help='Mail 1: potwierdzenie zamówienia. Wysyłka do {{m1}}.', tone=TONE_PROTOCOL,
)
MAIL1_STANDARD = _check(
    'mail1.standard_ok', 'Wyposażenie\nz pakietu OK?', GROUP_MAIL1, width=140,
    help=(
        'Czy światło, gniazdka, kosz, wieszak, fryz i ilości z katalogu obok się zgadzają. '
        'Jak nie, komentarz z propozycją przy Dodatkowe zamówienia. Termin {{m1}}.'
    ),
    tone=TONE_PROTOCOL,
)
MAIL1_EXTRA = _check(
    'mail1.extra_ok', 'Dokupione\nwyposażenie OK?', GROUP_MAIL1, width=140,
    help=(
        'Czy płatne dodatki i notatka Dodatkowe zamówienia się zgadzają. '
        'Jak nie, komentarz z propozycją przy tej notatce. Termin {{m1}}.'
    ),
    tone=TONE_PROTOCOL,
)
MAIL1_LOGO = _check(
    'mail1.logo_check', 'Logo sprawdzone', GROUP_MAIL1, width=130,
    help=(
        'Czy logo z formularza jest właściwe. Przy zabudowie ITP sprawdź logo na fryz i logo do katalogu. '
        'Przy własnej zabudowie tylko logo do katalogu. Termin {{m1}}.'
    ),
    tone=TONE_PROTOCOL,
)

MAIL2_SENT = _check(
    'mail2.sent', 'Wysłany?', GROUP_MAIL2,
    help='Mail 2: zaproszenie na galę PDI, liczba osób i maile. Wysyłka do {{m2}}. Liczbę i listę wpisujesz w kolumnach PDI.',
    tone=TONE_PROTOCOL,
)

MAIL3_SENT = _check(
    'mail3.sent', 'Wysłany?', GROUP_MAIL3,
    help='Mail 3: informator i parking. Wysyłka do {{m3}}.', tone=TONE_PROTOCOL,
)
MAIL3_HR = _extra(
    'mail3.hr_phone', 'HR z maila', width=180, group=GROUP_MAIL3,
    help='Kontakt z odpowiedzi na Mail #3. Osoby na targi są w kolumnie Delegaci na targi. Deadline {{m3}}.',
)

FIREMKA_CONTACT = ColumnDef(
    key='people.firemka', label='Główny przedstawiciel', kind=KIND_TEXT, source=SOURCE_COMPUTED,
    group=GROUP_COMPANY, width=220, getter=_firemka_contact,
    help='Imię, nazwisko i telefon głównego przedstawiciela z formularza.',
)
MAIL3_COURIER = _check(
    'mail3.courier', 'Kurier z gadżetami?', GROUP_MAIL3, width=140,
    help='Czy wysyłają kurierem gadżety? Deadline {{m3}}.', tone=TONE_PROTOCOL,
)
MAIL3_ARRIVAL = _extra(
    'mail3.arrival_time', 'Przyjazd od 6:30', width=140, group=GROUP_MAIL3,
    help='O której przyjazd od 6:30. Deadline {{m3}}.',
)
MAIL3_PEOPLE = _extra(
    'mail3.people_count', 'Osób z firmy', kind=KIND_NUMBER, width=110, group=GROUP_MAIL3,
    aggregate='sum', aggregate_by_day=True,
    help='Ile osób z firmy (Mail #3). Ta sama komórka na zakładce Welcome packi.',
)

MAIL4_HR = _extra(
    'mail4.hr', 'Kontakt HR', width=160, group=GROUP_MAIL4,
    help='Osoba, z którą prowadzisz kontakt przy zaproszeniach na PDI. Termin {{m4}}.',
)
MAIL4_SENT = _check(
    'mail4.sent', 'Mail #4 wysłany', GROUP_MAIL4, width=130,
    help='Czy osobiste zaproszenie na PDI poszło do każdej osoby z listy? Termin {{m4}}.',
    tone=TONE_PROTOCOL,
)

MAIL5_SENT = _check(
    'mail5.sent', 'Wysłany?', GROUP_MAIL5,
    help='Mail 5: powitanie na targach. Wysyłka {{m5}}.', tone=TONE_PROTOCOL,
)
MAIL5_NOTES = _extra(
    'mail5.notes', 'Uwagi przed startem', kind=KIND_LONGTEXT, width=200, group=GROUP_MAIL5,
    help='Uwagi przedstartowe. Deadline {{m5}}.',
)

FINAL_WELCOME = _check(
    'final.welcome_handed', 'Welcome pack\nwręczony?', GROUP_FINAL, width=130, tone=TONE_ANY_DAY,
    help='Osoba z firmy odebrała welcome pack.',
)
FINAL_D1_AM = _check(
    'final.protocol_d1_am', 'Protokół odbioru\nrano, dzień 1', GROUP_FINAL, width=150,
    tone=TONE_DAY1, by_day=False,
    help='Podpisany protokół odbiorczy rano pierwszego dnia targów.',
)
FINAL_D1_PM = _check(
    'final.protocol_d1_pm', 'Protokół zdania\npopołudnie, dzień 1', GROUP_FINAL, width=160,
    tone=TONE_DAY1, by_day=False,
    help='Podpisany protokół zdawczy popołudniu pierwszego dnia targów.',
)
FINAL_D2_AM = _check(
    'final.protocol_d2_am', 'Protokół odbioru\nrano, dzień 2', GROUP_FINAL, width=150,
    tone=TONE_DAY2, by_day=False,
    help='Podpisany protokół odbiorczy rano drugiego dnia targów.',
)
FINAL_D2_PM = _check(
    'final.protocol_d2_pm', 'Protokół zdania\npopołudnie, dzień 2', GROUP_FINAL, width=160,
    tone=TONE_DAY2, by_day=False,
    help='Podpisany protokół zdawczy popołudniu drugiego dnia targów.',
)

WELCOME_LUNCH_SUM = ColumnDef(
    key='welcome.lunch_sum', label='Obiady SUMA', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_WELCOME, width=110, getter=_lunch_sum, aggregate='sum',
    help='Suma obiadów dzień 1 i dzień 2 z formularza.',
)
WELCOME_LUNCHES_ISSUED = _check(
    'welcome.lunches_issued', 'Obiady wydane', GROUP_WELCOME, width=120, tone=TONE_ANY_DAY,
    help='Zaznacz, gdy obiady dla tej firmy zostały wydane.',
)
WELCOME_LUNCHES_COUNT = _extra(
    'welcome.lunches_count', 'Obiadów wydano', kind=KIND_NUMBER, width=120, group=GROUP_WELCOME,
    aggregate='sum', aggregate_by_day=True,
    help='Ile obiadów faktycznie wydano.',
)
WELCOME_BADGES_ISSUED = _check(
    'welcome.badges_issued', 'Identyfikatory\nwydane', GROUP_WELCOME, width=130, tone=TONE_ANY_DAY,
    help='Zaznacz, gdy identyfikatory dla tej firmy zostały wydane.',
)
WELCOME_BADGES_COUNT = _extra(
    'welcome.badges_count', 'Ile\nidentyfikatorów', kind=KIND_NUMBER, width=120, group=GROUP_WELCOME,
    aggregate='sum', aggregate_by_day=True,
    help='Ile identyfikatorów wydano.',
)
WELCOME_ALL_READY = _check(
    'welcome.all_ready', 'Wszystko gotowe', GROUP_WELCOME, width=130, tone=TONE_ANY_DAY,
    help='Obiady i identyfikatory są skompletowane i czekają na odbiór przez firmę.',
)

STAFF_NAME = ColumnDef(
    key='staff.name', label='Osoba', kind=KIND_TEXT, source=SOURCE_COMPUTED, group=GROUP_STAFF,
    width=180, getter=lambda ctx: '',
)
STAFF_MEAL_NOTE = ColumnDef(
    key='staff.meal.note', label='Uwagi', kind=KIND_LONGTEXT, source=SOURCE_STAFF,
    group=GROUP_STAFF, width=220, edit_roles=EDIT_CARE,
    help='Notatka przy osobie, np. że nie chce obiadu albo jest w core teamie.',
)
STAFF_MEAL_DAY1 = ColumnDef(
    key='staff.meal.day1', label='Bon na obiad\ndzień 1', kind=KIND_BOOL, source=SOURCE_STAFF,
    group=GROUP_STAFF, width=120, edit_roles=EDIT_CARE, aggregate='count_true',
    help='Zaznacz, gdy bon na obiad pierwszego dnia został wydany.',
)
STAFF_MEAL_DAY2 = ColumnDef(
    key='staff.meal.day2', label='Bon na obiad\ndzień 2', kind=KIND_BOOL, source=SOURCE_STAFF,
    group=GROUP_STAFF, width=120, edit_roles=EDIT_CARE, aggregate='count_true',
    help='Zaznacz, gdy bon na obiad drugiego dnia został wydany.',
)

STAFF_MEAL_FIELDS = {
    STAFF_MEAL_DAY1.key: 'day1',
    STAFF_MEAL_DAY2.key: 'day2',
    STAFF_MEAL_NOTE.key: 'note',
}
