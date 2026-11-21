"""Read-only columns taken from the company form (stages 1, 2, 4 and 5)."""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ObjectDoesNotExist

from companies.models import (
    ATTENDANCE_OPT,
    CARPET_CHOICE_CHOICES,
    PDIAttendee,
    TV_MOUNT_CHOICES,
    carpet_color_label,
)
from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG, STAFF_ROLE_OPIEKUN

from ..form_writes import (
    _ensure_description,
    _ensure_final,
    _ensure_pdi,
    _ensure_stand,
    make_attr_setter,
    make_file_setter,
    read_delegates,
    read_jobs,
    read_pdi_people,
    set_company_email,
    write_delegates,
    write_jobs,
    write_pdi_people,
)
from ..registry import (
    KIND_BOOL,
    KIND_FILE,
    KIND_LONGTEXT,
    KIND_NUMBER,
    KIND_SELECT,
    KIND_TEXT,
    KIND_TIME,
    SOURCE_COMPUTED,
    SOURCE_CUSTOM,
    SOURCE_SYSTEM,
    ColumnDef,
    RowContext,
)
from ..values import serialize
from .common import stand_size_code

GROUP_COMPANY = 'DANE FIRMY (z formularza)'
GROUP_STAND = 'STOISKO (z formularza)'
GROUP_POWER = 'PRĄD (z formularza)'
GROUP_SIGN = 'FRYZ (z formularza)'
GROUP_CARPET = 'WYKŁADZINA (z formularza)'
GROUP_EQUIPMENT = 'WYPOSAŻENIE (z formularza)'
GROUP_PACKAGE = 'PAKIET (wyliczany)'
GROUP_ARRIVAL = 'PRZYJAZD (z formularza)'
GROUP_LUNCH = 'OBIADY (z formularza)'
GROUP_PEOPLE = 'DELEGACI NA TARGI (z formularza)'
GROUP_PDI = 'GALA PDI (Mail #2)'
GROUP_CATALOGUE = 'KATALOG (z formularza)'
GROUP_MONEY = 'ROZLICZENIE (wyliczane)'

# Master: światło 4m²→1, 6m²→2, 8m²→3; gniazdko 1/1/2. 12m² nie było w tym opisie.
_LIGHTS_BY_SIZE = {'podstawowy': 1, 'standardowy': 2, 'rozszerzony': 3}
_SOCKETS_BY_SIZE = {'podstawowy': 1, 'standardowy': 1, 'rozszerzony': 2}
_ATTENDANCE = dict(ATTENDANCE_OPT)
_MOUNT = dict(TV_MOUNT_CHOICES)
_PUBLICATION = (
    ('none', 'brak'),
    ('pending', 'nie wysłano'),
    ('exported', 'wysłano na stronę'),
    ('error', 'błąd wysyłki'),
)


def _stand_details(ctx: RowContext):
    return ctx.related('stand_details')


def _final(ctx: RowContext):
    return ctx.related('finaldata')


def _description(ctx: RowContext):
    return ctx.related('description')


def _address(ctx: RowContext):
    basic = ctx.related('basic_data')
    if basic is None:
        return None
    try:
        return basic.adress
    except ObjectDoesNotExist:
        return None


def _pdi(ctx: RowContext):
    final = _final(ctx)
    if final is None:
        return None
    try:
        return final.pdis
    except ObjectDoesNotExist:
        return None


def _attr(getter, attr, default=''):
    def read(ctx: RowContext):
        obj = getter(ctx)
        if obj is None:
            return default
        return serialize(getattr(obj, attr))
    return read


def _file(getter, attr):
    def read(ctx: RowContext):
        obj = getter(ctx)
        if obj is None:
            return None
        value = getattr(obj, attr)
        return value or None
    return read


def _ensure_for(getter):
    if getter is _stand_details:
        return _ensure_stand
    if getter is _final:
        return _ensure_final
    if getter is _description:
        return _ensure_description
    if getter is _pdi:
        return _ensure_pdi
    return None


def _system(key, label, getter, attr, source_field, kind=KIND_TEXT, group=GROUP_STAND, width=160, default='', **kwargs):
    ensure = _ensure_for(getter)
    setter = kwargs.pop('setter', None)
    if setter is None and ensure is not None:
        setter = make_attr_setter(ensure, attr)
    return ColumnDef(
        key=key, label=label, kind=kind, source=SOURCE_SYSTEM, group=group, width=width,
        getter=_attr(getter, attr, default), setter=setter, source_fields=(source_field,), **kwargs,
    )


