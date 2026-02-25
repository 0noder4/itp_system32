"""
PDF Generator Service for Order Summary
Generates comprehensive PDF documents with all stage data for exhibitors.
"""

from io import BytesIO
from decimal import Decimal
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, KeepTogether, Image
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from django.utils import timezone
from django.conf import settings
import os
import logging

logger = logging.getLogger(__name__)

from .models import (
    Company, BasicData, Address, StandDetails, EquipmentSelection,
    Workshop, Jobwall, Description, FinalData, Lunch, PDI, PDIAttendee,
    Exhibitor, Stand, Settings
)

# Standardized font sizes
FONT_SIZE_TITLE = 20
FONT_SIZE_HEADING = 14
FONT_SIZE_TABLE_HEADER = 10
FONT_SIZE_BODY = 9
FONT_SIZE_SUBTEXT = 8

# Try to register fonts that support Polish characters
font_registered = False
font_bold_registered = False

# Try DejaVu Sans first (best for Polish characters)
try:
    dejavu_paths = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/TTF/DejaVuSans.ttf',
        '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
    ]
    
    for font_path in dejavu_paths:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont('DejaVuSans', font_path))
                font_registered = True
                # Try to register bold version
                bold_path = font_path.replace('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf')
                if os.path.exists(bold_path):
                    try:
                        pdfmetrics.registerFont(TTFont('DejaVuSansBold', bold_path))
                        # Register font mapping for bold
                        from reportlab.lib.fonts import addMapping
                        addMapping('DejaVuSans', 0, 1, 'DejaVuSansBold')  # normal, bold
                        font_bold_registered = True
                    except Exception:
                        pass
                break
            except Exception as e:
                continue
except:
    pass

# If DejaVu not available, try to use Arial (Windows/macOS) which also supports Polish
if not font_registered:
    try:
        arial_paths = [
            'C:/Windows/Fonts/arial.ttf',
            'C:/Windows/Fonts/ARIAL.TTF',
            '/System/Library/Fonts/Supplemental/Arial.ttf',
            '/Library/Fonts/Arial.ttf',
        ]
        for font_path in arial_paths:
            if os.path.exists(font_path):
                try:
                    pdfmetrics.registerFont(TTFont('DejaVuSans', font_path))
                    font_registered = True
                    bold_path = font_path.replace('arial.ttf', 'arialbd.ttf').replace('ARIAL.TTF', 'ARIALBD.TTF')
                    if os.path.exists(bold_path):
                        try:
                            pdfmetrics.registerFont(TTFont('DejaVuSansBold', bold_path))
                            # Register font mapping for bold
                            from reportlab.lib.fonts import addMapping
                            addMapping('DejaVuSans', 0, 1, 'DejaVuSansBold')  # normal, bold
                            font_bold_registered = True
                        except Exception:
                            pass
                    break
                except:
                    continue
    except:
        pass

# Fallback: Use ReportLab's Unicode CID fonts if available
if not font_registered:
    try:
        # These support Unicode properly
        pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))
        pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
        font_registered = True
        font_bold_registered = True
        # Override font names
        font_name_fallback = 'HeiseiMin-W3'
        font_bold_fallback = 'HeiseiKakuGo-W5'
    except:
        font_name_fallback = 'Helvetica'
        font_bold_fallback = 'Helvetica-Bold'

# Theme colors matching web application
PRIMARY_COLOR = colors.HexColor('#333333')  # Dark gray (primary)
ACCENT_COLOR = colors.HexColor('#F55718')   # Orange accent (matching web app)
BORDER_COLOR = colors.HexColor('#EBEBEB')   # Light gray (border)
MUTED_COLOR = colors.HexColor('#F5F5F5')    # Very light gray (muted)
TEXT_COLOR = colors.HexColor('#252525')     # Dark text
SUBTEXT_COLOR = colors.HexColor('#6b7280')  # Muted text


