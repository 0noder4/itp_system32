"""
Export Service
Business logic for exporting company data to CSV format
"""
from companies.models import (
    Company, Form, BasicData, Address, Stand,
    StandDetails, EquipmentItem, EquipmentSelection,
    FinalData, Lunch, Workshop, Exhibitor,
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
        # Fetch active equipment items for dynamic column generation
        self.equipment_items = list(EquipmentItem.objects.filter(is_active=True).order_by('category', 'name_pl'))
        # Create a mapping of equipment_item.id to column header name
        self.equipment_headers = {
            item.id: f"{item.name_pl} (sztuk)" for item in self.equipment_items
        }

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
            'finaldata',
            'finaldata__lunches',
            'finaldata__pdis',
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
            CSV chunks (header + data rows) as strings with UTF-8 encoding

        Raises:
            Exception: If queryset building or header generation fails
        """
        try:
            queryset = self.build_queryset()
        except Exception as e:
            logger.error(
                f"Error building queryset for CSV export (user: {self.user.username}): {str(e)}",
                exc_info=True
            )
            raise

        try:
            headers = self._build_headers()
        except Exception as e:
            logger.error(
                f"Error building CSV headers (user: {self.user.username}): {str(e)}",
                exc_info=True
            )
            raise

        generator = CSVGenerator(headers=headers)

        # UTF-8 BOM for Excel compatibility
        yield '\ufeff'

        try:
            yield generator.write_header()
        except Exception as e:
            logger.error(
                f"Error writing CSV header (user: {self.user.username}): {str(e)}",
                exc_info=True
            )
            raise

        exported_count = 0
        error_count = 0

        try:
            for company in queryset.iterator(chunk_size=100):
                try:
                    rows = self._flatten_company_data(company)
                    for row in rows:
                        try:
                            yield generator.write_row(row)
                        except Exception as e:
                            error_count += 1
                            logger.warning(
                                f"Error writing CSV row for company ID {company.id} "
                                f"({company.name}): {str(e)}",
                                exc_info=True
                            )
                            # Continue with next row
                            continue
                    exported_count += 1
                except Exception as e:
                    error_count += 1
                    logger.error(
                        f"Error exporting company ID {company.id} ({company.name}): {str(e)}",
                        exc_info=True
                    )
                    # Continue with next company instead of failing entire export
                    continue
        except Exception as e:
            logger.error(
                f"Error during CSV data iteration (user: {self.user.username}): {str(e)}",
                exc_info=True
            )
            raise

        logger.info(
            f"CSV export completed for user {self.user.username} - "
            f"{exported_count} companies exported successfully, {error_count} errors"
        )

    def _build_headers(self) -> List[str]:
        """
        Build CSV header - all fields always exported.
        Equipment columns are dynamically generated from active EquipmentItem objects.

        Returns:
            List of column headers
        """
        headers = [
            'ID', 'Nazwa', 'Email', 'Status', 'Przedstawiciel', 'Telefon przedstawiciela', 'FR', 'Telefon FR',
            # Basic Data (Stage 1)
            'Pełna nazwa firmy', 'NIP', 'Ulica', 'Numer budynku', 'Numer lokalu',
            'Miasto', 'Kod pocztowy', 'Kraj',
            # Stand Info - Separated by day
            'Dzień 1 - Numer stoiska', 'Dzień 1 - Rozmiar stoiska',
            'Dzień 2 - Numer stoiska', 'Dzień 2 - Rozmiar stoiska',
            # Stand Details (Stage 2)
            'Typ stanowiska', 'Szczegóły zabudowy', 'Tekst na fryzie',
        ]
        
        # Add dynamically generated equipment headers
        equipment_headers = [self.equipment_headers[item.id] for item in self.equipment_items]
        headers.extend(equipment_headers)
        
        # Add remaining headers
        headers.extend([
            # Workshops (Stage 3)
            'Poprowadzi warsztaty', 'Uwagi do warsztatów',
            # Final Data (Stage 5)
            'Urządzenia elektryczne podczas targów', 'Łączna moc urządzeń',
            'Dzień 1 - obiady', 'Ilość obiadów - dzień 1',
            'Dzień 2 - obiady', 'Ilość obiadów - dzień 2',
            # Delegates (Exhibitors)
            'Delegaci firmy',
        ])
        
        return headers

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
                'Telefon przedstawiciela': (company.representative.phone_number or '') if company.representative else '',
                'FR': self._format_full_name(
                    company.fr_resp.first_name if company.fr_resp else None,
                    company.fr_resp.last_name if company.fr_resp else None
                ),
                'Telefon FR': (company.fr_resp.phone_number or '') if company.fr_resp else '',
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

        # Stand information - Separated by day
        try:
            stands = list(company.stand_all.all())
            day1_stand = next((s for s in stands if s.day == 'day1'), None)
            day2_stand = next((s for s in stands if s.day == 'day2'), None)
            
            base_data.update({
                'Dzień 1 - Numer stoiska': day1_stand.stand_number if day1_stand else '',
                'Dzień 1 - Rozmiar stoiska': day1_stand.get_stand_size_display() if day1_stand else '',
                'Dzień 2 - Numer stoiska': day2_stand.stand_number if day2_stand else '',
                'Dzień 2 - Rozmiar stoiska': day2_stand.get_stand_size_display() if day2_stand else '',
            })
        except (AttributeError, ValueError) as e:
            logger.warning(f"Error extracting stand info for company {company.id}: {str(e)}")
            base_data.update({
                'Dzień 1 - Numer stoiska': '',
                'Dzień 1 - Rozmiar stoiska': '',
                'Dzień 2 - Numer stoiska': '',
                'Dzień 2 - Rozmiar stoiska': '',
            })

        # Stand Details (Stage 2)
        # Initialize equipment columns to 0 for all companies
        equipment_totals = {header: 0 for header in self.equipment_headers.values()}
        
        if hasattr(company, 'stand_details') and company.stand_details:
            try:
                sd = company.stand_details
                stand_type_display = self.CHOICE_MAPPINGS['stand_type'].get(sd.stand_type, sd.stand_type)
                base_data.update({
                    'Typ stanowiska': stand_type_display,
                    'Tekst na fryzie': sd.name_sign_text or '',
                })

                # Self-construction specific fields (only for 'self_construction' type)
                if sd.stand_type == 'self_construction':
                    base_data.update({
                        'Szczegóły zabudowy': sd.sc_details or '',
                    })
                else:
                    base_data.update({
                        'Szczegóły zabudowy': '',
                    })

                # Equipment selections - selection.quantity is already the total quantity
                equipment_selections = list(sd.equipment_selections.all())
                if equipment_selections:
                    # Sum up all selection quantities per equipment item
                    # Note: selection.quantity already represents the total quantity the user wants,
                    # not an additional quantity on top of included_quantity
                    for selection in equipment_selections:
                        item = selection.equipment_item
                        if item.id in self.equipment_headers:
                            header_name = self.equipment_headers[item.id]
                            # Sum up quantities if there are multiple selections for the same item
                            equipment_totals[header_name] += selection.quantity
                        # Note: If equipment item is not active, it won't be in headers, so we skip it
                        # This ensures consistency with the header generation

            except (AttributeError, ValueError, TypeError) as e:
                logger.warning(f"Error extracting stand details for company {company.id}: {str(e)}")
        else:
            # No stand_details, initialize stand detail fields
            base_data.update({
                'Typ stanowiska': '',
                'Szczegóły zabudowy': '',
                'Tekst na fryzie': '',
            })
        
        # Update base_data with equipment totals (all equipment items, even if 0)
        base_data.update(equipment_totals)

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

        # Jobwall removed from export

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
                            })
                        elif i == 1:
                            base_data.update({
                                'Dzień 2 - obiady': lunch.get_day_display(),
                                'Ilość obiadów - dzień 2': lunch.lunch_quantity,
                            })
                except (AttributeError, ValueError) as e:
                    logger.warning(f"Error extracting lunch data for company {company.id}: {str(e)}")

                # Exhibitors (Delegates) - Keep these
                if hasattr(fd, 'pdis') and fd.pdis:
                    try:
                        pdi = fd.pdis
                        exhibitors = list(pdi.exhibitors.all())
                        if exhibitors:
                            exhibitor_list = []
                            for exh in exhibitors:
                                exhibitor_list.append(f"{self._format_full_name(exh.name, exh.surname)} ({exh.phone_number})")
                            base_data['Delegaci firmy'] = ' | '.join(exhibitor_list)
                        else:
                            base_data['Delegaci firmy'] = ''
                    except (AttributeError, ValueError) as e:
                        logger.warning(f"Error extracting exhibitors/delegates for company {company.id}: {str(e)}")
                        base_data['Delegaci firmy'] = ''
                else:
                    base_data['Delegaci firmy'] = ''

            except AttributeError as e:
                logger.warning(f"Error extracting final data for company {company.id}: {str(e)}")
                base_data['Delegaci firmy'] = ''
        else:
            # No final data, initialize delegates field
            base_data['Delegaci firmy'] = ''

        # Description removed from export

        return [base_data]