def _own_build(ctx: RowContext) -> bool:
    details = _stand_details(ctx)
    return details is not None and details.stand_type == 'self_construction'


def _package_count(table: dict[str, int]):
    def read(ctx: RowContext):
        if _stand_details(ctx) is None and not stand_size_code(ctx):
            return None
        if _own_build(ctx):
            return 0
        code = stand_size_code(ctx)
        if not code or code not in table:
            return None
        return table[code]
    return read


def _package_flag(included_for_itp: int):
    def read(ctx: RowContext):
        if _stand_details(ctx) is None and not stand_size_code(ctx):
            return None
        if _own_build(ctx):
            return 0
        return included_for_itp
    return read


def _tv_mounts(ctx: RowContext) -> str:
    details = _stand_details(ctx)
    if details is None:
        return ''
    parts = []
    for selection in details.equipment_selections.all():
        if selection.equipment_item.code == 'tv' and selection.mount_type:
            parts.append(_MOUNT.get(selection.mount_type, selection.mount_type))
    return ', '.join(parts)


def _paid_equipment(ctx: RowContext):
    details = _stand_details(ctx)
    if details is None:
        return Decimal('0')
    total = Decimal('0')
    for selection in details.equipment_selections.all():
        included = selection.equipment_item.included_quantity or 0
        paid = max(0, selection.quantity - included)
        total += paid * (selection.equipment_item.price or 0)
    return total


def _lunches_by_day(ctx: RowContext) -> dict[str, int]:
    final = _final(ctx)
    if final is None:
        return {}
    totals: dict[str, int] = {}
    for lunch in final.lunches.all():
        totals[lunch.day] = totals.get(lunch.day, 0) + (lunch.lunch_quantity or 0)
    return totals


def _lunch_qty(day: str):
    def read(ctx: RowContext):
        totals = _lunches_by_day(ctx)
        if not totals and _final(ctx) is None:
            return None
        return totals.get(day, 0)
    return read



def _extra_lunch_cost(ctx: RowContext):
    final = _final(ctx)
    if final is None or final.lunches_declined:
        return Decimal('0')
    extra = sum(max(0, qty - 2) for qty in _lunches_by_day(ctx).values())
    price = ctx.shared.get('lunch_price') or 0
    return extra * price


def _job_count(ctx: RowContext) -> int:
    return len(ctx.company.jobwalls.all())


def _paid_jobs(ctx: RowContext) -> int:
    free = ctx.shared.get('jobwall_free') or 0
    return max(0, _job_count(ctx) - free)


def _jobwall_cost(ctx: RowContext):
    return _paid_jobs(ctx) * (ctx.shared.get('jobwall_price') or 0)


def _surcharge_total(ctx: RowContext):
    return _paid_equipment(ctx) + _extra_lunch_cost(ctx) + _jobwall_cost(ctx)


def _job_lines(ctx: RowContext) -> str:
    lines = []
    for job in ctx.company.jobwalls.all():
        lines.append(
            f'{job.name} — {job.get_form_display()}, {job.get_workload_display()}, {job.get_contract_display()}'
            f'\n{job.description}\nOferuje: {job.benefits}\nWymaga: {job.requirements}\n{job.url}'
        )
    return '\n\n'.join(lines)


def _person_line(person, with_attendance=False) -> str:
    name = f'{person.name} {person.surname}'.strip()
    bits = [name]
    if person.phone_number:
        bits.append(person.phone_number)
    if with_attendance and person.attendance:
        bits.append(_ATTENDANCE.get(person.attendance, person.attendance))
    return ', '.join(bits)


def _delegates(ctx: RowContext) -> str:
    pdi = _pdi(ctx)
    if pdi is None:
        return ''
    return '\n'.join(_person_line(person, with_attendance=True) for person in pdi.exhibitors.all())


def _pdi_people(ctx: RowContext) -> str:
    pdi = _pdi(ctx)
    if pdi is None:
        return ''
    return '\n'.join(_person_line(person) for person in pdi.pdiattendees.all())


def _pdi_emails(ctx: RowContext) -> str:
    pdi = _pdi(ctx)
    if pdi is None:
        return ''
    return '\n'.join(
        f'{person.name} {person.surname}: {person.email}'.strip()
        for person in pdi.pdiattendees.all() if person.email
    )


PDI_MAIL2_HELP = (
    'Osoby na galę PDI. Opiekun potwierdza je w Mailu #2 i wpisuje w arkuszu. '
    'Zwykle większość pokrywa się z delegatami na targi z formularza. '
    'Pierwsze 2 bilety są w pakiecie; dodatkowe wyliczają się automatycznie.'
)

