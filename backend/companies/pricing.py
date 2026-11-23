from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.utils import timezone

from companies.models import Company, Settings


ZERO = Decimal('0.00')

STAND_SIZE_M2 = {
    'podstawowy': '4 m²',
    'standardowy': '6 m²',
    'rozszerzony': '8 m²',
    '12m2': '12 m²',
}

PACKAGE_LABELS_PL = {
    'basic': 'Wystawca',
    'partner': 'Partner',
    'main': 'Partner Główny',
}

PACKAGE_LABELS_EN = {
    'basic': 'Exhibitor',
    'partner': 'Partner',
    'main': 'Main Partner',
}


def _to_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    if value is None or value == '':
        return ZERO
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _get_settings(settings_obj: Settings | None = None) -> Settings:
    return settings_obj if settings_obj is not None else Settings.get_settings()


def _company_registration_date(company: Company) -> date:
    created_at = getattr(company, 'created_at', None)
    if created_at is None:
        return timezone.localdate()
    if timezone.is_aware(created_at):
        return timezone.localtime(created_at).date()
    return created_at.date()


def get_free_jobwall_count(company: Company, settings_obj: Settings | None = None) -> int:
    s = _get_settings(settings_obj)
    if company.status == 'main':
        return int(s.jobwall_free_main)
    if company.status == 'partner':
        return int(s.jobwall_free_partner)
    reg_date = _company_registration_date(company)
    if s.jobwall_early_deadline and reg_date <= s.jobwall_early_deadline:
        return int(s.jobwall_free_basic_early)
    return int(s.jobwall_free_basic_late)


def calculate_jobwall_breakdown(
    company: Company,
    jobwall_count: int,
    settings_obj: Settings | None = None,
) -> dict[str, Any]:
    s = _get_settings(settings_obj)
    free_count = get_free_jobwall_count(company, s)
    total_count = max(0, int(jobwall_count or 0))
    extra_count = max(0, total_count - free_count)
    pack_2_price = _to_decimal(s.jobwall_pack_2_price)
    pack_3_price = _to_decimal(s.jobwall_pack_3_price)
    max_extra = int(s.jobwall_max_extra_offers)

    pack: int | None = None
    if extra_count == 0:
        cost = ZERO
    elif extra_count <= 2:
        pack = 2
        cost = pack_2_price
    elif extra_count == 3:
        pack = 3
        cost = pack_3_price
    else:
        full_threes, rem = divmod(extra_count, 3)
        cost = (pack_3_price * full_threes) + (
            pack_2_price if rem in (1, 2) else ZERO
        )
        pack = extra_count

    return {
        'total_count': total_count,
        'free_count': free_count,
        'extra_count': extra_count,
        'max_extra_offers': max_extra,
        'max_total_offers': free_count + max_extra,
        'pack': pack,
        'pack_2_price': pack_2_price,
        'pack_3_price': pack_3_price,
        'cost': cost.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
    }


def calculate_jobwall_cost(
    company: Company,
    jobwall_count: int,
    settings_obj: Settings | None = None,
) -> Decimal:
    return calculate_jobwall_breakdown(company, jobwall_count, settings_obj)['cost']


def get_free_lunches_per_day(company: Company, settings_obj: Settings | None = None) -> int:
    s = _get_settings(settings_obj)
    if company.status == 'main':
        return int(s.lunches_free_main)
    if company.status == 'partner':
        return int(s.lunches_free_partner)
    return int(s.lunches_free_basic)


def _stand_unit_price(size: str, days: int, s: Settings) -> Decimal:
    two_days = days >= 2
    mapping = {
        'podstawowy': s.stand_price_4m2_2d if two_days else s.stand_price_4m2_1d,
        'standardowy': s.stand_price_6m2_2d if two_days else s.stand_price_6m2_1d,
        'rozszerzony': s.stand_price_8m2_2d if two_days else s.stand_price_8m2_1d,
        '12m2': s.stand_price_12m2_2d if two_days else s.stand_price_12m2_1d,
    }
    return _to_decimal(mapping.get(size, ZERO))


