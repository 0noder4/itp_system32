"""
Write helpers for SOURCE_SYSTEM sheet columns (draft → commit into company form models).

Scalar: one model attribute. Lists: JSON array of dicts; grid still shows composed text.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ObjectDoesNotExist

from companies.models import (
    ATTENDANCE_OPT,
    CONTRACT_OPT,
    Description,
    Exhibitor,
    FinalData,
    FORM_OPT,
    Jobwall,
    PDI,
    PDIAttendee,
    SIZE_OPT,
    Stand,
    StandDetails,
    WORKLOAD_OPT,
    Workshop,
    WorkshopFacilitator,
)

from .values import CellValueError, public_file_name, serialize

_ATTENDANCE = {code for code, _ in ATTENDANCE_OPT}
_FORM = {code for code, _ in FORM_OPT}
_WORKLOAD = {code for code, _ in WORKLOAD_OPT}
_CONTRACT = {code for code, _ in CONTRACT_OPT}
_SIZE = {code for code, _ in SIZE_OPT}


def set_company_email(company, value: Any) -> None:
    if value is None or (isinstance(value, str) and not str(value).strip()):
        raise CellValueError('E-mail firmy jest wymagany.')
    company.email = str(value).strip()
    company.save(update_fields=['email', 'updated_at'])


def set_stand_size(company, value: Any) -> None:
    if value is None or (isinstance(value, str) and not str(value).strip()):
        raise CellValueError('Wybierz rozmiar stoiska.')
    code = str(value).strip()
    if code not in _SIZE:
        raise CellValueError('Nieprawidłowy rozmiar stoiska.')
    stands = list(Stand.objects.filter(company=company))
    if not stands:
        Stand.objects.create(company=company, day='day1', stand_number='brak', stand_size=code)
        return
    Stand.objects.filter(company=company).update(stand_size=code)


def _ensure_stand(company) -> StandDetails:
    details, _ = StandDetails.objects.get_or_create(company=company)
    return details


def _ensure_final(company) -> FinalData:
    final, _ = FinalData.objects.get_or_create(company=company)
    return final


def _ensure_description(company) -> Description:
    desc, _ = Description.objects.get_or_create(company=company, defaults={'descr': ''})
    return desc


def _ensure_workshop(company) -> Workshop:
    workshop, _ = Workshop.objects.get_or_create(company=company)
    return workshop


def _ensure_pdi(company) -> PDI:
    final = _ensure_final(company)
    pdi, _ = PDI.objects.get_or_create(form=final, defaults={'tickets_quantity': 0})
    return pdi


def make_attr_setter(ensure, attr: str):
    """Setter for a single field on a related form model."""

    def setter(company, value: Any) -> None:
        obj = ensure(company)
        if value is None:
            field = obj._meta.get_field(attr)
            if getattr(field, 'null', False):
                setattr(obj, attr, None)
            elif field.get_internal_type() == 'BooleanField':
                setattr(obj, attr, False)
            else:
                setattr(obj, attr, '')
        else:
            setattr(obj, attr, value)
        obj.save(update_fields=[attr])

    return setter


def make_file_setter(ensure, attr: str):
    """Setter for a FileField: UploadedFile, backup dict/path, or clear (None/'').

    A storage path is copied back into the field's upload folder under the original
    file name. The backup path itself is never stored on the form field.
    """

    def setter(company, value: Any) -> None:
        import os

        from django.core.files.base import ContentFile
        from django.core.files.storage import default_storage

        obj = ensure(company)
        current = getattr(obj, attr)

        def clear() -> None:
            if current:
                current.delete(save=False)
            setattr(obj, attr, '')
            obj.save(update_fields=[attr])

        def write_bytes(display_name: str, data: bytes) -> None:
            safe = os.path.basename(display_name) or 'plik'
            current.save(safe, ContentFile(data), save=True)

        def copy_from(path: str, display_name: str) -> None:
            if not path or not default_storage.exists(path):
                raise CellValueError('Poprzedni plik nie jest już dostępny.')
            with default_storage.open(path, 'rb') as src:
                write_bytes(display_name or public_file_name(path), src.read())

        if value is None or value == '':
            clear()
            return
        if isinstance(value, dict):
            copy_from(str(value.get('path') or '').strip(), str(value.get('name') or ''))
            return
        if isinstance(value, str):
            path = value.strip()
            if not path:
                clear()
                return
            copy_from(path, public_file_name(path))
            return
        setattr(obj, attr, value)
        obj.save(update_fields=[attr])

    return setter


def set_workshop_decision(company, value: Any) -> None:
    workshop = _ensure_workshop(company)
    if value in (None, '', 'undecided'):
        workshop.workshop = None
    elif value in (True, 'yes', 'tak'):
        workshop.workshop = True
    elif value in (False, 'no', 'nie'):
        workshop.workshop = False
    else:
        raise CellValueError('Oczekiwano tak/nie/brak decyzji.')
    workshop.save(update_fields=['workshop'])


# --- list columns -----------------------------------------------------------------

def _text(value: Any, field: str, required: bool = True) -> str:
    if value is None:
        text = ''
    elif isinstance(value, str):
        text = value.strip()
    else:
        text = str(value).strip()
    if required and not text:
        raise CellValueError(f'Pole „{field}” jest wymagane.')
    return text


def read_delegates(company) -> list[dict]:
    try:
        pdi = company.finaldata.pdis
    except ObjectDoesNotExist:
        return []
    return [
        {
            'name': person.name,
            'surname': person.surname,
            'phone_number': person.phone_number,
            'attendance': person.attendance or '',
        }
        for person in pdi.exhibitors.all()
    ]


def validate_delegates(items: Any) -> list[dict]:
    if not isinstance(items, list):
        raise CellValueError('Oczekiwano listy delegatów.')
    cleaned = []
    for raw in items:
        if not isinstance(raw, dict):
            raise CellValueError('Każdy delegat musi być obiektem.')
        attendance = _text(raw.get('attendance'), 'obecność', required=False)
        if attendance and attendance not in _ATTENDANCE:
            raise CellValueError('Nieprawidłowa obecność delegata.')
        cleaned.append({
            'name': _text(raw.get('name'), 'imię'),
            'surname': _text(raw.get('surname'), 'nazwisko'),
            'phone_number': _text(raw.get('phone_number'), 'telefon'),
            'attendance': attendance,
        })
    return cleaned


def write_delegates(company, items: Any) -> None:
    cleaned = validate_delegates(items)
    pdi = _ensure_pdi(company)
    pdi.exhibitors.all().delete()
    Exhibitor.objects.bulk_create([
        Exhibitor(form=pdi, **row) for row in cleaned
    ])


def format_delegates(items: list[dict]) -> str:
    lines = []
    for person in items:
        if not isinstance(person, dict):
            continue
        name = f'{person.get("name", "")} {person.get("surname", "")}'.strip()
        bits = [name]
        if person.get('phone_number'):
            bits.append(person['phone_number'])
        if person.get('attendance'):
            bits.append(dict(ATTENDANCE_OPT).get(person['attendance'], person['attendance']))
        lines.append(', '.join(bits))
    return '\n'.join(lines)


def read_pdi_people(company) -> list[dict]:
    try:
        pdi = company.finaldata.pdis
    except ObjectDoesNotExist:
        return []
    return [
        {
            'name': person.name,
            'surname': person.surname,
            'phone_number': person.phone_number,
            'email': person.email or '',
        }
        for person in pdi.pdiattendees.all()
    ]


def validate_pdi_people(items: Any) -> list[dict]:
    if not isinstance(items, list):
        raise CellValueError('Oczekiwano listy uczestników PDI.')
    cleaned = []
    for raw in items:
        if not isinstance(raw, dict):
            raise CellValueError('Każdy uczestnik musi być obiektem.')
        email = _text(raw.get('email'), 'e-mail')
        cleaned.append({
            'name': _text(raw.get('name'), 'imię'),
            'surname': _text(raw.get('surname'), 'nazwisko'),
            'phone_number': _text(raw.get('phone_number'), 'telefon'),
            'email': email,
        })
    return cleaned


def write_pdi_people(company, items: Any) -> None:
    cleaned = validate_pdi_people(items)
    pdi = _ensure_pdi(company)
    pdi.pdiattendees.all().delete()
    PDIAttendee.objects.bulk_create([
        PDIAttendee(form=pdi, **row) for row in cleaned
    ])
    if cleaned:
        pdi.tickets_quantity = max(pdi.tickets_quantity or 0, len(cleaned))
        pdi.save(update_fields=['tickets_quantity'])


def format_pdi_people(items: list[dict]) -> str:
    lines = []
    for person in items:
        if not isinstance(person, dict):
            continue
        name = f'{person.get("name", "")} {person.get("surname", "")}'.strip()
        bits = [name]
        if person.get('phone_number'):
            bits.append(person['phone_number'])
        lines.append(', '.join(bits))
    return '\n'.join(lines)


def read_facilitators(company) -> list[dict]:
    try:
        workshop = company.workshops
    except ObjectDoesNotExist:
        return []
    return [
        {
            'name': person.name,
            'surname': person.surname,
            'phone_number': person.phone_number,
            'description': person.description or '',
        }
        for person in workshop.facilitators.all()
    ]


def validate_facilitators(items: Any) -> list[dict]:
    if not isinstance(items, list):
        raise CellValueError('Oczekiwano listy prowadzących.')
    cleaned = []
    for raw in items:
        if not isinstance(raw, dict):
            raise CellValueError('Każdy prowadzący musi być obiektem.')
        cleaned.append({
            'name': _text(raw.get('name'), 'imię'),
            'surname': _text(raw.get('surname'), 'nazwisko'),
            'phone_number': _text(raw.get('phone_number'), 'telefon'),
            'description': _text(raw.get('description'), 'opis', required=False),
        })
    return cleaned


def write_facilitators(company, items: Any) -> None:
    cleaned = validate_facilitators(items)
    workshop = _ensure_workshop(company)
    workshop.facilitators.all().delete()
    WorkshopFacilitator.objects.bulk_create([
        WorkshopFacilitator(workshop=workshop, **row) for row in cleaned
    ])


def format_facilitators(items: list[dict]) -> str:
    lines = []
    for person in items:
        if not isinstance(person, dict):
            continue
        name = f'{person.get("name", "")} {person.get("surname", "")}'.strip()
        phone = person.get('phone_number') or ''
        lines.append(f'{name}, tel. {phone}' if phone else name)
    return '\n'.join(lines)


def format_facilitator_descriptions(items: list[dict]) -> str:
    return '\n'.join(
        f'{p.get("name", "")} {p.get("surname", "")}: {p.get("description", "")}'.strip()
        for p in items
        if isinstance(p, dict) and p.get('description')
    )


def read_jobs(company) -> list[dict]:
    return [
        {
            'name': job.name,
            'form': job.form,
            'workload': job.workload,
            'contract': job.contract,
            'description': job.description,
            'benefits': job.benefits,
            'requirements': job.requirements,
            'url': job.url,
        }
        for job in company.jobwalls.all()
    ]


def validate_jobs(items: Any) -> list[dict]:
    if not isinstance(items, list):
        raise CellValueError('Oczekiwano listy ogłoszeń.')
    cleaned = []
    for raw in items:
        if not isinstance(raw, dict):
            raise CellValueError('Każde ogłoszenie musi być obiektem.')
        form = _text(raw.get('form'), 'forma')
        workload = _text(raw.get('workload'), 'wymiar etatu')
        contract = _text(raw.get('contract'), 'umowa')
        if form not in _FORM:
            raise CellValueError('Nieprawidłowa forma zatrudnienia.')
        if workload not in _WORKLOAD:
            raise CellValueError('Nieprawidłowy wymiar etatu.')
        if contract not in _CONTRACT:
            raise CellValueError('Nieprawidłowy typ umowy.')
        cleaned.append({
            'name': _text(raw.get('name'), 'nazwa'),
            'form': form,
            'workload': workload,
            'contract': contract,
            'description': _text(raw.get('description'), 'opis'),
            'benefits': _text(raw.get('benefits'), 'oferuje'),
            'requirements': _text(raw.get('requirements'), 'wymaga'),
            'url': _text(raw.get('url'), 'link'),
        })
    return cleaned


def write_jobs(company, items: Any) -> None:
    cleaned = validate_jobs(items)
    company.jobwalls.all().delete()
    Jobwall.objects.bulk_create([
        Jobwall(company=company, **row) for row in cleaned
    ])


def format_jobs(items: list[dict]) -> str:
    form_labels = dict(FORM_OPT)
    workload_labels = dict(WORKLOAD_OPT)
    contract_labels = dict(CONTRACT_OPT)
    blocks = []
    for job in items:
        if not isinstance(job, dict):
            continue
        blocks.append(
            f'{job.get("name")} — {form_labels.get(job.get("form"), job.get("form"))}, '
            f'{workload_labels.get(job.get("workload"), job.get("workload"))}, '
            f'{contract_labels.get(job.get("contract"), job.get("contract"))}\n'
            f'{job.get("description")}\nOferuje: {job.get("benefits")}\n'
            f'Wymaga: {job.get("requirements")}\n{job.get("url")}'
        )
    return '\n\n'.join(blocks)


LIST_FORMATTERS = {
    'delegates': format_delegates,
    'pdi': format_pdi_people,
    'facilitators': format_facilitators,
    'jobs': format_jobs,
}

LIST_VALIDATORS = {
    'delegates': validate_delegates,
    'pdi': validate_pdi_people,
    'facilitators': validate_facilitators,
    'jobs': validate_jobs,
}


def display_from_draft(list_schema: str | None, value: Any) -> Any:
    """Grid text for a saved draft. An empty draft stays empty and does not show the form value."""
    if list_schema and isinstance(value, list):
        formatter = LIST_FORMATTERS.get(list_schema)
        if formatter:
            return formatter(value)
    if isinstance(value, dict) and isinstance(value.get('path'), str) and isinstance(value.get('name'), str):
        from django.core.files.storage import default_storage

        return {
            'url': default_storage.url(value['path']),
            'name': value['name'],
            'path': value['path'],
        }
    if value is None:
        return ''
    return serialize(value)


def normalize_form_value(column, raw: Any) -> Any:
    """Normalize draft/commit payload for a form-writable column."""
    if column.list_schema:
        validator = LIST_VALIDATORS.get(column.list_schema)
        if validator is None:
            raise CellValueError('Nieobsługiwana lista.')
        return validator(raw)
    from .values import normalize
    return normalize(column, raw)
