"""Columns shared by many sheets (company identity, stands, stage statuses, opiekun)."""
from __future__ import annotations

from companies.models import COMPANY_STATUS_CHOICES, DAY_OPT, SIZE_OPT, Company, Settings
from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG, STAFF_ROLE_OPIEKUN, User

from ..registry import (
    KIND_BOOL,
    KIND_LONGTEXT,
    KIND_SELECT,
    KIND_TEXT,
    KIND_USER,
    SOURCE_COMPUTED,
    SOURCE_CUSTOM,
    SOURCE_SYSTEM,
    ColumnDef,
    RowContext,
)

GROUP_BASE = 'INFORMACJE BAZOWE'
GROUP_STATUS = 'STATUSY'

COMPANY_STATUS_LABELS = {
    'main': 'Główny Partner',
    'partner': 'Partner',
    'basic': 'Wystawca',
}
SIZE_LABELS = dict(SIZE_OPT)

STAGE_STATUS_OPTIONS = (
    ('accepted', 'zaakceptowany'),
    ('pending', 'czeka na akceptację'),
    ('rejected', 'wymaga poprawek'),
    ('none', 'niewysłany'),
)
_STAGE_SHORT = {'accepted': 'OK', 'pending': 'czeka', 'rejected': 'popr.', 'none': '–'}


def user_display(user: User | None) -> str:
    if user is None:
        return ''
    full = f'{user.first_name} {user.last_name}'.strip()
    return full or user.username


def day_options() -> tuple[tuple[str, str], ...]:
    settings_obj = Settings.get_settings()
    dates = {'day1': settings_obj.day1_date, 'day2': settings_obj.day2_date}
    options = []
    for index, (code, fallback) in enumerate(DAY_OPT, start=1):
        date = dates.get(code)
        options.append((code, f'Dzień {index} ({date.strftime("%d.%m") if date else fallback})'))
    return tuple(options)


def opiekun_options() -> tuple[tuple[str, str], ...]:
    candidates = User.objects.filter(type='staff', is_active=True).order_by('first_name', 'last_name', 'username')
    return tuple(
        (str(u.id), user_display(u)) for u in candidates if STAFF_ROLE_OPIEKUN in u.get_staff_roles()
    )


def _set_opiekun(company: Company, value) -> None:
    company.opiekun_id = value
    company.save(update_fields=['opiekun', 'updated_at'])


def stage_status(ctx: RowContext, stage: int) -> str:
    fb = ctx.feedback(stage)
    return fb.status if fb else 'none'


def _days_label(ctx: RowContext) -> str:
    day1, day2 = ctx.stand(DAY_OPT[0][0]), ctx.stand(DAY_OPT[1][0])
    if day1 and day2:
        return 'Oba dni'
    if day1:
        return 'Dzień 1'
    if day2:
        return 'Dzień 2'
    return ''


def _stand_number(ctx: RowContext, day: str) -> str:
    stand = ctx.stand(day)
    if stand is None or stand.stand_number in ('', 'brak'):
        return ''
    return stand.stand_number


def stand_size_code(ctx: RowContext) -> str:
    for day, _label in DAY_OPT:
        stand = ctx.stand(day)
        if stand is not None and stand.stand_size:
            return stand.stand_size
    return ''


def _stand_size(ctx: RowContext) -> str:
    code = stand_size_code(ctx)
    return SIZE_LABELS.get(code, code) if code else ''


COMPANY_NAME = ColumnDef(
    key='company.name', label='Nazwa firmy', kind=KIND_TEXT, source=SOURCE_SYSTEM,
    getter=lambda ctx: ctx.company.name, group=GROUP_BASE, width=180,
)
COMPANY_STATUS = ColumnDef(
    key='company.status', label='Pakiet', kind=KIND_SELECT, source=SOURCE_SYSTEM,
    getter=lambda ctx: ctx.company.status, group=GROUP_STATUS, width=96,
    options=tuple((code, COMPANY_STATUS_LABELS.get(code, code)) for code, _ in COMPANY_STATUS_CHOICES),
)
COMPANY_FR = ColumnDef(
    key='company.fr', label='FR', kind=KIND_TEXT, source=SOURCE_SYSTEM, group=GROUP_BASE, width=120,
    getter=lambda ctx: ' | '.join(
        p for p in (user_display(ctx.company.fr_resp), getattr(ctx.company.fr_resp, 'phone_number', '')) if p
    ),
)
COMPANY_OPIEKUN = ColumnDef(
    key='company.opiekun', label='Opiekun', kind=KIND_USER, source=SOURCE_CUSTOM, group=GROUP_BASE, width=120,
    getter=lambda ctx: ctx.company.opiekun_id, setter=_set_opiekun, options=opiekun_options,
    edit_roles=frozenset({STAFF_ROLE_LG, STAFF_ROLE_FR}),
    help='Członek stowarzyszenia opiekujący się firmą (inna osoba niż FR).',
)
COMPANY_DAYS = ColumnDef(
    key='company.days', label='Dni', kind=KIND_TEXT, source=SOURCE_COMPUTED, group=GROUP_BASE, width=72,
    getter=_days_label,
)
STAND_DAY1 = ColumnDef(
    key='stand.day1', label='Stoisko\ndzień 1', kind=KIND_TEXT, source=SOURCE_SYSTEM, group=GROUP_BASE,
    width=72, getter=lambda ctx: _stand_number(ctx, 'day1'),
)
STAND_DAY2 = ColumnDef(
    key='stand.day2', label='Stoisko\ndzień 2', kind=KIND_TEXT, source=SOURCE_SYSTEM, group=GROUP_BASE,
    width=72, getter=lambda ctx: _stand_number(ctx, 'day2'),
)
STAND_SIZE = ColumnDef(
    key='stand.size', label='Rozmiar\nstoiska', kind=KIND_TEXT, source=SOURCE_SYSTEM, group=GROUP_BASE,
    width=72, getter=_stand_size,
)
STAGES_SUMMARY = ColumnDef(
    key='company.stages', label='Etapy 1–5', kind=KIND_TEXT, source=SOURCE_COMPUTED, group=GROUP_STATUS,
    width=200, getter=lambda ctx: ' · '.join(
        f'{n} {_STAGE_SHORT[stage_status(ctx, n)]}' for n in range(1, 6)
    ),
    help='OK = zaakceptowany, czeka = czeka na akceptację, popr. = wymaga poprawek, – = niewysłany',
)


