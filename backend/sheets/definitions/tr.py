"""Arkusz TR (warsztaty) — reference implementation for further sheets."""
from __future__ import annotations

from companies.models import STATUS_MAIN, STATUS_PARTENER
from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG, STAFF_ROLE_TR

from ..registry import (
    KIND_BOOL,
    KIND_LONGTEXT,
    KIND_SELECT,
    KIND_TEXT,
    KIND_TIME,
    SOURCE_EXTRA,
    SOURCE_SYSTEM,
    ColumnDef,
    RowContext,
    SheetDef,
    TabDef,
)
from ..values import serialize
from .common import IDENTITY_COLUMNS, STAGE_STATUS, STATUS_COLUMNS, STAND_COLUMNS, day_options

GROUP_FORM = 'WARSZTAT (z formularza firmy)'
GROUP_ROOM = 'SALA (z formularza firmy)'
GROUP_TR = 'USTALENIA TR (edytowalne)'

TR_EDIT = frozenset({STAFF_ROLE_TR})


def _workshop_attr(attr: str, default=''):
    def getter(ctx: RowContext):
        workshop = ctx.related('workshops')
        if workshop is None:
            return default
        return serialize(getattr(workshop, attr))
    return getter


def _decision(ctx: RowContext) -> str:
    workshop = ctx.related('workshops')
    if workshop is None or workshop.workshop is None:
        return 'undecided'
    return 'yes' if workshop.workshop else 'no'


def _facilitators(ctx: RowContext) -> str:
    workshop = ctx.related('workshops')
    if workshop is None:
        return ''
    lines = []
    for person in workshop.facilitators.all():
        name = f'{person.name} {person.surname}'.strip()
        lines.append(f'{name}, tel. {person.phone_number}' if person.phone_number else name)
    return '\n'.join(lines)


def _facilitator_descriptions(ctx: RowContext) -> str:
    workshop = ctx.related('workshops')
    if workshop is None:
        return ''
    return '\n'.join(
        f'{p.name} {p.surname}: {p.description}'.strip() for p in workshop.facilitators.all() if p.description
    )


def _system(key, label, attr, kind=KIND_TEXT, group=GROUP_FORM, width=160, default='', **kwargs):
    return ColumnDef(
        key=f'workshop.{key}', label=label, kind=kind, source=SOURCE_SYSTEM, group=group, width=width,
        getter=_workshop_attr(attr, default), source_fields=(f'Workshop.{attr}',), **kwargs,
    )


WORKSHOP_DECISION = ColumnDef(
    key='workshop.decision', label='Prowadzi warsztat?', kind=KIND_SELECT, source=SOURCE_SYSTEM,
    group=GROUP_FORM, width=130, getter=_decision, source_fields=('Workshop.workshop',),
    options=(('yes', 'tak'), ('no', 'nie'), ('undecided', 'brak decyzji')),
)
WORKSHOP_TITLE = _system('title', 'Nazwa warsztatu', 'title', width=220)
WORKSHOP_DESCRIPTION = _system('description', 'Opis warsztatu', 'description', kind=KIND_LONGTEXT, width=260)
WORKSHOP_PREFERRED_DAY = _system(
    'preferred_day', 'Preferowany dzień', 'preferred_day', kind=KIND_SELECT, width=140, options=day_options,
)
WORKSHOP_PREFERRED_TIME = _system('preferred_time', 'Preferowana godzina', 'preferred_time', kind=KIND_TIME,
                                  width=110, default=None)
WORKSHOP_SKILLS = _system('skills', 'Praktyczne umiejętności', 'skills', kind=KIND_LONGTEXT, width=220)
WORKSHOP_MAJORS = _system('study_majors', 'Mile widziane kierunki', 'study_majors', kind=KIND_LONGTEXT, width=200)
WORKSHOP_PROJECTOR = _system('room_projector', 'Rzutnik', 'room_projector', kind=KIND_BOOL, group=GROUP_ROOM,
                             width=80, default=False, aggregate='count_true')
WORKSHOP_HDMI = _system('room_hdmi', 'HDMI', 'room_hdmi', kind=KIND_BOOL, group=GROUP_ROOM, width=70,
                        default=False, aggregate='count_true')
