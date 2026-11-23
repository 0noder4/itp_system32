"""
Export Service
Business logic for exporting company data to CSV, CSV ZIP, and styled XLSX formats.
"""
from __future__ import annotations

import io
import logging
import zipfile
from typing import Any, Dict, List, Tuple

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Case, IntegerField, When
from django.utils import timezone

from companies.models import (
    ATTENDANCE_OPT,
    CARPET_CHOICE_CHOICES,
    COMPANY_STATUS_CHOICES,
    Company,
    CompanyInvitation,
    DIET_OPT,
    EquipmentItem,
    Lunch,
    Settings,
    STAND_TYPE_CHOICES,
    carpet_color_label,
    company_can_access_stage3,
)
from companies.pricing import (
    PACKAGE_LABELS_PL,
    calculate_company_costs,
    calculate_jobwall_breakdown,
)
from companies.utils.csv_generator import CSVGenerator

logger = logging.getLogger(__name__)

EXPORT_SECTIONS: Tuple[str, ...] = (
    'basic',
    'stage_1',
    'stage_2',
    'stage_3',
    'stage_4',
    'stage_5',
    'billing',
)

SECTION_TITLES: Dict[str, str] = {
    'basic': 'Dane podstawowe',
    'stage_1': 'Etap 1 - Faktura',
    'stage_2': 'Etap 2 - Stoisko',
    'stage_3': 'Etap 3 - Warsztaty',
    'stage_4': 'Etap 4 - Katalog',
    'stage_5': 'Etap 5 - Finał',
    'billing': 'Rozliczenia',
}

SECTION_CSV_FILENAMES: Dict[str, str] = {
    'basic': '01_dane_podstawowe.csv',
    'stage_1': '02_etap_1_faktura.csv',
    'stage_2': '03_etap_2_stoisko.csv',
    'stage_3': '04_etap_3_warsztaty.csv',
    'stage_4': '05_etap_4_katalog.csv',
    'stage_5': '06_etap_5_final.csv',
    'billing': '07_rozliczenia.csv',
}

GROUP_HEADER_BG: Dict[str, str] = {
    'INFORMACJE BAZOWE': '#FDBA74',
    'STATUSY': '#94A3B8',
    'DANE FIRMY (Etap 1)': '#FCD34D',
    'STOISKO (Etap 2)': '#93C5FD',
    'WYKŁADZINA (Etap 2)': '#D8B4FE',
    'WYPOSAŻENIE (Etap 2)': '#6EE7B7',
    'WARSZTATY (Etap 3)': '#A5B4FC',
    'KATALOG I JOBWALL (Etap 4)': '#86EFAC',
    'PRĄD (Etap 5)': '#C4B5FD',
    'OBIADY (Etap 5)': '#FDE047',
    'PRZYJAZD I DELEGACI (Etap 5)': '#FCA5A5',
    'ROZLICZENIE NETTO (PLN)': '#FCD34D',
}

_TOTAL_CELL_FILL = '#FEF3C7'
_FALLBACK_GROUP_BG = '#94A3B8'

# Column spec: (header, group_name, wrap_text)
ColumnSpec = Tuple[str, str, bool]

_IDENTITY_COLUMNS: List[ColumnSpec] = [
    ('ID', 'INFORMACJE BAZOWE', False),
    ('Nazwa', 'INFORMACJE BAZOWE', False),
]


def _lighten_hex(hex_color: str, amount: float = 0.45) -> str:
    """Blend a #RRGGBB color toward white so column headers stay softer than group bands."""
    raw = (hex_color or '').lstrip('#')
    if len(raw) != 6:
        return hex_color
    try:
        mix = min(1.0, max(0.0, amount))
        parts = [
            round(int(raw[i:i + 2], 16) + (255 - int(raw[i:i + 2], 16)) * mix)
            for i in (0, 2, 4)
        ]
        return f'#{parts[0]:02X}{parts[1]:02X}{parts[2]:02X}'
    except ValueError:
        return hex_color


def _get_related(obj: Any, attr: str) -> Any:
    """Safely access a reverse OneToOne relation without raising ObjectDoesNotExist."""
    try:
        return getattr(obj, attr)
    except (ObjectDoesNotExist, AttributeError):
        return None


def _format_decimal(value: Any) -> str:
    if value is None or value == '':
        return '0.00'
    return f'{value:.2f}'


