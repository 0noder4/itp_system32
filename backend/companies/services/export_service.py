"""
Export Service
Business logic for exporting company data to CSV format
"""
from companies.models import (
    Company, Form, BasicData, Address, Stand,
    StandDetails, EquipmentItem, EquipmentSelection,
    Description, FinalData, Lunch,
    PDI, PDIAttendee, Exhibitor, Workshop, Jobwall,
    COMPANY_STATUS_CHOICES, STAND_TYPE_CHOICES
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
        'stand_type': dict(STAND_TYPE_CHOICES),
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
            'stand_details',
            'stand_details__equipment_selections',
            'stand_details__equipment_selections__equipment_item',
            'stand_all',
            'workshops',
            'jobwalls',
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

    def _safe_file_url(self, file_field) -> str:
        """
        Safely get URL from FileField, handling missing/corrupted files.

        Args:
            file_field: Django FileField or ImageField

        Returns:
            File URL or empty string if file doesn't exist
        """
        if not file_field:
            return ''

        try:
            # Check if file exists and has a valid URL
            if hasattr(file_field, 'url') and file_field.name:
                return file_field.url
        except (ValueError, AttributeError) as e:
            logger.warning(f"Error accessing file URL: {str(e)}")
            return ''

        return ''

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
        error_count = 0

        for company in queryset.iterator(chunk_size=100):
            try:
                rows = self._flatten_company_data(company)
                for row in rows:
                    yield generator.write_row(row)
                exported_count += 1
            except Exception as e:
                error_count += 1
                logger.error(
                    f"Error exporting company ID {company.id} ({company.name}): {str(e)}",
                    exc_info=True
                )
                # Continue with next company instead of failing entire export
                continue

        logger.info(
            f"CSV export completed for user {self.user.username} - "
            f"{exported_count} companies exported successfully, {error_count} errors"
        )

    def _build_headers(self) -> List[str]:
        """
        Build CSV header - all fields always exported.
        Headers match frontend translations from pl.json.

        Returns:
            List of column headers
        """
        return [
            'ID', 'Nazwa', 'Email', 'Status', 'Przedstawiciel', 'FR',
            # Basic Data (Stage 1)
            'Pełna nazwa firmy', 'NIP', 'Ulica', 'Numer budynku', 'Numer lokalu',
            'Miasto', 'Kod pocztowy', 'Kraj',
            # Stand Info
            'Dzień targów', 'Numer stoiska', 'Rozmiar stoiska',
            # Stand Details (Stage 2)
            'Typ stanowiska', 'Szczegóły zabudowy', 'Tekst na fryzie', 'Logo na szyldzie (URL)', 'Certyfikat niepalności',
            # Equipment (Furniture) - Total quantities (package + ordered)
            'Lada łukowa (sztuk)', 'Krzesło barowe (sztuk)', 'Krzesło (sztuk)',
            'Stolik kawowy (sztuk)', 'Telewizor (sztuk)', 'Stojak na ulotki (sztuk)',
            'Inne wyposażenie',
            # Workshops (Stage 3)
            'Poprowadzi warsztaty', 'Uwagi do warsztatów',
            # Jobwall (Stage 4)
            'Oferty pracy',
            # Final Data (Stage 5)
            'Urządzenia elektryczne podczas targów', 'Łączna moc urządzeń',
            'Dzień 1 - obiady', 'Ilość obiadów - dzień 1', 'Informacje o diecie - dzień 1',
            'Dzień 2 - obiady', 'Ilość obiadów - dzień 2', 'Informacje o diecie - dzień 2',
            'Łączna liczba zaproszeń PDI', 'PDI - Uczestnicy', 'Delegaci firmy',
            # Marketing (Stage 4)
            'Opis firmy do katalogu', 'Logo do katalogu (URL)',
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

        Raises:
            Exception: If critical data extraction fails
        """
        try:
            base_data = {
                'ID': company.id,
                'Nazwa': company.name or '',
                'Email': company.email or '',
                'Status': self.CHOICE_MAPPINGS['status'].get(company.status, company.status),
                'Przedstawiciel': self._format_full_name(
                    company.representative.first_name if company.representative else None,
                    company.representative.last_name if company.representative else None
                ),
                'FR': self._format_full_name(
                    company.fr_resp.first_name if company.fr_resp else None,
                    company.fr_resp.last_name if company.fr_resp else None
                ),
            }
        except AttributeError as e:
            logger.error(f"Error extracting base data for company {company.id}: {str(e)}")
            raise

        # Basic Data (Stage 1)
        if hasattr(company, 'basic_data') and company.basic_data:
            try:
                bd = company.basic_data
                base_data.update({
                    'Pełna nazwa firmy': bd.full_name or '',
                    'NIP': bd.nip or '',
                })

                if hasattr(bd, 'adress') and bd.adress:
                    addr = bd.adress
                    base_data.update({
                        'Ulica': addr.street or '',
                        'Numer budynku': addr.home_number or '',
                        'Numer lokalu': addr.apt_number or '',
                        'Miasto': addr.city or '',
                        'Kod pocztowy': addr.postal_code or '',
                        'Kraj': addr.country or '',
                    })
            except AttributeError as e:
                logger.warning(f"Error extracting basic data for company {company.id}: {str(e)}")

        # Stand information
        try:
            stands = list(company.stand_all.all())
            if stands:
                base_data.update({
                    'Dzień targów': ', '.join([s.get_day_display() for s in stands]),
                    'Numer stoiska': ', '.join([str(s.stand_number) for s in stands]),
                    'Rozmiar stoiska': ', '.join([s.get_stand_size_display() for s in stands]),
                })
        except (AttributeError, ValueError) as e:
            logger.warning(f"Error extracting stand info for company {company.id}: {str(e)}")

        # Stand Details (Stage 2)
        if hasattr(company, 'stand_details') and company.stand_details:
            try:
                sd = company.stand_details
                stand_type_display = self.CHOICE_MAPPINGS['stand_type'].get(sd.stand_type, sd.stand_type)
                base_data.update({
                    'Typ stanowiska': stand_type_display,
                    'Tekst na fryzie': sd.name_sign_text or '',
                    'Logo na szyldzie (URL)': self._safe_file_url(sd.logo_sign_file),
                })

                # Self-construction specific fields (only for 'self_construction' type)
                if sd.stand_type == 'self_construction':
                    base_data.update({
                        'Szczegóły zabudowy': sd.sc_details or '',
                        'Certyfikat niepalności': self._safe_file_url(sd.fire_cert),
                    })
                else:
                    base_data.update({
                        'Szczegóły zabudowy': '',
                        'Certyfikat niepalności': '',
                    })

                # Equipment selections - with TOTAL quantities (included + ordered)
                equipment_selections = list(sd.equipment_selections.all())
                if equipment_selections:
                    # Initialize equipment counters
                    equipment_totals = {
                        'Lada łukowa (sztuk)': 0,
                        'Krzesło barowe (sztuk)': 0,
                        'Krzesło (sztuk)': 0,
                        'Stolik kawowy (sztuk)': 0,
                        'Telewizor (sztuk)': 0,
                        'Stojak na ulotki (sztuk)': 0,
                    }
                    other_equipment = []

                    # Map equipment names to CSV columns
                    equipment_name_mapping = {
                        'lada łukowa': 'Lada łukowa (sztuk)',
                        'curved counter': 'Lada łukowa (sztuk)',
                        'krzesło barowe': 'Krzesło barowe (sztuk)',
                        'bar stool': 'Krzesło barowe (sztuk)',
                        'krzesło': 'Krzesło (sztuk)',
                        'chair': 'Krzesło (sztuk)',
                        'stolik kawowy': 'Stolik kawowy (sztuk)',
                        'coffee table': 'Stolik kawowy (sztuk)',
                        'telewizor': 'Telewizor (sztuk)',
                        'tv': 'Telewizor (sztuk)',
                        'television': 'Telewizor (sztuk)',
                        'stojak na ulotki': 'Stojak na ulotki (sztuk)',
                        'brochure stand': 'Stojak na ulotki (sztuk)',
                    }

                    for selection in equipment_selections:
                        item = selection.equipment_item
                        # Calculate TOTAL: included_quantity (from package) + quantity (ordered)
                        total_quantity = item.included_quantity + selection.quantity

                        # Try to match equipment name to predefined columns
                        item_name_lower = item.name_pl.lower().strip()
                        matched = False

                        for key, column_name in equipment_name_mapping.items():
                            if key in item_name_lower:
                                equipment_totals[column_name] += total_quantity
                                matched = True
                                break

                        # If not matched, add to "other equipment"
                        if not matched:
                            other_equipment.append(f"{item.name_pl} x{total_quantity}")

                    # Update base_data with equipment totals
                    base_data.update(equipment_totals)

                    # Add other equipment as comma-separated list
                    if other_equipment:
                        base_data['Inne wyposażenie'] = ', '.join(other_equipment)

            except (AttributeError, ValueError, TypeError) as e:
                logger.warning(f"Error extracting stand details for company {company.id}: {str(e)}")

        # Workshops (Stage 3)
        if hasattr(company, 'workshops') and company.workshops:
            try:
                workshop = company.workshops
                base_data.update({
                    'Poprowadzi warsztaty': 'Tak' if workshop.workshop else 'Nie',
                    'Uwagi do warsztatów': workshop.notes or '',
                })
            except AttributeError as e:
                logger.warning(f"Error extracting workshop data for company {company.id}: {str(e)}")

        # Jobwall (Stage 4)
        try:
            jobwalls = list(company.jobwalls.all())
            if jobwalls:
                jobwall_list = []
                for jw in jobwalls:
                    jobwall_list.append(
                        f"{jw.name} ({jw.get_form_display()}, {jw.get_workload_display()}, {jw.get_contract_display()})"
                    )
                base_data['Oferty pracy'] = '; '.join(jobwall_list)
        except (AttributeError, ValueError) as e:
            logger.warning(f"Error extracting jobwall data for company {company.id}: {str(e)}")

        # Final Data (Stage 5)
        if hasattr(company, 'finaldata') and company.finaldata:
            try:
                fd = company.finaldata
                base_data.update({
                    'Urządzenia elektryczne podczas targów': fd.el_devices or '',
                    'Łączna moc urządzeń': fd.el_power or '',
                })

                # Lunches
                try:
                    lunches = list(fd.lunches.all())
                    for i, lunch in enumerate(lunches[:2]):  # Max 2 days
                        if i == 0:
                            base_data.update({
                                'Dzień 1 - obiady': lunch.get_day_display(),
                                'Ilość obiadów - dzień 1': lunch.lunch_quantity,
                                'Informacje o diecie - dzień 1': lunch.diet_info or '',
                            })
                        elif i == 1:
                            base_data.update({
                                'Dzień 2 - obiady': lunch.get_day_display(),
                                'Ilość obiadów - dzień 2': lunch.lunch_quantity,
                                'Informacje o diecie - dzień 2': lunch.diet_info or '',
                            })
                except (AttributeError, ValueError) as e:
                    logger.warning(f"Error extracting lunch data for company {company.id}: {str(e)}")

                # PDI
                if hasattr(fd, 'pdis') and fd.pdis:
                    try:
                        pdi = fd.pdis
                        base_data['Łączna liczba zaproszeń PDI'] = pdi.tickets_quantity

                        pdi_attendees = list(pdi.pdiattendees.all())
                        if pdi_attendees:
                            attendee_list = []
                            for att in pdi_attendees:
                                attendee_list.append(f"{self._format_full_name(att.name, att.surname)} ({att.email})")
                            base_data['PDI - Uczestnicy'] = '; '.join(attendee_list)

                        # Exhibitors (delegates in UI)
                        exhibitors = list(pdi.exhibitors.all())
                        if exhibitors:
                            exhibitor_list = []
                            for exh in exhibitors:
                                exhibitor_list.append(f"{self._format_full_name(exh.name, exh.surname)} ({exh.phone_number})")
                            base_data['Delegaci firmy'] = ' | '.join(exhibitor_list)
                    except (AttributeError, ValueError) as e:
                        logger.warning(f"Error extracting PDI data for company {company.id}: {str(e)}")

            except AttributeError as e:
                logger.warning(f"Error extracting final data for company {company.id}: {str(e)}")

        # Description (Marketing - Stage 4)
        if hasattr(company, 'description') and company.description:
            try:
                desc = company.description
                base_data.update({
                    'Opis firmy do katalogu': desc.descr or '',
                    'Logo do katalogu (URL)': self._safe_file_url(desc.logo_file),
                })
            except AttributeError as e:
                logger.warning(f"Error extracting description for company {company.id}: {str(e)}")

        return [base_data]
