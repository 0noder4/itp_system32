"""Opiekun sheet: own companies only, unless the user also has LG or FR."""
from __future__ import annotations

from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG, STAFF_ROLE_OPIEKUN

from ..registry import SheetDef, TabDef
from .common import IDENTITY_COLUMNS, STAND_COLUMNS, STATUS_COLUMNS
from .extras import CARE_COLUMNS, LG_EXTRA_ORDERS
from .form_columns import (
    COMPANY_EMAIL,
    COMPANY_REPRESENTATIVE,
    STAND_BROUGHT,
    STAND_COMPOSITION,
    STAND_OWN_BUILD,
    STAND_TYPE,
)

OPIEKUN_SHEET = SheetDef(
    key='opiekun',
    title='Opiekun',
    roles=frozenset({STAFF_ROLE_LG, STAFF_ROLE_FR}),
    scoped_roles=frozenset({STAFF_ROLE_OPIEKUN}),
    tabs=(
        TabDef(
            key='firmy',
            title='Moje firmy',
            select_related=('form', 'stand_details', 'representative'),
            columns=(
                *IDENTITY_COLUMNS,
                *STAND_COLUMNS,
                *STATUS_COLUMNS,
                COMPANY_EMAIL,
                COMPANY_REPRESENTATIVE,
                STAND_TYPE,
                STAND_OWN_BUILD,
                STAND_COMPOSITION,
                STAND_BROUGHT,
                *CARE_COLUMNS,
                LG_EXTRA_ORDERS,
            ),
        ),
    ),
)
