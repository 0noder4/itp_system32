"""Logistics sheet. FR can open every tab; LG-only columns stay read-only for FR."""
from __future__ import annotations

from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG

from ..registry import SheetDef, TabDef
from .common import (
    COMPANY_DAYS,
    COMPANY_FR,
    COMPANY_NAME,
    COMPANY_OPIEKUN,
    STAND_DAY1,
    STAND_DAY2,
    STAND_SIZE,
    STATUS_COLUMNS,
)
from .extras import (
    CARE_CAR_MAKE,
    CARE_CAR_REGISTRATION,
    CARE_COLUMNS,
    CARE_DRIVER,
    CARE_LOGO_APPROVED,
    CARE_PICKUP,
    CARE_SLOT,
    CARE_SLOT_LOAD,
    LG_EXTRA_ORDERS,
)
from .form_columns import (
    ARRIVAL_DAY1,
    ARRIVAL_DAY2,
    CARPET_CHOICE,
    CARPET_COLOR,
    COMPANY_EMAIL,
    COMPANY_REPRESENTATIVE,
    DELEGATES,
    EQUIPMENT_PAID,
    EQUIPMENT_TV_MOUNT,
    LUNCH_DAY1,
    LUNCH_DAY2,
    LUNCH_DECLINED,
    LUNCH_DIET,
    LUNCH_EXTRA_COST,
    LUNCH_EXTRA_DAY1,
    LUNCH_EXTRA_DAY2,
    MAIN_REP_ATTENDANCE,
    MAIN_REP_NAME,
    MAIN_REP_PHONE,
    MAIN_REP_SURNAME,
    NO_OTHER_DELEGATES,
    PACKAGE_BIN,
    PACKAGE_FRIEZE,
    PACKAGE_HANGER,
    PACKAGE_LIGHTS,
    PACKAGE_SOCKETS,
    PDI_EMAILS,
    PDI_PEOPLE,
    PDI_TICKETS,
    POWER_DEVICES,
    POWER_LOW,
    POWER_TOTAL,
    SIGN_FIRE_CERT,
    SIGN_LOGO,
    SIGN_TEXT,
    SIGN_VISUAL,
    STAND_BROUGHT,
    STAND_COMPOSITION,
    STAND_OWN_BUILD,
    STAND_POWER_ACK,
    STAND_TYPE,
)

# Główny: kto i gdzie — zamrożone (kolejność jak A–H w Masterze, bez pakietu).
_GLOWNY_PIN = (
    COMPANY_NAME,
    COMPANY_OPIEKUN,
    COMPANY_FR,
    COMPANY_DAYS,
    STAND_DAY1,
    STAND_DAY2,
    STAND_SIZE,
)
# Pakiet + statusy etapów — tylko na końcu Głównego (grupa STATUSY).
_GLOWNY_TAIL = STATUS_COLUMNS

_STAND_SELECT = ('form', 'stand_details')
_STAND_PREFETCH = ('stand_details__equipment_selections__equipment_item',)
_FINAL_SELECT = ('form', 'finaldata', 'finaldata__pdis')

# Krótki początek jak na roboczych kartach Excela (bez etapów z przodu).
_PLACE = (COMPANY_NAME, COMPANY_DAYS, STAND_DAY1, STAND_DAY2, STAND_SIZE)

LG_SHEET = SheetDef(
    key='lg',
    title='LG',
    roles=frozenset({STAFF_ROLE_LG, STAFF_ROLE_FR}),
    tabs=(
        TabDef(
            key='glowny',
            title='Główny',
            frozen_columns=7,
            select_related=_STAND_SELECT + ('finaldata',),
            prefetch_related=_STAND_PREFETCH,
            columns=(
                *_GLOWNY_PIN,
                STAND_TYPE,
                STAND_OWN_BUILD,
                STAND_COMPOSITION,
                STAND_BROUGHT,
                PACKAGE_LIGHTS,
                PACKAGE_SOCKETS,
                PACKAGE_BIN,
                PACKAGE_HANGER,
                PACKAGE_FRIEZE,
                # equipment.qty.* wstawiane w visible_columns
                EQUIPMENT_TV_MOUNT,
                EQUIPMENT_PAID,
                LG_EXTRA_ORDERS,
                POWER_DEVICES,
                POWER_TOTAL,
                POWER_LOW,
                STAND_POWER_ACK,
                *_GLOWNY_TAIL,
            ),
        ),
        TabDef(
            key='wyposazenie',
            title='Wyposażenie',
            select_related=_STAND_SELECT,
            prefetch_related=_STAND_PREFETCH,
            columns=(*_PLACE, EQUIPMENT_TV_MOUNT, EQUIPMENT_PAID),
        ),
        TabDef(
            key='fryz',
            title='Fryz',
            select_related=_STAND_SELECT,
            columns=(
                *_PLACE,
                STAND_TYPE,
                STAND_OWN_BUILD,
                SIGN_TEXT,
                SIGN_LOGO,
                SIGN_VISUAL,
                SIGN_FIRE_CERT,
                CARE_LOGO_APPROVED,
            ),
        ),
        TabDef(
            key='wykladziny',
            title='Wykładziny',
            select_related=_STAND_SELECT,
            columns=(*_PLACE, CARPET_CHOICE, CARPET_COLOR),
        ),
        TabDef(
            key='przyjazdy',
            title='Przyjazdy',
            select_related=('form', 'finaldata', 'stand_details'),
            columns=(
                *_PLACE,
                STAND_OWN_BUILD,
                ARRIVAL_DAY1,
                ARRIVAL_DAY2,
                CARE_CAR_REGISTRATION,
                CARE_CAR_MAKE,
                CARE_DRIVER,
                CARE_SLOT,
                CARE_SLOT_LOAD,
                CARE_PICKUP,
            ),
        ),
        TabDef(
            key='obiady',
            title='Obiady',
            select_related=('form', 'finaldata'),
            prefetch_related=('finaldata__lunches',),
            columns=(
                COMPANY_NAME,
                COMPANY_DAYS,
                LUNCH_DECLINED,
                LUNCH_DAY1,
                LUNCH_DAY2,
                LUNCH_EXTRA_DAY1,
                LUNCH_EXTRA_DAY2,
                LUNCH_DIET,
                LUNCH_EXTRA_COST,
            ),
        ),
        TabDef(
            key='delegaci',
            title='Delegaci i PDI',
            select_related=_FINAL_SELECT,
            prefetch_related=('finaldata__pdis__pdiattendees', 'finaldata__pdis__exhibitors'),
            columns=(
                COMPANY_NAME,
                COMPANY_DAYS,
                MAIN_REP_NAME,
                MAIN_REP_SURNAME,
                MAIN_REP_PHONE,
                MAIN_REP_ATTENDANCE,
                NO_OTHER_DELEGATES,
                DELEGATES,
                PDI_TICKETS,
                PDI_PEOPLE,
                PDI_EMAILS,
            ),
        ),
        TabDef(
            key='opiekunowie',
            title='Opiekunowie',
            select_related=('form', 'representative', 'fr_resp', 'opiekun'),
            columns=(
                COMPANY_NAME,
                COMPANY_OPIEKUN,
                COMPANY_FR,
                COMPANY_EMAIL,
                COMPANY_REPRESENTATIVE,
                *CARE_COLUMNS,
                LG_EXTRA_ORDERS,
            ),
        ),
    ),
)