class ExportService:
    """
    Service for exporting company form & billing data to CSV, CSV ZIP, or styled XLSX.
    """

    CHOICE_MAPPINGS = {
        'status': dict(COMPANY_STATUS_CHOICES),
        'stand_type': dict(STAND_TYPE_CHOICES),
        'carpet_choice': dict(CARPET_CHOICE_CHOICES),
    }

    STAND_TYPE_LABELS = {
        'provided_stand': 'Zabudowa ITP',
        'self_construction': 'Zabudowa własna',
    }

    STAGE_STATUS_LABELS = {
        'accepted': 'OK',
        'rejected': 'poprawki',
        'pending': 'oczekuje',
    }

    def __init__(self, user, filters: Dict[str, Any]):
        self.user = user
        self.company_ids = filters.get('company_ids') or []
        raw_sections = filters.get('sections')
        if raw_sections is None:
            self.sections = list(EXPORT_SECTIONS)
        else:
            requested = set(raw_sections)
            self.sections = [sec for sec in EXPORT_SECTIONS if sec in requested] or list(EXPORT_SECTIONS)

        self.settings = Settings.get_settings()
        self.equipment_items = list(
            EquipmentItem.objects.filter(is_active=True).order_by('category', 'name_pl')
        )
        self.equipment_headers = {
            item.id: f"{item.name_pl} (sztuk)" for item in self.equipment_items
        }
        self._invitation_languages: Dict[str, str] = {}

    def build_queryset(self):
        """Build optimized QuerySet for selected companies, preserving request order."""
        if not self.company_ids:
            return Company.objects.none()

        order = Case(
            *[When(id=pk, then=pos) for pos, pk in enumerate(self.company_ids)],
            output_field=IntegerField(),
        )

        queryset = (
            Company.objects.filter(id__in=self.company_ids)
            .select_related('representative', 'fr_resp', 'opiekun', 'form')
            .prefetch_related(
                'basic_data',
                'basic_data__adress',
                'stand_details',
                'stand_details__equipment_selections',
                'stand_details__equipment_selections__equipment_item',
                'stand_all',
                'feedback',
                'workshops',
                'workshops__facilitators',
                'description',
                'jobwalls',
                'website_publication',
                'finaldata',
                'finaldata__lunches',
                'finaldata__pdis',
                'finaldata__pdis__exhibitors',
            )
            .order_by(order)
        )

        logger.info(
            "Built queryset for export with %s requested company ids (sections=%s)",
            len(self.company_ids),
            self.sections,
        )
        return queryset

    def _load_invitation_languages(self, companies: List[Company]) -> Dict[str, str]:
        """Batch-load latest invitation language per company name (avoids N+1 queries)."""
        names = [c.name for c in companies if c.name]
        if not names:
            return {}
        langs: Dict[str, str] = {}
        rows = (
            CompanyInvitation.objects.filter(company_name__in=names)
            .order_by('created_at', 'id')
            .values_list('company_name', 'language')
        )
        for company_name, lang in rows:
            if lang in ('en', 'pl'):
                langs[company_name] = lang
        return langs

    def _company_language_label(self, company: Company) -> str:
        rep = company.representative
        if rep is not None and getattr(rep, 'language', None) in ('en', 'pl'):
            return rep.language.upper()
        inv_lang = self._invitation_languages.get(company.name)
        if inv_lang in ('en', 'pl'):
            return inv_lang.upper()
        return 'PL'

    def _format_full_name(self, first_name: str | None, last_name: str | None) -> str:
        parts = [p for p in (first_name, last_name) if p]
        return ' '.join(parts) if parts else ''

    def _format_attendance(self, attendance: str | None) -> str:
        return dict(ATTENDANCE_OPT).get(attendance or '', attendance or '')

    def _format_diet(self, diet: str | None) -> str:
        return dict(DIET_OPT).get(diet or '', diet or '')

    def _format_lunches_for_day(self, day_lunches: List[Lunch]) -> tuple[int, str]:
        if not day_lunches:
            return 0, ''
        total = sum(l.lunch_quantity for l in day_lunches)
        comment_counts: Dict[str, int] = {}
        for lunch in day_lunches:
            info = self._format_diet((lunch.diet_info or '').strip())
            if info:
                comment_counts[info] = comment_counts.get(info, 0) + lunch.lunch_quantity
        if not comment_counts:
            return total, str(total) if total else ''
        parts = [f"{text} ({count})" for text, count in comment_counts.items()]
        return total, f"{total} ({', '.join(parts)})"

    def _section_columns(self, section: str) -> List[ColumnSpec]:
        if section == 'basic':
            return [
                ('ID', 'INFORMACJE BAZOWE', False),
                ('Nazwa', 'INFORMACJE BAZOWE', False),
                ('Email', 'INFORMACJE BAZOWE', False),
                ('Status', 'INFORMACJE BAZOWE', False),
                ('Język', 'INFORMACJE BAZOWE', False),
                ('Przedstawiciel', 'INFORMACJE BAZOWE', False),
                ('Telefon przedstawiciela', 'INFORMACJE BAZOWE', False),
                ('Opiekun FR', 'INFORMACJE BAZOWE', False),
                ('Telefon FR', 'INFORMACJE BAZOWE', False),
                ('Opiekun firmy', 'INFORMACJE BAZOWE', False),
                ('Telefon opiekuna', 'INFORMACJE BAZOWE', False),
                ('Dzień 1 - Numer stoiska', 'STATUSY', False),
                ('Dzień 1 - Rozmiar stoiska', 'STATUSY', False),
                ('Dzień 2 - Numer stoiska', 'STATUSY', False),
                ('Dzień 2 - Rozmiar stoiska', 'STATUSY', False),
                ('Ukończone etapy', 'STATUSY', False),
                ('Statusy etapów (1–5)', 'STATUSY', True),
                ('Data wejścia do systemu', 'STATUSY', False),
            ]
        if section == 'stage_1':
            return [
                ('Pełna nazwa firmy', 'DANE FIRMY (Etap 1)', False),
                ('NIP', 'DANE FIRMY (Etap 1)', False),
                ('Ulica', 'DANE FIRMY (Etap 1)', False),
                ('Numer budynku', 'DANE FIRMY (Etap 1)', False),
                ('Numer lokalu', 'DANE FIRMY (Etap 1)', False),
                ('Miasto', 'DANE FIRMY (Etap 1)', False),
                ('Kod pocztowy', 'DANE FIRMY (Etap 1)', False),
                ('Kraj', 'DANE FIRMY (Etap 1)', False),
            ]
        if section == 'stage_2':
            cols: List[ColumnSpec] = [
                ('Typ stanowiska', 'STOISKO (Etap 2)', False),
                ('Wymiary zabudowy', 'STOISKO (Etap 2)', True),
                ('Tekst na fryzie', 'STOISKO (Etap 2)', False),
                ('Logo na fryz', 'STOISKO (Etap 2)', False),
                ('Wizualizacja zabudowy', 'STOISKO (Etap 2)', False),
                ('Certyfikat niepalności', 'STOISKO (Etap 2)', False),
                ('Przywóz własnego sprzętu', 'STOISKO (Etap 2)', True),
                ('Wykładzina - wybór', 'WYKŁADZINA (Etap 2)', False),
                ('Wykładzina - kolor', 'WYKŁADZINA (Etap 2)', False),
            ]
            for item in self.equipment_items:
                cols.append((self.equipment_headers[item.id], 'WYPOSAŻENIE (Etap 2)', False))
            cols.append(('Montaż TV', 'WYPOSAŻENIE (Etap 2)', False))
            return cols
        if section == 'stage_3':
            return [
                ('Poprowadzi warsztaty', 'WARSZTATY (Etap 3)', False),
                ('Nazwa warsztatu', 'WARSZTATY (Etap 3)', False),
                ('Opis warsztatu', 'WARSZTATY (Etap 3)', True),
                ('Preferowany dzień', 'WARSZTATY (Etap 3)', False),
                ('Preferowana godzina', 'WARSZTATY (Etap 3)', False),
                ('Umiejętności praktyczne', 'WARSZTATY (Etap 3)', True),
                ('Kierunki studiów', 'WARSZTATY (Etap 3)', True),
                ('Prowadzący', 'WARSZTATY (Etap 3)', True),
                ('Telefon ds. warsztatów', 'WARSZTATY (Etap 3)', False),
                ('Udogodnienia sali', 'WARSZTATY (Etap 3)', False),
                ('Uwagi do warsztatów', 'WARSZTATY (Etap 3)', True),
            ]
        if section == 'stage_4':
            return [
                ('Opis katalogowy', 'KATALOG I JOBWALL (Etap 4)', True),
                ('Logo katalogowe', 'KATALOG I JOBWALL (Etap 4)', False),
                ('Liczba ofert JobWall', 'KATALOG I JOBWALL (Etap 4)', False),
                ('Płatne oferty JobWall', 'KATALOG I JOBWALL (Etap 4)', False),
                ('Oferty JobWall', 'KATALOG I JOBWALL (Etap 4)', True),
                ('Publikacja na stronie', 'KATALOG I JOBWALL (Etap 4)', False),
            ]
        if section == 'stage_5':
            return [
                ('Urządzenia elektryczne podczas targów', 'PRĄD (Etap 5)', True),
                ('Łączna moc urządzeń', 'PRĄD (Etap 5)', False),
                ('Niska moc (≤100 W)', 'PRĄD (Etap 5)', False),
                ('Rezygnacja z obiadów', 'OBIADY (Etap 5)', False),
                ('Dzień 1 - obiady', 'OBIADY (Etap 5)', False),
                ('Ilość obiadów - dzień 1', 'OBIADY (Etap 5)', False),
                ('Dzień 2 - obiady', 'OBIADY (Etap 5)', False),
                ('Ilość obiadów - dzień 2', 'OBIADY (Etap 5)', False),
                ('Godzina przyjazdu - dzień 1', 'PRZYJAZD I DELEGACI (Etap 5)', False),
                ('Godzina przyjazdu - dzień 2', 'PRZYJAZD I DELEGACI (Etap 5)', False),
                ('Główny przedstawiciel', 'PRZYJAZD I DELEGACI (Etap 5)', False),
                ('Obecność głównego przedstawiciela', 'PRZYJAZD I DELEGACI (Etap 5)', False),
                ('Brak innych delegatów', 'PRZYJAZD I DELEGACI (Etap 5)', False),
                ('Delegaci firmy', 'PRZYJAZD I DELEGACI (Etap 5)', True),
                ('Obecność delegatów', 'PRZYJAZD I DELEGACI (Etap 5)', True),
            ]
        if section == 'billing':
            return [
                ('Pakiet / stoisko (netto)', 'ROZLICZENIE NETTO (PLN)', False),
                ('Dopłata za wyposażenie (netto)', 'ROZLICZENIE NETTO (PLN)', False),
                ('Dopłata za obiady (netto)', 'ROZLICZENIE NETTO (PLN)', False),
                ('Dopłata za JobWall (netto)', 'ROZLICZENIE NETTO (PLN)', False),
                ('Dodatkowe koszty (netto)', 'ROZLICZENIE NETTO (PLN)', False),
                ('Opis dodatkowych kosztów', 'ROZLICZENIE NETTO (PLN)', True),
                ('Suma netto (PLN)', 'ROZLICZENIE NETTO (PLN)', False),
            ]
        return []

    def _columns_for_sections(self, sections: List[str]) -> List[ColumnSpec]:
        cols: List[ColumnSpec] = []
        if 'basic' not in sections:
            cols.extend(_IDENTITY_COLUMNS)
        for sec in sections:
            cols.extend(self._section_columns(sec))
        return cols

    def _build_headers(self) -> List[str]:
        return [header for header, _group, _wrap in self._columns_for_sections(self.sections)]

    def _latest_feedback_map(self, company: Company) -> Dict[str, Any]:
        latest: Dict[str, Any] = {}
        for fb in company.feedback.all():
            current = latest.get(fb.form)
            if current is None or fb.id > current.id:
                latest[fb.form] = fb
        return latest

    def _extract_company_row(self, company: Company, sections: List[str]) -> Dict[str, Any]:
        """Build a flat dict of column values for the requested sections of one company."""
        latest_feedback = self._latest_feedback_map(company)
        sec_set = set(sections)
        row: Dict[str, Any] = {
            'ID': company.id,
            'Nazwa': company.name or '',
        }

        basic_data = _get_related(company, 'basic_data')
        stand_details = _get_related(company, 'stand_details')
        workshops = _get_related(company, 'workshops')
        description = _get_related(company, 'description')
        jobwalls = list(company.jobwalls.all())
        website_pub = _get_related(company, 'website_publication')
        finaldata = _get_related(company, 'finaldata')
        form_obj = _get_related(company, 'form')

        if 'basic' in sec_set:
            stands = list(company.stand_all.all())
            day1_stand = next((s for s in stands if s.day == 'day1'), None)
            day2_stand = next((s for s in stands if s.day == 'day2'), None)

            completed_count = 0
            if form_obj is not None:
                completed_count = sum(
                    1
                    for idx in range(1, 6)
                    if getattr(form_obj, f'stage_{idx}_completed', False)
                )

            data_exists = {
                1: basic_data is not None,
                2: stand_details is not None,
                3: workshops is not None,
                4: bool(jobwalls) or description is not None,
                5: finaldata is not None,
            }
            stage3_available = company_can_access_stage3(company)
            stage_parts: List[str] = []
            for idx in range(1, 6):
                if idx == 3 and not stage3_available:
                    stage_parts.append('3: nd.')
                    continue
                fb = latest_feedback.get(f'stage_{idx}')
                completed = bool(
                    form_obj is not None and getattr(form_obj, f'stage_{idx}_completed', False)
                )
                if fb is not None:
                    label = self.STAGE_STATUS_LABELS.get(fb.status, 'oczekuje')
                elif completed:
                    label = 'oczekuje'
                elif data_exists[idx]:
                    label = 'roboczy'
                else:
                    label = 'brak'
                stage_parts.append(f'{idx}: {label}')

            created_str = ''
            if company.created_at:
                dt = (
                    timezone.localtime(company.created_at)
                    if timezone.is_aware(company.created_at)
                    else company.created_at
                )
                created_str = dt.strftime('%d.%m.%Y')

            row.update({
                'Email': company.email or '',
                'Status': PACKAGE_LABELS_PL.get(company.status, company.status),
                'Język': self._company_language_label(company),
                'Przedstawiciel': self._format_full_name(
                    company.representative.first_name if company.representative else None,
                    company.representative.last_name if company.representative else None,
                ),
                'Telefon przedstawiciela': (
                    (company.representative.phone_number or '')
                    if company.representative
                    else ''
                ),
                'Opiekun FR': self._format_full_name(
                    company.fr_resp.first_name if company.fr_resp else None,
                    company.fr_resp.last_name if company.fr_resp else None,
                ),
                'Telefon FR': (
                    (company.fr_resp.phone_number or '')
                    if company.fr_resp
                    else ''
                ),
                'Opiekun firmy': self._format_full_name(
                    company.opiekun.first_name if company.opiekun else None,
                    company.opiekun.last_name if company.opiekun else None,
                ),
                'Telefon opiekuna': (
                    (company.opiekun.phone_number or '')
                    if company.opiekun
                    else ''
                ),
                'Dzień 1 - Numer stoiska': day1_stand.stand_number if day1_stand else '',
                'Dzień 1 - Rozmiar stoiska': (
                    day1_stand.get_stand_size_display() if day1_stand else ''
                ),
                'Dzień 2 - Numer stoiska': day2_stand.stand_number if day2_stand else '',
                'Dzień 2 - Rozmiar stoiska': (
                    day2_stand.get_stand_size_display() if day2_stand else ''
                ),
                'Ukończone etapy': f'{completed_count}/5',
                'Statusy etapów (1–5)': ' · '.join(stage_parts),
                'Data wejścia do systemu': created_str,
            })

        if 'stage_1' in sec_set:
            if 'stage_1' in latest_feedback and basic_data is not None:
                addr = _get_related(basic_data, 'adress')
                row.update({
                    'Pełna nazwa firmy': basic_data.full_name or '',
                    'NIP': basic_data.nip or '',
                    'Ulica': addr.street or '' if addr else '',
                    'Numer budynku': addr.home_number or '' if addr else '',
                    'Numer lokalu': addr.apt_number or '' if addr else '',
                    'Miasto': addr.city or '' if addr else '',
                    'Kod pocztowy': addr.postal_code or '' if addr else '',
                    'Kraj': addr.country or '' if addr else '',
                })

        if 'stage_2' in sec_set:
            equipment_totals = {header: 0 for header in self.equipment_headers.values()}
            if 'stage_2' in latest_feedback and stand_details is not None:
                sd = stand_details
                stand_type_display = self.STAND_TYPE_LABELS.get(
                    sd.stand_type,
                    self.CHOICE_MAPPINGS['stand_type'].get(sd.stand_type, sd.stand_type),
                )
                carpet_choice = getattr(sd, 'carpet_choice', None) or ''
                carpet_color = getattr(sd, 'carpet_color', None) or ''

                tv_mount_display = ''
                for selection in sd.equipment_selections.all():
                    item = selection.equipment_item
                    if item.id in self.equipment_headers:
                        header_name = self.equipment_headers[item.id]
                        equipment_totals[header_name] += selection.quantity
                    if getattr(item, 'code', None) == 'tv' and selection.quantity > 0:
                        mount = selection.mount_type
                        if mount == 'wall':
                            tv_mount_display = 'Ściana'
                        elif mount == 'stand':
                            tv_mount_display = 'Stojak'
                        else:
                            tv_mount_display = mount or ''

                row.update({
                    'Typ stanowiska': stand_type_display,
                    'Wymiary zabudowy': (
                        (sd.sc_details or '') if sd.stand_type == 'self_construction' else ''
                    ),
                    'Tekst na fryzie': sd.name_sign_text or '',
                    'Logo na fryz': 'Tak' if sd.logo_sign_file else 'Nie',
                    'Wizualizacja zabudowy': 'Tak' if sd.stand_visualization else 'Nie',
                    'Certyfikat niepalności': 'Tak' if sd.fire_cert else 'Nie',
                    'Przywóz własnego sprzętu': sd.brought_equipment or '',
                    'Wykładzina - wybór': (
                        self.CHOICE_MAPPINGS['carpet_choice'].get(carpet_choice, carpet_choice)
                        if carpet_choice
                        else ''
                    ),
                    'Wykładzina - kolor': carpet_color_label(carpet_choice, carpet_color),
                    'Montaż TV': tv_mount_display,
                })
            row.update(equipment_totals)

        if 'stage_3' in sec_set:
            if not company_can_access_stage3(company):
                row['Poprowadzi warsztaty'] = 'Nie dotyczy'
            elif 'stage_3' in latest_feedback and workshops is not None:
                ws = workshops
                if ws.workshop is True:
                    workshop_label = 'Tak'
                elif ws.workshop is False:
                    workshop_label = 'Nie'
                else:
                    workshop_label = ''

                if ws.workshop is True:
                    facilitators = (
                        list(ws.facilitators.all()) if hasattr(ws, 'facilitators') else []
                    )
                    facilitators_label = ' | '.join(
                        f"{(f.name or '').strip()} {(f.surname or '').strip()}".strip()
                        + (f" ({f.phone_number})" if f.phone_number else "")
                        for f in facilitators
                    )
                    amenities = []
                    if ws.room_projector:
                        amenities.append('Rzutnik')
                    if ws.room_hdmi:
                        amenities.append('Kabel HDMI')
                    if ws.room_other:
                        amenities.append(ws.room_other)

                    day_labels = dict(self.settings.get_day_opt())
                    preferred_day_label = (
                        day_labels.get(ws.preferred_day, ws.preferred_day)
                        if ws.preferred_day
                        else ''
                    )
                    preferred_time_label = (
                        ws.preferred_time.strftime('%H:%M') if ws.preferred_time else ''
                    )

                    row.update({
                        'Poprowadzi warsztaty': workshop_label,
                        'Nazwa warsztatu': ws.title or '',
                        'Opis warsztatu': ws.description or '',
                        'Preferowany dzień': preferred_day_label,
                        'Preferowana godzina': preferred_time_label,
                        'Umiejętności praktyczne': ws.skills or '',
                        'Kierunki studiów': ws.study_majors or '',
                        'Prowadzący': facilitators_label,
                        'Telefon ds. warsztatów': ws.contact_phone or '',
                        'Udogodnienia sali': ', '.join(amenities),
                        'Uwagi do warsztatów': ws.notes or '',
                    })
                else:
                    row.update({
                        'Poprowadzi warsztaty': workshop_label,
                        'Uwagi do warsztatów': ws.notes or '',
                    })

        if 'stage_4' in sec_set:
            if website_pub is None:
                pub_label = 'Brak'
            elif website_pub.last_error:
                pub_label = 'Błąd wysyłki'
            elif website_pub.last_exported_at:
                pub_label = (
                    'Wysłano na stronę' if website_pub.content_published else 'Szkic w Strapi'
                )
            else:
                pub_label = 'Nie wysłano'

            row['Publikacja na stronie'] = pub_label

            if 'stage_4' in latest_feedback:
                if description is not None:
                    row['Opis katalogowy'] = description.descr or ''
                    row['Logo katalogowe'] = 'Tak' if description.logo_file else 'Nie'
                jw_breakdown = calculate_jobwall_breakdown(
                    company, len(jobwalls), self.settings
                )
                row['Liczba ofert JobWall'] = len(jobwalls)
                row['Płatne oferty JobWall'] = jw_breakdown['extra_count']
                job_lines = [
                    f"{job.name} — {job.get_form_display()}, "
                    f"{job.get_workload_display()}, {job.get_contract_display()}"
                    + (f" ({job.url})" if job.url else '')
                    for job in jobwalls
                ]
                row['Oferty JobWall'] = '\n'.join(job_lines)

        if 'stage_5' in sec_set:
            if 'stage_5' in latest_feedback and finaldata is not None:
                fd = finaldata
                day_labels = dict(self.settings.get_day_opt())
                lunches = list(fd.lunches.all())
                by_day: Dict[str, List[Lunch]] = {'day1': [], 'day2': []}
                for lunch in lunches:
                    if lunch.day in by_day:
                        by_day[lunch.day].append(lunch)

                _, d1_formatted = self._format_lunches_for_day(by_day['day1'])
                _, d2_formatted = self._format_lunches_for_day(by_day['day2'])

                delegates_names = ''
                delegates_att = ''
                pdi = _get_related(fd, 'pdis')
                if pdi is not None:
                    exhibitors = list(pdi.exhibitors.all())
                    if exhibitors:
                        delegates_names = ' | '.join(
                            f"{self._format_full_name(e.name, e.surname)} ({e.phone_number})"
                            for e in exhibitors
                        )
                        delegates_att = ' | '.join(
                            self._format_attendance(e.attendance) for e in exhibitors
                        )

                row.update({
                    'Urządzenia elektryczne podczas targów': fd.el_devices or '',
                    'Łączna moc urządzeń': fd.el_power or '',
                    'Niska moc (≤100 W)': 'Tak' if fd.el_low_power else 'Nie',
                    'Rezygnacja z obiadów': 'Tak' if fd.lunches_declined else 'Nie',
                    'Dzień 1 - obiady': day_labels.get('day1', ''),
                    'Ilość obiadów - dzień 1': d1_formatted,
                    'Dzień 2 - obiady': day_labels.get('day2', ''),
                    'Ilość obiadów - dzień 2': d2_formatted,
                    'Godzina przyjazdu - dzień 1': (
                        fd.arrival_time_day1.strftime('%H:%M') if fd.arrival_time_day1 else ''
                    ),
                    'Godzina przyjazdu - dzień 2': (
                        fd.arrival_time_day2.strftime('%H:%M') if fd.arrival_time_day2 else ''
                    ),
                    'Główny przedstawiciel': (
                        self._format_full_name(fd.main_rep_name, fd.main_rep_surname)
                        + (f" ({fd.main_rep_phone})" if fd.main_rep_phone else '')
                    ),
                    'Obecność głównego przedstawiciela': self._format_attendance(
                        fd.main_rep_attendance
                    ),
                    'Brak innych delegatów': 'Tak' if fd.no_other_delegates else 'Nie',
                    'Delegaci firmy': delegates_names,
                    'Obecność delegatów': delegates_att,
                })

        if 'billing' in sec_set:
            costs = calculate_company_costs(company, self.settings)
            row.update({
                'Pakiet / stoisko (netto)': _format_decimal(costs['base_package']['cost']),
                'Dopłata za wyposażenie (netto)': _format_decimal(costs['equipment']['cost']),
                'Dopłata za obiady (netto)': _format_decimal(costs['lunches']['cost']),
                'Dopłata za JobWall (netto)': _format_decimal(costs['jobwall']['cost']),
                'Dodatkowe koszty (netto)': _format_decimal(costs['extra']['cost']),
                'Opis dodatkowych kosztów': costs['extra']['description'],
                'Suma netto (PLN)': _format_decimal(costs['total_cost']),
            })

        return row

    def generate_csv(self):
        """Stream UTF-8 BOM semicolon-delimited CSV for the merged selected sections."""
        queryset = self.build_queryset()
        headers = self._build_headers()
        generator = CSVGenerator(headers=headers)

        yield '\ufeff'
        yield generator.write_header()

        companies = list(queryset)
        self._invitation_languages = self._load_invitation_languages(companies)
        for company in companies:
            try:
                row_data = self._extract_company_row(company, self.sections)
                yield generator.write_row(row_data)
            except Exception as exc:
                logger.error(
                    "Error exporting company ID %s (%s): %s",
                    company.id,
                    company.name,
                    exc,
                    exc_info=True,
                )
                continue

    def generate_csv_zip(self) -> bytes:
        """Build a ZIP containing one UTF-8 BOM CSV file per selected section."""
        companies = list(self.build_queryset())
        self._invitation_languages = self._load_invitation_languages(companies)

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            for section in self.sections:
                col_specs = self._columns_for_sections([section])
                headers = [h for h, _grp, _wrap in col_specs]
                generator = CSVGenerator(headers=headers)
                lines = ['\ufeff', generator.write_header()]
                for company in companies:
                    try:
                        row_data = self._extract_company_row(company, [section])
                        lines.append(generator.write_row(row_data))
                    except Exception as exc:
                        logger.error(
                            "Error exporting section %s for company %s: %s",
                            section,
                            company.id,
                            exc,
                            exc_info=True,
                        )
                filename = SECTION_CSV_FILENAMES.get(section, f'{section}.csv')
                archive.writestr(filename, ''.join(lines).encode('utf-8'))

        return buffer.getvalue()

    def _build_xlsx_sheet_entry(
        self,
        sheet_name: str,
        sections: List[str],
        companies: List[Company],
    ) -> dict:
        col_specs = self._columns_for_sections(sections)
        width = len(col_specs)
        headers = [h for h, _g, _w in col_specs]
        groups = [g for _h, g, _w in col_specs]
        wrap_flags = [w for _h, _g, w in col_specs]

        group_fills = [GROUP_HEADER_BG.get(g, _FALLBACK_GROUP_BG) for g in groups]
        header_fills = [_lighten_hex(bg, 0.45) for bg in group_fills]

        rows: List[List[str]] = [groups, headers]
        fills: List[List[str | None]] = [group_fills, header_fills]
        bold: List[List[bool]] = [[True] * width, [True] * width]
        borders: List[List[bool]] = [[True] * width, [True] * width]
        centered: List[List[bool]] = [[True] * width, [False] * width]
        wrap_text: List[List[bool]] = [[True] * width, [True] * width]

        for company in companies:
            row_data = self._extract_company_row(company, sections)
            data_row: List[str] = []
            row_fills: List[str | None] = []
            row_bold: List[bool] = []
            row_wrap: List[bool] = []
            for header, _group, wrap in col_specs:
                val = row_data.get(header, '')
                text = '' if val is None else str(val)
                data_row.append(text)
                is_total = header == 'Suma netto (PLN)'
                row_fills.append(_TOTAL_CELL_FILL if is_total else None)
                row_bold.append(is_total)
                row_wrap.append(wrap or ('\n' in text))
            rows.append(data_row)
            fills.append(row_fills)
            bold.append(row_bold)
            borders.append([False] * width)
            centered.append([False] * width)
            wrap_text.append(row_wrap)

        col_widths: List[float] = []
        for idx, header in enumerate(headers):
            max_len = len(header)
            for data_row in rows[2:80]:
                cell_lines = str(data_row[idx]).splitlines() or ['']
                max_len = max(max_len, max(len(line) for line in cell_lines))
            col_widths.append(max(10.0, min(48.0, float(max_len) + 4.0)))

        return {
            'name': sheet_name,
            'rows': rows,
            'fills': fills,
            'bold': bold,
            'borders': borders,
            'centered': centered,
            'wrap_text': wrap_text,
            'col_widths': col_widths,
            'freeze_rows': 2,
            'freeze_cols': min(2, width),
        }

    def generate_xlsx(self, combine: str = 'merge') -> bytes:
        """Build a styled XLSX workbook (single merged sheet or one sheet per section)."""
        from sheets.xlsx import build_xlsx_workbook

        companies = list(self.build_queryset())
        self._invitation_languages = self._load_invitation_languages(companies)

        if combine == 'separate' and len(self.sections) > 1:
            sheets = [
                self._build_xlsx_sheet_entry(
                    SECTION_TITLES.get(sec, sec),
                    [sec],
                    companies,
                )
                for sec in self.sections
            ]
        else:
            sheets = [self._build_xlsx_sheet_entry('Firmy', self.sections, companies)]

        return build_xlsx_workbook(sheets)
