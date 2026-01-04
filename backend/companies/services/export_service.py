"""
Export Service
Business logic for exporting company data to CSV format
"""
from companies.models import (
    Company, Form, BasicData, Address, ContactPerson,
    StandDetails, BasicEquipment, ExtendedEquipment,
    Description, FinalData, Lunch,
    PDI, PDIAttendee, Exhibitor,
    COMPANY_STATUS_CHOICES
)
from companies.utils.csv_generator import CSVGenerator
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)


class ExportService:
    """
    Service for exporting company form data to CSV.

    Handles:
    - QuerySet building with filters
    - Data denormalization (flattening nested structures)
    - Choice field mapping to human-readable values
    - Streaming CSV generation
    """

    CHOICE_MAPPINGS = {
        'status': dict(COMPANY_STATUS_CHOICES),
    }

    def __init__(self, user, filters: Dict[str, Any]):
        """
        Initialize export service.

        Args:
            user: User performing the export (for logging/auth)
            filters: Not used (kept for compatibility)
        """
        self.user = user

    def build_queryset(self):
        """
        Build optimized QuerySet - fetches all companies with all related data.

        Returns:
            Optimized Company QuerySet with all related data prefetched
        """
        queryset = Company.objects.select_related(
            'representative',
            'fr_resp',
            'form',
        ).prefetch_related(
            'basic_data',
            'basic_data__adress',
            'basic_data__contact_ppl',
            'stand_details',
            'stand_details__basic_equipment',
            'stand_details__ext_equipment',
            'description',
            'finaldata',
            'finaldata__lunches',
            'finaldata__pdis',
            'finaldata__pdis__pdiattendees',
            'finaldata__pdis__exhibitors',
        ).order_by('id')

        logger.info(f"Built queryset for export")

        return queryset

    def _format_full_name(self, first_name: str, last_name: str) -> str:
        """
        Safely format full name, handling None values.

        Args:
            first_name: First name (can be None)
            last_name: Last name (can be None)

        Returns:
            Formatted full name or empty string
        """
        parts = [p for p in [first_name, last_name] if p]
        return ' '.join(parts) if parts else ''

    def generate_csv(self):
        """
        Generate CSV using streaming iterator.

        Yields:
            CSV chunks (header + data rows) as strings
        """
        queryset = self.build_queryset()

        headers = self._build_headers()

        generator = CSVGenerator(headers=headers)

        yield '\ufeff'

        yield generator.write_header()

        exported_count = 0
        for company in queryset.iterator(chunk_size=100):
            rows = self._flatten_company_data(company)
            for row in rows:
                yield generator.write_row(row)
            exported_count += 1

        logger.info(f"CSV export completed for user {self.user.username} - {exported_count} companies exported")

    def _build_headers(self) -> List[str]:
        """
        Build CSV header - all fields always exported.
        Headers match frontend translations from pl.json.

        Returns:
            List of column headers
        """
        return [
            'ID', 'Nazwa', 'Przedstawiciel', 'FR',
            'Pełna nazwa firmy', 'NIP', 'Ulica', 'Numer budynku', 'Numer lokalu',
            'Miasto', 'Kod pocztowy', 'Kraj',
            'Imię', 'Nazwisko', 'Numer telefonu', 'Adres e-mail',
            'Własna zabudowa stoiska', 'Szczegóły zabudowy', 'Tekst na fryzie', 'Plik logo',
            'Liczba krzeseł', 'Lada', 'Kosz na śmieci', 'Wieszak',
            'Lada zwykła', 'Lada łukowa', 'Telewizor', 'Krzesło', 'Stół barowy', 'Krzesło barowe', 'Stojak na ulotki', 'Kolor wykładziny',
            'Potrzebujemy wjazdu na parking', 'Urządzenia elektryczne podczas targów', 'Łączna moc urządzeń',
            'Dzień 1', 'Ilość - dzień 1', 'Informacje o diecie - dzień 1',
            'Dzień 2', 'Ilość - dzień 2', 'Informacje o diecie - dzień 2',
            'Łączna liczba zaproszeń PDI', 'PDI - Imię i nazwisko uczestnika', 'PDI - E-mail uczestnika',
            'Wystawca - Imię i nazwisko', 'Wystawca - Telefon',
            'Opis',
        ]

    def _flatten_company_data(self, company: Company) -> List[Dict]:
        """
        Flatten company data into CSV rows.

        Handles 1:N relationships by creating multiple rows per company.
        Each row contains the same company base data but different related records.

        Args:
            company: Company instance with prefetched related data

        Returns:
            List of dictionaries representing CSV rows
        """
        base_data = {
            'ID': company.id,
            'Nazwa': company.name or '',
            'Przedstawiciel': self._format_full_name(
                company.representative.first_name if company.representative else None,
                company.representative.last_name if company.representative else None
            ),
            'FR': self._format_full_name(
                company.fr_resp.first_name if company.fr_resp else None,
                company.fr_resp.last_name if company.fr_resp else None
            ),
        }

        if hasattr(company, 'basic_data'):
            bd = company.basic_data
            base_data.update({
                'Pełna nazwa firmy': bd.full_name,
                'NIP': bd.nip,
            })

            if hasattr(bd, 'adress'):
                addr = bd.adress
                base_data.update({
                    'Ulica': addr.street,
                    'Numer budynku': addr.home_number,
                    'Numer lokalu': addr.apt_number or '',
                    'Miasto': addr.city,
                    'Kod pocztowy': addr.postal_code,
                    'Kraj': addr.country,
                })

        if hasattr(company, 'stand_details'):
            sd = company.stand_details
            base_data.update({
                'Własna zabudowa stoiska': 'Tak' if sd.self_construction else 'Nie',
                'Szczegóły zabudowy': sd.sc_details or '',
                'Tekst na fryzie': sd.name_sign_text or '',
                'Plik logo': sd.logo_sign_file.url if sd.logo_sign_file else '',
            })

            if hasattr(company.stand_details, 'basic_equipment'):
                be = company.stand_details.basic_equipment
                base_data.update({
                    'Liczba krzeseł': be.chair,
                    'Lada': 'Tak' if be.counter else 'Nie',
                    'Kosz na śmieci': 'Tak' if be.trashbin else 'Nie',
                    'Wieszak': 'Tak' if be.hanger else 'Nie',
                })

            if hasattr(company.stand_details, 'ext_equipment'):
                ee = company.stand_details.ext_equipment
                base_data.update({
                    'Lada zwykła': ee.counter or 0,
                    'Lada łukowa': ee.arched_counter or 0,
                    'Telewizor': ee.tv or 0,
                    'Krzesło': ee.chair or 0,
                    'Stół barowy': ee.bar_table or 0,
                    'Krzesło barowe': ee.bar_stool or 0,
                    'Stojak na ulotki': ee.leaflet_stand or 0,
                    'Kolor wykładziny': ee.carpet_color or '',
                })

        if hasattr(company, 'finaldata'):
            fd = company.finaldata
            base_data.update({
                'Potrzebujemy wjazdu na parking': 'Tak' if fd.gg_parking else 'Nie',
                'Urządzenia elektryczne podczas targów': fd.el_devices or '',
                'Łączna moc urządzeń': fd.el_power or '',
            })

            if hasattr(fd, 'pdis'):
                base_data['Łączna liczba zaproszeń PDI'] = fd.pdis.tickets_quantity

        if hasattr(company, 'description'):
            base_data['Opis'] = company.description.descr

        contacts = list(company.basic_data.contact_ppl.all()) if hasattr(company, 'basic_data') else []
        lunches = list(company.finaldata.lunches.all()) if hasattr(company, 'finaldata') else []
        pdi_attendees = list(company.finaldata.pdis.pdiattendees.all()) if hasattr(company, 'finaldata') and hasattr(company.finaldata, 'pdis') else []
        exhibitors = list(company.finaldata.pdis.exhibitors.all()) if hasattr(company, 'finaldata') and hasattr(company.finaldata, 'pdis') else []

        max_rows = max(
            len(contacts) or 1,
            len(lunches) or 1,
            len(pdi_attendees) or 1,
            len(exhibitors) or 1,
        )

        rows = []
        for i in range(max_rows):
            row = base_data.copy()

            if i < len(contacts):
                contact = contacts[i]
                row.update({
                    'Imię': contact.name,
                    'Nazwisko': contact.surname,
                    'Numer telefonu': contact.phone_number,
                    'Adres e-mail': contact.email,
                })

            if i < len(lunches):
                lunch = lunches[i]
                if i == 0:
                    row.update({
                        'Dzień 1': lunch.day,
                        'Ilość - dzień 1': lunch.lunch_quantity,
                        'Informacje o diecie - dzień 1': lunch.diet_info or '',
                    })
                elif i == 1:
                    row.update({
                        'Dzień 2': lunch.day,
                        'Ilość - dzień 2': lunch.lunch_quantity,
                        'Informacje o diecie - dzień 2': lunch.diet_info or '',
                    })

            if i < len(pdi_attendees):
                att = pdi_attendees[i]
                row.update({
                    'PDI - Imię i nazwisko uczestnika': self._format_full_name(att.name, att.surname),
                    'PDI - E-mail uczestnika': att.email or '',
                })

            if i < len(exhibitors):
                exh = exhibitors[i]
                row.update({
                    'Wystawca - Imię i nazwisko': self._format_full_name(exh.name, exh.surname),
                    'Wystawca - Telefon': exh.phone_number or '',
                })

            rows.append(row)

        return rows if rows else [base_data]