_PDI_EDIT_ROLES = frozenset({STAFF_ROLE_LG, STAFF_ROLE_OPIEKUN})
_PDI_VIEW_ROLES = frozenset({STAFF_ROLE_LG, STAFF_ROLE_FR, STAFF_ROLE_OPIEKUN})


def _set_pdi_tickets(company, value) -> None:
    qty = 0 if value is None or value == '' else int(value)
    if qty < 0:
        qty = 0
    pdi = _ensure_pdi(company)
    pdi.tickets_quantity = qty
    pdi.save(update_fields=['tickets_quantity'])


def _pdi_extra_tickets(ctx: RowContext):
    pdi = _pdi(ctx)
    if pdi is None or pdi.tickets_quantity is None:
        return 0
    return max(0, int(pdi.tickets_quantity) - 2)


def _parse_pdi_attendee_line(line: str) -> tuple[str, str, str] | None:
    """Parse 'Imię Nazwisko: mail' or 'Imię Nazwisko - mail'."""
    text = (line or '').strip()
    if not text:
        return None
    sep = None
    if ': ' in text:
        sep = ': '
    elif ' - ' in text:
        sep = ' - '
    elif ':' in text:
        sep = ':'
    elif ' -' in text:
        sep = ' -'
    if sep is None:
        return None
    left, email = text.split(sep, 1)
    email = email.strip()
    parts = left.strip().split()
    if not email or not parts:
        return None
    name = parts[0]
    surname = ' '.join(parts[1:]) if len(parts) > 1 else '-'
    return name, surname, email


def _set_pdi_emails(company, value) -> None:
    raw = '' if value is None else str(value)
    attendees: list[tuple[str, str, str]] = []
    for line in raw.splitlines():
        parsed = _parse_pdi_attendee_line(line)
        if parsed is not None:
            attendees.append(parsed)
    pdi = _ensure_pdi(company)
    phones_by_email: dict[str, str] = {}
    phones_by_name: dict[tuple[str, str], str] = {}
    for existing in pdi.pdiattendees.all():
        phone = (existing.phone_number or '').strip()
        if phone and phone != '-':
            if existing.email:
                phones_by_email[existing.email.strip().lower()] = phone
            phones_by_name[(existing.name.strip().lower(), existing.surname.strip().lower())] = phone
    pdi.pdiattendees.all().delete()
    for name, surname, email in attendees:
        phone = (
            phones_by_email.get(email.lower())
            or phones_by_name.get((name.lower(), surname.lower()))
            or '-'
        )
        PDIAttendee.objects.create(
            form=pdi,
            name=name[:100],
            surname=surname[:100],
            phone_number=phone[:20],
            email=email[:254],
        )
    if pdi.tickets_quantity < len(attendees):
        pdi.tickets_quantity = len(attendees)
        pdi.save(update_fields=['tickets_quantity'])


def _publication(ctx: RowContext) -> str:
    pub = ctx.related('website_publication')
    if pub is None:
        return 'none'
    if pub.last_error:
        return 'error'
    if pub.last_exported_at:
        return 'exported'
    return 'pending'


def _order_pdf(ctx: RowContext):
    return {'url': f'/api/company/{ctx.company.id}/order-summary-pdf/', 'name': 'PDF zamówienia'}


def _representative(ctx: RowContext) -> str:
    user = ctx.company.representative
    if user is None:
        return ''
    full = f'{user.first_name} {user.last_name}'.strip() or user.username
    return ' | '.join(p for p in (full, user.email, getattr(user, 'phone_number', '')) if p)


def _address_text(ctx: RowContext) -> str:
    addr = _address(ctx)
    if addr is None:
        return ''
    number = addr.home_number
    if addr.apt_number:
        number = f'{number}/{addr.apt_number}' if number else addr.apt_number
    street = ' '.join(p for p in (addr.street, number) if p)
    city = ' '.join(p for p in (addr.postal_code, addr.city) if p)
    return ', '.join(p for p in (street, city, addr.country) if p)


def _carpet_color(ctx: RowContext) -> str:
    details = _stand_details(ctx)
    if details is None:
        return ''
    return carpet_color_label(details.carpet_choice, details.carpet_color)