def calculate_base_package_cost(
    company: Company,
    settings_obj: Settings | None = None,
) -> dict[str, Any]:
    s = _get_settings(settings_obj)
    stands = list(company.stand_all.all())
    unique_days = sorted({st.day for st in stands if st.day})

    if company.status == 'main':
        cost = _to_decimal(s.main_partner_package_price)
        primary_size = stands[0].stand_size if stands else 'rozszerzony'
        return {
            'status': company.status,
            'package_label_pl': PACKAGE_LABELS_PL['main'],
            'package_label_en': PACKAGE_LABELS_EN['main'],
            'stand_size': primary_size,
            'stand_size_label': STAND_SIZE_M2.get(primary_size, '8 m²'),
            'days_count': 2,
            'days': unique_days or ['day1', 'day2'],
            'pending_stand_assignment': False,
            'planned_from_invitation': False,
            'individual_pricing': False,
            'cost': cost,
        }

    if company.status == 'partner':
        cost = _to_decimal(s.partner_package_price)
        primary_size = stands[0].stand_size if stands else 'rozszerzony'
        return {
            'status': company.status,
            'package_label_pl': PACKAGE_LABELS_PL['partner'],
            'package_label_en': PACKAGE_LABELS_EN['partner'],
            'stand_size': primary_size,
            'stand_size_label': STAND_SIZE_M2.get(primary_size, '8 m²'),
            'days_count': 2,
            'days': unique_days or ['day1', 'day2'],
            'pending_stand_assignment': False,
            'planned_from_invitation': False,
            'individual_pricing': False,
            'cost': cost,
        }

    if not stands:
        planned_size = (getattr(company, 'planned_stand_size', '') or '').strip()
        if planned_size in STAND_SIZE_M2:
            planned_days = 1 if getattr(company, 'planned_days_count', None) == 1 else 2
            planned_cost = _stand_unit_price(planned_size, planned_days, s)
            return {
                'status': company.status,
                'package_label_pl': PACKAGE_LABELS_PL.get(company.status, 'Wystawca'),
                'package_label_en': PACKAGE_LABELS_EN.get(company.status, 'Exhibitor'),
                'stand_size': planned_size,
                'stand_size_label': STAND_SIZE_M2[planned_size],
                'days_count': planned_days,
                'days': [],
                'pending_stand_assignment': False,
                'planned_from_invitation': True,
                'individual_pricing': planned_size == '12m2' and planned_cost == ZERO,
                'cost': planned_cost,
            }
        return {
            'status': company.status,
            'package_label_pl': PACKAGE_LABELS_PL.get(company.status, 'Wystawca'),
            'package_label_en': PACKAGE_LABELS_EN.get(company.status, 'Exhibitor'),
            'stand_size': None,
            'stand_size_label': None,
            'days_count': 0,
            'days': [],
            'pending_stand_assignment': True,
            'planned_from_invitation': False,
            'individual_pricing': False,
            'cost': ZERO,
        }

    sizes_seen = {st.stand_size for st in stands}
    if len(sizes_seen) == 1:
        size = stands[0].stand_size
        days_count = min(2, max(1, len(unique_days)))
        cost = _stand_unit_price(size, days_count, s)
        return {
            'status': company.status,
            'package_label_pl': PACKAGE_LABELS_PL.get(company.status, 'Wystawca'),
            'package_label_en': PACKAGE_LABELS_EN.get(company.status, 'Exhibitor'),
            'stand_size': size,
            'stand_size_label': STAND_SIZE_M2.get(size, size),
            'days_count': days_count,
            'days': unique_days,
            'pending_stand_assignment': False,
            'planned_from_invitation': False,
            'individual_pricing': size == '12m2' and cost == ZERO,
            'cost': cost,
        }

    total = sum((_stand_unit_price(st.stand_size, 1, s) for st in stands), ZERO)
    primary_size = stands[0].stand_size
    return {
        'status': company.status,
        'package_label_pl': PACKAGE_LABELS_PL.get(company.status, 'Wystawca'),
        'package_label_en': PACKAGE_LABELS_EN.get(company.status, 'Exhibitor'),
        'stand_size': primary_size,
        'stand_size_label': ', '.join(STAND_SIZE_M2.get(st.stand_size, st.stand_size) for st in stands),
        'days_count': len(unique_days),
        'days': unique_days,
        'pending_stand_assignment': False,
        'planned_from_invitation': False,
        'individual_pricing': False,
        'cost': _to_decimal(total),
    }


def calculate_equipment_breakdown(company: Company) -> dict[str, Any]:
    stand_details = getattr(company, 'stand_details', None)
    if not stand_details:
        return {'items': [], 'paid_items': [], 'cost': ZERO}

    items: list[dict[str, Any]] = []
    paid_items: list[dict[str, Any]] = []
    total = ZERO
    for sel in stand_details.equipment_selections.all():
        item = sel.equipment_item
        qty = int(sel.quantity or 0)
        included = int(item.included_quantity or 0)
        paid_qty = max(0, qty - included)
        unit_price = _to_decimal(item.price)
        line_cost = _to_decimal(unit_price * paid_qty)
        total += line_cost
        entry = {
            'id': item.id,
            'code': item.code,
            'name_pl': item.name_pl,
            'name_en': item.name_en,
            'quantity': qty,
            'included_quantity': included,
            'paid_quantity': paid_qty,
            'unit_price': unit_price,
            'cost': line_cost,
        }
        items.append(entry)
        if paid_qty > 0 and line_cost > ZERO:
            paid_items.append(entry)

    return {
        'items': items,
        'paid_items': paid_items,
        'cost': _to_decimal(total),
    }


