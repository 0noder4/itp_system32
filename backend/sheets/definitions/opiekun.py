"""Opiekun sheet: own companies only, unless the user also has LG or FR."""
from __future__ import annotations

from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG, STAFF_ROLE_OPIEKUN

from ..registry import (
    KIND_LONGTEXT,
    KIND_TEXT,
    ROW_STAFF,
    SOURCE_COMPUTED,
    VIEW_MATRIX,
    ColumnDef,
    SheetDef,
    TabDef,
)
from .common import (
    COMPANY_RESIGNED,
    COMPANY_STATUS,
    IDENTITY_COLUMNS,
    STAGES_SUMMARY,
    STAND_COLUMNS,
)
from .extras import (
    ARRIVAL_SLOTS,
    CARE_ARRIVAL_DAY,
    CARE_BUILD_SIZE,
    CARE_BUILD_TONE,
    CARE_CAR_MAKE,
    CARE_CAR_REGISTRATION,
    CARE_COMMENT,
    CARE_DRIVER,
    CARE_FIRE_CERT_CHECKED,
    CARE_LOGO_APPROVED,
    CARE_PICKUP,
    CARE_PICKUP_TIME,
    CARE_SLOT,
    CARE_SLOT_LOAD,
    FIREMKA_CONTACT,
    FINAL_D1_AM,
    FINAL_D1_PM,
    FINAL_D2_AM,
    FINAL_D2_PM,
    FINAL_WELCOME,
    LG_EXTRA_ORDERS,
    MAIL1_EXTRA,
    MAIL1_LOGO,
    MAIL1_SENT,
    MAIL1_STANDARD,
    MAIL2_SENT,
    MAIL3_ARRIVAL,
    MAIL3_COURIER,
    MAIL3_HR,
    MAIL3_PEOPLE,
    MAIL3_SENT,
    MAIL4_HR,
    MAIL4_SENT,
    MAIL5_NOTES,
    MAIL5_SENT,
    MONTAGE_DATES,
    STAFF_MEAL_DAY1,
    STAFF_MEAL_DAY2,
    STAFF_MEAL_NOTE,
    STAFF_NAME,
    WELCOME_ALL_READY,
    WELCOME_BADGES_COUNT,
    WELCOME_BADGES_ISSUED,
    WELCOME_LUNCH_SUM,
    WELCOME_LUNCHES_COUNT,
    WELCOME_LUNCHES_ISSUED,
    montage_tab_title,
)
from .form_columns import (
    COMPANY_EMAIL,
    DELEGATES,
    EQUIPMENT_PAID,
    EQUIPMENT_TV_MOUNT,
    LUNCH_DAY1,
    LUNCH_DAY2,
    PACKAGE_BIN,
    PACKAGE_FRIEZE,
    PACKAGE_HANGER,
    PACKAGE_LIGHTS,
    PACKAGE_SOCKETS,
    PDI_EMAILS,
    PDI_EXTRA_TICKETS,
    PDI_TICKETS,
    SIGN_FIRE_CERT,
    SIGN_VISUAL,
    STAND_BROUGHT,
    STAND_COMPOSITION,
    STAND_OWN_BUILD,
)

_FIRM_SELECT = ('form', 'stand_details', 'representative', 'finaldata')
_FIRM_PREFETCH = (
    'finaldata__lunches',
    'finaldata__pdis__pdiattendees',
    'finaldata__pdis__exhibitors',
    'stand_details__equipment_selections__equipment_item',
)

_BUILD_COLUMNS = (
    STAND_OWN_BUILD,
    STAND_COMPOSITION,
    STAND_BROUGHT,
    SIGN_VISUAL,
    SIGN_FIRE_CERT,
    CARE_FIRE_CERT_CHECKED,
    CARE_BUILD_SIZE,
    CARE_CAR_REGISTRATION,
    CARE_CAR_MAKE,
    CARE_DRIVER,
    CARE_ARRIVAL_DAY,
    CARE_SLOT,
    CARE_SLOT_LOAD,
    CARE_PICKUP,
    CARE_PICKUP_TIME,
    CARE_BUILD_TONE,
    CARE_COMMENT,
)