COMPANY_FULL_NAME = _system(
    'company.full_name', 'Pełna nazwa', lambda ctx: ctx.related('basic_data'), 'full_name',
    'BasicData.full_name', group=GROUP_COMPANY, width=220,
)
COMPANY_NIP = _system(
    'company.nip', 'NIP', lambda ctx: ctx.related('basic_data'), 'nip', 'BasicData.nip',
    group=GROUP_COMPANY, width=120,
)
COMPANY_ADDRESS = ColumnDef(
    key='company.address', label='Adres', kind=KIND_TEXT, source=SOURCE_SYSTEM, group=GROUP_COMPANY,
    width=260, getter=_address_text,
    source_fields=(
        'Address.street', 'Address.home_number', 'Address.apt_number', 'Address.city',
        'Address.country', 'Address.postal_code',
    ),
)
COMPANY_EMAIL = ColumnDef(
    key='company.email', label='E-mail firmy', kind=KIND_TEXT, source=SOURCE_SYSTEM, group=GROUP_COMPANY,
    width=200, getter=lambda ctx: ctx.company.email, setter=set_company_email,
    help='Adres konta firmy. Formularz nie zbiera osobnego maila głównego przedstawiciela.',
)
COMPANY_REPRESENTATIVE = ColumnDef(
    key='company.representative', label='Przedstawiciel (konto)', kind=KIND_TEXT, source=SOURCE_SYSTEM,
    group=GROUP_COMPANY, width=240, getter=_representative,
)
COMPANY_LANGUAGE = ColumnDef(
    key='company.language', label='Język zaproszenia', kind=KIND_SELECT, source=SOURCE_COMPUTED,
    group=GROUP_COMPANY, width=130, options=(('pl', 'polski'), ('en', 'angielski')),
    getter=lambda ctx: ctx.invitation_language,
)

STAND_OWN_BUILD = ColumnDef(
    key='stand.own_build', label='Własna zabudowa', kind=KIND_BOOL, source=SOURCE_COMPUTED,
    group=GROUP_STAND, width=120, getter=_own_build, highlight='truthy',
    aggregate='count_true', aggregate_by_day=True,
    source_fields=('StandDetails.stand_type',),
    help='Tak, gdy firma stawia własną zabudowę, a nie stoisko ITP.',
)
# Klucz historyczny stand.composition — w formularzu sc_details trzyma wymiary (dł.×szer.×wys.).
STAND_COMPOSITION = _system(
    'stand.composition', 'Wymiary zabudowy', _stand_details, 'sc_details',
    'StandDetails.sc_details', kind=KIND_LONGTEXT, width=220,
    help=(
        'Wymiary własnej zabudowy z formularza firmy (długość × szerokość × wysokość). '
        'To nie jest rozmiar pakietu stoiska. Skład (części / całość) jest w osobnej kolumnie.'
    ),
)
STAND_BROUGHT = _system(
    'stand.brought_equipment', 'Sprzęt, który przywożą', _stand_details, 'brought_equipment',
    'StandDetails.brought_equipment', kind=KIND_LONGTEXT, width=220,
    help='Meble i sprzęt własnej zabudowy, które firma sama przywozi. To nie jest wyposażenie z katalogu ITP.',
)
STAND_POWER_ACK = _system(
    'stand.power_ack', 'Zapowiedź\nmocy', _stand_details, 'el_power_acknowledged',
    'StandDetails.el_power_acknowledged', kind=KIND_BOOL, group=GROUP_POWER, width=110, default=False,
    aggregate='count_true', aggregate_by_day=True,
    help=(
        'Ptaszek firmy z etapu 2: wie, że listę urządzeń i waty podaje dopiero w finale. '
        'To nie jest sprawdzenie mocy przez logistykę.'
    ),
)
POWER_DEVICES = _system(
    'power.devices', 'Urządzenia elektryczne', _final, 'el_devices', 'FinalData.el_devices',
    group=GROUP_POWER, width=200,
    help='Co firma podłączy w trakcie targów, np. laptop, ładowarka, lampki. Z ostatniego etapu formularza.',
)
POWER_TOTAL = _system(
    'power.total', 'Łączna moc (W)', _final, 'el_power', 'FinalData.el_power', group=GROUP_POWER, width=120,
    help='Suma watów urządzeń na czas targów. Przy niskiej mocy formularz wpisuje około 100 W.',
)
POWER_LOW = _system(
    'power.low', 'Niska moc', _final, 'el_low_power', 'FinalData.el_low_power', kind=KIND_BOOL,
    group=GROUP_POWER, width=100, default=False, highlight='truthy',
    aggregate='count_true', aggregate_by_day=True,
    help='Zaznaczone, gdy firma podała około 100 W lub mniej i nie rozpisuje urządzeń.',
)

