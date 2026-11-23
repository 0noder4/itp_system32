"""
PDF Generator Service for Order Summary
Generates comprehensive, compact PDF documents with all stage data for exhibitors.
"""

from io import BytesIO
from decimal import Decimal
import logging
import os
from xml.sax.saxutils import escape as xml_escape

from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .models import (
    Address,
    BasicData,
    CARPET_COLORS_RIPS,
    CARPET_COLORS_WELUR,
    DEFAULT_CARPET_CHOICE,
    DEFAULT_CARPET_COLOR,
    Description,
    EquipmentSelection,
    Exhibitor,
    FinalData,
    Jobwall,
    Lunch,
    PDI,
    PDIAttendee,
    Settings,
    Stand,
    StandDetails,
    Workshop,
    company_can_access_stage3,
    company_chooses_carpet,
)
from .pricing import (
    PACKAGE_LABELS_EN,
    PACKAGE_LABELS_PL,
    calculate_company_costs,
    calculate_equipment_breakdown,
    calculate_jobwall_breakdown,
    calculate_lunch_breakdown,
)

logger = logging.getLogger(__name__)

# Compact, crisp typography and spacing
CONTENT_WIDTH = 18.0 * cm
FONT_SIZE_TITLE = 15
FONT_SIZE_COMPANY = 10.5
FONT_SIZE_HEADING = 10
FONT_SIZE_SUBHEADING = 8.5
FONT_SIZE_TABLE_HEADER = 8
FONT_SIZE_BODY = 8
FONT_SIZE_SUBTEXT = 7.5

# Try to register fonts that support Polish characters
font_registered = False
font_bold_registered = False

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
                bold_path = font_path.replace('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf')
                if os.path.exists(bold_path):
                    try:
                        pdfmetrics.registerFont(TTFont('DejaVuSansBold', bold_path))
                        from reportlab.lib.fonts import addMapping
                        addMapping('DejaVuSans', 0, 1, 'DejaVuSansBold')
                        font_bold_registered = True
                    except Exception:
                        pass
                break
            except Exception:
                continue
except Exception:
    pass

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
                            from reportlab.lib.fonts import addMapping
                            addMapping('DejaVuSans', 0, 1, 'DejaVuSansBold')
                            font_bold_registered = True
                        except Exception:
                            pass
                    break
                except Exception:
                    continue
    except Exception:
        pass

if not font_registered:
    try:
        pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))
        pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
        font_registered = True
        font_bold_registered = True
    except Exception:
        pass

# Theme colors matching web application
PRIMARY_COLOR = colors.HexColor('#333333')
ACCENT_COLOR = colors.HexColor('#F55718')
BORDER_COLOR = colors.HexColor('#E5E7EB')
MUTED_COLOR = colors.HexColor('#F5F5F5')
ROW_STRIPE_COLOR = colors.HexColor('#FAFAFA')
SUBCARD_HEADER_BG = colors.HexColor('#FFF3ED')
TEXT_COLOR = colors.HexColor('#252525')
SUBTEXT_COLOR = colors.HexColor('#6B7280')

PL_MONTHS_GENITIVE = {
    1: 'stycznia',
    2: 'lutego',
    3: 'marca',
    4: 'kwietnia',
    5: 'maja',
    6: 'czerwca',
    7: 'lipca',
    8: 'sierpnia',
    9: 'września',
    10: 'października',
    11: 'listopada',
    12: 'grudnia',
}

EN_MONTHS = {
    1: 'January',
    2: 'February',
    3: 'March',
    4: 'April',
    5: 'May',
    6: 'June',
    7: 'July',
    8: 'August',
    9: 'September',
    10: 'October',
    11: 'November',
    12: 'December',
}

CARPET_COLORS_EN = {
    'rips': {
        '005': 'white',
        '035': 'yellow',
        '033': 'orange',
        '037': 'red',
        '313': 'burgundy',
        '042': 'pink',
        '029': 'purple',
        '946': 'honey',
        '912': 'beige',
        '248': 'dark brown',
        '065': 'green',
        '602': 'dark green',
        '054': 'blue',
        '055': 'dark blue',
        '543': 'navy',
        '022': 'light grey',
        '892': 'grey',
        '940': 'graphite',
        '890': 'anthracite',
        '021': 'black',
    },
    'welur': {
        'V005': 'white',
        'V810': 'yellow',
        'V800': 'orange',
        'V372': 'red',
        'V320': 'burgundy',
        'V322': 'fuchsia',
        'V250': 'light beige',
        'V549': 'blue',
        'V551': 'dark blue',
        'V560': 'navy',
        'V254': 'beige',
        'V171': 'lemon',
        'V650': 'green',
        'V643': 'dark green',
        'V228': 'light grey',
        'V202': 'grey',
        'V234': 'graphite',
        'V215': 'anthracite',
        'V217': 'black',
    },
}

CARPET_COLORS_PL = {
    'rips': dict(CARPET_COLORS_RIPS),
    'welur': dict(CARPET_COLORS_WELUR),
}


def _esc(value) -> str:
    """Escape text for ReportLab Paragraph XML and preserve line breaks."""
    if value is None:
        return ''
    return xml_escape(str(value)).replace('\r\n', '\n').replace('\n', '<br/>')