def _stage_status_column(stage: int) -> ColumnDef:
    return ColumnDef(
        key=f'stage.{stage}.status', label=f'Status etapu {stage}', kind=KIND_SELECT, source=SOURCE_SYSTEM,
        group=GROUP_STATUS, width=150, options=STAGE_STATUS_OPTIONS,
        getter=lambda ctx: stage_status(ctx, stage),
    )


# One definition per key — always reuse these objects (Catalog rejects duplicates).
STAGE_STATUS = {n: _stage_status_column(n) for n in range(1, 6)}

_STAGE_CHOICES = (
    ('stage_1', '1 · firma'),
    ('stage_2', '2 · wyposażenie'),
    ('stage_3', '3 · warsztaty'),
    ('stage_4', '4 · katalog'),
    ('stage_5', '5 · finał'),
    ('completed', 'Zakończone'),
)


def _current_stage(ctx: RowContext) -> str:
    form = ctx.related('form')
    return form.current_stage if form is not None else ''


def _overdue_stages(ctx: RowContext) -> str:
    now = ctx.shared.get('now')
    deadlines = ctx.shared.get('deadlines') or {}
    if now is None:
        return ''
    late = [
        str(stage) for stage in range(1, 6)
        if deadlines.get(stage) is not None
        and now > deadlines[stage]
        and stage_status(ctx, stage) != 'accepted'
    ]
    return ', '.join(late)


def _rejection_notes(ctx: RowContext) -> str:
    notes = []
    for stage in range(1, 6):
        fb = ctx.feedback(stage)
        if fb is not None and fb.status == 'rejected' and fb.comment:
            notes.append(f'{stage}: {fb.comment}')
    return '\n'.join(notes)


COMPANY_STAGE = ColumnDef(
    key='company.stage', label='Bieżący\netap', kind=KIND_SELECT, source=SOURCE_SYSTEM,
    group=GROUP_STATUS, width=140, options=_STAGE_CHOICES, getter=_current_stage,
)
COMPANY_OVERDUE = ColumnDef(
    key='company.overdue', label='Po\nterminie', kind=KIND_TEXT, source=SOURCE_COMPUTED,
    group=GROUP_STATUS, width=80, getter=_overdue_stages, highlight='truthy',
    help='Numery etapów, których termin z ustawień minął, a etap nie jest zaakceptowany.',
)
COMPANY_RESIGNED = ColumnDef(
    key='company.resigned', label='Firma\nrezygnuje', kind=KIND_BOOL, source=SOURCE_COMPUTED,
    group=GROUP_STATUS, width=72, getter=lambda ctx: ctx.resigned, highlight='truthy',
)
COMPANY_REJECTIONS = ColumnDef(
    key='company.rejections', label='Uwagi do poprawek', kind=KIND_LONGTEXT, source=SOURCE_COMPUTED,
    group=GROUP_STATUS, width=220, getter=_rejection_notes,
)

# Pakiet + etapy w osobnej grupie STATUSY — bez drugiego paska INFORMACJE BAZOWE na końcu LG.
IDENTITY_COLUMNS = (COMPANY_NAME, COMPANY_FR, COMPANY_OPIEKUN)
STAND_COLUMNS = (COMPANY_DAYS, STAND_DAY1, STAND_DAY2, STAND_SIZE)
STATUS_COLUMNS = (
    COMPANY_STATUS,
    STAGES_SUMMARY,
    COMPANY_STAGE,
    COMPANY_OVERDUE,
    COMPANY_RESIGNED,
    COMPANY_REJECTIONS,
)