SIGN_TEXT = _system(
    'sign.text', 'Napis na fryz', _stand_details, 'name_sign_text', 'StandDetails.name_sign_text',
    group=GROUP_SIGN, width=180,
    help='Tekst na belce nad stoiskiem ITP. Przy własnej zabudowie zwykle pusty.',
)
SIGN_LOGO = ColumnDef(
    key='sign.logo', label='Logo na fryz', kind=KIND_FILE, source=SOURCE_SYSTEM, group=GROUP_SIGN,
    width=140, getter=_file(_stand_details, 'logo_sign_file'),
    setter=make_file_setter(_ensure_stand, 'logo_sign_file'),
    source_fields=('StandDetails.logo_sign_file',),
    help='Plik logo na belkę nad stoiskiem, z formularza. Osobno od ptaszka Logo zatwierdzone.',
)
SIGN_VISUAL = ColumnDef(
    key='sign.visualization', label='Wizualizacja', kind=KIND_FILE, source=SOURCE_SYSTEM, group=GROUP_SIGN,
    width=140, getter=_file(_stand_details, 'stand_visualization'),
    setter=make_file_setter(_ensure_stand, 'stand_visualization'),
    source_fields=('StandDetails.stand_visualization',),
    help='Plik wizualizacji z formularza firmy.',
)
SIGN_FIRE_CERT = ColumnDef(
    key='sign.fire_cert', label='Certyfikat niepalności', kind=KIND_FILE, source=SOURCE_SYSTEM,
    group=GROUP_SIGN, width=160, getter=_file(_stand_details, 'fire_cert'),
    setter=make_file_setter(_ensure_stand, 'fire_cert'),
    source_fields=('StandDetails.fire_cert',),
    help='Plik z formularza. Otwórz go i sprawdź datę oraz nazwę firmy, potem zaznacz Certyfikat sprawdzony.',
)

CARPET_CHOICE = _system(
    'carpet.choice', 'Wykładzina', _stand_details, 'carpet_choice', 'StandDetails.carpet_choice',
    kind=KIND_SELECT, group=GROUP_CARPET, width=160, options=tuple(CARPET_CHOICE_CHOICES),
    help='Obowiązkowa dla każdej firmy. Partnerzy wybierają RIPS albo welur. Pozostałe firmy mają RIPS.',
)
CARPET_COLOR = ColumnDef(
    key='carpet.color', label='Kolor wykładziny', kind=KIND_TEXT, source=SOURCE_SYSTEM, group=GROUP_CARPET,
    width=140, getter=_carpet_color, source_fields=('StandDetails.carpet_color',),
    help='Domyślnie 892 szary. Partnerzy wybierają kolor z palety. Pozostałe firmy zostają przy 892.',
)

EQUIPMENT_TV_MOUNT = ColumnDef(
    key='equipment.tv_mount', label='Montaż TV', kind=KIND_TEXT, source=SOURCE_COMPUTED,
    group=GROUP_EQUIPMENT, width=140, getter=_tv_mounts,
    # Keeps EquipmentSelection in Catalog coverage after equipment.lines left LG tabs.
    source_fields=('EquipmentSelection.equipment_item', 'EquipmentSelection.quantity', 'EquipmentSelection.mount_type'),
    help='Na stojaku albo na ścianie — tak firma wybrała przy telewizorze.',
)
EQUIPMENT_PAID = ColumnDef(
    key='equipment.paid', label='Dopłata za wyposażenie', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_MONEY, width=150, getter=_paid_equipment, aggregate='sum', highlight='positive',
    help='Suma (ilość ponad darmowy próg pozycji) × cena. Ten sam próg co w PDF zamówienia.',
)

# Inserted on LG Główny at read time (catalog items change; Catalog is static at import).
EQUIPMENT_QTY_INSERT_BEFORE = 'equipment.tv_mount'


def _equipment_qty_getter(item_id: int):
    def read(ctx: RowContext):
        details = _stand_details(ctx)
        if details is None:
            return 0
        for selection in details.equipment_selections.all():
            if selection.equipment_item_id == item_id:
                return selection.quantity or 0
        return 0

    return read