class _NumberedCanvas(canvas.Canvas):
    """Canvas subclass enabling 'Page X of Y' / 'Strona X / Y' in footers."""

    def __init__(self, *args, footer_callback=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self._footer_callback = footer_callback

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            if self._footer_callback:
                self._footer_callback(self, num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)


class OrderSummaryPDFGenerator:
    """Generates PDF order summaries for companies with all stage data."""

    def __init__(self, company, language='pl'):
        self.company = company
        self.language = language if language in ['en', 'pl'] else 'pl'
        company_name = (getattr(company, 'name', '') or '').strip() or f"#{getattr(company, 'id', '')}"
        if self.language == 'en':
            self.doc_title = f"Order Summary — {company_name}"
            self.doc_author = "Engineering Job Fair (ITP)"
        else:
            self.doc_title = f"Podsumowanie zamówienia — {company_name}"
            self.doc_author = "Inżynierskie Targi Pracy (ITP)"
        self.buffer = BytesIO()
        self.generation_date = timezone.now()
        self.doc = SimpleDocTemplate(
            self.buffer,
            pagesize=A4,
            rightMargin=1.5 * cm,
            leftMargin=1.5 * cm,
            topMargin=1.3 * cm,
            bottomMargin=1.5 * cm,
            title=self.doc_title,
            author=self.doc_author,
            subject=self.doc_title,
            creator=self.doc_author,
        )
        self.story = []
        self.styles = getSampleStyleSheet()

        registered_fonts = pdfmetrics.getRegisteredFontNames()
        if font_registered and 'DejaVuSans' in registered_fonts:
            self._font_name = 'DejaVuSans'
            if font_bold_registered and 'DejaVuSansBold' in registered_fonts:
                try:
                    self._font_bold = (
                        'DejaVuSansBold'
                        if pdfmetrics.getFont('DejaVuSansBold')
                        else 'DejaVuSans'
                    )
                except Exception:
                    self._font_bold = 'DejaVuSans'
            else:
                self._font_bold = 'DejaVuSans'
        else:
            self._font_name = 'Helvetica'
            self._font_bold = 'Helvetica-Bold'

        self._setup_custom_styles()

    def _setup_custom_styles(self):
        """Setup compact, consistent paragraph and table styles."""
        self.title_style = ParagraphStyle(
            'OrderTitle',
            parent=self.styles['Normal'],
            fontName=self._font_bold,
            fontSize=FONT_SIZE_TITLE,
            textColor=ACCENT_COLOR,
            leading=FONT_SIZE_TITLE + 3,
            spaceBefore=0,
            spaceAfter=2,
            alignment=TA_LEFT,
        )

        self.company_name_style = ParagraphStyle(
            'OrderCompanyName',
            parent=self.styles['Normal'],
            fontName=self._font_bold,
            fontSize=FONT_SIZE_COMPANY,
            textColor=PRIMARY_COLOR,
            leading=FONT_SIZE_COMPANY + 3,
            spaceBefore=0,
            spaceAfter=2,
            alignment=TA_LEFT,
        )

        self.masthead_meta_style = ParagraphStyle(
            'OrderMastheadMeta',
            parent=self.styles['Normal'],
            fontName=self._font_name,
            fontSize=FONT_SIZE_SUBTEXT,
            textColor=SUBTEXT_COLOR,
            leading=FONT_SIZE_SUBTEXT + 2.5,
            spaceBefore=0,
            spaceAfter=0,
        )

        self.heading_style = ParagraphStyle(
            'OrderSectionHeading',
            parent=self.styles['Normal'],
            fontName=self._font_bold,
            fontSize=FONT_SIZE_HEADING,
            textColor=PRIMARY_COLOR,
            leading=FONT_SIZE_HEADING + 3,
            spaceBefore=6,
            spaceAfter=4,
            keepWithNext=True,
        )

        self.subheading_style = ParagraphStyle(
            'OrderSubheading',
            parent=self.styles['Normal'],
            fontName=self._font_bold,
            fontSize=FONT_SIZE_SUBHEADING,
            textColor=PRIMARY_COLOR,
            leading=FONT_SIZE_SUBHEADING + 2.5,
            spaceBefore=4,
            spaceAfter=3,
            keepWithNext=True,
        )

        self.normal_style = ParagraphStyle(
            'OrderNormal',
            parent=self.styles['Normal'],
            fontName=self._font_name,
            fontSize=FONT_SIZE_BODY,
            textColor=TEXT_COLOR,
            leading=FONT_SIZE_BODY + 2,
            spaceBefore=0,
            spaceAfter=3,
        )

        self.subtext_style = ParagraphStyle(
            'OrderSubtext',
            parent=self.styles['Normal'],
            fontName=self._font_name,
            fontSize=FONT_SIZE_SUBTEXT,
            textColor=SUBTEXT_COLOR,
            leading=FONT_SIZE_SUBTEXT + 2,
            spaceBefore=0,
            spaceAfter=2,
        )

        # Dedicated table cell styles (no extra spaceAfter/spaceBefore)
        self.cell_style = ParagraphStyle(
            'OrderCell',
            parent=self.styles['Normal'],
            fontName=self._font_name,
            fontSize=FONT_SIZE_BODY,
            textColor=TEXT_COLOR,
            leading=FONT_SIZE_BODY + 2,
            spaceBefore=0,
            spaceAfter=0,
        )

        self.cell_bold_style = ParagraphStyle(
            'OrderCellBold',
            parent=self.cell_style,
            fontName=self._font_bold,
            textColor=PRIMARY_COLOR,
        )

        self.cell_right_style = ParagraphStyle(
            'OrderCellRight',
            parent=self.cell_style,
            alignment=TA_RIGHT,
        )

        self.cell_right_bold_style = ParagraphStyle(
            'OrderCellRightBold',
            parent=self.cell_bold_style,
            alignment=TA_RIGHT,
        )

        self.cell_center_style = ParagraphStyle(
            'OrderCellCenter',
            parent=self.cell_style,
            alignment=TA_CENTER,
        )

        self.table_header_style = ParagraphStyle(
            'OrderTableHeader',
            parent=self.styles['Normal'],
            fontName=self._font_bold,
            fontSize=FONT_SIZE_TABLE_HEADER,
            textColor=colors.white,
            leading=FONT_SIZE_TABLE_HEADER + 2,
            spaceBefore=0,
            spaceAfter=0,
        )

        self.table_header_center_style = ParagraphStyle(
            'OrderTableHeaderCenter',
            parent=self.table_header_style,
            alignment=TA_CENTER,
        )

        self.table_header_right_style = ParagraphStyle(
            'OrderTableHeaderRight',
            parent=self.table_header_style,
            alignment=TA_RIGHT,
        )

    def _t(self, key_en, key_pl):
        """Get translation based on language."""
        return key_en if self.language == 'en' else key_pl

    def _compact_table_padding(self, has_header_row: bool) -> list:
        cmds = [
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ]
        if has_header_row:
            cmds.extend([
                ('BACKGROUND', (0, 0), (-1, 0), ACCENT_COLOR),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('TOPPADDING', (0, 0), (-1, 0), 4.5),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 4.5),
                ('TOPPADDING', (0, 1), (-1, -1), 3.5),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 3.5),
            ])
        else:
            cmds.extend([
                ('TOPPADDING', (0, 0), (-1, -1), 3.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
            ])
        return cmds

    def _zebra_rows(self, table: Table, start_row: int, end_row: int):
        """Apply subtle alternating row striping to a range of body rows."""
        cmds = []
        for idx, row_num in enumerate(range(start_row, end_row)):
            bg = ROW_STRIPE_COLOR if idx % 2 == 1 else colors.white
            cmds.append(('BACKGROUND', (0, row_num), (-1, row_num), bg))
        if cmds:
            table.setStyle(TableStyle(cmds))

    def _format_attendance(self, attendance, system_settings):
        """Format attendance choice with fair dates."""
        day1 = (
            system_settings.get_day1_display_pl()
            if self.language != 'en'
            else system_settings.get_day1_display_en()
        )
        day2 = (
            system_settings.get_day2_display_pl()
            if self.language != 'en'
            else system_settings.get_day2_display_en()
        )
        labels = {
            'both': self._t('Both days', 'Oba dni'),
            'day1': self._t(f'First day ({day1})', f'Pierwszego dnia ({day1})'),
            'day2': self._t(f'Second day ({day2})', f'Drugiego dnia ({day2})'),
            'none': self._t('Will not attend in person', 'Nie będzie mnie osobiście'),
        }
        return labels.get(attendance, attendance or '—')

    def _format_person_contact(self, user) -> str:
        """Format User contact (full name, email, optional phone) concisely."""
        if not user:
            return '—'
        full_name = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
        if not full_name:
            full_name = getattr(user, 'username', '') or ''
        parts = [p for p in (full_name, getattr(user, 'email', ''), getattr(user, 'phone_number', '')) if p]
        return ' • '.join(parts) if parts else '—'

    def _format_carpet_summary(self, stand_details) -> str:
        """Format carpet choice + localized color name."""
        choice = getattr(stand_details, 'carpet_choice', None) or ''
        color = getattr(stand_details, 'carpet_color', None) or ''
        if not choice and not company_chooses_carpet(self.company):
            choice = DEFAULT_CARPET_CHOICE
            color = DEFAULT_CARPET_COLOR

        if choice in ('rips', 'welur'):
            type_label = 'RIPS EXPO' if choice == 'rips' else 'WELUR EXPO'
            if color:
                palette = CARPET_COLORS_EN[choice] if self.language == 'en' else CARPET_COLORS_PL[choice]
                color_name = palette.get(color)
                color_text = f"{color} {color_name}" if color_name else color
                return f"{type_label} — {color_text}"
            return type_label

        return self._t('Not selected', 'Nie wybrano')

    def _make_canvas(self, *args, **kwargs):
        return _NumberedCanvas(*args, footer_callback=self._add_footer, **kwargs)

    def generate(self):
        """Generate the complete PDF document."""
        system_settings = Settings.get_settings()

        self._add_header(system_settings)
        self._add_company_data(system_settings)
        self._add_stand_section(system_settings)
        self._add_workshop_section(system_settings)
        self._add_catalogue_data(system_settings)
        self._add_delegates_and_lunches(system_settings)
        self._add_cost_summary_and_note(system_settings)

        self.doc.build(self.story, canvasmaker=self._make_canvas)
        self.buffer.seek(0)
        return self.buffer

    def _add_header(self, system_settings: Settings):
        """Add compact 2-column masthead with title, company, fair metadata, and logo."""
        try:
            basic_data = BasicData.objects.get(company=self.company)
            company_full_name = basic_data.full_name or self.company.name
        except BasicData.DoesNotExist:
            company_full_name = self.company.name

        package_labels = PACKAGE_LABELS_EN if self.language == 'en' else PACKAGE_LABELS_PL
        package_label = package_labels.get(self.company.status, self.company.status)
        day1_str = system_settings.get_day1_display_pl() if self.language != 'en' else system_settings.get_day1_display_en()
        day2_str = system_settings.get_day2_display_pl() if self.language != 'en' else system_settings.get_day2_display_en()
        fair_name = self._t('Engineering Job Fair', 'Inżynierskie Targi Pracy')
        meta_line = f"{package_label} • {fair_name} • {day1_str} – {day2_str}"

        left_flow = [
            Paragraph(self._t('Order Summary', 'Podsumowanie zamówienia'), self.title_style),
            Paragraph(_esc(company_full_name), self.company_name_style),
            Paragraph(_esc(meta_line), self.masthead_meta_style),
        ]

        logo_flow = ''
        logo_path = os.path.join(settings.BASE_DIR, 'static', 'images', 'ITP_LOGO_horizontal_black.png')
        if os.path.exists(logo_path):
            try:
                from PIL import Image as PILImage
                with PILImage.open(logo_path) as pil_img:
                    img_width, img_height = pil_img.size
                if img_width > 0 and img_height > 0:
                    logo_width = 4.8 * cm
                    logo_height = logo_width * (float(img_height) / float(img_width))
                    logo = Image(logo_path, width=float(logo_width), height=float(logo_height))
                    logo.hAlign = 'RIGHT'
                    logo_flow = logo
            except Exception as exc:
                logger.warning(f"Could not load logo image: {exc}")

        masthead = Table([[left_flow, logo_flow]], colWidths=[12.8 * cm, 5.2 * cm])
        masthead.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        self.story.append(masthead)
        self.story.append(HRFlowable(
            width='100%',
            thickness=0.8,
            color=ACCENT_COLOR,
            spaceBefore=2,
            spaceAfter=6,
        ))

    def _add_company_data(self, system_settings: Settings):
        """Add compact 4-column Company Data & Contact section."""
        heading = Paragraph(self._t('Company Data & Contacts', 'Dane firmy i kontakt'), self.heading_style)

        package_labels = PACKAGE_LABELS_EN if self.language == 'en' else PACKAGE_LABELS_PL
        package_label = package_labels.get(self.company.status, self.company.status)

        try:
            basic_data = BasicData.objects.get(company=self.company)
            address = Address.objects.filter(form=basic_data).first()

            if address:
                street_line = address.street or ''
                house_parts = [p for p in (address.home_number, address.apt_number) if p]
                if house_parts:
                    street_line = f"{street_line} {'/'.join(house_parts)}".strip()
                city_line = f"{address.postal_code} {address.city}".strip()
                addr_parts = [p for p in (street_line, city_line, address.country) if p]
                address_text = ', '.join(addr_parts) or '—'
            else:
                address_text = '—'

            rep_text = self._format_person_contact(self.company.representative)
            fr_text = self._format_person_contact(self.company.fr_resp)

            rows = [
                [
                    Paragraph(self._t('Full Name:', 'Pełna nazwa:'), self.cell_bold_style),
                    Paragraph(_esc(basic_data.full_name or self.company.name), self.cell_style),
                    Paragraph(self._t('Tax ID (NIP):', 'NIP:'), self.cell_bold_style),
                    Paragraph(_esc(basic_data.nip or '—'), self.cell_style),
                ],
                [
                    Paragraph(self._t('Address:', 'Adres:'), self.cell_bold_style),
                    Paragraph(_esc(address_text), self.cell_style),
                    Paragraph(self._t('Package:', 'Pakiet:'), self.cell_bold_style),
                    Paragraph(_esc(package_label), self.cell_style),
                ],
                [
                    Paragraph(self._t('Representative:', 'Przedstawiciel:'), self.cell_bold_style),
                    Paragraph(_esc(rep_text), self.cell_style),
                    Paragraph(self._t('FR Supervisor:', 'Opiekun FR:'), self.cell_bold_style),
                    Paragraph(_esc(fr_text), self.cell_style),
                ],
            ]

            table = Table(rows, colWidths=[3.0 * cm, 6.0 * cm, 2.8 * cm, 6.2 * cm])
            table.setStyle(TableStyle([
                *self._compact_table_padding(has_header_row=False),
                ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
                ('BACKGROUND', (2, 0), (2, -1), MUTED_COLOR),
                ('BACKGROUND', (1, 0), (1, -1), colors.white),
                ('BACKGROUND', (3, 0), (3, -1), colors.white),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            self.story.append(KeepTogether([heading, table, Spacer(1, 0.25 * cm)]))
        except BasicData.DoesNotExist:
            self.story.append(KeepTogether([
                heading,
                Paragraph(self._t('No basic data available', 'Brak danych podstawowych'), self.subtext_style),
                Spacer(1, 0.25 * cm),
            ]))

    def _add_stand_section(self, system_settings: Settings):
        """Add Stand details, stand assignments, and equipment table."""
        heading = Paragraph(self._t('Stand & Equipment', 'Stoisko i wyposażenie'), self.heading_style)

        stands = Stand.objects.filter(company=self.company)
        day1_stand = stands.filter(day='day1').first()
        day2_stand = stands.filter(day='day2').first()
        stand_details = StandDetails.objects.filter(company=self.company).first()

        if not day1_stand and not day2_stand and not stand_details:
            self.story.append(KeepTogether([
                heading,
                Paragraph(self._t('No stand data available', 'Brak danych stoiska'), self.subtext_style),
                Spacer(1, 0.25 * cm),
            ]))
            return

        first_block_flowables = [heading]

        # 1. Stand configuration (Stage 2)
        if stand_details:
            is_provided = stand_details.stand_type == 'provided_stand'
            stand_type_value = self._t(
                'Provided Stand' if is_provided else 'Self Construction',
                'Stoisko organizatora' if is_provided else 'Własna zabudowa',
            )
            carpet_value = self._format_carpet_summary(stand_details)

            info_rows = [
                [
                    Paragraph(self._t('Stand Type:', 'Typ stoiska:'), self.cell_bold_style),
                    Paragraph(_esc(stand_type_value), self.cell_style),
                    Paragraph(self._t('Carpet:', 'Wykładzina:'), self.cell_bold_style),
                    Paragraph(_esc(carpet_value), self.cell_style),
                ]
            ]
            span_cmds = []

            if is_provided:
                logo_status = (
                    self._t('Uploaded', 'Przesłano')
                    if stand_details.logo_sign_file
                    else self._t('None', 'Brak')
                )
                if stand_details.name_sign_text:
                    info_rows.append([
                        Paragraph(self._t('Name Sign Text:', 'Napis na fryz:'), self.cell_bold_style),
                        Paragraph(_esc(stand_details.name_sign_text), self.cell_style),
                        Paragraph(self._t('Frieze Logo:', 'Logotyp na fryz:'), self.cell_bold_style),
                        Paragraph(_esc(logo_status), self.cell_style),
                    ])
                else:
                    r_idx = len(info_rows)
                    info_rows.append([
                        Paragraph(self._t('Frieze Logo:', 'Logotyp na fryz:'), self.cell_bold_style),
                        Paragraph(_esc(logo_status), self.cell_style),
                        '',
                        '',
                    ])
                    span_cmds.append(('SPAN', (1, r_idx), (3, r_idx)))
            else:
                viz_status = (
                    self._t('Uploaded', 'Przesłano')
                    if stand_details.stand_visualization
                    else self._t('None', 'Brak')
                )
                fire_status = (
                    self._t('Uploaded', 'Przesłano')
                    if stand_details.fire_cert
                    else self._t('None', 'Brak')
                )
                info_rows.append([
                    Paragraph(self._t('Dimensions:', 'Wymiary zabudowy:'), self.cell_bold_style),
                    Paragraph(_esc(stand_details.sc_details or '—'), self.cell_style),
                    Paragraph(self._t('Visualization:', 'Wizualizacja zabudowy:'), self.cell_bold_style),
                    Paragraph(_esc(viz_status), self.cell_style),
                ])
                r_fire = len(info_rows)
                info_rows.append([
                    Paragraph(self._t('Fire Certificate:', 'Certyfikat niepalności:'), self.cell_bold_style),
                    Paragraph(_esc(fire_status), self.cell_style),
                    '',
                    '',
                ])
                span_cmds.append(('SPAN', (1, r_fire), (3, r_fire)))

                if stand_details.brought_equipment:
                    r_eq = len(info_rows)
                    info_rows.append([
                        Paragraph(self._t('Brought Equipment:', 'Przywożony sprzęt:'), self.cell_bold_style),
                        Paragraph(_esc(stand_details.brought_equipment), self.cell_style),
                        '',
                        '',
                    ])
                    span_cmds.append(('SPAN', (1, r_eq), (3, r_eq)))

            info_table = Table(info_rows, colWidths=[3.3 * cm, 5.7 * cm, 3.3 * cm, 5.7 * cm])
            table_cmds = [
                *self._compact_table_padding(has_header_row=False),
                ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
                ('BACKGROUND', (2, 0), (2, 0), MUTED_COLOR),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]
            # Highlight column 2 as label cell only on rows that actually have a 2nd pair
            for r_idx, row in enumerate(info_rows):
                if r_idx > 0 and row[2] != '':
                    table_cmds.append(('BACKGROUND', (2, r_idx), (2, r_idx), MUTED_COLOR))
            table_cmds.extend(span_cmds)
            info_table.setStyle(TableStyle(table_cmds))
            first_block_flowables.append(info_table)
            first_block_flowables.append(Spacer(1, 0.2 * cm))

        # 2. Stand assignments by day
        size_mapping = {
            'podstawowy': '4 m²',
            'standardowy': '6 m²',
            'rozszerzony': '8 m²',
            '12m2': '12 m²',
        }
        assign_rows = [[
            Paragraph(self._t('Day', 'Dzień'), self.table_header_style),
            Paragraph(self._t('Stand Number', 'Numer stoiska'), self.table_header_style),
            Paragraph(self._t('Stand Size', 'Rozmiar stoiska'), self.table_header_style),
        ]]
        if day1_stand:
            assign_rows.append([
                Paragraph(_esc(self._t(
                    f"Day 1 ({system_settings.get_day1_display_en()})",
                    f"Dzień 1 ({system_settings.get_day1_display_pl()})",
                )), self.cell_style),
                Paragraph(_esc(day1_stand.stand_number), self.cell_bold_style),
                Paragraph(_esc(size_mapping.get(day1_stand.stand_size, day1_stand.stand_size)), self.cell_style),
            ])
        if day2_stand:
            assign_rows.append([
                Paragraph(_esc(self._t(
                    f"Day 2 ({system_settings.get_day2_display_en()})",
                    f"Dzień 2 ({system_settings.get_day2_display_pl()})",
                )), self.cell_style),
                Paragraph(_esc(day2_stand.stand_number), self.cell_bold_style),
                Paragraph(_esc(size_mapping.get(day2_stand.stand_size, day2_stand.stand_size)), self.cell_style),
            ])

        if len(assign_rows) > 1:
            assign_table = Table(assign_rows, colWidths=[7.0 * cm, 5.5 * cm, 5.5 * cm])
            assign_table.setStyle(TableStyle([
                *self._compact_table_padding(has_header_row=True),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            self._zebra_rows(assign_table, 1, len(assign_rows))
            first_block_flowables.append(assign_table)
            first_block_flowables.append(Spacer(1, 0.2 * cm))

        self.story.append(KeepTogether(first_block_flowables))

        # 3. Equipment table
        if stand_details:
            selections = [
                sel for sel in EquipmentSelection.objects.filter(
                    stand_details=stand_details
                ).select_related('equipment_item')
                if (sel.quantity or 0) > 0
            ]
            if selections:
                eq_breakdown = calculate_equipment_breakdown(self.company)
                total_eq_cost = eq_breakdown['cost']

                eq_rows = [[
                    Paragraph(self._t('Equipment Item', 'Wyposażenie'), self.table_header_style),
                    Paragraph(self._t('Qty', 'Ilość'), self.table_header_center_style),
                    Paragraph(self._t('Included', 'W pakiecie'), self.table_header_center_style),
                    Paragraph(self._t('Paid', 'Płatne'), self.table_header_center_style),
                    Paragraph(self._t('Unit Price', 'Cena jedn.'), self.table_header_right_style),
                    Paragraph(self._t('Netto Cost', 'Koszt netto'), self.table_header_right_style),
                ]]

                for selection in selections:
                    item = selection.equipment_item
                    qty = int(selection.quantity or 0)
                    included = int(item.included_quantity or 0)
                    paid_qty = max(0, qty - included)
                    unit_price = item.price or Decimal('0.00')
                    line_cost = unit_price * paid_qty

                    item_name = item.name_pl if self.language == 'pl' else item.name_en
                    if getattr(item, 'code', None) == 'tv' and selection.mount_type:
                        mount_label = (
                            self._t('wall', 'ściana')
                            if selection.mount_type == 'wall'
                            else self._t('stand', 'stojak')
                        )
                        item_name = f"{item_name} ({mount_label})"

                    eq_rows.append([
                        Paragraph(_esc(item_name), self.cell_style),
                        Paragraph(str(qty), self.cell_center_style),
                        Paragraph(str(included) if included > 0 else '—', self.cell_center_style),
                        Paragraph(str(paid_qty) if paid_qty > 0 else '—', self.cell_center_style),
                        Paragraph(f"{unit_price:.2f} PLN" if unit_price > 0 else '—', self.cell_right_style),
                        Paragraph(f"{line_cost:.2f} PLN" if line_cost > 0 else '0.00 PLN', self.cell_right_style),
                    ])

                has_total_row = total_eq_cost > Decimal('0.00')
                if has_total_row:
                    eq_rows.append([
                        Paragraph(
                            self._t('Total Extra Equipment (netto):', 'Razem wyposażenie dodatkowe (netto):'),
                            self.cell_bold_style,
                        ),
                        '', '', '', '',
                        Paragraph(f"{total_eq_cost:.2f} PLN", self.cell_right_bold_style),
                    ])

                eq_table = Table(
                    eq_rows,
                    colWidths=[7.4 * cm, 1.9 * cm, 2.3 * cm, 2.0 * cm, 2.1 * cm, 2.3 * cm],
                    repeatRows=1,
                )
                eq_cmds = [
                    *self._compact_table_padding(has_header_row=True),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ]
                body_end = len(eq_rows) - 1 if has_total_row else len(eq_rows)
                eq_table.setStyle(TableStyle(eq_cmds))
                self._zebra_rows(eq_table, 1, body_end)
                if has_total_row:
                    eq_table.setStyle(TableStyle([
                        ('SPAN', (0, -1), (4, -1)),
                        ('BACKGROUND', (0, -1), (-1, -1), MUTED_COLOR),
                    ]))

                if len(eq_rows) <= 12:
                    self.story.append(KeepTogether([eq_table, Spacer(1, 0.25 * cm)]))
                else:
                    self.story.append(eq_table)
                    self.story.append(Spacer(1, 0.25 * cm))
            else:
                self.story.append(Paragraph(
                    self._t('No additional equipment selected', 'Nie wybrano wyposażenia'),
                    self.subtext_style,
                ))
                self.story.append(Spacer(1, 0.2 * cm))

    def _add_workshop_section(self, system_settings: Settings):
        """Add Stage 3 (Workshops) section for Partner/Main companies or when conducted."""
        workshop = Workshop.objects.filter(company=self.company).prefetch_related('facilitators').first()
        is_stage3_eligible = company_can_access_stage3(self.company)
        if not is_stage3_eligible and not (workshop and workshop.workshop is True):
            return

        heading = Paragraph(self._t('Workshops', 'Warsztaty'), self.heading_style)
        if not workshop or workshop.workshop is not True:
            self.story.append(KeepTogether([
                heading,
                Paragraph(
                    self._t('Not conducting a workshop', 'Firma nie prowadzi warsztatu'),
                    self.subtext_style,
                ),
                Spacer(1, 0.25 * cm),
            ]))
            return

        rows = []
        if workshop.title:
            rows.append([
                Paragraph(self._t('Workshop Title:', 'Nazwa warsztatu:'), self.cell_bold_style),
                Paragraph(_esc(workshop.title), self.cell_style),
            ])

        pref_parts = []
        if workshop.preferred_day == 'day1':
            pref_parts.append(self._t(
                f"Day 1 ({system_settings.get_day1_display_en()})",
                f"Dzień 1 ({system_settings.get_day1_display_pl()})",
            ))
        elif workshop.preferred_day == 'day2':
            pref_parts.append(self._t(
                f"Day 2 ({system_settings.get_day2_display_en()})",
                f"Dzień 2 ({system_settings.get_day2_display_pl()})",
            ))
        if workshop.preferred_time:
            pref_parts.append(workshop.preferred_time.strftime('%H:%M'))
        if pref_parts:
            rows.append([
                Paragraph(self._t('Preferred Time:', 'Preferowany termin:'), self.cell_bold_style),
                Paragraph(_esc(' • '.join(pref_parts)), self.cell_style),
            ])

        amenities = []
        if workshop.room_projector:
            amenities.append(self._t('Projector', 'Rzutnik'))
        if workshop.room_hdmi:
            amenities.append(self._t('HDMI cable', 'Kabel HDMI'))
        if workshop.room_other:
            amenities.append(workshop.room_other)
        if amenities:
            rows.append([
                Paragraph(self._t('Room Equipment:', 'Wyposażenie sali:'), self.cell_bold_style),
                Paragraph(_esc(', '.join(amenities)), self.cell_style),
            ])

        if workshop.contact_phone:
            rows.append([
                Paragraph(self._t('Contact Phone:', 'Telefon kontaktowy:'), self.cell_bold_style),
                Paragraph(_esc(workshop.contact_phone), self.cell_style),
            ])
        if workshop.description:
            rows.append([
                Paragraph(self._t('Description:', 'Opis warsztatu:'), self.cell_bold_style),
                Paragraph(_esc(workshop.description), self.cell_style),
            ])
        if workshop.skills:
            rows.append([
                Paragraph(self._t('Practical Skills:', 'Umiejętności:'), self.cell_bold_style),
                Paragraph(_esc(workshop.skills), self.cell_style),
            ])
        if workshop.study_majors:
            rows.append([
                Paragraph(self._t('Target Majors:', 'Kierunki studiów:'), self.cell_bold_style),
                Paragraph(_esc(workshop.study_majors), self.cell_style),
            ])
        if workshop.notes:
            rows.append([
                Paragraph(self._t('Additional Notes:', 'Uwagi:'), self.cell_bold_style),
                Paragraph(_esc(workshop.notes), self.cell_style),
            ])

        flowables = [heading]
        if rows:
            ws_table = Table(rows, colWidths=[4.0 * cm, 14.0 * cm], splitByRow=1)
            ws_table.setStyle(TableStyle([
                *self._compact_table_padding(has_header_row=False),
                ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
                ('BACKGROUND', (1, 0), (1, -1), colors.white),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            flowables.append(ws_table)
            flowables.append(Spacer(1, 0.2 * cm))

        self.story.append(KeepTogether(flowables))

        facilitators = list(workshop.facilitators.all())
        if facilitators:
            fac_heading = Paragraph(self._t('Facilitators:', 'Prowadzący:'), self.subheading_style)
            fac_rows = [[
                Paragraph(self._t('Full Name', 'Imię i nazwisko'), self.table_header_style),
                Paragraph(self._t('Phone', 'Telefon'), self.table_header_style),
                Paragraph(self._t('Bio / Role', 'Opis'), self.table_header_style),
            ]]
            for fac in facilitators:
                full_name = f"{fac.name} {fac.surname}".strip()
                fac_rows.append([
                    Paragraph(_esc(full_name or '—'), self.cell_style),
                    Paragraph(_esc(fac.phone_number or '—'), self.cell_style),
                    Paragraph(_esc(fac.description or '—'), self.cell_style),
                ])

            fac_table = Table(fac_rows, colWidths=[4.5 * cm, 3.5 * cm, 10.0 * cm], repeatRows=1)
            fac_table.setStyle(TableStyle([
                *self._compact_table_padding(has_header_row=True),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            self._zebra_rows(fac_table, 1, len(fac_rows))
            if len(fac_rows) <= 10:
                self.story.append(KeepTogether([fac_heading, fac_table, Spacer(1, 0.25 * cm)]))
            else:
                self.story.append(fac_heading)
                self.story.append(fac_table)
                self.story.append(Spacer(1, 0.25 * cm))
        else:
            self.story.append(Spacer(1, 0.05 * cm))

    def _add_catalogue_data(self, system_settings: Settings):
        """Add Catalogue Data section (Logo, Company Description, JobWall postings)."""
        heading = Paragraph(self._t('Catalogue & JobWall', 'Dane katalogowe i JobWall'), self.heading_style)

        description = Description.objects.filter(company=self.company).first()
        jobwalls = list(Jobwall.objects.filter(company=self.company))
        jw_breakdown = calculate_jobwall_breakdown(self.company, len(jobwalls), system_settings)

        logo_status = (
            self._t('Uploaded', 'Przesłano')
            if (description and description.logo_file)
            else self._t('None', 'Brak')
        )
        jw_summary = self._t(
            f"{jw_breakdown['total_count']} (included: {jw_breakdown['free_count']}, paid: {jw_breakdown['extra_count']})",
            f"{jw_breakdown['total_count']} (w pakiecie: {jw_breakdown['free_count']}, płatnych: {jw_breakdown['extra_count']})",
        )

        meta_table = Table(
            [[
                Paragraph(self._t('Catalogue Logo:', 'Logotyp do katalogu:'), self.cell_bold_style),
                Paragraph(_esc(logo_status), self.cell_style),
                Paragraph(self._t('JobWall Offers:', 'Ogłoszenia JobWall:'), self.cell_bold_style),
                Paragraph(_esc(jw_summary), self.cell_style),
            ]],
            colWidths=[3.6 * cm, 4.4 * cm, 3.8 * cm, 6.2 * cm],
        )
        meta_table.setStyle(TableStyle([
            *self._compact_table_padding(has_header_row=False),
            ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
            ('BACKGROUND', (2, 0), (2, -1), MUTED_COLOR),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('BACKGROUND', (3, 0), (3, -1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))

        intro_block = [heading, meta_table, Spacer(1, 0.2 * cm)]
        if description and description.descr:
            desc_text = description.descr
            if len(desc_text) <= 900:
                intro_block.append(Paragraph(self._t('Company Description:', 'Opis firmy:'), self.subheading_style))
                intro_block.append(Paragraph(_esc(desc_text), self.normal_style))
                intro_block.append(Spacer(1, 0.15 * cm))
                self.story.append(KeepTogether(intro_block))
            else:
                self.story.append(KeepTogether(intro_block))
                self.story.append(Paragraph(self._t('Company Description:', 'Opis firmy:'), self.subheading_style))
                self.story.append(Paragraph(_esc(desc_text), self.normal_style))
                self.story.append(Spacer(1, 0.15 * cm))
        else:
            self.story.append(KeepTogether(intro_block))

        if not jobwalls:
            self.story.append(Paragraph(
                self._t('No JobWall postings', 'Brak ogłoszeń JobWall'),
                self.subtext_style,
            ))
            self.story.append(Spacer(1, 0.25 * cm))
            return

        form_mapping = {
            's': self._t('On-site', 'Stacjonarnie'),
            'z': self._t('Remote', 'Zdalnie'),
            'h': self._t('Hybrid', 'Hybrydowo'),
            'k': self._t('Competition', 'Konkurs'),
            'm': self._t('Mobile', 'Mobilnie'),
        }
        workload_mapping = {
            'pelen': self._t('Full-time', 'Pełen etat'),
            'pol': self._t('Half-time', '1/2 etatu'),
            'trzyczwarte': self._t('3/4 time', '3/4 etatu'),
            'el': self._t('Flexible', 'Elastyczny'),
        }
        contract_mapping = {
            'uop': self._t('Employment contract', 'Umowa o pracę'),
            'uoz': self._t('Mandate contract', 'Umowa zlecenie'),
            'uod': self._t('Contract for work', 'Umowa o dzieło'),
            'b2b': self._t('B2B contract', 'Kontrakt B2B'),
            'uos': self._t('Internship/Traineeship', 'Staż/Praktyki'),
        }

        for idx, jobwall in enumerate(jobwalls, 1):
            title_label = self._t(f'Job Posting {idx}', f'Ogłoszenie {idx}')
            form_val = form_mapping.get(jobwall.form, jobwall.form)
            workload_val = workload_mapping.get(jobwall.workload, jobwall.workload)
            contract_val = contract_mapping.get(jobwall.contract, jobwall.contract)

            card_rows = [
                [
                    Paragraph(f"<b>{_esc(title_label)} — {_esc(jobwall.name)}</b>", self.cell_bold_style),
                    '', '', '',
                ],
                [
                    Paragraph(f"<b>{_esc(self._t('Form:', 'Forma:'))}</b> {_esc(form_val)}", self.cell_style),
                    '',
                    Paragraph(f"<b>{_esc(self._t('Workload:', 'Wymiar:'))}</b> {_esc(workload_val)}", self.cell_style),
                    Paragraph(f"<b>{_esc(self._t('Contract:', 'Umowa:'))}</b> {_esc(contract_val)}", self.cell_style),
                ],
            ]

            detail_fields = [
                (self._t('Description:', 'Opis:'), jobwall.description),
                (self._t('Requirements:', 'Wymagania:'), jobwall.requirements),
                (self._t('Benefits:', 'Benefity:'), jobwall.benefits),
                (self._t('Application Link:', 'Link do aplikacji:'), jobwall.url),
            ]
            for label, val in detail_fields:
                if val:
                    card_rows.append([
                        Paragraph(_esc(label), self.cell_bold_style),
                        Paragraph(_esc(val), self.cell_style),
                        '', '',
                    ])

            card_table = Table(
                card_rows,
                colWidths=[3.4 * cm, 2.6 * cm, 6.0 * cm, 6.0 * cm],
                splitByRow=1,
            )
            cmds = [
                *self._compact_table_padding(has_header_row=False),
                ('SPAN', (0, 0), (3, 0)),
                ('BACKGROUND', (0, 0), (3, 0), SUBCARD_HEADER_BG),
                ('SPAN', (0, 1), (1, 1)),
                ('BACKGROUND', (0, 1), (3, 1), colors.white),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]
            for r_idx in range(2, len(card_rows)):
                cmds.extend([
                    ('SPAN', (1, r_idx), (3, r_idx)),
                    ('BACKGROUND', (0, r_idx), (0, r_idx), MUTED_COLOR),
                    ('BACKGROUND', (1, r_idx), (3, r_idx), colors.white),
                ])
            card_table.setStyle(TableStyle(cmds))

            total_chars = sum(
                len(str(v or ''))
                for v in (jobwall.name, jobwall.description, jobwall.requirements, jobwall.benefits, jobwall.url)
            )
            spacer = Spacer(1, 0.2 * cm)
            if total_chars < 2200:
                self.story.append(KeepTogether([card_table, spacer]))
            else:
                self.story.append(card_table)
                self.story.append(spacer)

    def _add_delegates_and_lunches(self, system_settings: Settings):
        """Add Stage 5 logistics, power, arrival times, lunches, delegates, and PDI."""
        heading = Paragraph(
            self._t('Logistics, Delegates & Lunches', 'Organizacja, delegaci i obiady'),
            self.heading_style,
        )

        try:
            final_data = FinalData.objects.get(company=self.company)
        except FinalData.DoesNotExist:
            self.story.append(KeepTogether([
                heading,
                Paragraph(self._t('No final stage data available', 'Brak danych etapu 5'), self.subtext_style),
                Spacer(1, 0.25 * cm),
            ]))
            return

        pdi = PDI.objects.filter(form=final_data).first()
        logistics_rows = []

        # Electrical power
        devices_text = (final_data.el_devices or '').strip()
        power_text = (final_data.el_power or '').strip()
        if final_data.el_low_power:
            low_label = self._t('Low power (≤ 100 W)', 'Niska moc (≤ 100 W)')
            if devices_text and '100' not in devices_text:
                power_summary = f"{low_label} — {devices_text}"
            else:
                power_summary = low_label
        elif devices_text or power_text:
            if devices_text and power_text:
                power_summary = self._t(
                    f"{devices_text} (total power: {power_text})",
                    f"{devices_text} (łączna moc: {power_text})",
                )
            else:
                power_summary = devices_text or power_text
        else:
            power_summary = '—'

        logistics_rows.append([
            Paragraph(self._t('Electrical Power:', 'Zasilanie elektryczne:'), self.cell_bold_style),
            Paragraph(_esc(power_summary), self.cell_style),
        ])

        # Main representative
        if final_data.main_rep_name or final_data.main_rep_surname:
            rep_name = f"{final_data.main_rep_name} {final_data.main_rep_surname}".strip()
            rep_parts = [p for p in (
                rep_name,
                final_data.main_rep_phone,
                self._format_attendance(final_data.main_rep_attendance, system_settings),
            ) if p]
            logistics_rows.append([
                Paragraph(self._t('Main Representative:', 'Główny przedstawiciel:'), self.cell_bold_style),
                Paragraph(_esc(' — '.join(rep_parts)), self.cell_style),
            ])

        if final_data.lunches_declined:
            logistics_rows.append([
                Paragraph(self._t('Lunches:', 'Obiady:'), self.cell_bold_style),
                Paragraph(self._t('Lunches declined', 'Rezygnacja z obiadów'), self.cell_style),
            ])

        if pdi and (pdi.tickets_quantity or 0) > 0:
            logistics_rows.append([
                Paragraph(self._t('PDI Gala Tickets:', 'Bilety na galę PDI:'), self.cell_bold_style),
                Paragraph(str(pdi.tickets_quantity), self.cell_style),
            ])

        log_table = Table(logistics_rows, colWidths=[4.0 * cm, 14.0 * cm])
        log_table.setStyle(TableStyle([
            *self._compact_table_padding(has_header_row=False),
            ('BACKGROUND', (0, 0), (0, -1), MUTED_COLOR),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        self.story.append(KeepTogether([heading, log_table, Spacer(1, 0.2 * cm)]))

        # Lunches breakdown table
        if not final_data.lunches_declined:
            lunches = list(Lunch.objects.filter(form=final_data))
            if lunches:
                lunch_breakdown = calculate_lunch_breakdown(self.company, system_settings)
                free_per_day = lunch_breakdown['free_per_day']
                unit_price = lunch_breakdown['unit_price']
                extra_lunches = lunch_breakdown['extra_lunches']
                lunch_total_cost = lunch_breakdown['cost']

                qty_by_day = {'day1': 0, 'day2': 0}
                diet_notes = []
                for lunch in lunches:
                    if lunch.day in qty_by_day:
                        qty_by_day[lunch.day] += lunch.lunch_quantity or 0
                    if lunch.diet_info and lunch.diet_info.strip():
                        diet_notes.append(lunch.diet_info.strip())

                lunch_heading = Paragraph(self._t('Lunches:', 'Obiady:'), self.subheading_style)
                lunch_rows = [[
                    Paragraph(self._t('Day', 'Dzień'), self.table_header_style),
                    Paragraph(self._t('Ordered', 'Zamówione'), self.table_header_center_style),
                    Paragraph(self._t('Included', 'W pakiecie'), self.table_header_center_style),
                    Paragraph(self._t('Paid', 'Płatne'), self.table_header_center_style),
                    Paragraph(self._t('Netto Cost', 'Koszt netto'), self.table_header_right_style),
                ]]

                for day_key, day_display in (
                    ('day1', self._t(
                        f"Day 1 ({system_settings.get_day1_display_en()})",
                        f"Dzień 1 ({system_settings.get_day1_display_pl()})",
                    )),
                    ('day2', self._t(
                        f"Day 2 ({system_settings.get_day2_display_en()})",
                        f"Dzień 2 ({system_settings.get_day2_display_pl()})",
                    )),
                ):
                    ordered = qty_by_day[day_key]
                    paid = max(0, ordered - free_per_day)
                    day_cost = unit_price * paid
                    lunch_rows.append([
                        Paragraph(_esc(day_display), self.cell_style),
                        Paragraph(str(ordered), self.cell_center_style),
                        Paragraph(str(free_per_day), self.cell_center_style),
                        Paragraph(str(paid) if paid > 0 else '—', self.cell_center_style),
                        Paragraph(f"{day_cost:.2f} PLN", self.cell_right_style),
                    ])

                has_lunch_total = extra_lunches > 0 and lunch_total_cost > Decimal('0.00')
                if has_lunch_total:
                    lunch_rows.append([
                        Paragraph(
                            self._t('Total Additional Lunches (netto):', 'Razem dodatkowe obiady (netto):'),
                            self.cell_bold_style,
                        ),
                        '', '',
                        Paragraph(str(extra_lunches), self.cell_center_style),
                        Paragraph(f"{lunch_total_cost:.2f} PLN", self.cell_right_bold_style),
                    ])

                lunch_table = Table(
                    lunch_rows,
                    colWidths=[6.4 * cm, 2.7 * cm, 2.9 * cm, 2.5 * cm, 3.5 * cm],
                )
                lunch_table.setStyle(TableStyle([
                    *self._compact_table_padding(has_header_row=True),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ]))
                body_end = len(lunch_rows) - 1 if has_lunch_total else len(lunch_rows)
                self._zebra_rows(lunch_table, 1, body_end)
                if has_lunch_total:
                    lunch_table.setStyle(TableStyle([
                        ('SPAN', (0, -1), (2, -1)),
                        ('BACKGROUND', (0, -1), (-1, -1), MUTED_COLOR),
                    ]))

                lunch_block = [lunch_heading, lunch_table]
                if diet_notes:
                    unique_notes = '; '.join(dict.fromkeys(diet_notes))
                    lunch_block.append(Spacer(1, 0.1 * cm))
                    lunch_block.append(Paragraph(
                        f"<b>{_esc(self._t('Dietary Notes:', 'Uwagi żywieniowe:'))}</b> {_esc(unique_notes)}",
                        self.subtext_style,
                    ))
                lunch_block.append(Spacer(1, 0.2 * cm))
                self.story.append(KeepTogether(lunch_block))

        # Other delegates & PDI attendees
        if final_data.no_other_delegates:
            self.story.append(Paragraph(
                self._t('Other Delegates: none', 'Inni delegaci: brak'),
                self.subtext_style,
            ))
            self.story.append(Spacer(1, 0.15 * cm))
        elif pdi:
            exhibitors = list(Exhibitor.objects.filter(form=pdi))
            if exhibitors:
                del_heading = Paragraph(self._t('Other Delegates:', 'Inni delegaci:'), self.subheading_style)
                del_rows = [[
                    Paragraph(self._t('Full Name', 'Imię i nazwisko'), self.table_header_style),
                    Paragraph(self._t('Phone', 'Telefon'), self.table_header_style),
                    Paragraph(self._t('Attendance', 'Obecność'), self.table_header_style),
                ]]
                for ex in exhibitors:
                    full_name = f"{ex.name} {ex.surname}".strip()
                    del_rows.append([
                        Paragraph(_esc(full_name), self.cell_style),
                        Paragraph(_esc(ex.phone_number or '—'), self.cell_style),
                        Paragraph(_esc(self._format_attendance(ex.attendance, system_settings)), self.cell_style),
                    ])
                del_table = Table(del_rows, colWidths=[6.5 * cm, 4.5 * cm, 7.0 * cm], repeatRows=1)
                del_table.setStyle(TableStyle([
                    *self._compact_table_padding(has_header_row=True),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ]))
                self._zebra_rows(del_table, 1, len(del_rows))
                if len(del_rows) <= 12:
                    self.story.append(KeepTogether([del_heading, del_table, Spacer(1, 0.2 * cm)]))
                else:
                    self.story.append(del_heading)
                    self.story.append(del_table)
                    self.story.append(Spacer(1, 0.2 * cm))

        if pdi:
            attendees = list(PDIAttendee.objects.filter(form=pdi))
            if attendees:
                pdi_heading = Paragraph(self._t('PDI Gala Attendees:', 'Uczestnicy gali PDI:'), self.subheading_style)
                pdi_rows = [[
                    Paragraph(self._t('Full Name', 'Imię i nazwisko'), self.table_header_style),
                    Paragraph(self._t('Email', 'Email'), self.table_header_style),
                    Paragraph(self._t('Phone', 'Telefon'), self.table_header_style),
                ]]
                for att in attendees:
                    full_name = f"{att.name} {att.surname}".strip()
                    pdi_rows.append([
                        Paragraph(_esc(full_name), self.cell_style),
                        Paragraph(_esc(att.email or '—'), self.cell_style),
                        Paragraph(_esc(att.phone_number or '—'), self.cell_style),
                    ])
                pdi_table = Table(pdi_rows, colWidths=[5.5 * cm, 8.0 * cm, 4.5 * cm], repeatRows=1)
                pdi_table.setStyle(TableStyle([
                    *self._compact_table_padding(has_header_row=True),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ]))
                self._zebra_rows(pdi_table, 1, len(pdi_rows))
                if len(pdi_rows) <= 12:
                    self.story.append(KeepTogether([pdi_heading, pdi_table, Spacer(1, 0.2 * cm)]))
                else:
                    self.story.append(pdi_heading)
                    self.story.append(pdi_table)
                    self.story.append(Spacer(1, 0.2 * cm))

    def _add_cost_summary_and_note(self, system_settings: Settings):
        """Add netto cost breakdown table and VAT note wrapped in a single KeepTogether."""
        summary = calculate_company_costs(self.company, system_settings)
        bp = summary['base_package']
        eq = summary['equipment']
        jw = summary['jobwall']
        ln = summary['lunches']
        ex = summary['extra']

        heading = Paragraph(
            self._t('Order Cost Summary (Netto)', 'Zestawienie kosztów zamówienia (netto)'),
            self.heading_style,
        )

        package_name = bp['package_label_en'] if self.language == 'en' else bp['package_label_pl']
        stand_parts = []
        if bp['stand_size_label']:
            stand_parts.append(bp['stand_size_label'])
        if bp['days_count']:
            stand_parts.append(
                self._t('1 day', '1 dzień') if bp['days_count'] == 1 else self._t('2 days', '2 dni')
            )
        pkg_desc = f"{package_name} ({', '.join(stand_parts)})" if stand_parts else package_name
        if bp['pending_stand_assignment']:
            pkg_amount_text = self._t('Pending assignment', 'Do przypisania')
        elif bp['individual_pricing']:
            pkg_amount_text = self._t('Individual quote (0.00 PLN)', 'Wycena indywidualna (0.00 PLN)')
        else:
            pkg_amount_text = f"{bp['cost']:.2f} PLN"

        if eq['paid_items']:
            eq_items_text = ', '.join(
                f"{item['name_en'] if self.language == 'en' else item['name_pl']} ×{item['paid_quantity']}"
                for item in eq['paid_items']
            )
        else:
            eq_items_text = self._t('Included in package', 'W cenie pakietu')

        jw_desc = self._t(
            f"Total: {jw['total_count']} (included: {jw['free_count']}, paid: {jw['extra_count']})",
            f"Łącznie: {jw['total_count']} (w pakiecie: {jw['free_count']}, płatnych: {jw['extra_count']})",
        )
        ln_desc = (
            self._t('Declined', 'Rezygnacja')
            if ln['lunches_declined']
            else self._t(
                f"Paid: {ln['extra_lunches']} ({ln['free_per_day']}/day included)",
                f"Płatne: {ln['extra_lunches']} ({ln['free_per_day']}/dzień w pakiecie)",
            )
        )

        rows = [
            [
                Paragraph(self._t('Item', 'Pozycja'), self.table_header_style),
                Paragraph(self._t('Details', 'Szczegóły'), self.table_header_style),
                Paragraph(self._t('Netto Amount', 'Kwota netto'), self.table_header_right_style),
            ],
            [
                Paragraph(self._t('Stage 1 — Package / Stand', 'Etap 1 — Pakiet / Stoisko'), self.cell_style),
                Paragraph(_esc(pkg_desc), self.cell_style),
                Paragraph(_esc(pkg_amount_text), self.cell_right_style),
            ],
            [
                Paragraph(self._t('Stage 2 — Extra Equipment', 'Etap 2 — Wyposażenie dodatkowe'), self.cell_style),
                Paragraph(_esc(eq_items_text), self.cell_style),
                Paragraph(f"{eq['cost']:.2f} PLN", self.cell_right_style),
            ],
            [
                Paragraph(self._t('Stage 4 — Extra JobWall', 'Etap 4 — Dodatkowe oferty JobWall'), self.cell_style),
                Paragraph(_esc(jw_desc), self.cell_style),
                Paragraph(f"{jw['cost']:.2f} PLN", self.cell_right_style),
            ],
            [
                Paragraph(self._t('Stage 5 — Extra Lunches', 'Etap 5 — Dodatkowe obiady'), self.cell_style),
                Paragraph(_esc(ln_desc), self.cell_style),
                Paragraph(f"{ln['cost']:.2f} PLN", self.cell_right_style),
            ],
        ]
        if ex['cost'] != Decimal('0.00') or ex['description']:
            rows.append([
                Paragraph(
                    self._t('Additional Costs / Adjustments', 'Dodatkowe koszty / korekty'),
                    self.cell_style,
                ),
                Paragraph(_esc(ex['description'] or '—'), self.cell_style),
                Paragraph(f"{ex['cost']:.2f} PLN", self.cell_right_style),
            ])
        rows.append([
            Paragraph(self._t('Total (netto)', 'Suma łączna (netto)'), self.cell_bold_style),
            '',
            Paragraph(f"{summary['total_cost']:.2f} PLN", self.cell_right_bold_style),
        ])

        cost_table = Table(rows, colWidths=[5.4 * cm, 8.8 * cm, 3.8 * cm])
        cost_table.setStyle(TableStyle([
            *self._compact_table_padding(has_header_row=True),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        self._zebra_rows(cost_table, 1, len(rows) - 1)
        cost_table.setStyle(TableStyle([
            ('SPAN', (0, -1), (1, -1)),
            ('BACKGROUND', (0, -1), (-1, -1), MUTED_COLOR),
        ]))

        pricing_note = Paragraph(
            self._t(
                'All amounts shown are netto prices and exclude VAT. Full pricing details can be found in the offer and in the terms and conditions.',
                'Podane kwoty są cenami netto i nie zawierają podatku VAT. Szczegółowe informacje o cenach znajdą Państwo w ofercie oraz w regulaminie.',
            ),
            self.subtext_style,
        )

        self.story.append(KeepTogether([
            heading,
            cost_table,
            Spacer(1, 0.15 * cm),
            pricing_note,
        ]))

    def _add_footer(self, canv, total_pages: int):
        """Draw footer divider, localized generation date, and page counter."""
        canv.setTitle(self.doc_title)
        canv.setAuthor(self.doc_author)
        canv.setSubject(self.doc_title)
        canv.setCreator(self.doc_author)
        canv.saveState()

        local_dt = (
            timezone.localtime(self.generation_date)
            if timezone.is_aware(self.generation_date)
            else self.generation_date
        )
        if self.language == 'en':
            date_str = f"{EN_MONTHS[local_dt.month]} {local_dt.day}, {local_dt.year}"
            left_text = f"Generated on: {date_str}"
            right_text = f"Page {canv.getPageNumber()} of {total_pages}"
        else:
            date_str = f"{local_dt.day} {PL_MONTHS_GENITIVE[local_dt.month]} {local_dt.year}"
            left_text = f"Wygenerowano: {date_str}"
            right_text = f"Strona {canv.getPageNumber()} / {total_pages}"

        page_width = canv._pagesize[0]
        left_x = 1.5 * cm
        right_x = page_width - 1.5 * cm

        canv.setStrokeColor(BORDER_COLOR)
        canv.setLineWidth(0.6)
        canv.line(left_x, 1.18 * cm, right_x, 1.18 * cm)

        canv.setFont(self._font_name, FONT_SIZE_SUBTEXT)
        canv.setFillColor(SUBTEXT_COLOR)
        canv.drawString(left_x, 0.8 * cm, left_text)
        canv.drawRightString(right_x, 0.8 * cm, right_text)

        canv.restoreState()