WORKSHOP_ROOM_OTHER = _system('room_other', 'Inne udogodnienia', 'room_other', group=GROUP_ROOM, width=180)
WORKSHOP_PHONE = _system('contact_phone', 'Telefon ds. warsztatów', 'contact_phone', width=150)
WORKSHOP_PHONE_SAME = _system(
    'contact_phone_same_as_facilitator', 'Telefon = prowadzący', 'contact_phone_same_as_facilitator',
    kind=KIND_BOOL, width=110, default=False,
)
WORKSHOP_FACILITATORS = ColumnDef(
    key='workshop.facilitators', label='Prowadzący', kind=KIND_LONGTEXT, source=SOURCE_SYSTEM,
    group=GROUP_FORM, width=240, getter=_facilitators,
    source_fields=('WorkshopFacilitator.name', 'WorkshopFacilitator.surname', 'WorkshopFacilitator.phone_number'),
)
WORKSHOP_FACILITATOR_DESCRIPTIONS = ColumnDef(
    key='workshop.facilitator_descriptions', label='Opis prowadzących', kind=KIND_LONGTEXT, source=SOURCE_SYSTEM,
    group=GROUP_FORM, width=240, getter=_facilitator_descriptions,
    source_fields=('WorkshopFacilitator.description',),
)
WORKSHOP_NOTES = _system('notes', 'Uwagi firmy', 'notes', kind=KIND_LONGTEXT, width=220)

TR_ROOM = ColumnDef(
    key='tr.room', label='Sala', kind=KIND_TEXT, source=SOURCE_EXTRA, group=GROUP_TR, width=110, edit_roles=TR_EDIT,
)
TR_FINAL_DAY = ColumnDef(
    key='tr.final_day', label='Ustalony dzień', kind=KIND_SELECT, source=SOURCE_EXTRA, group=GROUP_TR, width=140,
    edit_roles=TR_EDIT, options=day_options,
)
TR_FINAL_TIME = ColumnDef(
    key='tr.final_time', label='Ustalona godzina', kind=KIND_TIME, source=SOURCE_EXTRA, group=GROUP_TR, width=120,
    edit_roles=TR_EDIT,
)
TR_STATUS = ColumnDef(
    key='tr.status', label='Status TR', kind=KIND_SELECT, source=SOURCE_EXTRA, group=GROUP_TR, width=140,
    edit_roles=TR_EDIT,
    options=(('todo', 'do ustalenia'), ('confirmed', 'potwierdzony'), ('cancelled', 'odwołany')),
)
TR_NOTES = ColumnDef(
    key='tr.notes', label='Uwagi TR', kind=KIND_LONGTEXT, source=SOURCE_EXTRA, group=GROUP_TR, width=240,
    edit_roles=TR_EDIT,
)


def _workshop_companies(qs):
    return qs.filter(status__in=(STATUS_MAIN, STATUS_PARTENER))


TR_SHEET = SheetDef(
    key='tr',
    title='TR – warsztaty',
    roles=frozenset({STAFF_ROLE_TR, STAFF_ROLE_LG, STAFF_ROLE_FR}),
    tabs=(
        TabDef(
            key='warsztaty',
            title='Warsztaty',
            row_filter=_workshop_companies,
            select_related=('workshops', 'form'),
            prefetch_related=('workshops__facilitators',),
            columns=(
                *IDENTITY_COLUMNS,
                *STAND_COLUMNS,
                *STATUS_COLUMNS,
                STAGE_STATUS[3],
                WORKSHOP_DECISION,
                WORKSHOP_TITLE,
                WORKSHOP_DESCRIPTION,
                WORKSHOP_PREFERRED_DAY,
                WORKSHOP_PREFERRED_TIME,
                WORKSHOP_FACILITATORS,
                WORKSHOP_FACILITATOR_DESCRIPTIONS,
                WORKSHOP_PHONE,
                WORKSHOP_PHONE_SAME,
                WORKSHOP_SKILLS,
                WORKSHOP_MAJORS,
                WORKSHOP_NOTES,
                WORKSHOP_PROJECTOR,
                WORKSHOP_HDMI,
                WORKSHOP_ROOM_OTHER,
                TR_ROOM,
                TR_FINAL_DAY,
                TR_FINAL_TIME,
                TR_STATUS,
                TR_NOTES,
            ),
        ),
    ),
)