def build_equipment_qty_columns() -> list[ColumnDef]:
    """One quantity column per catalog item (active + any still selected but inactive)."""
    from companies.models import EquipmentItem, EquipmentSelection

    active = list(
        EquipmentItem.objects.filter(is_active=True).order_by('category', 'name_pl', 'id')
    )
    active_ids = {item.id for item in active}
    selected_ids = set(
        EquipmentSelection.objects.values_list('equipment_item_id', flat=True).distinct()
    )
    extras = list(
        EquipmentItem.objects.filter(id__in=selected_ids - active_ids)
        .order_by('category', 'name_pl', 'id')
    )
    items = active + extras
    columns: list[ColumnDef] = []
    for item in items:
        included = item.included_quantity or 0
        columns.append(
            ColumnDef(
                key=f'equipment.qty.{item.id}',
                label=item.name_pl or item.name_en or f'#{item.id}',
                kind=KIND_NUMBER,
                source=SOURCE_COMPUTED,
                group=GROUP_EQUIPMENT,
                width=88,
                getter=_equipment_qty_getter(item.id),
                aggregate='sum',
                aggregate_by_day=True,
                highlight='over_included' if included > 0 else 'positive',
                highlight_above=included if included > 0 else None,
                help=(
                    f'Ile sztuk wybrała firma. W cenie stoiska: {included}. Powyżej tej liczby jest dopłata.'
                    if included > 0
                    else 'Ile sztuk wybrała firma. Ta pozycja nie ma darmowych sztuk w pakiecie.'
                ),
                source_fields=(
                    'EquipmentSelection.equipment_item',
                    'EquipmentSelection.quantity',
                ),
            )
        )
    return columns

PACKAGE_LIGHTS = ColumnDef(
    key='package.lights', label='Punkty świetlne\nw pakiecie', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_PACKAGE, width=88, getter=_package_count(_LIGHTS_BY_SIZE),
    help='4 m² → 1, 6 m² → 2, 8 m² → 3. Przy własnej zabudowie: 0. Dla 12 m² liczby nie ma.',
)
PACKAGE_SOCKETS = ColumnDef(
    key='package.sockets', label='Gniazdka\nw pakiecie', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_PACKAGE, width=80, getter=_package_count(_SOCKETS_BY_SIZE),
    help='4 m² → 1, 6 m² → 1, 8 m² → 2. Przy własnej zabudowie: 0. Dla 12 m² liczby nie ma.',
)
PACKAGE_HANGER = ColumnDef(
    key='package.hanger', label='Wieszak\nw pakiecie', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_PACKAGE, width=72, getter=_package_flag(1),
    help='1 przy zabudowie ITP, 0 przy własnej zabudowie.',
)
PACKAGE_FRIEZE = ColumnDef(
    key='package.frieze', label='Fryz\nw pakiecie', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_PACKAGE, width=64, getter=_package_flag(1),
    help='1 przy zabudowie ITP, 0 przy własnej zabudowie.',
)

def _bin_count(ctx: RowContext):
    if _stand_details(ctx) is None and not stand_size_code(ctx):
        return None
    return 1


PACKAGE_BIN = ColumnDef(
    key='package.bin', label='Kosz\nw pakiecie', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_PACKAGE, width=64, getter=_bin_count,
    help='Zawsze 1, gdy firma ma już stoisko albo dane zabudowy.',
)

ARRIVAL_DAY1 = _system(
    'arrival.day1', 'Wejście\ndzień 1', _final, 'arrival_time_day1', 'FinalData.arrival_time_day1',
    kind=KIND_TIME, group=GROUP_ARRIVAL, width=88, default=None,
    help='Godzina wejścia na targi pierwszego dnia, z formularza. Osobno od dnia montażu własnej zabudowy.',
)
ARRIVAL_DAY2 = _system(
    'arrival.day2', 'Wejście\ndzień 2', _final, 'arrival_time_day2', 'FinalData.arrival_time_day2',
    kind=KIND_TIME, group=GROUP_ARRIVAL, width=88, default=None,
    help='Godzina wejścia na targi drugiego dnia, z formularza. Osobno od dnia montażu własnej zabudowy.',
)

LUNCH_DECLINED = _system(
    'lunch.declined', 'Rezygnacja\nz obiadów', _final, 'lunches_declined', 'FinalData.lunches_declined',
    kind=KIND_BOOL, group=GROUP_LUNCH, width=88, default=False, highlight='truthy',
    aggregate='count_true',
    help='Firma zrezygnowała z obiadów w formularzu. Dopłata za obiady jest wtedy 0.',
)
LUNCH_DAY1 = ColumnDef(
    key='lunch.day1', label='Obiady\ndzień 1', kind=KIND_NUMBER, source=SOURCE_SYSTEM, group=GROUP_LUNCH,
    width=72, getter=_lunch_qty('day1'), aggregate='sum',
    source_fields=('Lunch.day', 'Lunch.lunch_quantity'),
    help='Liczba obiadów wpisana przez firmę w formularzu, dzień 1.',
)
LUNCH_DAY2 = ColumnDef(
    key='lunch.day2', label='Obiady\ndzień 2', kind=KIND_NUMBER, source=SOURCE_SYSTEM, group=GROUP_LUNCH,
    width=72, getter=_lunch_qty('day2'), aggregate='sum',
    source_fields=('Lunch.day', 'Lunch.lunch_quantity'),
    help='Liczba obiadów wpisana przez firmę w formularzu, dzień 2.',
)