def calculate_lunch_breakdown(
    company: Company,
    settings_obj: Settings | None = None,
) -> dict[str, Any]:
    s = _get_settings(settings_obj)
    free_per_day = get_free_lunches_per_day(company, s)
    unit_price = _to_decimal(s.lunch_price)
    final_data = getattr(company, 'finaldata', None)

    if not final_data or final_data.lunches_declined:
        return {
            'lunches_declined': bool(final_data and final_data.lunches_declined),
            'free_per_day': free_per_day,
            'unit_price': unit_price,
            'total_lunches': 0,
            'extra_lunches': 0,
            'days': [],
            'cost': ZERO,
        }

    total_lunches = 0
    extra_lunches = 0
    total_cost = ZERO
    days: list[dict[str, Any]] = []
    for lunch in sorted(final_data.lunches.all(), key=lambda x: x.day):
        qty = max(0, int(lunch.lunch_quantity or 0))
        paid_qty = max(0, qty - free_per_day)
        day_cost = _to_decimal(unit_price * paid_qty)
        total_lunches += qty
        extra_lunches += paid_qty
        total_cost += day_cost
        days.append({
            'day': lunch.day,
            'quantity': qty,
            'free_per_day': free_per_day,
            'extra_quantity': paid_qty,
            'cost': day_cost,
        })

    return {
        'lunches_declined': False,
        'free_per_day': free_per_day,
        'unit_price': unit_price,
        'total_lunches': total_lunches,
        'extra_lunches': extra_lunches,
        'days': days,
        'cost': _to_decimal(total_cost),
    }


def calculate_extra_cost_breakdown(company: Company) -> dict[str, Any]:
    return {
        'cost': _to_decimal(getattr(company, 'extra_cost', ZERO)),
        'description': (getattr(company, 'extra_cost_description', '') or '').strip(),
    }


def calculate_company_costs(
    company: Company,
    settings_obj: Settings | None = None,
) -> dict[str, Any]:
    s = _get_settings(settings_obj)
    base_package = calculate_base_package_cost(company, s)
    equipment = calculate_equipment_breakdown(company)
    jobwall_count = len(list(company.jobwalls.all()))
    jobwall = calculate_jobwall_breakdown(company, jobwall_count, s)
    lunches = calculate_lunch_breakdown(company, s)
    extra = calculate_extra_cost_breakdown(company)

    total_cost = _to_decimal(
        base_package['cost']
        + equipment['cost']
        + jobwall['cost']
        + lunches['cost']
        + extra['cost']
    )
    return {
        'company_id': company.id,
        'company_status': company.status,
        'base_package': base_package,
        'equipment': equipment,
        'jobwall': jobwall,
        'lunches': lunches,
        'extra': extra,
        'total_cost': total_cost,
    }


def serialize_company_cost_summary(
    company: Company,
    settings_obj: Settings | None = None,
) -> dict[str, Any]:
    summary = calculate_company_costs(company, settings_obj)
    bp = summary['base_package']
    eq = summary['equipment']
    jw = summary['jobwall']
    ln = summary['lunches']
    ex = summary['extra']

    return {
        'company_id': summary['company_id'],
        'company_status': summary['company_status'],
        'currency': 'PLN',
        'vat_excluded': True,
        'base_package': {
            'status': bp['status'],
            'package_label_pl': bp['package_label_pl'],
            'package_label_en': bp['package_label_en'],
            'stand_size': bp['stand_size'],
            'stand_size_label': bp['stand_size_label'],
            'days_count': bp['days_count'],
            'days': bp['days'],
            'pending_stand_assignment': bp['pending_stand_assignment'],
            'planned_from_invitation': bool(bp.get('planned_from_invitation', False)),
            'individual_pricing': bp['individual_pricing'],
            'cost': str(bp['cost']),
        },
        'equipment': {
            'paid_items': [
                {
                    'id': item['id'],
                    'code': item['code'],
                    'name_pl': item['name_pl'],
                    'name_en': item['name_en'],
                    'quantity': item['quantity'],
                    'included_quantity': item['included_quantity'],
                    'paid_quantity': item['paid_quantity'],
                    'unit_price': str(item['unit_price']),
                    'cost': str(item['cost']),
                }
                for item in eq['paid_items']
            ],
            'cost': str(eq['cost']),
        },
        'jobwall': {
            'total_count': jw['total_count'],
            'free_count': jw['free_count'],
            'extra_count': jw['extra_count'],
            'max_extra_offers': jw['max_extra_offers'],
            'max_total_offers': jw['max_total_offers'],
            'pack': jw['pack'],
            'pack_2_price': str(jw['pack_2_price']),
            'pack_3_price': str(jw['pack_3_price']),
            'cost': str(jw['cost']),
        },
        'lunches': {
            'lunches_declined': ln['lunches_declined'],
            'free_per_day': ln['free_per_day'],
            'unit_price': str(ln['unit_price']),
            'total_lunches': ln['total_lunches'],
            'extra_lunches': ln['extra_lunches'],
            'days': [
                {
                    'day': d['day'],
                    'quantity': d['quantity'],
                    'free_per_day': d['free_per_day'],
                    'extra_quantity': d['extra_quantity'],
                    'cost': str(d['cost']),
                }
                for d in ln['days']
            ],
            'cost': str(ln['cost']),
        },
        'extra': {
            'cost': str(ex['cost']),
            'description': ex['description'],
        },
        'total_cost': str(summary['total_cost']),
    }
