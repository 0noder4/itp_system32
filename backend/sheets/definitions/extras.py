"""Editable cells shared by the Opiekun, LG and FR sheets (one value per company)."""
from __future__ import annotations

from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG, STAFF_ROLE_OPIEKUN

from ..registry import (
    KIND_BOOL,
    KIND_LONGTEXT,
    KIND_NUMBER,
    KIND_TEXT,
    SOURCE_COMPUTED,
    SOURCE_EXTRA,
    ColumnDef,
    RowContext,
)

GROUP_CARE = 'OPIEKUN (edytowalne)'
GROUP_LG = 'LOGISTYKA (edytowalne)'

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


CARE_CAR_REGISTRATION = _extra('care.car_registration', 'Rejestracja auta', width=130)
CARE_CAR_MAKE = _extra('care.car_make', 'Marka auta', width=140)
CARE_DRIVER = _extra('care.driver', 'Kierowca (kontakt)', width=180)
CARE_SLOT = _extra(
    SLOT_KEY, 'Slot przyjazdu', width=130,
    help='Wspólna etykieta slotu. Kolumna „Firm w slocie” liczy firmy z tą samą etykietą.',
)
CARE_SLOT_LOAD = ColumnDef(
    key='care.slot_count', label='Firm w slocie', kind=KIND_NUMBER, source=SOURCE_COMPUTED,
    group=GROUP_CARE, width=110, getter=_slot_load, highlight='over_five',
    help='Podświetlenie, gdy w tym slocie jest więcej niż 5 firm.',
)
CARE_PICKUP = _extra('care.pickup', 'Odbiór zabudowy', kind=KIND_LONGTEXT, width=200)
CARE_LOGO_APPROVED = _extra(
    'care.logo_approved', 'Logo zatwierdzone', kind=KIND_BOOL, width=120, edit_roles=EDIT_LOGO,
    aggregate='count_true',
)
CARE_COMMENT = _extra('care.comment', 'Komentarz opiekuna', kind=KIND_LONGTEXT, width=240)
LG_EXTRA_ORDERS = _extra(
    'lg.extra_orders', 'Dodatkowe zamówienia', kind=KIND_LONGTEXT, width=220,
    edit_roles=EDIT_LG, group=GROUP_LG,
)

CARE_COLUMNS = (
    CARE_CAR_REGISTRATION,
    CARE_CAR_MAKE,
    CARE_DRIVER,
    CARE_SLOT,
    CARE_SLOT_LOAD,
    CARE_PICKUP,
    CARE_LOGO_APPROVED,
    CARE_COMMENT,
)