def _lunch_over_free(day: str):
    """Sztuki ponad 2 darmowe na dzień (dla kateringu; kwota zostaje w lunch.extra_cost)."""
    qty_of = _lunch_qty(day)

    def read(ctx: RowContext):
        qty = qty_of(ctx)
        if qty is None:
            return None
        return max(0, int(qty) - 2)

    return read


LUNCH_EXTRA_DAY1 = ColumnDef(
    key='lunch.extra_day1', label='Dodatkowe\ndzień 1', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_LUNCH, width=88, getter=_lunch_over_free('day1'), aggregate='sum', highlight='positive',
    help='Ile obiadów ponad 2 darmowe w dniu 1.',
)
LUNCH_EXTRA_DAY2 = ColumnDef(
    key='lunch.extra_day2', label='Dodatkowe\ndzień 2', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_LUNCH, width=88, getter=_lunch_over_free('day2'), aggregate='sum', highlight='positive',
    help='Ile obiadów ponad 2 darmowe w dniu 2.',
)
LUNCH_EXTRA_COST = ColumnDef(
    key='lunch.extra_cost', label='Dopłata\nza obiady', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_MONEY, width=88, getter=_extra_lunch_cost, aggregate='sum', highlight='positive',
    help='Powyżej 2 obiadów na dzień × cena z ustawień. Przy rezygnacji z obiadów: 0.',
)

MAIN_REP_NAME = _system(
    'people.main_name', 'Główny przedstawiciel\n— imię', _final, 'main_rep_name', 'FinalData.main_rep_name',
    group=GROUP_PEOPLE, width=140,
    help='Imię głównego przedstawiciela z formularza finału.',
)
MAIN_REP_SURNAME = _system(
    'people.main_surname', 'Główny przedstawiciel — nazwisko', _final, 'main_rep_surname',
    'FinalData.main_rep_surname', group=GROUP_PEOPLE, width=180,
    help='Nazwisko głównego przedstawiciela z formularza finału.',
)
MAIN_REP_PHONE = _system(
    'people.main_phone', 'Główny przedstawiciel — telefon', _final, 'main_rep_phone',
    'FinalData.main_rep_phone', group=GROUP_PEOPLE, width=160,
    help='Telefon głównego przedstawiciela z formularza finału.',
)
MAIN_REP_ATTENDANCE = _system(
    'people.main_attendance', 'Obecność głównego przedstawiciela', _final, 'main_rep_attendance',
    'FinalData.main_rep_attendance', kind=KIND_SELECT, group=GROUP_PEOPLE, width=180,
    options=tuple(ATTENDANCE_OPT),
    help='Których dni targów będzie główny przedstawiciel.',
)
NO_OTHER_DELEGATES = _system(
    'people.no_other', 'Brak innych delegatów', _final, 'no_other_delegates',
    'FinalData.no_other_delegates', kind=KIND_BOOL, group=GROUP_PEOPLE, width=150, default=False,
    help='Firma zaznaczyła, że na targi przyjedzie tylko główny przedstawiciel.',
)
DELEGATES = ColumnDef(
    key='people.delegates', label='Delegaci na targi', kind=KIND_LONGTEXT, source=SOURCE_SYSTEM,
    group=GROUP_PEOPLE, width=240, getter=_delegates, setter=write_delegates,
    list_schema='delegates', list_reader=read_delegates,
    source_fields=('Exhibitor.name', 'Exhibitor.surname', 'Exhibitor.phone_number', 'Exhibitor.attendance'),
    help=(
        'Delegaci na targi z formularza, poza głównym przedstawicielem: '
        'imię, nazwisko, telefon i dni obecności.'
    ),
)
PDI_TICKETS = ColumnDef(
    key='people.pdi_tickets', label='Osoby na PDI', kind=KIND_NUMBER, source=SOURCE_CUSTOM,
    group=GROUP_PDI, width=110, getter=_attr(_pdi, 'tickets_quantity', 0),
    setter=_set_pdi_tickets, aggregate='sum', edit_roles=_PDI_EDIT_ROLES,
    source_fields=('PDI.tickets_quantity',), help=PDI_MAIL2_HELP,
)
PDI_EXTRA_TICKETS = ColumnDef(
    key='people.pdi_extra', label='Dodatkowe\nbilety PDI', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_PDI, width=110, getter=_pdi_extra_tickets, aggregate='sum', highlight='positive',
    help='Ile biletów ponad 2 wliczone w pakiet.',
)
PDI_PEOPLE = ColumnDef(
    key='people.pdi', label='Uczestnicy PDI', kind=KIND_LONGTEXT, source=SOURCE_SYSTEM, group=GROUP_PDI,
    width=220, getter=_pdi_people, setter=write_pdi_people,
    list_schema='pdi', list_reader=read_pdi_people,
    source_fields=('PDIAttendee.name', 'PDIAttendee.surname', 'PDIAttendee.phone_number'),
    help=PDI_MAIL2_HELP,
)
PDI_EMAILS = ColumnDef(
    key='people.pdi_emails', label='E-maile uczestników PDI', kind=KIND_LONGTEXT, source=SOURCE_CUSTOM,
    group=GROUP_PDI, width=240, getter=_pdi_emails, setter=_set_pdi_emails,
    source_fields=('PDIAttendee.email',),
    view_roles=_PDI_VIEW_ROLES, edit_roles=_PDI_EDIT_ROLES,
    help=(
        PDI_MAIL2_HELP
        + ' Jedna osoba w wierszu: Imię Nazwisko: email albo Imię Nazwisko - email. '
        'Wiersz bez maila się nie zapisze. Zapis zastępuje całą listę.'
    ),
)

