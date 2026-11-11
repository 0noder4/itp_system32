"""FR sheets that were not in the logistics Master: company data, catalogue, money."""
from __future__ import annotations

from users.models import STAFF_ROLE_FR, STAFF_ROLE_LG

from ..registry import SheetDef, TabDef
from .common import IDENTITY_COLUMNS, STATUS_COLUMNS
from .form_columns import (
    CATALOGUE_LOGO,
    CATALOGUE_TEXT,
    COMPANY_ADDRESS,
    COMPANY_EMAIL,
    COMPANY_FULL_NAME,
    COMPANY_LANGUAGE,
    COMPANY_NIP,
    COMPANY_REPRESENTATIVE,
    EQUIPMENT_PAID,
    JOB_COUNT,
    JOB_LINES,
    JOB_PAID,
    JOBWALL_COST,
    LUNCH_EXTRA_COST,
    MONEY_TOTAL,
    ORDER_PDF,
    PUBLICATION,
)

FR_SHEET = SheetDef(
    key='fr',
    title='FR',
    roles=frozenset({STAFF_ROLE_FR, STAFF_ROLE_LG}),
    tabs=(
        TabDef(
            key='dane',
            title='Dane firmy',
            select_related=('form', 'basic_data', 'basic_data__adress', 'representative'),
            columns=(
                *IDENTITY_COLUMNS,
                *STATUS_COLUMNS,
                COMPANY_FULL_NAME,
                COMPANY_NIP,
                COMPANY_ADDRESS,
                COMPANY_EMAIL,
                COMPANY_REPRESENTATIVE,
                COMPANY_LANGUAGE,
            ),
        ),
        TabDef(
            key='katalog',
            title='Katalog i Jobwall',
            select_related=('form', 'description', 'website_publication'),
            prefetch_related=('jobwalls',),
            columns=(
                *IDENTITY_COLUMNS,
                *STATUS_COLUMNS,
                CATALOGUE_TEXT,
                CATALOGUE_LOGO,
                JOB_COUNT,
                JOB_PAID,
                JOB_LINES,
                PUBLICATION,
            ),
        ),
        TabDef(
            key='rozliczenia',
            title='Rozliczenia',
            select_related=('form', 'stand_details', 'finaldata'),
            prefetch_related=('stand_details__equipment_selections__equipment_item', 'finaldata__lunches', 'jobwalls'),
            columns=(
                *IDENTITY_COLUMNS,
                *STATUS_COLUMNS,
                EQUIPMENT_PAID,
                LUNCH_EXTRA_COST,
                JOBWALL_COST,
                MONEY_TOTAL,
                ORDER_PDF,
            ),
        ),
    ),
)