_MAIL_COLUMNS = (
    MAIL1_SENT,
    PACKAGE_LIGHTS,
    PACKAGE_SOCKETS,
    PACKAGE_BIN,
    PACKAGE_HANGER,
    PACKAGE_FRIEZE,
    # equipment.qty.* wstawiane w visible_columns, tuż przed montażem TV
    EQUIPMENT_TV_MOUNT,
    EQUIPMENT_PAID,
    LG_EXTRA_ORDERS,
    MAIL1_STANDARD,
    MAIL1_EXTRA,
    MAIL1_LOGO,
    CARE_LOGO_APPROVED,
    LUNCH_DAY1,
    LUNCH_DAY2,
    MAIL2_SENT,
    DELEGATES,
    PDI_TICKETS,
    PDI_EXTRA_TICKETS,
    PDI_EMAILS,
    MAIL3_SENT,
    MAIL3_HR,
    MAIL3_COURIER,
    MAIL3_ARRIVAL,
    MAIL3_PEOPLE,
    MAIL4_HR,
    MAIL4_SENT,
    MAIL5_SENT,
    MAIL5_NOTES,
    FINAL_WELCOME,
    FINAL_D1_AM,
    FINAL_D1_PM,
    FINAL_D2_AM,
    FINAL_D2_PM,
)


_SLOT_HELP = (
    'Firmy z własną zabudową, które tego dnia przyjeżdżają w tym przedziale. '
    'W jednym przedziale najwyżej 5 firm. Dzień i slot wpisuje się na zakładce Główny. '
    'Odbiór zabudowy jest w kolumnach Kiedy odbiór i Godzina odbioru.'
)
_NO_SLOT_HELP = (
    'Firma ma ten dzień montażu, ale slot jest pusty, spoza listy 14–16, 16–18, 18–20, 20–22, '
    'albo w przedziale jest już 5 firm.'
)


def _matrix_column(key: str, label: str, width: int = 220, help: str = '') -> ColumnDef:
    return ColumnDef(
        key=key, label=label, kind=KIND_LONGTEXT, source=SOURCE_COMPUTED,
        getter=lambda ctx: '', width=width, help=help,
    )


MATRIX_COLUMNS = (
    _matrix_column('matrix.pos', 'l.p.', 56, help='Numer miejsca w przedziale godzin.'),
    *(
        _matrix_column(
            f'matrix.slot.{slot}',
            'Bez godziny' if slot == 'NO' else slot,
            240,
            help=_NO_SLOT_HELP if slot == 'NO' else _SLOT_HELP,
        )
        for slot in (*ARRIVAL_SLOTS, 'NO')
    ),
)


def _montage_tab(index: int) -> TabDef:
    day = MONTAGE_DATES[index]
    return TabDef(
        key=f'montaz_{index + 1}',
        title=montage_tab_title(day),
        columns=MATRIX_COLUMNS,
        view=VIEW_MATRIX,
        select_related=('stand_details',),
        frozen_columns=1,
    )


OPIEKUN_SHEET = SheetDef(
    key='opiekun',
    title='Opiekun',
    roles=frozenset({STAFF_ROLE_LG, STAFF_ROLE_FR}),
    scoped_roles=frozenset({STAFF_ROLE_OPIEKUN}),
    tabs=(
        TabDef(
            key='glowny',
            title='Główny',
            select_related=_FIRM_SELECT,
            prefetch_related=_FIRM_PREFETCH,
            columns=(
                *IDENTITY_COLUMNS,
                *STAND_COLUMNS,
                COMPANY_STATUS,
                COMPANY_EMAIL,
                FIREMKA_CONTACT,
                STAGES_SUMMARY,
                COMPANY_RESIGNED,
                *_BUILD_COLUMNS,
                *_MAIL_COLUMNS,
            ),
        ),
        TabDef(
            key='welcome',
            title='Welcome packi',
            select_related=('finaldata',),
            prefetch_related=('finaldata__lunches',),
            columns=(
                *IDENTITY_COLUMNS,
                *STAND_COLUMNS,
                COMPANY_RESIGNED,
                LUNCH_DAY1,
                LUNCH_DAY2,
                WELCOME_LUNCH_SUM,
                WELCOME_LUNCHES_ISSUED,
                WELCOME_LUNCHES_COUNT,
                MAIL3_PEOPLE,
                WELCOME_BADGES_ISSUED,
                WELCOME_BADGES_COUNT,
                WELCOME_ALL_READY,
            ),
        ),
        TabDef(
            key='obiady_besciakow',
            title='Obiady Beściaków',
            columns=(STAFF_NAME, STAFF_MEAL_NOTE, STAFF_MEAL_DAY1, STAFF_MEAL_DAY2),
            row_source=ROW_STAFF,
            frozen_columns=1,
        ),
        _montage_tab(0),
        _montage_tab(1),
        _montage_tab(2),
    ),
)