CATALOGUE_TEXT = _system(
    'catalogue.text', 'Opis katalogowy', _description, 'descr', 'Description.descr',
    kind=KIND_LONGTEXT, group=GROUP_CATALOGUE, width=260,
)
CATALOGUE_LOGO = ColumnDef(
    key='catalogue.logo', label='Logo katalogowe', kind=KIND_FILE, source=SOURCE_SYSTEM,
    group=GROUP_CATALOGUE, width=140, getter=_file(_description, 'logo_file'),
    setter=make_file_setter(_ensure_description, 'logo_file'),
    source_fields=('Description.logo_file',),
)
JOB_COUNT = ColumnDef(
    key='catalogue.jobs', label='Ogłoszenia Jobwall', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_CATALOGUE, width=130, getter=_job_count, aggregate='sum',
)
JOB_PAID = ColumnDef(
    key='catalogue.jobs_paid', label='Płatne ogłoszenia', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_CATALOGUE, width=130, getter=_paid_jobs, aggregate='sum', highlight='positive',
    help='Ogłoszenia ponad darmowy próg z ustawień.',
)
JOB_LINES = ColumnDef(
    key='catalogue.job_lines', label='Treść ogłoszeń', kind=KIND_LONGTEXT, source=SOURCE_SYSTEM,
    group=GROUP_CATALOGUE, width=280, getter=_job_lines, setter=write_jobs,
    list_schema='jobs', list_reader=read_jobs,
    source_fields=(
        'Jobwall.name', 'Jobwall.form', 'Jobwall.workload', 'Jobwall.contract', 'Jobwall.description',
        'Jobwall.benefits', 'Jobwall.requirements', 'Jobwall.url',
    ),
)
PUBLICATION = ColumnDef(
    key='catalogue.publication', label='Publikacja na stronie', kind=KIND_SELECT, source=SOURCE_COMPUTED,
    group=GROUP_CATALOGUE, width=160, options=_PUBLICATION, getter=_publication,
)
JOBWALL_COST = ColumnDef(
    key='money.jobwall', label='Dopłata za Jobwall', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_MONEY, width=140, getter=_jobwall_cost, aggregate='sum', highlight='positive',
)
MONEY_TOTAL = ColumnDef(
    key='money.total', label='Suma dopłat', kind=KIND_NUMBER, source=SOURCE_COMPUTED, group=GROUP_MONEY,
    width=130, getter=_surcharge_total, aggregate='sum', highlight='positive',
    help='Wyposażenie ponad próg + obiady ponad 2 dziennie + płatne ogłoszenia.',
)
ORDER_PDF = ColumnDef(
    key='money.pdf', label='PDF zamówienia', kind=KIND_FILE, source=SOURCE_COMPUTED, group=GROUP_MONEY,
    width=140, getter=_order_pdf,
    help='Działa, gdy wszystkie etapy są zaakceptowane. Pobiera osoba z rolą FR.',
)