class OrderSummaryPDFGenerator:
    """Generates PDF order summaries for companies with all stage data."""
    
    def __init__(self, company, language='pl'):
        """
        Initialize PDF generator.
        
        Args:
            company: Company instance
            language: 'en' or 'pl' for translations
        """
        self.company = company
        self.language = language if language in ['en', 'pl'] else 'pl'
        self.buffer = BytesIO()
        self.generation_date = timezone.now()
        self.doc = SimpleDocTemplate(
            self.buffer,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2.5*cm  # Increased bottom margin for footer
        )
        self.story = []
        self.styles = getSampleStyleSheet()
        
        # Set up footer callbacks
        self.doc.onFirstPage = self._add_footer
        self.doc.onLaterPages = self._add_footer
        
        # Set font names - use registered fonts or fallback to built-in
        from reportlab.pdfbase import pdfmetrics
        
        # Verify what fonts are actually available
        registered_fonts = pdfmetrics.getRegisteredFontNames()
        
        # Log font registration status for debugging
        logger.debug(f"Font registration status: font_registered={font_registered}, font_bold_registered={font_bold_registered}")
        logger.debug(f"Registered fonts: {registered_fonts[:10]}...")  # First 10 fonts
        
        # Try to use DejaVu Sans for Polish character support
        if font_registered and 'DejaVuSans' in registered_fonts:
            self._font_name = 'DejaVuSans'
            logger.info("Using DejaVuSans font for PDF generation (supports Polish characters)")
            # Use DejaVuSans for bold too - ReportLab will handle bold via font mapping
            # If we have bold font registered, we can use it, but it's safer to use base font
            if font_bold_registered and 'DejaVuSansBold' in registered_fonts:
                # Test if we can use it - sometimes ReportLab has issues with custom bold fonts
                try:
                    test_font = pdfmetrics.getFont('DejaVuSansBold')
                    if test_font:
                        self._font_bold = 'DejaVuSansBold'
                        logger.debug("Using DejaVuSansBold for bold text")
                    else:
                        self._font_bold = 'DejaVuSans'
                        logger.debug("DejaVuSansBold font test failed, using DejaVuSans for bold")
                except Exception as e:
                    logger.debug(f"Error testing DejaVuSansBold font: {e}, using DejaVuSans for bold")
                    self._font_bold = 'DejaVuSans'
            else:
                self._font_bold = 'DejaVuSans'
                logger.debug("DejaVuSansBold not registered, using DejaVuSans for bold")
        else:
            # Fallback to Helvetica (limited Polish support)
            self._font_name = 'Helvetica'
            self._font_bold = 'Helvetica-Bold'
            logger.warning("DejaVuSans not available, falling back to Helvetica (limited Polish character support)")
        
        self._setup_custom_styles()
        
    def _setup_custom_styles(self):
        """Setup custom paragraph styles with standardized font sizes."""
        # Title style - don't inherit fontName from parent to avoid parsing issues
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Normal'],  # Use Normal as parent to avoid font parsing issues
            fontName=self._font_bold,
            fontSize=FONT_SIZE_TITLE,
            textColor=ACCENT_COLOR,  # Use accent color for title
            spaceAfter=20,
            spaceBefore=10,
            alignment=TA_LEFT,  # Left align title
            leading=FONT_SIZE_TITLE + 4,
            leftIndent=0,
            rightIndent=0
        )
        
        # Heading style - don't inherit fontName from parent
        self.heading_style = ParagraphStyle(
            'CustomHeading',
            parent=self.styles['Normal'],  # Use Normal as parent to avoid font parsing issues
            fontName=self._font_bold,
            fontSize=FONT_SIZE_HEADING,
            textColor=PRIMARY_COLOR,
            spaceAfter=12,
            spaceBefore=16,
            leading=FONT_SIZE_HEADING + 4,
            borderWidth=0,
            borderPadding=0,
            leftIndent=0,
            rightIndent=0
        )
        
        # Normal text style
        self.normal_style = ParagraphStyle(
            'CustomNormal',
            parent=self.styles['Normal'],
            fontName=self._font_name,
            fontSize=FONT_SIZE_BODY,
            textColor=TEXT_COLOR,
            leading=FONT_SIZE_BODY + 2,
            spaceAfter=6
        )
        
        # Subtext style
        self.subtext_style = ParagraphStyle(
            'CustomSubtext',
            parent=self.styles['Normal'],
            fontName=self._font_name,
            fontSize=FONT_SIZE_SUBTEXT,
            textColor=SUBTEXT_COLOR,
            leading=FONT_SIZE_SUBTEXT + 2
        )
        
        # Company name style - don't inherit fontName from parent
        self.company_name_style = ParagraphStyle(
            'CompanyName',
            parent=self.styles['Normal'],  # Use Normal as parent to avoid font parsing issues
            fontName=self._font_bold,
            fontSize=FONT_SIZE_HEADING + 2,
            textColor=PRIMARY_COLOR,
            alignment=TA_LEFT,  # Left align company name
            spaceAfter=10,
            leading=FONT_SIZE_HEADING + 6,
            leftIndent=0,
            rightIndent=0
        )
        
        # Bold label style for tables
        self.bold_label_style = ParagraphStyle(
            'BoldLabel',
            parent=self.normal_style,
            fontName=self._font_bold,
            fontSize=FONT_SIZE_BODY
        )
        
        # Bold heading style for subsections
        self.bold_heading_style = ParagraphStyle(
            'BoldHeading',
            parent=self.normal_style,
            fontName=self._font_bold,
            fontSize=FONT_SIZE_BODY
        )
        
    def _t(self, key_en, key_pl):
        """Get translation based on language."""
        return key_en if self.language == 'en' else key_pl
        
    def generate(self):
        """Generate the complete PDF document."""
        # Header
        self._add_header()
        
        # Company Data
        self._add_company_data()
        
        # Stand
        self._add_stand_section()
        
        # Catalogue Data (Company Description + Jobwall)
        self._add_catalogue_data()
        
        # Delegates and Lunches
        self._add_delegates_and_lunches()
        
        # Pricing information note
        self._add_pricing_note()
        
        # Build PDF
        self.doc.build(self.story)
        self.buffer.seek(0)
        return self.buffer
        
    def _add_header(self):
        """Add PDF header with logo, company full name and date."""
        # Add logo at the top
        logo_path = os.path.join(settings.BASE_DIR, 'static', 'images', 'ITP_LOGO_horizontal_black.png')
        if os.path.exists(logo_path):
            try:
                # Logo width - adjust to fit page (A4 width - margins = ~16cm)
                # Keep aspect ratio, set width to reasonable size (e.g., 7cm - smaller)
                logo_width = 7 * cm
                logo_height = None
                
                # Try to get image dimensions using PIL - REQUIRED for ReportLab
                # If PIL fails, we cannot reliably add the image, so skip it
                try:
                    from PIL import Image as PILImage
                    pil_img = PILImage.open(logo_path)
                    img_width, img_height = pil_img.size
                    pil_img.close()  # Close the image file
                    if img_width > 0 and img_height > 0:
                        aspect_ratio = float(img_height) / float(img_width)
                        logo_height = logo_width * aspect_ratio
                    else:
                        # Invalid image dimensions, skip logo
                        raise ValueError("Image has invalid dimensions")
                except Exception as pil_error:
                    # PIL failed or image invalid - cannot add logo safely
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Cannot read image (PIL required for ReportLab Image): {pil_error}")
                    # Skip logo entirely - don't use default dimensions
                    logo_height = None
                
                # Only proceed if we successfully got dimensions from PIL
                if logo_height is None or logo_height <= 0:
                    # Skip logo if we couldn't get valid dimensions
                    logger = logging.getLogger(__name__)
                    logger.info("Skipping logo - could not determine image dimensions (PIL may not be installed)")
                else:
                    # Verify dimensions are valid numbers
                    logo_width_float = float(logo_width)
                    logo_height_float = float(logo_height)
                    
                    if logo_width_float <= 0 or logo_height_float <= 0:
                        logger = logging.getLogger(__name__)
                        logger.warning(f"Invalid logo dimensions: width={logo_width_float}, height={logo_height_float}")
                    else:
                        # Create image with explicit dimensions - this is required by ReportLab
                        try:
                            logo = Image(logo_path, width=logo_width_float, height=logo_height_float)
                            logo.hAlign = 'CENTER'
                            self.story.append(logo)
                            self.story.append(Spacer(1, 0.2*cm))  # Reduced spacing
                        except Exception as img_error:
                            # ReportLab Image creation failed, skip logo
                            logger = logging.getLogger(__name__)
                            logger.warning(f"ReportLab could not create Image object: {img_error}")
            except Exception as e:
                # If logo can't be loaded, just continue without it
                logger = logging.getLogger(__name__)
                logger.warning(f"Could not load logo image: {e}")
                import traceback
                logger.warning(traceback.format_exc())
        
        title = self._t(
            "Order Summary",
            "Podsumowanie zamówienia"
        )
        self.story.append(Paragraph(title, self.title_style))
        self.story.append(Spacer(1, 0.2*cm))  # Reduced spacing
        
        # Company full name
        try:
            basic_data = BasicData.objects.get(company=self.company)
            company_full_name = basic_data.full_name
        except BasicData.DoesNotExist:
            company_full_name = self.company.name
        
        self.story.append(Paragraph(company_full_name, self.company_name_style))
        self.story.append(Spacer(1, 0.3*cm))
        
        # Date (removed from header, now in footer)
        self.story.append(Spacer(1, 0.6*cm))
        
    def _add_company_data(self):
        """Add Company Data section."""
        heading = self._t("Company Data", "Dane firmy")
        self.story.append(Paragraph(heading, self.heading_style))
        
        try:
            basic_data = BasicData.objects.get(company=self.company)
            address = Address.objects.filter(form=basic_data).first()
            
            data = []
            data.append([
                Paragraph(self._t("Company Full Name:", "Pełna nazwa firmy:"), self.bold_label_style),
                Paragraph(basic_data.full_name, self.normal_style)
            ])
            data.append([
                Paragraph(self._t("NIP:", "NIP:"), self.bold_label_style),
                Paragraph(basic_data.nip, self.normal_style)
            ])
            
            if address:
                data.append([
                    Paragraph(self._t("Street:", "Ulica:"), self.bold_label_style),
                    Paragraph(address.street, self.normal_style)
                ])
                data.append([
                    Paragraph(self._t("Home Number:", "Numer domu:"), self.bold_label_style),
                    Paragraph(address.home_number, self.normal_style)
                ])
                if address.apt_number:
                    data.append([
                        Paragraph(self._t("Apt Number:", "Numer lokalu:"), self.bold_label_style),
                        Paragraph(address.apt_number, self.normal_style)
                    ])
                data.append([
                    Paragraph(self._t("City:", "Miasto:"), self.bold_label_style),
                    Paragraph(address.city, self.normal_style)
                ])
                data.append([
                    Paragraph(self._t("Country:", "Kraj:"), self.bold_label_style),
                    Paragraph(address.country, self.normal_style)
                ])
                data.append([
                    Paragraph(self._t("Postal Code:", "Kod pocztowy:"), self.bold_label_style),
                    Paragraph(address.postal_code, self.normal_style)
                ])
            
            table = Table(data, colWidths=[5.5*cm, 10.5*cm])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
                ('TEXTCOLOR', (0, 0), (0, -1), PRIMARY_COLOR),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('BACKGROUND', (1, 0), (1, -1), colors.white),
                ('TEXTCOLOR', (1, 0), (1, -1), TEXT_COLOR),
                ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ('LINEBELOW', (0, -1), (-1, -1), 0.5, BORDER_COLOR),
            ]))
            self.story.append(table)
            
        except BasicData.DoesNotExist:
            self.story.append(Paragraph(
                self._t("No basic data available", "Brak danych podstawowych"),
                self.subtext_style
            ))
        
        self.story.append(Spacer(1, 0.5*cm))
        
    def _add_stand_section(self):
        """Add Stand section with assignments."""
        heading = self._t("Stand", "Stoisko")
        self.story.append(Paragraph(heading, self.heading_style))
        
        # Get stand assignments
        stands = Stand.objects.filter(company=self.company)
        day1_stand = stands.filter(day='day1').first()
        day2_stand = stands.filter(day='day2').first()
        
        # Only show if at least one stand is assigned
        if not day1_stand and not day2_stand:
            self.story.append(Paragraph(
                self._t("No stand assignments", "Brak przypisań stoisk"),
                self.subtext_style
            ))
            self.story.append(Spacer(1, 0.5*cm))
            return
        
        # Stand details
        try:
            stand_details = StandDetails.objects.get(company=self.company)
            equipment_selections = EquipmentSelection.objects.filter(
                stand_details=stand_details
            ).select_related('equipment_item')
            
            # Stand type info
            stand_info_data = []
            stand_type_label = self._t("Stand Type:", "Typ stoiska:")
            stand_type_value = self._t(
                "Provided Stand" if stand_details.stand_type == 'provided_stand' else "Self Construction",
                "Stoisko organizatora" if stand_details.stand_type == 'provided_stand' else "Własna zabudowa"
            )
            stand_info_data.append([
                Paragraph(stand_type_label, self.bold_label_style),
                Paragraph(stand_type_value, self.normal_style)
            ])
            
            if stand_details.name_sign_text:
                sign_label = self._t("Name Sign Text:", "Napis na fryz:")
                stand_info_data.append([
                    Paragraph(sign_label, self.bold_label_style),
                    Paragraph(stand_details.name_sign_text, self.normal_style)
                ])
            
            if stand_details.sc_details:
                details_label = self._t("Self Construction Details:", "Szczegóły własnej zabudowy:")
                stand_info_data.append([
                    Paragraph(details_label, self.bold_label_style),
                    Paragraph(stand_details.sc_details, self.normal_style)
                ])
            
            # Stand assignments table
            stand_assignments_data = []
            header_style = ParagraphStyle(
                'TableHeader',
                parent=self.normal_style,
                fontName=self._font_bold,
                fontSize=FONT_SIZE_TABLE_HEADER,
                textColor=colors.white
            )
            stand_assignments_data.append([
                Paragraph(self._t("Day", "Dzień"), header_style),
                Paragraph(self._t("Stand Number", "Numer stoiska"), header_style),
                Paragraph(self._t("Stand Size", "Rozmiar stoiska"), header_style)
            ])
            
            size_mapping = {
                'podstawowy': self._t("4m²", "4m²"),
                'standardowy': self._t("6m²", "6m²"),
                'rozszerzony': self._t("8m²", "8m²"),
                '12m2': self._t("12m²", "12m²"),
            }
            
            if day1_stand:
                stand_assignments_data.append([
                    Paragraph(self._t("Day 1 (March 10, 2025)", "Dzień 1 (10.03.2025)"), self.normal_style),
                    Paragraph(day1_stand.stand_number, self.normal_style),
                    Paragraph(size_mapping.get(day1_stand.stand_size, day1_stand.stand_size), self.normal_style)
                ])
            if day2_stand:
                stand_assignments_data.append([
                    Paragraph(self._t("Day 2 (March 11, 2025)", "Dzień 2 (11.03.2025)"), self.normal_style),
                    Paragraph(day2_stand.stand_number, self.normal_style),
                    Paragraph(size_mapping.get(day2_stand.stand_size, day2_stand.stand_size), self.normal_style)
                ])
            
            if stand_info_data:
                stand_info_table = Table(stand_info_data, colWidths=[5.5*cm, 10.5*cm])
                stand_info_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
                    ('TEXTCOLOR', (0, 0), (0, -1), PRIMARY_COLOR),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 8),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ('BACKGROUND', (1, 0), (1, -1), colors.white),
                    ('TEXTCOLOR', (1, 0), (1, -1), TEXT_COLOR),
                    ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ]))
                self.story.append(stand_info_table)
                self.story.append(Spacer(1, 0.3*cm))
            
            if len(stand_assignments_data) > 1:
                stand_assignments_table = Table(stand_assignments_data, colWidths=[6*cm, 5*cm, 5*cm])
                stand_assignments_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), ACCENT_COLOR),  # Use accent color for header
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
                    ('TOPPADDING', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
                    ('TOPPADDING', (0, 1), (-1, -1), 8),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ]))
                self.story.append(stand_assignments_table)
                self.story.append(Spacer(1, 0.3*cm))
            
            # Equipment table
            if equipment_selections:
                table_data = []
                # Header row
                header_style = ParagraphStyle(
                    'TableHeader',
                    parent=self.normal_style,
                    fontName=self._font_bold,
                    fontSize=FONT_SIZE_TABLE_HEADER,
                    textColor=colors.white
                )
                table_data.append([
                    Paragraph(self._t("Equipment Item", "Wyposażenie"), header_style),
                    Paragraph(self._t("Quantity", "Ilość"), header_style),
                    Paragraph(self._t("Free", "Darmowe"), header_style),
                    Paragraph(self._t("Paid", "Płatne"), header_style),
                ])
                
                for selection in equipment_selections:
                    item = selection.equipment_item
                    quantity = selection.quantity
                    included_quantity = item.included_quantity or 0
                    
                    # Calculate paid quantity (quantity above the free/included quantity)
                    paid_quantity = max(0, quantity - included_quantity)
                    
                    # Get item name based on language
                    item_name = item.name_pl if self.language == 'pl' else item.name_en
                    
                    table_data.append([
                        Paragraph(item_name, self.normal_style),
                        Paragraph(str(quantity), self.normal_style),
                        Paragraph(str(included_quantity) if included_quantity > 0 else "-", self.normal_style),
                        Paragraph(str(paid_quantity) if paid_quantity > 0 else "-", self.normal_style),
                    ])
                
                table = Table(table_data, colWidths=[8*cm, 2.5*cm, 2.5*cm, 3*cm])
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), ACCENT_COLOR),  # Use accent color for header
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('ALIGN', (1, 0), (3, -1), 'CENTER'),
                    ('ALIGN', (4, 1), (-1, -2), 'RIGHT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 10),  # Header padding
                    ('TOPPADDING', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 1), (-1, -1), 8),  # Body padding (standardized)
                    ('TOPPADDING', (0, 1), (-1, -1), 8),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ('BACKGROUND', (0, -1), (-1, -1), MUTED_COLOR),
                    ('TEXTCOLOR', (0, -1), (-1, -1), PRIMARY_COLOR),
                    ('FONTSIZE', (0, -1), (-1, -1), FONT_SIZE_BODY),
                    ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ]))
                self.story.append(table)
                self.story.append(Spacer(1, 0.3*cm))
            else:
                self.story.append(Paragraph(
                    self._t("No equipment selected", "Nie wybrano wyposażenia"),
                    self.subtext_style
                ))
            
        except StandDetails.DoesNotExist:
            # Still show stand assignments even if no stand details
            if len(stand_assignments_data) > 1:
                stand_assignments_table = Table(stand_assignments_data, colWidths=[6*cm, 5*cm, 5*cm])
                stand_assignments_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), ACCENT_COLOR),  # Use accent color for header
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
                    ('TOPPADDING', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
                    ('TOPPADDING', (0, 1), (-1, -1), 8),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ]))
                self.story.append(stand_assignments_table)
        
        self.story.append(Spacer(1, 0.5*cm))
        
    def _add_catalogue_data(self):
        """Add Catalogue Data section (Company Description + Jobwall)."""
        heading = self._t("Catalogue Data", "Dane katalogowe")
        self.story.append(Paragraph(heading, self.heading_style))
        
        # Company description (before jobwall)
        try:
            description = Description.objects.get(company=self.company)
            if description.descr:
                desc_heading = self._t("Company Description:", "Opis firmy:")
                heading_para = Paragraph(desc_heading, ParagraphStyle(
                    'BoldHeading',
                    parent=self.normal_style,
                    fontName=self._font_bold
                ))
                self.story.append(heading_para)
                self.story.append(Spacer(1, 0.2*cm))
                self.story.append(Paragraph(description.descr, self.normal_style))
                self.story.append(Spacer(1, 0.3*cm))
        except Description.DoesNotExist:
            pass
        
        # Jobwall postings
        jobwalls = Jobwall.objects.filter(company=self.company)
        
        if jobwalls:
            jobwall_count = jobwalls.count()
            
            info_data = [[
                Paragraph(self._t("Number of Jobwall Postings:", "Liczba ogłoszeń Jobwall:"), self.bold_label_style),
                Paragraph(str(jobwall_count), self.normal_style)
            ]]
            
            info_table = Table(info_data, colWidths=[5.5*cm, 10.5*cm])
            info_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
                ('TEXTCOLOR', (0, 0), (0, -1), PRIMARY_COLOR),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('BACKGROUND', (1, 0), (1, -1), colors.white),
                ('TEXTCOLOR', (1, 0), (1, -1), TEXT_COLOR),
                ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ]))
            self.story.append(info_table)
            self.story.append(Spacer(1, 0.3*cm))
            
            # List jobwall details
            for idx, jobwall in enumerate(jobwalls, 1):
                jobwall_heading = self._t(f"Job Posting {idx}", f"Ogłoszenie {idx}")
                self.story.append(Paragraph(jobwall_heading, self.bold_heading_style))
                self.story.append(Spacer(1, 0.2*cm))
                
                form_mapping = {
                    's': self._t("On-site", "Stacjonarnie"),
                    'z': self._t("Remote", "Zdalnie"),
                    'h': self._t("Hybrid", "Hybrydowo"),
                    'k': self._t("Competition", "Konkurs"),
                    'm': self._t("Mobile", "Mobilnie"),
                }
                
                workload_mapping = {
                    'pelen': self._t("Full-time", "Pełen etat"),
                    'pol': self._t("Half-time", "1/2 etatu"),
                    'trzyczwarte': self._t("3/4 time", "3/4 etatu"),
                    'el': self._t("Flexible", "Elastyczny"),
                }
                
                contract_mapping = {
                    'uop': self._t("Employment contract", "Umowa o pracę"),
                    'uoz': self._t("Mandate contract", "Umowa zlecenie"),
                    'uod': self._t("Contract for work", "Umowa o dzieło"),
                    'b2b': self._t("B2B contract", "Kontrakt B2B"),
                    'uos': self._t("Internship/Traineeship", "Staż/Praktyki"),
                }
                
                data = []
                data.append([
                    Paragraph(self._t("Position Name:", "Nazwa stanowiska:"), self.bold_label_style),
                    Paragraph(jobwall.name, self.normal_style)
                ])
                data.append([
                    Paragraph(self._t("Form:", "Forma:"), self.bold_label_style),
                    Paragraph(form_mapping.get(jobwall.form, jobwall.form), self.normal_style)
                ])
                data.append([
                    Paragraph(self._t("Workload:", "Wymiar pracy:"), self.bold_label_style),
                    Paragraph(workload_mapping.get(jobwall.workload, jobwall.workload), self.normal_style)
                ])
                data.append([
                    Paragraph(self._t("Contract Type:", "Rodzaj umowy:"), self.bold_label_style),
                    Paragraph(contract_mapping.get(jobwall.contract, jobwall.contract), self.normal_style)
                ])
                
                if jobwall.description:
                    data.append([
                        Paragraph(self._t("Description:", "Opis:"), self.bold_label_style),
                        Paragraph(jobwall.description, self.normal_style)
                    ])
                if jobwall.requirements:
                    data.append([
                        Paragraph(self._t("Requirements:", "Wymagania:"), self.bold_label_style),
                        Paragraph(jobwall.requirements, self.normal_style)
                    ])
                if jobwall.benefits:
                    data.append([
                        Paragraph(self._t("Benefits:", "Benefity:"), self.bold_label_style),
                        Paragraph(jobwall.benefits, self.normal_style)
                    ])
                if jobwall.url:
                    data.append([
                        Paragraph(self._t("Application Link:", "Link do aplikacji:"), self.bold_label_style),
                        Paragraph(jobwall.url, self.normal_style)
                    ])
                
                table = Table(data, colWidths=[4.5*cm, 11.5*cm])
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
                    ('TEXTCOLOR', (0, 0), (0, -1), PRIMARY_COLOR),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 8),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),  # Standardized padding
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),  # Standardized padding
                    ('BACKGROUND', (1, 0), (1, -1), colors.white),
                    ('TEXTCOLOR', (1, 0), (1, -1), TEXT_COLOR),
                    ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ]))
                self.story.append(table)
                self.story.append(Spacer(1, 0.3*cm))
        else:
            self.story.append(Paragraph(
                self._t("No jobwall postings", "Brak ogłoszeń Jobwall"),
                self.subtext_style
            ))
            self.story.append(Spacer(1, 0.3*cm))
        
        self.story.append(Spacer(1, 0.5*cm))
        
    def _add_delegates_and_lunches(self):
        """Add Delegates and Lunches section."""
        heading = self._t("Delegates and Lunches", "Delegaci i obiady")
        self.story.append(Paragraph(heading, self.heading_style))
        
        try:
            final_data = FinalData.objects.get(company=self.company)
            
            # Lunches
            lunches = Lunch.objects.filter(form=final_data)
            if lunches:
                self.story.append(Paragraph(
                    self._t("Lunches:", "Obiady:"),
                    self.bold_heading_style
                ))
                self.story.append(Spacer(1, 0.2*cm))
                
                lunch_data = []
                # Header
                header_style = ParagraphStyle(
                    'TableHeader',
                    parent=self.normal_style,
                    fontName=self._font_bold,
                    fontSize=FONT_SIZE_TABLE_HEADER,
                    textColor=colors.white
                )
                lunch_data.append([
                    Paragraph(self._t("Day", "Dzień"), header_style),
                    Paragraph(self._t("Quantity", "Ilość"), header_style),
                    Paragraph(self._t("Diet Info", "Informacje o dietach"), header_style)
                ])
                
                # Get job fair dates from settings
                system_settings = Settings.get_settings()
                
                for lunch in lunches:
                    if lunch.day == 'day1':
                        day_display = self._t(
                            f"Day 1 ({system_settings.get_day1_display_en()})",
                            f"Dzień 1 ({system_settings.get_day1_display_pl()})"
                        )
                    else:
                        day_display = self._t(
                            f"Day 2 ({system_settings.get_day2_display_en()})",
                            f"Dzień 2 ({system_settings.get_day2_display_pl()})"
                        )
                    lunch_data.append([
                        Paragraph(day_display, self.normal_style),
                        Paragraph(str(lunch.lunch_quantity), self.normal_style),
                        Paragraph(lunch.diet_info or "", self.normal_style)
                    ])
                
                lunch_table = Table(lunch_data, colWidths=[5*cm, 3*cm, 8*cm])
                lunch_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), ACCENT_COLOR),  # Use accent color for header
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 10),  # Header padding
                    ('TOPPADDING', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 1), (-1, -1), 8),  # Body padding
                    ('TOPPADDING', (0, 1), (-1, -1), 8),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ]))
                self.story.append(lunch_table)
                self.story.append(Spacer(1, 0.3*cm))
                
                # Calculate extra lunches and pricing
                # Group lunches by day and sum quantities per day
                lunches_by_day = {}
                for lunch in lunches:
                    day = lunch.day
                    quantity = lunch.lunch_quantity or 0
                    lunches_by_day[day] = lunches_by_day.get(day, 0) + quantity
                
                # Calculate extra lunches: 2 free lunches per day
                free_per_day = 2
                extra_lunches = sum(max(0, total_for_day - free_per_day) for total_for_day in lunches_by_day.values())
                
                # Calculate total cost if there are extra lunches and price is set
                lunch_price = system_settings.lunch_price or Decimal('0')
                if extra_lunches > 0 and lunch_price > 0:
                    total_lunch_cost = extra_lunches * lunch_price
                    pricing_text = self._t(
                        f"Additional lunches: {extra_lunches} × {lunch_price:.2f} PLN = {total_lunch_cost:.2f} PLN",
                        f"Dodatkowe obiady: {extra_lunches} × {lunch_price:.2f} PLN = {total_lunch_cost:.2f} PLN"
                    )
                    self.story.append(Paragraph(pricing_text, self.normal_style))
                    self.story.append(Spacer(1, 0.2*cm))
            
            # PDI
            try:
                pdi = final_data.pdis
                if pdi:
                    # PDI Attendees
                    attendees = PDIAttendee.objects.filter(form=pdi)
                    if attendees:
                        self.story.append(Paragraph(
                            self._t("PDI Attendees:", "Uczestnicy PDI:"),
                            self.bold_heading_style
                        ))
                        self.story.append(Spacer(1, 0.2*cm))
                        
                        attendee_data = []
                        # Header
                        header_style = ParagraphStyle(
                            'TableHeader',
                            parent=self.normal_style,
                            fontName=self._font_bold,
                            fontSize=FONT_SIZE_TABLE_HEADER,
                            textColor=colors.white
                        )
                        attendee_data.append([
                            Paragraph(self._t("Name", "Imię"), header_style),
                            Paragraph(self._t("Surname", "Nazwisko"), header_style),
                            Paragraph(self._t("Email", "Email"), header_style),
                            Paragraph(self._t("Phone", "Telefon"), header_style)
                        ])
                        
                        for attendee in attendees:
                            attendee_data.append([
                                Paragraph(attendee.name, self.normal_style),
                                Paragraph(attendee.surname, self.normal_style),
                                Paragraph(attendee.email, self.normal_style),
                                Paragraph(attendee.phone_number, self.normal_style)
                            ])
                        
                        attendee_table = Table(attendee_data, colWidths=[4*cm, 4*cm, 5*cm, 3*cm])
                        attendee_table.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), ACCENT_COLOR),  # Use accent color for header
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),  # Header padding
                            ('TOPPADDING', (0, 0), (-1, 0), 10),
                            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),  # Body padding
                            ('TOPPADDING', (0, 1), (-1, -1), 8),
                            ('LEFTPADDING', (0, 0), (-1, -1), 8),
                            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                            ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                        ]))
                        self.story.append(attendee_table)
                        self.story.append(Spacer(1, 0.3*cm))
                    
                    # Exhibitors
                    exhibitors = Exhibitor.objects.filter(form=pdi)
                    if exhibitors:
                        self.story.append(Paragraph(
                            self._t("Exhibitors:", "Wystawcy:"),
                            self.bold_heading_style
                        ))
                        self.story.append(Spacer(1, 0.2*cm))
                        
                        exhibitor_data = []
                        # Header
                        header_style = ParagraphStyle(
                            'TableHeader',
                            parent=self.normal_style,
                            fontName=self._font_bold,
                            fontSize=FONT_SIZE_TABLE_HEADER,
                            textColor=colors.white
                        )
                        exhibitor_data.append([
                            Paragraph(self._t("Name", "Imię"), header_style),
                            Paragraph(self._t("Surname", "Nazwisko"), header_style),
                            Paragraph(self._t("Phone", "Telefon"), header_style)
                        ])
                        
                        for exhibitor in exhibitors:
                            exhibitor_data.append([
                                Paragraph(exhibitor.name, self.normal_style),
                                Paragraph(exhibitor.surname, self.normal_style),
                                Paragraph(exhibitor.phone_number, self.normal_style)
                            ])
                        
                        exhibitor_table = Table(exhibitor_data, colWidths=[5*cm, 5*cm, 6*cm])
                        exhibitor_table.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), ACCENT_COLOR),  # Use accent color for header
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),  # Header padding
                            ('TOPPADDING', (0, 0), (-1, 0), 10),
                            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),  # Body padding
                            ('TOPPADDING', (0, 1), (-1, -1), 8),
                            ('LEFTPADDING', (0, 0), (-1, -1), 8),
                            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                            ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                        ]))
                        self.story.append(exhibitor_table)
            except PDI.DoesNotExist:
                pass
            
        except FinalData.DoesNotExist:
            self.story.append(Paragraph(
                self._t("No final data available", "Brak danych końcowych"),
                self.subtext_style
            ))
        
        self.story.append(Spacer(1, 0.5*cm))
        
    def _add_pricing_note(self):
        """Add pricing information note at the end of the document."""
        self.story.append(Spacer(1, 0.5*cm))
        pricing_note = self._t(
            "Pricing information can be found in the offer and in the terms and conditions.",
            "Informacje o cenach można znaleźć w ofercie oraz w regulaminie."
        )
        self.story.append(Paragraph(pricing_note, self.subtext_style))
    
    def _add_footer(self, canvas, doc):
        """Add footer with generation date on every page."""
        # Save the current state
        canvas.saveState()
        
        # Format date
        date_str = self.generation_date.strftime(
            self._t("%B %d, %Y", "%d %B %Y")
        )
        footer_text = self._t(
            f"Generated on: {date_str}",
            f"Wygenerowano: {date_str}"
        )
        
        # Set font and color
        canvas.setFont(self._font_name, FONT_SIZE_SUBTEXT)
        canvas.setFillColor(SUBTEXT_COLOR)
        
        # Calculate footer position (centered at bottom)
        footer_y = 1*cm
        text_width = canvas.stringWidth(footer_text, self._font_name, FONT_SIZE_SUBTEXT)
        page_width = doc.pagesize[0]
        footer_x = (page_width - text_width) / 2
        
        # Draw footer text
        canvas.drawString(footer_x, footer_y, footer_text)
        
        # Restore the state
        canvas.restoreState()
