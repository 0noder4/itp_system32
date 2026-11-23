from datetime import datetime, timedelta
from pathlib import Path
import tempfile
from unittest import mock
import xml.etree.ElementTree as ET
import zipfile

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from companies.models import Company, Feedback, MapLayout, Settings, Stand, Workshop

from .emergency_export import WARSAW_TZ, build_emergency_xlsx_files
from .models import SheetCellStyle, StaffMeal

User = get_user_model()

_MAIN_NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def _sheet_names(xlsx_path: Path) -> list[str]:
    with zipfile.ZipFile(xlsx_path, 'r') as zf:
        root = ET.fromstring(zf.read('xl/workbook.xml'))
    return [el.attrib['name'] for el in root.findall(f'.//{_MAIN_NS}sheet')]


def _combined_xml_text(xlsx_path: Path) -> str:
    with zipfile.ZipFile(xlsx_path, 'r') as zf:
        parts = [
            zf.read(name).decode('utf-8')
            for name in zf.namelist()
            if name.endswith('.xml')
        ]
    return '\n'.join(parts)


class EmergencyXlsxExportTests(TestCase):
    def setUp(self):
        self.opiekun = User.objects.create_user(
            username='opiekun_backup',
            email='opiekun@example.com',
            password='x',
            type='staff',
            staff_roles=['opiekun'],
        )
        self.company = Company.objects.create(
            name='BackupTestCo',
            email='firm@example.com',
            status='main',
            opiekun=self.opiekun,
        )
        Stand.objects.create(
            company=self.company, day='day1', stand_number='C5', stand_size='rozszerzony'
        )
        Stand.objects.create(
            company=self.company, day='day2', stand_number='C5', stand_size='rozszerzony'
        )
        Workshop.objects.create(company=self.company, workshop=True, title='Backup Workshop')
        Feedback.objects.create(company=self.company, form='stage_1', status='accepted')
        StaffMeal.objects.create(user=self.opiekun, day1=True, note='bez laktozy')
        SheetCellStyle.objects.create(
            company=self.company,
            column_key='company.name',
            bg_color='#FEF08A',
        )
        settings_obj = Settings.get_settings()
        settings_obj.system_admin_email = 'ops@targipracy.org.pl'
        settings_obj.save()

    def test_export_creates_five_valid_xlsx_without_sending_email(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            call_command('export_emergency_xlsx', output_dir=tmpdir, retention_days=7)

            export_dirs = [p for p in Path(tmpdir).iterdir() if p.is_dir()]
            self.assertEqual(len(export_dirs), 1)
            export_dir = export_dirs[0]

            expected_counts = {
                'lg.xlsx': 8,
                'fr.xlsx': 3,
                'tr.xlsx': 1,
                'opiekun.xlsx': 6,
                'mapa.xlsx': 2,
                'wszystkie-arkusze.xlsx': 20,
            }
            actual_files = {p.name for p in export_dir.iterdir() if p.is_file()}
            self.assertEqual(actual_files, set(expected_counts))

            for filename, tab_count in expected_counts.items():
                path = export_dir / filename
                with zipfile.ZipFile(path, 'r') as zf:
                    self.assertIsNone(zf.testzip())
                names = _sheet_names(path)
                self.assertEqual(len(names), tab_count, filename)
                self.assertEqual(len(set(names)), tab_count, filename)
                xml_blob = _combined_xml_text(path)
                self.assertIn('BackupTestCo', xml_blob, filename)

            opiekun_blob = _combined_xml_text(export_dir / 'opiekun.xlsx')
            self.assertIn('bez laktozy', opiekun_blob)
            self.assertIn('FEF08A', opiekun_blob)

        self.assertEqual(len(mail.outbox), 0)

    def test_mapa_xlsx_visual_list_and_repartitioned_booths(self):
        from companies.map_seed import apply_repartition

        with tempfile.TemporaryDirectory() as tmpdir:
            files = build_emergency_xlsx_files()
            mapa_path = Path(tmpdir) / 'mapa.xlsx'
            mapa_path.write_bytes(files['mapa.xlsx'])

            with zipfile.ZipFile(mapa_path, 'r') as zf:
                self.assertIsNone(zf.testzip())
                for name in zf.namelist():
                    if name.endswith('.xml') or name.endswith('.rels'):
                        ET.fromstring(zf.read(name))

            self.assertEqual(_sheet_names(mapa_path), ['Mapa wizualna', 'Lista stoisk'])
            blob = _combined_xml_text(mapa_path)
            self.assertIn('C5 (8 m²)\nBackupTestCo', blob)
            for label in ('A1', 'A10', 'B3', 'B8', 'C1', 'C5', 'D9', 'E1', 'E10', 'F1', 'F4'):
                self.assertIn(label, blob)

            layout = MapLayout.get_solo()
            day1_b = layout.day1['tracks']['B']
            layout.day1['tracks']['B'] = apply_repartition(
                day1_b, ['B8'], [4, 4], ['B8a', 'B8b'], track_letter='B'
            )
            layout.save()

            files_repart = build_emergency_xlsx_files()
            mapa_repart_path = Path(tmpdir) / 'mapa_repart.xlsx'
            mapa_repart_path.write_bytes(files_repart['mapa.xlsx'])
            with zipfile.ZipFile(mapa_repart_path, 'r') as zf:
                self.assertIsNone(zf.testzip())
                for name in zf.namelist():
                    if name.endswith('.xml') or name.endswith('.rels'):
                        ET.fromstring(zf.read(name))
            repart_blob = _combined_xml_text(mapa_repart_path)
            self.assertIn('B8a (4 m²)', repart_blob)
            self.assertIn('B8b (4 m²)', repart_blob)

    def test_retention_prunes_old_untagged_but_keeps_tagged_and_recent(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            now = datetime.now(WARSAW_TZ)

            very_old_untagged = root / '20200101_024500'
            recent_untagged = root / (now - timedelta(days=2)).strftime('%Y%m%d_%H%M%S')
            tagged_15d = root / ((now - timedelta(days=15)).strftime('%Y%m%d_%H%M%S') + '_pre-deploy')
            tagged_very_old = root / '20200101_024500_pre-deploy'

            for d in (very_old_untagged, recent_untagged, tagged_15d, tagged_very_old):
                d.mkdir()

            call_command(
                'export_emergency_xlsx',
                output_dir=tmpdir,
                retention_days=7,
                tagged_retention_days=30,
            )

            self.assertFalse(very_old_untagged.exists())
            self.assertFalse(tagged_very_old.exists())
            self.assertTrue(recent_untagged.exists())
            self.assertTrue(tagged_15d.exists())

    def test_failure_sends_single_alert_email_to_system_admin_email(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch(
                'sheets.management.commands.export_emergency_xlsx.export_emergency_xlsx',
                side_effect=RuntimeError('simulated disk error'),
            ):
                with self.assertRaises(CommandError):
                    call_command('export_emergency_xlsx', output_dir=tmpdir)

        self.assertEqual(len(mail.outbox), 1)
        alert = mail.outbox[0]
        self.assertEqual(alert.to, ['ops@targipracy.org.pl'])
        self.assertIn('[ITP BACKUP ALERT]', alert.subject)
        self.assertIn('simulated disk error', alert.body)

    def test_failure_skips_alert_when_admin_email_is_placeholder(self):
        settings_obj = Settings.get_settings()
        settings_obj.system_admin_email = 'admin@example.com'
        settings_obj.save()

        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch(
                'sheets.management.commands.export_emergency_xlsx.export_emergency_xlsx',
                side_effect=RuntimeError('simulated disk error'),
            ):
                with self.assertRaises(CommandError):
                    call_command('export_emergency_xlsx', output_dir=tmpdir)

        self.assertEqual(len(mail.outbox), 0)
