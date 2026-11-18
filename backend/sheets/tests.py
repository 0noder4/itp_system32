from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import (
    Company,
    CompanyInvitation,
    EquipmentItem,
    EquipmentSelection,
    Feedback,
    FinalData,
    Lunch,
    Settings,
    Stand,
    StandDetails,
    Workshop,
)

from . import views
from .coverage import EXCLUDED_FIELDS, NOT_YET_MAPPED, form_field_names
from .definitions import CATALOG
from .definitions.common import COMPANY_NAME, COMPANY_OPIEKUN
from .definitions.form_columns import PDI_EMAILS
from .models import (
    SheetCellChange,
    SheetCellComment,
    SheetCellStyle,
    SheetCellValue,
    SheetLayoutDefault,
    SheetNotification,
    StaffMeal,
    StaffMealChange,
)
from .registry import KIND_TEXT, SOURCE_EXTRA, Catalog, ColumnDef, SheetDef, TabDef

User = get_user_model()

TR_URL = '/api/sheets/tr/warsztaty/'
TR_CELLS = TR_URL + 'cells/'


def make_user(username, type_='staff', roles=()):
    return User.objects.create_user(
        username=username, email=f'{username}@example.com', password='x', type=type_, staff_roles=list(roles),
    )


class SheetsApiBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tr = make_user('tr1', roles=['tr'])
        self.fr = make_user('fr1', roles=['fr'])
        self.opiekun = make_user('op1', roles=['opiekun'])
        self.partner = Company.objects.create(name='Partner SA', email='p@example.com', status='partner')
        self.basic = Company.objects.create(name='Basic sp', email='b@example.com', status='basic')
        Workshop.objects.create(company=self.partner, workshop=True, title='Excel od zera')
        Feedback.objects.create(company=self.partner, form='stage_3', status='pending')
        Feedback.objects.create(company=self.partner, form='stage_3', status='accepted')

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client

    def patch(self, user, changes, url=TR_CELLS):
        return self.as_user(user).patch(url, {'changes': changes}, format='json')


class SheetCatalogTests(SheetsApiBase):
    def test_company_user_has_no_access(self):
        company_user = make_user('firma', type_='company')
        self.assertEqual(self.as_user(company_user).get('/api/sheets/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.as_user(company_user).get(TR_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_tr_sees_tr_sheet(self):
        response = self.as_user(self.tr).get('/api/sheets/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([s['key'] for s in response.data], ['tr'])
        self.assertEqual(response.data[0]['tabs'][0]['key'], 'warsztaty')

    def test_opiekun_sees_only_the_opiekun_sheet(self):
        response = self.as_user(self.opiekun).get('/api/sheets/')
        self.assertEqual([s['key'] for s in response.data], ['opiekun'])
        self.assertTrue(response.data[0]['scoped'])
        self.assertEqual(self.as_user(self.opiekun).get(TR_URL).status_code, status.HTTP_404_NOT_FOUND)


class TrSheetReadTests(SheetsApiBase):
    def test_rows_only_main_and_partner(self):
        data = self.as_user(self.tr).get(TR_URL).data
        self.assertEqual([r['company_id'] for r in data['rows']], [self.partner.id])

    def test_cells_and_editability(self):
        data = self.as_user(self.tr).get(TR_URL).data
        cells = data['rows'][0]['cells']
        self.assertEqual(cells['company.name'], 'Partner SA')
        self.assertEqual(cells['workshop.decision'], 'yes')
        self.assertEqual(cells['workshop.title'], 'Excel od zera')
        self.assertEqual(cells['stage.3.status'], 'accepted')
        editable = {c['key'] for c in data['columns'] if c['editable']}
        self.assertIn('tr.room', editable)
        self.assertNotIn('workshop.title', editable)
        self.assertNotIn('company.opiekun', editable)

    def test_fr_reads_but_cannot_edit_tr_columns(self):
        data = self.as_user(self.fr).get(TR_URL).data
        editable = {c['key'] for c in data['columns'] if c['editable']}
        self.assertNotIn('tr.room', editable)
        self.assertIn('company.opiekun', editable)


class TrSheetWriteTests(SheetsApiBase):
    def test_extra_cell_saved_with_history(self):
        response = self.patch(self.tr, [
            {'company_id': self.partner.id, 'column_key': 'tr.room', 'value': ' A-101 ', 'base': None},
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['conflicts'], [])
        cell = SheetCellValue.objects.get(company=self.partner, column_key='tr.room')
        self.assertEqual(cell.value, 'A-101')
        self.assertEqual(cell.updated_by, self.tr)
        change = SheetCellChange.objects.get(company=self.partner, column_key='tr.room')
        self.assertIsNone(change.old_value)
        self.assertEqual(change.new_value, 'A-101')

    def test_select_accepts_label(self):
        response = self.patch(self.tr, [
            {'company_id': self.partner.id, 'column_key': 'tr.status', 'value': 'Potwierdzony', 'base': None},
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(SheetCellValue.objects.get(column_key='tr.status').value, 'confirmed')

    def test_system_column_is_forbidden(self):
        response = self.patch(self.tr, [
            {'company_id': self.partner.id, 'column_key': 'workshop.title', 'value': 'X', 'base': 'Excel od zera'},
        ])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Workshop.objects.get(company=self.partner).title, 'Excel od zera')

    def test_fr_cannot_edit_tr_column(self):
        response = self.patch(self.fr, [
            {'company_id': self.partner.id, 'column_key': 'tr.room', 'value': 'B', 'base': None},
        ])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_row_outside_tab_filter_is_forbidden(self):
        response = self.patch(self.tr, [
            {'company_id': self.basic.id, 'column_key': 'tr.room', 'value': 'B', 'base': None},
        ])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(SheetCellValue.objects.exists())

    def test_invalid_value_rejects_whole_batch(self):
        response = self.patch(self.tr, [
            {'company_id': self.partner.id, 'column_key': 'tr.room', 'value': 'A', 'base': None},
            {'company_id': self.partner.id, 'column_key': 'tr.status', 'value': 'nie ma takiej', 'base': None},
        ])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(SheetCellValue.objects.exists())

    def test_conflict_skips_only_that_cell(self):
        SheetCellValue.objects.create(company=self.partner, column_key='tr.room', value='C-3', updated_by=self.fr)
        response = self.patch(self.tr, [
            {'company_id': self.partner.id, 'column_key': 'tr.room', 'value': 'A-1', 'base': None},
            {'company_id': self.partner.id, 'column_key': 'tr.notes', 'value': 'ok', 'base': None},
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['conflicts']), 1)
        conflict = response.data['conflicts'][0]
        self.assertEqual((conflict['column_key'], conflict['current'], conflict['updated_by']), ('tr.room', 'C-3', 'fr1'))
        self.assertEqual(SheetCellValue.objects.get(column_key='tr.room').value, 'C-3')
        self.assertEqual(SheetCellValue.objects.get(column_key='tr.notes').value, 'ok')

    def test_undo_style_write_with_matching_base(self):
        self.patch(self.tr, [{'company_id': self.partner.id, 'column_key': 'tr.room', 'value': 'A', 'base': None}])
        response = self.patch(self.tr, [
            {'company_id': self.partner.id, 'column_key': 'tr.room', 'value': None, 'base': 'A'},
        ])
        self.assertEqual(response.data['conflicts'], [])
        self.assertIsNone(SheetCellValue.objects.get(column_key='tr.room').value)
        self.assertEqual(SheetCellChange.objects.count(), 2)

    def test_custom_opiekun_column(self):
        response = self.patch(self.fr, [
            {'company_id': self.partner.id, 'column_key': 'company.opiekun', 'value': self.opiekun.id, 'base': None},
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.partner.refresh_from_db()
        self.assertEqual(self.partner.opiekun, self.opiekun)

    def test_custom_column_conflict_reports_changed_by(self):
        """Custom fields have no SheetCellValue — conflict who/when comes from the audit log."""
        other_fr = make_user('fr2', roles=['fr'])
        first = self.patch(self.fr, [
            {'company_id': self.partner.id, 'column_key': 'company.opiekun', 'value': self.opiekun.id, 'base': None},
        ])
        self.assertEqual(first.status_code, 200, first.data)
        conflicted = self.patch(other_fr, [
            {'company_id': self.partner.id, 'column_key': 'company.opiekun', 'value': None, 'base': None},
        ])
        self.assertEqual(conflicted.status_code, 200, conflicted.data)
        self.assertEqual(len(conflicted.data['conflicts']), 1)
        conflict = conflicted.data['conflicts'][0]
        self.assertEqual(conflict['column_key'], 'company.opiekun')
        self.assertEqual(conflict['current'], self.opiekun.id)
        self.assertEqual(conflict['updated_by'], 'fr1')
        self.assertIsNotNone(conflict['updated_at'])

    def test_styles_batch_rolls_back_on_invalid_color(self):
        """One bad colour in the batch must not leave earlier styles half-applied."""
        url = TR_URL + 'styles/'
        response = self.as_user(self.tr).patch(url, {
            'styles': [
                {'company_id': self.partner.id, 'column_key': 'tr.room', 'bg_color': '#FEF08A'},
                {'company_id': self.partner.id, 'column_key': 'tr.notes', 'bg_color': '#NOTVALID'},
            ],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(SheetCellStyle.objects.exists())

    def test_opiekun_must_have_role(self):
        response = self.patch(self.fr, [
            {'company_id': self.partner.id, 'column_key': 'company.opiekun', 'value': self.tr.id, 'base': None},
        ])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class OpiekunLgFrTests(SheetsApiBase):
    def test_opiekun_edits_own_car_but_not_lg_orders(self):
        self.partner.opiekun = self.opiekun
        self.partner.save()
        url = '/api/sheets/opiekun/glowny/cells/'
        saved = self.patch(self.opiekun, [
            {'company_id': self.partner.id, 'column_key': 'care.car_registration', 'value': 'WX 123', 'base': None},
        ], url=url)
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(SheetCellValue.objects.get(column_key='care.car_registration').value, 'WX 123')
        denied = self.patch(self.opiekun, [
            {'company_id': self.partner.id, 'column_key': 'lg.extra_orders', 'value': 'krzesła', 'base': None},
        ], url=url)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_care_day_slot_pair_is_all_or_nothing(self):
        """Conflict on arrival_day must not leave a new slot applied in the same batch."""
        self.partner.opiekun = self.opiekun
        self.partner.save()
        url = '/api/sheets/opiekun/glowny/cells/'
        SheetCellValue.objects.create(
            company=self.partner, column_key='care.arrival_day', value='2027-03-09', updated_by=self.fr,
        )
        SheetCellValue.objects.create(
            company=self.partner, column_key='care.slot', value='14-16', updated_by=self.fr,
        )
        response = self.patch(self.opiekun, [
            {
                'company_id': self.partner.id,
                'column_key': 'care.arrival_day',
                'value': '2027-03-10',
                'base': None,  # stale — server has 2027-03-09
            },
            {
                'company_id': self.partner.id,
                'column_key': 'care.slot',
                'value': '16-18',
                'base': '14-16',  # would apply alone
            },
        ], url=url)
        self.assertEqual(response.status_code, 200, response.data)
        conflict_keys = {c['column_key'] for c in response.data['conflicts']}
        self.assertEqual(conflict_keys, {'care.arrival_day', 'care.slot'})
        self.assertEqual(response.data['applied'], [])
        self.assertEqual(
            SheetCellValue.objects.get(company=self.partner, column_key='care.arrival_day').value,
            '2027-03-09',
        )
        self.assertEqual(
            SheetCellValue.objects.get(company=self.partner, column_key='care.slot').value,
            '14-16',
        )

    def test_opiekun_does_not_see_other_companies(self):
        self.partner.opiekun = self.opiekun
        self.partner.save()
        rows = self.as_user(self.opiekun).get('/api/sheets/opiekun/glowny/').data['rows']
        self.assertEqual([row['company_id'] for row in rows], [self.partner.id])

    def test_fr_mine_flag_and_slot_load(self):
        self.partner.fr_resp = self.fr
        self.partner.save()
        SheetCellValue.objects.create(company=self.partner, column_key='care.slot', value='rano')
        SheetCellValue.objects.create(company=self.basic, column_key='care.slot', value='rano')
        data = self.as_user(self.fr).get('/api/sheets/opiekun/glowny/').data
        by_id = {row['company_id']: row for row in data['rows']}
        self.assertTrue(by_id[self.partner.id]['mine'])
        self.assertFalse(by_id[self.basic.id]['mine'])
        loads = {
            row['company_id']: row['cells']['care.slot_count']
            for row in self.as_user(self.fr).get('/api/sheets/lg/przyjazdy/').data['rows']
        }
        self.assertEqual(loads[self.partner.id], 2)
        self.assertEqual(loads[self.basic.id], 2)

    def test_package_lights_follow_stand_size(self):
        Stand.objects.create(company=self.partner, day='day1', stand_number='A1', stand_size='standardowy')
        rows = self.as_user(self.fr).get('/api/sheets/lg/glowny/').data['rows']
        cells = next(row for row in rows if row['company_id'] == self.partner.id)['cells']
        self.assertEqual(cells['package.lights'], 2)
        self.assertEqual(cells['package.sockets'], 1)
        self.assertEqual(cells['stand.size'], 'standardowy')

    def test_package_lights_zero_for_own_build(self):
        Stand.objects.create(company=self.partner, day='day1', stand_number='A1', stand_size='standardowy')
        StandDetails.objects.create(company=self.partner, stand_type='self_construction')
        cells = next(
            row for row in self.as_user(self.fr).get('/api/sheets/lg/glowny/').data['rows']
            if row['company_id'] == self.partner.id
        )['cells']
        self.assertEqual(cells['package.lights'], 0)
        self.assertEqual(cells['package.sockets'], 0)
        self.assertEqual(cells['package.hanger'], 0)
        self.assertEqual(cells['package.frieze'], 0)

    def test_glowny_freeze_and_equipment_qty_columns(self):
        item = EquipmentItem.objects.create(
            name_en='Chair', name_pl='Krzesło', price=10, included_quantity=2, is_active=True,
        )
        details = StandDetails.objects.create(company=self.partner, stand_type='provided_stand')
        EquipmentSelection.objects.create(stand_details=details, equipment_item=item, quantity=5)
        data = self.as_user(self.fr).get('/api/sheets/lg/glowny/').data
        self.assertEqual(data['tab']['frozen_columns'], 7)
        keys = [c['key'] for c in data['columns']]
        self.assertEqual(keys[:7], [
            'company.name', 'company.opiekun', 'company.fr', 'company.days',
            'stand.day1', 'stand.day2', 'stand.size',
        ])
        qty_key = f'equipment.qty.{item.id}'
        self.assertIn(qty_key, keys)
        self.assertLess(keys.index(qty_key), keys.index('equipment.tv_mount'))
        self.assertEqual(keys[-1], 'company.rejections')
        groups = {c['key']: c['group'] for c in data['columns']}
        self.assertEqual(groups['company.name'], 'INFORMACJE BAZOWE')
        self.assertEqual(groups['company.status'], 'STATUSY')
        self.assertEqual(groups['company.stages'], 'STATUSY')
        self.assertEqual(
            [c['group'] for c in data['columns']].count('INFORMACJE BAZOWE'),
            7,
            'Główny: jedna ciągła grupa INFORMACJE BAZOWE na pinie, bez duplikatu na końcu',
        )
        qty_meta = next(c for c in data['columns'] if c['key'] == qty_key)
        self.assertEqual(qty_meta['highlight'], 'over_included')
        self.assertEqual(qty_meta['highlight_above'], 2)
        cells = next(row for row in data['rows'] if row['company_id'] == self.partner.id)['cells']
        self.assertEqual(cells[qty_key], 5)
        fryz = self.as_user(self.fr).get('/api/sheets/lg/fryz/').data
        self.assertEqual(fryz['tab']['frozen_columns'], 1)
        self.assertNotIn('company.stages', [c['key'] for c in fryz['columns']])

    def test_lunch_extra_pieces_on_obiady(self):
        final = FinalData.objects.create(company=self.partner)
        Lunch.objects.create(form=final, day='day1', lunch_quantity=4)
        Lunch.objects.create(form=final, day='day2', lunch_quantity=2)
        cells = next(
            row for row in self.as_user(self.fr).get('/api/sheets/lg/obiady/').data['rows']
            if row['company_id'] == self.partner.id
        )['cells']
        self.assertEqual(cells['lunch.extra_day1'], 2)
        self.assertEqual(cells['lunch.extra_day2'], 0)

    def test_lunch_surcharge_matches_two_free_per_day(self):
        final = FinalData.objects.create(company=self.partner)
        Lunch.objects.create(form=final, day='day1', lunch_quantity=4)
        settings_obj = Settings.get_settings()
        settings_obj.lunch_price = 10
        settings_obj.save(update_fields=['lunch_price'])
        cells = self.as_user(self.fr).get('/api/sheets/fr/rozliczenia/').data['rows']
        partner = next(row for row in cells if row['company_id'] == self.partner.id)
        self.assertEqual(partner['cells']['lunch.extra_cost'], 20)

    def test_pdi_emails_visible_to_opiekun_and_fr(self):
        # Mail #2: Opiekun edits PDI in the sheet; FR/LG also see the column.
        self.assertTrue(PDI_EMAILS.visible_to(self.opiekun))
        self.assertTrue(PDI_EMAILS.visible_to(self.fr))
        self.assertTrue(PDI_EMAILS.editable_by(self.opiekun))
        self.assertFalse(PDI_EMAILS.editable_by(self.fr))

    def test_system_cells_are_read_only_in_sheets(self):
        self.partner.opiekun = self.opiekun
        self.partner.save()
        StandDetails.objects.create(company=self.partner, stand_type='provided_stand', sc_details='')
        url = '/api/sheets/opiekun/glowny/cells/'
        denied_draft = self.patch(self.opiekun, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.composition',
                'value': 'ścianki + lada (prośba firmy)',
                'base': '',
                'mode': 'draft',
            },
        ], url=url)
        self.assertEqual(denied_draft.status_code, status.HTTP_403_FORBIDDEN)
        denied_edit = self.patch(self.opiekun, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.composition',
                'value': 'ścianki + lada',
                'base': '',
            },
        ], url=url)
        self.assertEqual(denied_edit.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            SheetCellValue.objects.filter(
                company=self.partner, column_key='stand.composition'
            ).exists()
        )
        self.assertEqual(
            StandDetails.objects.get(company=self.partner).sc_details, ''
        )
        meta = {
            c['key']: c
            for c in self.as_user(self.opiekun).get('/api/sheets/opiekun/glowny/').data['columns']
        }
        self.assertFalse(meta['stand.composition']['editable'])
        self.assertNotIn('can_draft', meta['stand.composition'])
        self.assertNotIn('can_commit', meta['stand.composition'])

    def test_pdi_editable_on_lg_delegaci(self):
        from companies.models import Exhibitor, FinalData, PDI

        lg = make_user('lg-pdi', roles=['lg'])
        final, _ = FinalData.objects.get_or_create(company=self.partner)
        pdi, _ = PDI.objects.get_or_create(form=final, defaults={'tickets_quantity': 0})
        Exhibitor.objects.create(
            form=pdi, name='Ewa', surname='Targowa', phone_number='500100200', attendance='day1',
        )
        url = '/api/sheets/lg/delegaci/cells/'
        response = self.patch(lg, [
            {
                'company_id': self.partner.id,
                'column_key': 'people.pdi_tickets',
                'value': 4,
                'base': 0,
            },
            {
                'company_id': self.partner.id,
                'column_key': 'people.pdi_emails',
                'value': 'Anna Nowak: anna@example.com\nJan Kowalski - jan@example.com',
                'base': '',
            },
        ], url=url)
        self.assertEqual(response.status_code, 200, response.data)
        pdi = PDI.objects.get(form__company=self.partner)
        self.assertEqual(pdi.tickets_quantity, 4)
        emails = sorted(pdi.pdiattendees.values_list('email', flat=True))
        self.assertEqual(emails, ['anna@example.com', 'jan@example.com'])
        self.assertEqual(
            list(pdi.exhibitors.values_list('name', 'surname')),
            [('Ewa', 'Targowa')],
        )
        data = self.as_user(lg).get('/api/sheets/lg/delegaci/').data
        cols = {col['key']: col for col in data['columns']}
        self.assertEqual(cols['people.delegates']['label'], 'Delegaci na targi')
        self.assertEqual(cols['people.delegates']['group'], 'DELEGACI NA TARGI (z formularza)')
        self.assertEqual(cols['people.pdi_emails']['group'], 'GALA PDI (Mail #2)')
        self.assertIn('Mailu #2', cols['people.pdi_emails']['help'])
        self.assertIn('delegatami na targi', cols['people.pdi_emails']['help'])
        cells = next(
            row for row in data['rows'] if row['company_id'] == self.partner.id
        )['cells']
        self.assertEqual(cells['people.pdi_extra'], 2)
        self.assertIn('Ewa Targowa', cells['people.delegates'])
        self.assertIn('Anna Nowak', cells['people.pdi'])
        opiekun_keys = [
            col['key'] for col in self.as_user(self.fr).get('/api/sheets/opiekun/glowny/').data['columns']
        ]
        self.assertLess(
            opiekun_keys.index('people.delegates'),
            opiekun_keys.index('people.pdi_tickets'),
        )

    def test_sign_visual_on_glowny_not_fryz(self):
        glowny = self.as_user(self.fr).get('/api/sheets/lg/glowny/').data
        fryz = self.as_user(self.fr).get('/api/sheets/lg/fryz/').data
        g_keys = [c['key'] for c in glowny['columns']]
        f_keys = [c['key'] for c in fryz['columns']]
        self.assertIn('sign.visualization', g_keys)
        self.assertIn('sign.fire_cert', g_keys)
        self.assertNotIn('sign.visualization', f_keys)
        self.assertNotIn('sign.fire_cert', f_keys)
        self.assertIn('sign.logo', f_keys)
        self.assertIn('mail1.logo_check', f_keys)
        self.assertIn('care.logo_approved', f_keys)
        self.assertLess(f_keys.index('mail1.logo_check'), f_keys.index('care.logo_approved'))
        self.assertIn('care.fire_cert_checked', g_keys)
        self.assertLess(g_keys.index('sign.fire_cert'), g_keys.index('care.fire_cert_checked'))
        self.assertNotIn('stand.type', g_keys)
        self.assertNotIn('stand.type', f_keys)

    def test_przyjazdy_shows_montage_next_to_entry_time(self):
        cols = {
            col['key']: col
            for col in self.as_user(self.fr).get('/api/sheets/lg/przyjazdy/').data['columns']
        }
        keys = list(cols)
        self.assertLess(keys.index('care.arrival_day'), keys.index('care.slot'))
        self.assertLess(keys.index('care.slot'), keys.index('arrival.day1'))
        self.assertLess(keys.index('care.pickup'), keys.index('care.pickup_time'))
        self.assertEqual(cols['care.arrival_day']['label'], 'Dzień montażu')
        self.assertEqual(cols['care.build_size']['label'], 'Wymiary zabudowy')
        self.assertEqual(cols['arrival.day1']['label'], 'Wejście\ndzień 1')
        self.assertIn('montażu', cols['arrival.day1']['help'])
        self.assertIn('Bez godziny', cols['care.slot']['help'])
        glowny = {
            col['key']: col
            for col in self.as_user(self.fr).get('/api/sheets/lg/glowny/').data['columns']
        }
        self.assertEqual(glowny['stand.brought_equipment']['label'], 'Sprzęt, który przywożą')
        self.assertEqual(glowny['stand.power_ack']['label'], 'Zapowiedź\nmocy')
        self.assertEqual(glowny['power.total']['label'], 'Łączna moc (W)')
        self.assertIn('ścianek', glowny['lg.extra_orders']['help'])

    def test_wyposazenie_inserts_equipment_qty(self):
        item = EquipmentItem.objects.create(
            name_en='Table', name_pl='Stolik', price=20, included_quantity=1, is_active=True,
        )
        data = self.as_user(self.fr).get('/api/sheets/lg/wyposazenie/').data
        keys = [c['key'] for c in data['columns']]
        qty_key = f'equipment.qty.{item.id}'
        self.assertIn(qty_key, keys)
        self.assertLess(keys.index(qty_key), keys.index('equipment.tv_mount'))
        self.assertIn('power.devices', keys)

    def test_history_and_xlsx(self):
        self.patch(self.tr, [
            {'company_id': self.partner.id, 'column_key': 'tr.room', 'value': 'A-1', 'base': None},
        ])
        history = self.as_user(self.tr).get(
            TR_URL + 'history/', {'company_id': self.partner.id, 'column_key': 'tr.room'},
        )
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.data[0]['new'], 'A-1')
        self.assertEqual(history.data[0]['old'], '')
        exported = self.as_user(self.tr).get(TR_URL + 'xlsx/')
        self.assertEqual(exported.status_code, 200)
        self.assertTrue(exported.content.startswith(b'PK'))
        visible = self.as_user(self.tr).post(
            TR_URL + 'xlsx/',
            {'rows': [['Nazwa firmy'], ['Partner SA']]},
            format='json',
        )
        self.assertEqual(visible.status_code, 200)
        self.assertTrue(visible.content.startswith(b'PK'))
        self.assertEqual(
            self.as_user(self.tr).post(TR_URL + 'xlsx/', {'rows': []}, format='json').status_code,
            status.HTTP_400_BAD_REQUEST,
        )


class FormDraftCommitTests(SheetsApiBase):
    def test_fr_draft_commit_restore_stand_composition(self):
        from sheets.models import SheetCellDraft, SheetCellFormOverride

        StandDetails.objects.create(company=self.partner, stand_type='provided_stand', sc_details='oryginał')
        url = '/api/sheets/lg/glowny/cells/'
        meta = {
            c['key']: c
            for c in self.as_user(self.fr).get('/api/sheets/lg/glowny/').data['columns']
        }
        self.assertTrue(meta['stand.composition']['can_draft'])
        self.assertTrue(meta['stand.composition']['can_commit'])

        draft = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.composition',
                'value': 'wersja robocza',
                'base': 'oryginał',
                'mode': 'draft',
            },
        ], url=url)
        self.assertEqual(draft.status_code, 200, draft.data)
        self.assertEqual(StandDetails.objects.get(company=self.partner).sc_details, 'oryginał')
        self.assertEqual(
            SheetCellDraft.objects.get(company=self.partner, column_key='stand.composition').value,
            'wersja robocza',
        )
        payload = self.as_user(self.fr).get('/api/sheets/lg/glowny/').data
        partner = next(r for r in payload['rows'] if r['company_id'] == self.partner.id)
        self.assertEqual(partner['cells']['stand.composition'], 'wersja robocza')
        self.assertTrue(payload['drafts'][f'{self.partner.id}|stand.composition'])
        self.assertEqual(payload['form_values'][f'{self.partner.id}|stand.composition'], 'oryginał')

        commit = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.composition',
                'value': 'wersja robocza',
                'base': 'wersja robocza',
                'mode': 'commit',
            },
        ], url=url)
        self.assertEqual(commit.status_code, 200, commit.data)
        self.assertEqual(StandDetails.objects.get(company=self.partner).sc_details, 'wersja robocza')
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='stand.composition').exists()
        )
        override = SheetCellFormOverride.objects.get(company=self.partner, column_key='stand.composition')
        self.assertEqual(override.previous_value, 'oryginał')

        second = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.composition',
                'value': 'drugi zapis',
                'base': 'wersja robocza',
                'mode': 'draft',
            },
        ], url=url)
        self.assertEqual(second.status_code, 200, second.data)
        second_commit = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.composition',
                'value': 'drugi zapis',
                'base': 'drugi zapis',
                'mode': 'commit',
            },
        ], url=url)
        self.assertEqual(second_commit.status_code, 200, second_commit.data)
        override.refresh_from_db()
        self.assertEqual(override.previous_value, 'oryginał')
        self.assertEqual(StandDetails.objects.get(company=self.partner).sc_details, 'drugi zapis')

        restore = self.as_user(self.fr).post(
            '/api/sheets/lg/glowny/cells/restore/',
            {'cells': [{'company_id': self.partner.id, 'column_key': 'stand.composition'}]},
            format='json',
        )
        self.assertEqual(restore.status_code, 200, restore.data)
        self.assertEqual(StandDetails.objects.get(company=self.partner).sc_details, 'oryginał')
        self.assertFalse(
            SheetCellFormOverride.objects.filter(
                company=self.partner, column_key='stand.composition'
            ).exists()
        )

    def test_sign_text_draft_stays_out_of_the_form_and_shows_in_the_cell(self):
        from sheets.models import SheetCellDraft

        StandDetails.objects.create(company=self.partner, name_sign_text='Szydłowy')
        url = '/api/sheets/lg/fryz/'
        rejected = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'sign.text',
                'value': 'Szyldowy 1',
                'base': None,
                'mode': 'draft',
            },
        ], url=url + 'cells/')
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertEqual(rejected.data['applied'], [])
        self.assertEqual(rejected.data['conflicts'][0]['column_key'], 'sign.text')
        self.assertFalse(SheetCellDraft.objects.filter(company=self.partner, column_key='sign.text').exists())

        saved = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'sign.text',
                'value': 'Szyldowy 1',
                'base': 'Szydłowy',
                'mode': 'draft',
            },
        ], url=url + 'cells/')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data['applied'][0]['value'], 'Szyldowy 1')
        self.assertEqual(StandDetails.objects.get(company=self.partner).name_sign_text, 'Szydłowy')
        payload = self.as_user(self.fr).get(url).data
        partner = next(r for r in payload['rows'] if r['company_id'] == self.partner.id)
        cell_id = f'{self.partner.id}|sign.text'
        self.assertEqual(partner['cells']['sign.text'], 'Szyldowy 1')
        self.assertTrue(payload['drafts'][cell_id])
        self.assertEqual(payload['form_values'][cell_id], 'Szydłowy')

        cleared = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'sign.text',
                'value': '',
                'base': 'Szyldowy 1',
                'mode': 'draft',
            },
        ], url=url + 'cells/')
        self.assertEqual(cleared.status_code, 200, cleared.data)
        payload = self.as_user(self.fr).get(url).data
        partner = next(r for r in payload['rows'] if r['company_id'] == self.partner.id)
        self.assertEqual(partner['cells']['sign.text'], '')
        self.assertEqual(payload['form_values'][cell_id], 'Szydłowy')

    def test_discard_removes_draft_and_leaves_the_form(self):
        from sheets.models import SheetCellDraft

        StandDetails.objects.create(company=self.partner, name_sign_text='Szydłowy')
        url = '/api/sheets/lg/fryz/'
        saved = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'sign.text',
                'value': 'Szyldowy 1',
                'base': 'Szydłowy',
                'mode': 'draft',
            },
        ], url=url + 'cells/')
        self.assertEqual(saved.status_code, 200, saved.data)

        discarded = self.as_user(self.fr).post(
            url + 'cells/discard/',
            {'cells': [{'company_id': self.partner.id, 'column_key': 'sign.text'}]},
            format='json',
        )
        self.assertEqual(discarded.status_code, 200, discarded.data)
        self.assertEqual(discarded.data['discarded'], [
            {'company_id': self.partner.id, 'column_key': 'sign.text'},
        ])
        self.assertFalse(SheetCellDraft.objects.filter(company=self.partner, column_key='sign.text').exists())
        self.assertEqual(StandDetails.objects.get(company=self.partner).name_sign_text, 'Szydłowy')
        payload = self.as_user(self.fr).get(url).data
        partner = next(r for r in payload['rows'] if r['company_id'] == self.partner.id)
        self.assertEqual(partner['cells']['sign.text'], 'Szydłowy')
        self.assertNotIn(f'{self.partner.id}|sign.text', payload['drafts'])

    def test_firemka_draft_shows_composed_text_and_keeps_form_parts(self):
        FinalData.objects.create(
            company=self.partner, main_rep_name='Jan', main_rep_surname='Kowalski', main_rep_phone='111',
        )
        url = '/api/sheets/opiekun/glowny/'
        saved = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'people.main_name',
                'value': 'Anna',
                'base': 'Jan',
                'mode': 'draft',
            },
        ], url=url + 'cells/')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(FinalData.objects.get(company=self.partner).main_rep_name, 'Jan')
        payload = self.as_user(self.fr).get(url).data
        partner = next(r for r in payload['rows'] if r['company_id'] == self.partner.id)
        cell_id = f'{self.partner.id}|people.firemka'
        self.assertEqual(partner['cells']['people.firemka'], 'Anna Kowalski | 111')
        self.assertEqual(payload['form_values'][cell_id], 'Jan Kowalski | 111')
        self.assertEqual(payload['form_values'][f'{self.partner.id}|people.main_name'], 'Jan')
        self.assertTrue(payload['drafts'][cell_id])

    def test_firemka_opens_as_separate_fields_and_commits(self):
        from companies.models import FinalData

        FinalData.objects.create(
            company=self.partner, main_rep_name='Jan', main_rep_surname='Kowalski', main_rep_phone='111',
        )
        payload = self.as_user(self.fr).get('/api/sheets/opiekun/glowny/').data
        meta = {c['key']: c for c in payload['columns']}
        self.assertTrue(meta['people.firemka']['can_draft'])
        self.assertEqual(
            [part['key'] for part in meta['people.firemka']['edit_parts']],
            ['people.main_name', 'people.main_surname', 'people.main_phone'],
        )
        parts = payload['part_values'][f'{self.partner.id}|people.firemka']
        self.assertEqual(parts['people.main_name'], 'Jan')
        opiekun_meta = {
            c['key']: c
            for c in self.as_user(self.opiekun).get('/api/sheets/opiekun/glowny/').data['columns']
        }
        self.assertNotIn('can_draft', opiekun_meta['people.firemka'])

        response = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'people.main_name',
                'value': 'Anna',
                'base': None,
                'mode': 'commit',
            },
        ], url='/api/sheets/opiekun/glowny/cells/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(FinalData.objects.get(company=self.partner).main_rep_name, 'Anna')
        self.assertEqual(FinalData.objects.get(company=self.partner).main_rep_surname, 'Kowalski')

    def test_fr_writes_stand_size_email_and_opiekun_cannot_draft(self):
        from companies.models import Stand
        from sheets.models import SheetCellDraft

        Stand.objects.create(company=self.partner, day='day1', stand_number='A1', stand_size='standardowy')
        glowny = '/api/sheets/lg/glowny/cells/'
        opiekunowie = '/api/sheets/lg/opiekunowie/cells/'
        meta = {
            c['key']: c
            for c in self.as_user(self.fr).get('/api/sheets/lg/glowny/').data['columns']
        }
        email_meta = {
            c['key']: c
            for c in self.as_user(self.fr).get('/api/sheets/lg/opiekunowie/').data['columns']
        }
        self.assertTrue(meta['stand.size']['can_draft'])
        self.assertNotIn('can_draft', meta['stand.day1'])
        self.assertNotIn('can_draft', meta['stand.day2'])
        self.assertTrue(email_meta['company.email']['can_draft'])
        self.assertEqual(
            {opt['value']: opt['label'] for opt in meta['stand.size']['options']},
            {'podstawowy': '4 m²', 'standardowy': '6 m²', 'rozszerzony': '8 m²', '12m2': '12 m²'},
        )

        draft = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.size',
                'value': 'rozszerzony',
                'base': 'standardowy',
                'mode': 'draft',
            },
        ], url=glowny)
        self.assertEqual(draft.status_code, 200, draft.data)
        self.assertEqual(Stand.objects.get(company=self.partner, day='day1').stand_size, 'standardowy')
        self.assertEqual(
            SheetCellDraft.objects.get(company=self.partner, column_key='stand.size').value,
            'rozszerzony',
        )
        payload = self.as_user(self.fr).get('/api/sheets/lg/glowny/').data
        partner = next(r for r in payload['rows'] if r['company_id'] == self.partner.id)
        self.assertEqual(partner['cells']['stand.size'], 'rozszerzony')

        commit = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.size',
                'value': 'rozszerzony',
                'base': 'rozszerzony',
                'mode': 'commit',
            },
        ], url=glowny)
        self.assertEqual(commit.status_code, 200, commit.data)
        self.assertEqual(Stand.objects.get(company=self.partner, day='day1').stand_size, 'rozszerzony')

        email = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'company.email',
                'value': 'nowy@example.com',
                'base': None,
                'mode': 'commit',
            },
        ], url=opiekunowie)
        self.assertEqual(email.status_code, 200, email.data)
        self.partner.refresh_from_db()
        self.assertEqual(self.partner.email, 'nowy@example.com')

        number = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'stand.day1',
                'value': 'B12',
                'base': None,
                'mode': 'commit',
            },
        ], url=glowny)
        self.assertEqual(number.status_code, status.HTTP_403_FORBIDDEN, number.data)
        self.assertEqual(Stand.objects.get(company=self.partner, day='day1').stand_number, 'A1')

        opiekun_meta = {
            c['key']: c
            for c in self.as_user(self.opiekun).get('/api/sheets/opiekun/glowny/').data['columns']
        }
        self.assertNotIn('can_draft', opiekun_meta['stand.size'])
        self.assertNotIn('can_draft', opiekun_meta['company.email'])

    def test_tr_cannot_draft_system_column(self):
        StandDetails.objects.create(company=self.partner, stand_type='provided_stand', sc_details='')
        response = self.patch(self.tr, [
            {
                'company_id': self.partner.id,
                'column_key': 'workshop.title',
                'value': 'Hacked',
                'base': 'Excel od zera',
                'mode': 'draft',
            },
        ])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Workshop.objects.get(company=self.partner).title, 'Excel od zera')

    def test_list_draft_validates_items_like_commit(self):
        from sheets.models import SheetCellDraft

        response = self.patch(self.fr, [
            {
                'company_id': self.partner.id,
                'column_key': 'people.delegates',
                'value': [{'name': '', 'surname': 'Kowalski', 'phone_number': '123456789', 'attendance': 'day1'}],
                'base': [],
                'mode': 'draft',
            },
        ], url='/api/sheets/opiekun/glowny/cells/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='people.delegates').exists()
        )

    def test_pdi_emails_commit_preserves_existing_phone_number(self):
        from companies.models import PDI, PDIAttendee

        self.partner.opiekun = self.opiekun
        self.partner.save()
        final = FinalData.objects.create(company=self.partner)
        pdi = PDI.objects.create(form=final, tickets_quantity=1)
        PDIAttendee.objects.create(
            form=pdi, name='Jan', surname='Kowalski', phone_number='600700800', email='jan@old.pl',
        )

        saved = self.patch(self.opiekun, [
            {
                'company_id': self.partner.id,
                'column_key': 'people.pdi_emails',
                'value': 'Jan Kowalski: jan@new.pl',
                'base': 'Jan Kowalski: jan@old.pl',
            },
        ], url='/api/sheets/opiekun/glowny/cells/')
        self.assertEqual(saved.status_code, 200, saved.data)
        attendee = PDIAttendee.objects.get(form=pdi)
        self.assertEqual(attendee.email, 'jan@new.pl')
        self.assertEqual(attendee.phone_number, '600700800')


SCOPED_NOTE = ColumnDef(
    key='test.note', label='Notatka', kind=KIND_TEXT, source=SOURCE_EXTRA, edit_roles=frozenset({'opiekun'}),
)
SCOPED_CATALOG = Catalog([
    SheetDef(
        key='opiekun', title='Opiekun', roles=frozenset({'lg'}), scoped_roles=frozenset({'opiekun'}),
        tabs=(TabDef(key='firmy', title='Firmy', columns=(COMPANY_NAME, COMPANY_OPIEKUN, SCOPED_NOTE)),),
    ),
])


@mock.patch.object(views, 'CATALOG', SCOPED_CATALOG)
class OpiekunScopeTests(SheetsApiBase):
    url = '/api/sheets/opiekun/firmy/'

    def setUp(self):
        super().setUp()
        self.partner.opiekun = self.opiekun
        self.partner.save()
        self.lg = make_user('lg1', roles=['lg'])

    def test_opiekun_sees_only_own_companies(self):
        rows = self.as_user(self.opiekun).get(self.url).data['rows']
        self.assertEqual([r['company_id'] for r in rows], [self.partner.id])

    def test_full_role_sees_all(self):
        rows = self.as_user(self.lg).get(self.url).data['rows']
        self.assertEqual({r['company_id'] for r in rows}, {self.partner.id, self.basic.id})

    def test_opiekun_cannot_write_foreign_company(self):
        response = self.patch(self.opiekun, [
            {'company_id': self.basic.id, 'column_key': 'test.note', 'value': 'x', 'base': None},
        ], url=self.url + 'cells/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.patch(self.opiekun, [
            {'company_id': self.partner.id, 'column_key': 'test.note', 'value': 'x', 'base': None},
        ], url=self.url + 'cells/')
        self.assertEqual(response.status_code, 200)


class FieldCoverageTests(TestCase):
    def test_every_form_field_is_decided(self):
        fields = form_field_names()
        mapped = CATALOG.all_source_fields()
        undecided = fields - mapped - set(EXCLUDED_FIELDS) - NOT_YET_MAPPED
        self.assertEqual(
            undecided, set(),
            'Nowe pola formularza bez decyzji — dodaj je do kolumny (source_fields), '
            'EXCLUDED_FIELDS albo NOT_YET_MAPPED w sheets/coverage.py',
        )

    def test_lists_do_not_overlap_or_go_stale(self):
        fields = form_field_names()
        mapped = CATALOG.all_source_fields()
        self.assertEqual(mapped & NOT_YET_MAPPED, set(), 'Zmapowane pola usuń z NOT_YET_MAPPED')
        self.assertEqual(mapped & set(EXCLUDED_FIELDS), set())
        self.assertEqual((mapped | NOT_YET_MAPPED | set(EXCLUDED_FIELDS)) - fields, set(), 'Nieistniejące pola')


class SheetLayoutDefaultTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='layout-admin',
            email='layout-admin@example.com',
            password='x',
            type='admin',
        )
        self.fr = make_user('layout-fr', roles=['fr'])

    def test_put_and_get_hidden_by_tab(self):
        url = '/api/sheets/fr/layout/'
        self.client.force_authenticate(self.admin)
        put = self.client.put(
            url,
            {
                'column_widths': {'company.name': 200},
                'hidden_by_tab': {'firmy': ['stand.day2']},
                'merge_hidden_tab': 'firmy',
            },
            format='json',
        )
        self.assertEqual(put.status_code, 200, put.data)
        self.assertEqual(put.data['hidden_by_tab']['firmy'], ['stand.day2'])
        layout = SheetLayoutDefault.objects.get(sheet_key='fr')
        self.assertEqual(layout.hidden_by_tab['firmy'], ['stand.day2'])

        self.client.force_authenticate(self.fr)
        get = self.client.get(url)
        self.assertEqual(get.status_code, 200)
        self.assertEqual(get.data['hidden_by_tab']['firmy'], ['stand.day2'])
        self.assertEqual(get.data['column_widths']['company.name'], 200)

    def test_merge_preserves_other_tabs(self):
        SheetLayoutDefault.objects.create(
            sheet_key='fr',
            column_widths={'company.name': 160},
            hidden_by_tab={'inne': ['x.y']},
        )
        self.client.force_authenticate(self.admin)
        put = self.client.put(
            '/api/sheets/fr/layout/',
            {
                'column_widths': {'company.name': 180},
                'hidden_by_tab': {'firmy': ['stand.day1']},
                'merge_hidden_tab': 'firmy',
            },
            format='json',
        )
        self.assertEqual(put.status_code, 200, put.data)
        self.assertEqual(put.data['hidden_by_tab']['inne'], ['x.y'])
        self.assertEqual(put.data['hidden_by_tab']['firmy'], ['stand.day1'])

    def test_put_and_get_column_order(self):
        url = '/api/sheets/fr/layout/'
        self.client.force_authenticate(self.admin)
        put = self.client.put(
            url,
            {
                'column_widths': {'company.name': 200},
                'column_order_by_tab': {'firmy': ['stand.day2', 'stand.day1']},
                'merge_order_tab': 'firmy',
            },
            format='json',
        )
        self.assertEqual(put.status_code, 200, put.data)
        self.assertEqual(put.data['column_order_by_tab']['firmy'], ['stand.day2', 'stand.day1'])
        self.client.force_authenticate(self.fr)
        got = self.client.get(url)
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.data['column_order_by_tab']['firmy'], ['stand.day2', 'stand.day1'])

    def test_merge_order_preserves_other_tabs(self):
        SheetLayoutDefault.objects.create(
            sheet_key='fr',
            column_widths={'company.name': 160},
            column_order_by_tab={'inne': ['a.b']},
        )
        self.client.force_authenticate(self.admin)
        put = self.client.put(
            '/api/sheets/fr/layout/',
            {
                'column_widths': {'company.name': 180},
                'column_order_by_tab': {'firmy': ['stand.day1']},
                'merge_order_tab': 'firmy',
            },
            format='json',
        )
        self.assertEqual(put.status_code, 200, put.data)
        self.assertEqual(put.data['column_order_by_tab']['inne'], ['a.b'])
        self.assertEqual(put.data['column_order_by_tab']['firmy'], ['stand.day1'])


class MailDeadlineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_user('mail-admin', type_='admin')
        self.fr = make_user('mail-fr', roles=['fr'])
        self.lg = make_user('mail-lg', roles=['lg'])
        self.opiekun = make_user('mail-op', roles=['opiekun'])
        self.tr = make_user('mail-tr', roles=['tr'])

    def _dates(self, day: int) -> dict:
        return {str(n): f'2027-06-{day + n - 1:02d}' for n in range(1, 6)}

    def test_fr_lg_and_admin_can_set_dates(self):
        self.client.force_authenticate(self.fr)
        got = self.client.get('/api/sheets/mail-deadlines/')
        self.assertEqual(got.status_code, 200, got.data)
        self.assertEqual(got.data['dates']['1'], '2027-02-25')
        self.assertEqual(got.data['dates']['5'], '2027-03-09')

        saved = self.client.put(
            '/api/sheets/mail-deadlines/',
            {'dates': self._dates(1)},
            format='json',
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data['dates']['1'], '2027-06-01')
        self.assertEqual(Settings.get_settings().mail_1_send_by, date(2027, 6, 1))

        self.client.force_authenticate(self.lg)
        lg_saved = self.client.put(
            '/api/sheets/mail-deadlines/',
            {'dates': self._dates(2)},
            format='json',
        )
        self.assertEqual(lg_saved.status_code, 200, lg_saved.data)

        self.client.force_authenticate(self.admin)
        admin_saved = self.client.put(
            '/api/sheets/mail-deadlines/',
            {'dates': self._dates(3)},
            format='json',
        )
        self.assertEqual(admin_saved.status_code, 200, admin_saved.data)
        self.assertEqual(Settings.get_settings().mail_5_send_by, date(2027, 6, 7))

    def test_opiekun_and_tr_cannot_change_dates(self):
        body = {'dates': self._dates(1)}
        self.client.force_authenticate(self.opiekun)
        denied = self.client.put('/api/sheets/mail-deadlines/', body, format='json')
        self.assertEqual(denied.status_code, 403)
        self.client.force_authenticate(self.tr)
        denied_tr = self.client.put('/api/sheets/mail-deadlines/', body, format='json')
        self.assertEqual(denied_tr.status_code, 403)
        readable = self.client.get('/api/sheets/mail-deadlines/')
        self.assertEqual(readable.status_code, 200)
        self.assertEqual(Settings.get_settings().mail_1_send_by, date(2027, 2, 25))

    def test_rejects_bad_date(self):
        self.client.force_authenticate(self.fr)
        bad = self.client.put(
            '/api/sheets/mail-deadlines/',
            {'dates': {**self._dates(1), '3': 'jutro'}},
            format='json',
        )
        self.assertEqual(bad.status_code, 400)


class OpiekunKrok3Tests(SheetsApiBase):
    GL = '/api/sheets/opiekun/glowny/'
    WELCOME = '/api/sheets/opiekun/welcome/'
    MEALS = '/api/sheets/opiekun/obiady_besciakow/'

    def _row(self, user, url, company_id):
        data = self.as_user(user).get(url).data
        return next(row for row in data['rows'] if row['company_id'] == company_id)

    def test_mail_group_header_uses_settings_date(self):
        settings_obj = Settings.get_settings()
        settings_obj.mail_1_send_by = date(2027, 4, 1)
        settings_obj.mail_5_send_by = date(2027, 4, 9)
        settings_obj.save()
        data = self.as_user(self.fr).get(self.GL).data
        by_key = {col['key']: col for col in data['columns']}
        self.assertEqual(by_key['mail1.sent']['group'], 'MAIL #1 · do 01.04')
        self.assertIn('01.04', by_key['mail1.sent']['help'])
        self.assertNotIn('{{', by_key['mail1.sent']['help'])
        self.assertEqual(by_key['mail5.sent']['group'], 'MAIL #5 · 09.04')
        self.assertIn('09.04', by_key['mail5.sent']['help'])

    def test_checklist_extra_saves_for_opiekun(self):
        self.partner.opiekun = self.opiekun
        self.partner.save()
        saved = self.patch(self.opiekun, [
            {'company_id': self.partner.id, 'column_key': 'mail1.sent', 'value': True, 'base': False},
        ], url=self.GL + 'cells/')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(SheetCellValue.objects.get(company=self.partner, column_key='mail1.sent').value)
        fr_saved = self.patch(self.fr, [
            {'company_id': self.partner.id, 'column_key': 'mail3.people_count', 'value': 4, 'base': None},
        ], url=self.GL + 'cells/')
        self.assertEqual(fr_saved.status_code, 200, fr_saved.data)
        welcome = self._row(self.fr, self.WELCOME, self.partner.id)
        self.assertEqual(welcome['cells']['mail3.people_count'], 4)

    def test_own_build_tones(self):
        bare = self._row(self.fr, self.GL, self.partner.id)
        self.assertEqual(bare['cells']['care.build_tone'], 'nie dotyczy')
        self.assertEqual(bare['tones']['care.build_tone'], 'na')

        StandDetails.objects.create(company=self.partner, stand_type='self_construction')
        missing = self._row(self.fr, self.GL, self.partner.id)
        self.assertEqual(missing['cells']['care.build_tone'], 'braki')
        self.assertEqual(missing['tones']['care.build_tone'], 'warn')

        details = StandDetails.objects.get(company=self.partner)
        details.stand_visualization = 'viz.pdf'
        details.fire_cert = 'cert.pdf'
        details.save(update_fields=['stand_visualization', 'fire_cert'])
        SheetCellValue.objects.create(company=self.partner, column_key='care.car_registration', value='WX 1')
        SheetCellValue.objects.create(company=self.partner, column_key='care.slot', value='14-16')
        complete = self._row(self.fr, self.GL, self.partner.id)
        self.assertEqual(complete['cells']['care.build_tone'], 'komplet')
        self.assertEqual(complete['tones']['care.build_tone'], 'ok')

        Stand.objects.create(company=self.partner, day='day1', stand_number='A1', stand_size='standardowy')
        day_row = self._row(self.fr, self.GL, self.partner.id)
        self.assertEqual(day_row['tones']['final.protocol_d1_am'], 'todo')
        self.assertEqual(day_row['tones']['final.protocol_d2_am'], 'na')

    def test_welcome_sum_skips_resigned_in_the_row_flag(self):
        final = FinalData.objects.create(company=self.partner)
        Lunch.objects.create(form=final, day='day1', lunch_quantity=3)
        Lunch.objects.create(form=final, day='day2', lunch_quantity=1)
        other = FinalData.objects.create(company=self.basic)
        Lunch.objects.create(form=other, day='day1', lunch_quantity=9)
        CompanyInvitation.objects.create(
            email='b@example.com', company_name=self.basic.name, is_cancelled=True, is_resigned=True,
        )
        data = self.as_user(self.fr).get(self.WELCOME).data
        by_id = {row['company_id']: row for row in data['rows']}
        self.assertEqual(by_id[self.partner.id]['cells']['welcome.lunch_sum'], 4)
        self.assertFalse(by_id[self.partner.id]['resigned'])
        self.assertTrue(by_id[self.basic.id]['resigned'])
        active = [
            row['cells']['welcome.lunch_sum']
            for row in data['rows']
            if not row['resigned'] and isinstance(row['cells']['welcome.lunch_sum'], int)
        ]
        self.assertEqual(sum(active), 4)
        self.assertEqual(by_id[self.basic.id]['tones']['welcome.lunches_issued'], 'na')

    def test_staff_meal_day1_and_opiekun_sees_only_self(self):
        other = make_user('op2', roles=['opiekun'])
        saved = self.patch(self.opiekun, [
            {'company_id': self.opiekun.id, 'column_key': 'staff.meal.day1', 'value': True, 'base': False},
        ], url=self.MEALS + 'cells/')
        self.assertEqual(saved.status_code, 200, saved.data)
        meal = StaffMeal.objects.get(user=self.opiekun)
        self.assertTrue(meal.day1)
        self.assertFalse(meal.day2)
        self.assertTrue(StaffMealChange.objects.filter(user=self.opiekun, column_key='staff.meal.day1').exists())

        own_rows = self.as_user(self.opiekun).get(self.MEALS).data['rows']
        self.assertEqual([row['company_id'] for row in own_rows], [self.opiekun.id])
        self.assertEqual(own_rows[0]['entity'], 'user')
        self.assertTrue(own_rows[0]['cells']['staff.meal.day1'])

        denied = self.patch(self.opiekun, [
            {'company_id': other.id, 'column_key': 'staff.meal.day1', 'value': True, 'base': False},
        ], url=self.MEALS + 'cells/')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        seen = {row['company_id'] for row in self.as_user(self.fr).get(self.MEALS).data['rows']}
        self.assertEqual(seen, {self.opiekun.id, other.id})

    def test_staff_meal_note(self):
        saved = self.patch(self.opiekun, [
            {'company_id': self.opiekun.id, 'column_key': 'staff.meal.note', 'value': 'core team', 'base': None},
        ], url=self.MEALS + 'cells/')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(StaffMeal.objects.get(user=self.opiekun).note, 'core team')
        own = self.as_user(self.opiekun).get(self.MEALS).data
        self.assertEqual(own['rows'][0]['cells']['staff.meal.note'], 'core team')
        self.assertEqual(
            next(col['label'] for col in own['columns'] if col['key'] == 'staff.meal.day1'),
            'Bon na obiad\ndzień 1',
        )

    def test_opiekun_sees_equipment_to_confirm_and_distinct_logo_checks(self):
        self.partner.opiekun = self.opiekun
        self.partner.save()
        cols = {col['key']: col for col in self.as_user(self.opiekun).get(self.GL).data['columns']}
        keys = list(cols)
        self.assertEqual(cols['company.status']['label'], 'Status firmy')
        self.assertIn('Główny Partner', cols['company.status']['help'])
        self.assertIn('m²', cols['stand.size']['help'])
        self.assertEqual(
            {opt['value']: opt['label'] for opt in cols['stand.size']['options']},
            {'podstawowy': '4 m²', 'standardowy': '6 m²', 'rozszerzony': '8 m²', '12m2': '12 m²'},
        )
        self.assertEqual(cols['company.fr']['label'], 'Opiekun FR')
        self.assertEqual(cols['people.firemka']['label'], 'Główny przedstawiciel')
        self.assertEqual(cols['people.pdi_tickets']['label'], 'Osoby na PDI')
        self.assertEqual(cols['mail4.hr']['label'], 'Kontakt HR')
        self.assertIn('stand.brought_equipment', cols)
        self.assertFalse(cols['stand.brought_equipment']['editable'])
        self.assertLess(keys.index('package.lights'), keys.index('mail1.standard_ok'))
        self.assertLess(keys.index('lg.extra_orders'), keys.index('mail1.extra_ok'))
        self.assertFalse(cols['lg.extra_orders']['editable'])
        self.assertIn('care.logo_approved', cols)
        self.assertLess(keys.index('mail1.logo_check'), keys.index('care.logo_approved'))
        self.assertIn('odebrała welcome pack', cols['final.welcome_handed']['help'])
        self.assertIn('data oraz nazwa firmy', cols['care.fire_cert_checked']['help'])
        saved = self.patch(self.opiekun, [
            {'company_id': self.partner.id, 'column_key': 'care.fire_cert_checked', 'value': True, 'base': False},
        ], url=self.GL + 'cells/')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(
            SheetCellValue.objects.get(company=self.partner, column_key='care.fire_cert_checked').value
        )
        denied = self.patch(self.opiekun, [
            {'company_id': self.partner.id, 'column_key': 'lg.extra_orders', 'value': 'krzesła x10', 'base': None},
        ], url=self.GL + 'cells/')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        fryz = {col['key'] for col in self.as_user(self.fr).get('/api/sheets/lg/fryz/').data['columns']}
        self.assertIn('care.logo_approved', fryz)
        self.assertIn('mail1.logo_check', fryz)
        carpet = {
            col['key']: col for col in self.as_user(self.fr).get('/api/sheets/lg/wykladziny/').data['columns']
        }
        self.assertIn('892', carpet['carpet.color']['help'])
        matrix = {
            col['key']: col for col in self.as_user(self.fr).get('/api/sheets/opiekun/montaz_1/').data['columns']
        }
        self.assertIn('5 firm', matrix['matrix.slot.14-16']['help'])
        self.assertIn('Godzina odbioru', matrix['matrix.slot.14-16']['help'])

    def test_matrix_places_company_by_day_and_slot(self):
        day1 = '2027-03-09'
        day2 = '2027-03-10'

        def own(name, day, slot):
            company = Company.objects.create(name=name, email=f'{name}@e.com', status='partner')
            StandDetails.objects.create(company=company, stand_type='self_construction')
            SheetCellValue.objects.create(company=company, column_key='care.arrival_day', value=day)
            SheetCellValue.objects.create(company=company, column_key='care.slot', value=slot)
            SheetCellValue.objects.create(company=company, column_key='care.car_make', value='VW')
            SheetCellValue.objects.create(company=company, column_key='care.car_registration', value=name)
            return company

        for index in range(1, 7):
            own(f'A{index}', day1, '14-16')
        own('ObcySlot', day1, 'rano')
        own('DrugiDzien', day2, '16-18')
        plain = Company.objects.create(name='BezZabudowy', email='bz@e.com', status='partner')
        StandDetails.objects.create(company=plain, stand_type='provided_stand')
        SheetCellValue.objects.create(company=plain, column_key='care.arrival_day', value=day1)
        SheetCellValue.objects.create(company=plain, column_key='care.slot', value='14-16')

        monday = self.as_user(self.fr).get('/api/sheets/opiekun/montaz_1/').data
        self.assertEqual(monday['tab']['view'], 'matrix')
        self.assertIn('Wtorek', monday['tab']['title'])
        self.assertEqual(monday['matrix']['edit_tab'], 'glowny')
        self.assertEqual(monday['matrix']['comment_column']['key'], 'care.slot')
        self.assertEqual(monday['matrix']['comment_column']['kind'], 'select')
        self.assertTrue(monday['matrix']['comment_column'].get('proposable'))
        slot = [
            row['cells']['matrix.slot.14-16']
            for row in monday['rows']
            if row['cells']['matrix.slot.14-16']
        ]
        self.assertEqual(len(slot), 5)
        self.assertTrue(all('A' in text and 'A6' not in text for text in slot))
        # Excel-style multiline: „Nazwa\nMarka - Rejestracja”
        self.assertTrue(all('\nVW - A' in text for text in slot))
        placed = monday['matrix']['placements']['14-16']
        self.assertEqual(len(placed), 5)
        self.assertTrue(all(item.get('color') and item.get('registration') for item in placed))
        self.assertTrue(all(row['tones'].get('matrix.slot.14-16') == 'warn' for row in monday['rows']))
        no_text = ' '.join(
            row['cells']['matrix.slot.NO'] or '' for row in monday['rows']
        )
        self.assertIn('A6', no_text)
        self.assertIn('ObcySlot', no_text)
        self.assertNotIn('DrugiDzien', no_text)
        self.assertNotIn('BezZabudowy', no_text)

        tuesday = self.as_user(self.fr).get('/api/sheets/opiekun/montaz_2/').data
        self.assertIn('Środa', tuesday['tab']['title'])
        joined = ' '.join(
            row['cells']['matrix.slot.16-18'] or '' for row in tuesday['rows']
        )
        self.assertIn('DrugiDzien', joined)
        readonly = self.patch(self.fr, [
            {'company_id': -1, 'column_key': 'matrix.pos', 'value': 'x', 'base': '1'},
        ], url='/api/sheets/opiekun/montaz_1/cells/')
        self.assertEqual(readonly.status_code, status.HTTP_403_FORBIDDEN)

    def test_footer_day_split_only_when_it_is_a_fair_day_subset(self):
        meals = {col['key']: col for col in self.as_user(self.fr).get(self.MEALS).data['columns']}
        self.assertEqual(meals['staff.meal.day1']['aggregate'], 'count_true')
        self.assertFalse(meals['staff.meal.day1']['aggregate_by_day'])
        self.assertFalse(meals['staff.meal.day2']['aggregate_by_day'])

        welcome = {col['key']: col for col in self.as_user(self.fr).get(self.WELCOME).data['columns']}
        self.assertFalse(welcome['lunch.day1']['aggregate_by_day'])
        self.assertFalse(welcome['welcome.lunch_sum']['aggregate_by_day'])
        self.assertTrue(welcome['welcome.lunches_issued']['aggregate_by_day'])
        self.assertTrue(welcome['mail3.people_count']['aggregate_by_day'])
        self.assertIn('company.days', welcome)

        glowny = {col['key']: col for col in self.as_user(self.fr).get('/api/sheets/lg/glowny/').data['columns']}
        self.assertTrue(glowny['stand.own_build']['aggregate_by_day'])
        self.assertFalse(glowny['equipment.paid']['aggregate_by_day'])

        money = {col['key']: col for col in self.as_user(self.fr).get('/api/sheets/fr/rozliczenia/').data['columns']}
        self.assertFalse(money['money.total']['aggregate_by_day'])
        self.assertNotIn('company.days', money)
        self.assertNotIn('stand.day1', money)


class SheetCommentTests(SheetsApiBase):
    def setUp(self):
        super().setUp()
        self.partner.opiekun = self.opiekun
        self.partner.save()
        self.other_opiekun = make_user('op2', roles=['opiekun'])

    def test_opiekun_cannot_comment_other_company(self):
        response = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.basic.id,
            'column_key': 'care.comment',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'hej',
            'mentions': [],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_mention_creates_notification_only_for_mentioned(self):
        response = self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'lg',
            'tab_key': 'glowny',
            'body': 'sprawdź logo',
            'mentions': [self.opiekun.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(SheetNotification.objects.filter(recipient=self.opiekun).count(), 1)
        self.assertEqual(SheetNotification.objects.filter(recipient=self.fr).count(), 0)

        empty = self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'lg',
            'tab_key': 'glowny',
            'body': 'bez @',
            'mentions': [],
        }, format='json')
        self.assertEqual(empty.status_code, status.HTTP_201_CREATED, empty.data)
        self.assertEqual(SheetNotification.objects.count(), 1)

    def test_self_mention_notifies_author(self):
        response = self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'lg',
            'tab_key': 'glowny',
            'body': 'przypomnij sobie',
            'mentions': [self.fr.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(SheetNotification.objects.filter(recipient=self.fr).count(), 1)

    def test_edit_does_not_duplicate_old_mention_notification(self):
        created = self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.slot',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'pierwszy',
            'mentions': [self.opiekun.id],
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        comment_id = created.data['id']
        patched = self.as_user(self.fr).patch(f'/api/sheets/comments/{comment_id}/', {
            'body': 'pierwszy (edycja)',
            'mentions': [self.opiekun.id],
        }, format='json')
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(SheetNotification.objects.filter(recipient=self.opiekun).count(), 1)

        patched2 = self.as_user(self.fr).patch(f'/api/sheets/comments/{comment_id}/', {
            'mentions': [self.opiekun.id, self.other_opiekun.id],
        }, format='json')
        self.assertEqual(patched2.status_code, 200, patched2.data)
        self.assertEqual(SheetNotification.objects.filter(recipient=self.opiekun).count(), 1)
        self.assertEqual(SheetNotification.objects.filter(recipient=self.other_opiekun).count(), 1)

    def test_comment_counts_in_company_and_staff_payload(self):
        SheetCellComment.objects.create(
            company=self.partner,
            column_key='care.comment',
            sheet_key='opiekun',
            tab_key='glowny',
            author=self.fr,
            body='x',
        )
        SheetCellComment.objects.create(
            staff_user=self.opiekun,
            column_key='staff.meal.day1',
            sheet_key='opiekun',
            tab_key='obiady_besciakow',
            author=self.fr,
            body='y',
        )
        glowny = self.as_user(self.fr).get('/api/sheets/opiekun/glowny/').data
        self.assertEqual(
            glowny['comment_counts'].get(f'c:{self.partner.id}|care.comment'),
            1,
        )
        meals = self.as_user(self.fr).get('/api/sheets/opiekun/obiady_besciakow/').data
        self.assertEqual(
            meals['comment_counts'].get(f'u:{self.opiekun.id}|staff.meal.day1'),
            1,
        )

    def test_opiekun_staff_row_scope(self):
        denied = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'staff_user_id': self.other_opiekun.id,
            'column_key': 'staff.meal.day1',
            'sheet_key': 'opiekun',
            'tab_key': 'obiady_besciakow',
            'body': 'cudzy',
            'mentions': [],
        }, format='json')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        ok = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'staff_user_id': self.opiekun.id,
            'column_key': 'staff.meal.day1',
            'sheet_key': 'opiekun',
            'tab_key': 'obiady_besciakow',
            'body': 'mój',
            'mentions': [],
        }, format='json')
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED, ok.data)

    def test_notifications_list_is_private(self):
        self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'lg',
            'tab_key': 'glowny',
            'body': 'ping',
            'mentions': [self.opiekun.id],
        }, format='json')
        mine = self.as_user(self.opiekun).get('/api/sheets/notifications/').data
        self.assertEqual(mine['unread_count'], 1)
        self.assertEqual(len(mine['items']), 1)
        other = self.as_user(self.fr).get('/api/sheets/notifications/').data
        self.assertEqual(other['unread_count'], 0)
        self.assertEqual(other['items'], [])

    def test_status_dropdown_values(self):
        created = self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'lg',
            'tab_key': 'glowny',
            'body': 'status test',
            'mentions': [],
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['status'], 'progress')
        comment_id = created.data['id']
        for value in ('accepted', 'rejected', 'progress'):
            patched = self.as_user(self.opiekun).patch(
                f'/api/sheets/comments/{comment_id}/',
                {'status': value},
                format='json',
            )
            self.assertEqual(patched.status_code, 200, patched.data)
            self.assertEqual(patched.data['status'], value)
        bad = self.as_user(self.fr).patch(
            f'/api/sheets/comments/{comment_id}/',
            {'status': 'done'},
            format='json',
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_propose_and_apply_by_fr_writes_cell(self):
        created = self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'zmień komentarz',
            'mentions': [],
            'proposed_value': 'nowa treść FR',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['proposed_value'], 'nowa treść FR')
        self.assertEqual(created.data['status'], 'progress')
        self.assertTrue(created.data['can_apply'])
        comment_id = created.data['id']

        applied = self.as_user(self.fr).post(
            f'/api/sheets/comments/{comment_id}/apply/',
            {},
            format='json',
        )
        self.assertEqual(applied.status_code, 200, applied.data)
        self.assertEqual(applied.data['comment']['status'], 'accepted')
        self.assertEqual(
            SheetCellValue.objects.get(company=self.partner, column_key='care.comment').value,
            'nowa treść FR',
        )

    def test_apply_forbidden_without_editable_by(self):
        """Anyone with cell access may propose; opiekun cannot apply LG-only column."""
        lg = make_user('lg-propose', roles=['lg'])
        created = self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'lg.extra_orders',
            'sheet_key': 'lg',
            'tab_key': 'glowny',
            'body': 'propozycja krzeseł',
            'mentions': [],
            'proposed_value': 'krzesła x10',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertFalse(created.data['can_apply'])  # FR cannot edit lg.extra_orders
        as_lg = self.as_user(lg).get(
            f'/api/sheets/comments/?company_id={self.partner.id}&column_key=lg.extra_orders',
        )
        self.assertEqual(as_lg.status_code, 200)
        self.assertTrue(as_lg.data[0]['can_apply'])
        denied = self.as_user(self.opiekun).post(
            f'/api/sheets/comments/{created.data["id"]}/apply/',
            {},
            format='json',
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            SheetCellValue.objects.filter(
                company=self.partner, column_key='lg.extra_orders',
            ).exists()
        )

    def test_apply_without_proposed_value_is_bad_request(self):
        plain = SheetCellComment.objects.create(
            company=self.partner,
            column_key='care.comment',
            sheet_key='opiekun',
            tab_key='glowny',
            author=self.fr,
            body='bez propozycji',
        )
        response = self.as_user(self.fr).post(
            f'/api/sheets/comments/{plain.id}/apply/',
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_apply_rejected_proposal_is_bad_request(self):
        created = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'do odrzucenia',
            'mentions': [],
            'proposed_value': 'nie tędy',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        comment_id = created.data['id']

        rejected = self.as_user(self.fr).patch(
            f'/api/sheets/comments/{comment_id}/',
            {'status': 'rejected'},
            format='json',
        )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertFalse(rejected.data['can_apply'])
        self.assertTrue(rejected.data['can_delete'])

        applied = self.as_user(self.fr).post(
            f'/api/sheets/comments/{comment_id}/apply/',
            {},
            format='json',
        )
        self.assertEqual(applied.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            SheetCellValue.objects.filter(
                company=self.partner, column_key='care.comment', value='nie tędy',
            ).exists()
        )

    def test_comments_list_is_ordered_by_created_at(self):
        older = SheetCellComment.objects.create(
            company=self.partner,
            column_key='care.comment',
            sheet_key='opiekun',
            tab_key='glowny',
            author=self.fr,
            body='starszy',
        )
        newer = SheetCellComment.objects.create(
            company=self.partner,
            column_key='care.comment',
            sheet_key='opiekun',
            tab_key='glowny',
            author=self.fr,
            body='nowszy',
        )
        SheetCellComment.objects.filter(pk=older.pk).update(created_at=older.created_at.replace(year=2020))
        listed = self.as_user(self.fr).get(
            f'/api/sheets/comments/?company_id={self.partner.id}&column_key=care.comment',
        )
        self.assertEqual(listed.status_code, 200)
        bodies = [row['body'] for row in listed.data]
        self.assertEqual(bodies, ['starszy', 'nowszy'])
        self.assertEqual(listed.data[0]['id'], older.id)
        self.assertEqual(listed.data[1]['id'], newer.id)

    def test_opiekun_cannot_delete_foreign_proposal(self):
        created = self.as_user(self.fr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'propozycja FR',
            'mentions': [],
            'proposed_value': 'treść FR',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertTrue(created.data['can_apply'])
        self.assertTrue(created.data['can_delete'])

        as_opiekun = self.as_user(self.opiekun).get(
            f'/api/sheets/comments/?company_id={self.partner.id}&column_key=care.comment',
        )
        self.assertEqual(as_opiekun.status_code, 200)
        self.assertFalse(as_opiekun.data[0]['can_apply'])
        self.assertFalse(as_opiekun.data[0]['can_delete'])

        denied = self.as_user(self.opiekun).delete(
            f'/api/sheets/comments/{created.data["id"]}/',
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(SheetCellComment.objects.filter(pk=created.data['id']).exists())

        allowed = self.as_user(self.fr).delete(
            f'/api/sheets/comments/{created.data["id"]}/',
        )
        self.assertEqual(allowed.status_code, 204)
        self.assertFalse(SheetCellComment.objects.filter(pk=created.data['id']).exists())

    def test_migration_maps_legacy_statuses(self):
        import importlib

        from django.apps import apps as django_apps

        migration = importlib.import_module('sheets.migrations.0007_comment_propose_change')

        rows = [
            ('open→progress', 'open'),
            ('done→accepted', 'done'),
            ('blocked→rejected', 'blocked'),
        ]
        for body, _legacy in rows:
            SheetCellComment.objects.create(
                company=self.partner,
                column_key='care.comment',
                sheet_key='opiekun',
                tab_key='glowny',
                author=self.fr,
                body=body,
            )
        for body, legacy in rows:
            SheetCellComment.objects.filter(body=body).update(status=legacy)

        migration.forwards_map_statuses(django_apps, None)

        bodies = {
            c.body: c.status
            for c in SheetCellComment.objects.filter(body__in=[b for b, _ in rows])
        }
        self.assertEqual(bodies['open→progress'], 'progress')
        self.assertEqual(bodies['done→accepted'], 'accepted')
        self.assertEqual(bodies['blocked→rejected'], 'rejected')

    def test_proposed_value_creates_draft_and_syncs_lifecycle(self):
        from sheets.models import SheetCellDraft, SheetCellFormOverride

        Stand.objects.create(
            company=self.partner, day='day1', stand_number='A1', stand_size='standardowy',
        )
        created = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'stand.size',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'proszę zmienić metraż',
            'mentions': [],
            'proposed_value': 'rozszerzony',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['proposed_value'], 'rozszerzony')
        self.assertFalse(created.data['can_apply'])
        comment_id = created.data['id']

        draft = SheetCellDraft.objects.get(company=self.partner, column_key='stand.size')
        self.assertEqual(draft.value, 'rozszerzony')

        payload = self.as_user(self.opiekun).get('/api/sheets/opiekun/glowny/').data
        cell_key = f'{self.partner.id}|stand.size'
        self.assertTrue(payload['drafts'][cell_key])
        self.assertEqual(payload['form_values'][cell_key], 'standardowy')
        partner_row = next(r for r in payload['rows'] if r['company_id'] == self.partner.id)
        self.assertEqual(partner_row['cells']['stand.size'], 'rozszerzony')

        denied = self.as_user(self.opiekun).post(
            f'/api/sheets/comments/{comment_id}/apply/', {}, format='json',
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        applied = self.as_user(self.fr).post(
            f'/api/sheets/comments/{comment_id}/apply/', {}, format='json',
        )
        self.assertEqual(applied.status_code, 200, applied.data)
        self.assertEqual(applied.data['comment']['status'], 'accepted')
        self.assertEqual(Stand.objects.get(company=self.partner, day='day1').stand_size, 'rozszerzony')
        self.assertTrue(
            SheetCellFormOverride.objects.filter(company=self.partner, column_key='stand.size').exists()
        )
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='stand.size').exists()
        )

    def test_rejecting_or_deleting_proposal_comment_cleans_up_draft(self):
        from sheets.models import SheetCellDraft

        first = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'propozycja 1',
            'mentions': [],
            'proposed_value': 'nowa uwaga 1',
        }, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertTrue(
            SheetCellDraft.objects.filter(company=self.partner, column_key='care.comment').exists()
        )

        rejected = self.as_user(self.fr).patch(
            f'/api/sheets/comments/{first.data["id"]}/',
            {'status': 'rejected'},
            format='json',
        )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='care.comment').exists()
        )

        second = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'propozycja 2',
            'mentions': [],
            'proposed_value': 'nowa uwaga 2',
        }, format='json')
        self.assertEqual(second.status_code, 201, second.data)
        self.assertTrue(
            SheetCellDraft.objects.filter(company=self.partner, column_key='care.comment').exists()
        )

        deleted = self.as_user(self.opiekun).delete(f'/api/sheets/comments/{second.data["id"]}/')
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='care.comment').exists()
        )

    def test_accepting_rejected_proposal_restores_draft_until_applied(self):
        from sheets.models import SheetCellDraft

        created = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'propozycja do akceptacji',
            'mentions': [],
            'proposed_value': 'zaakceptowana uwaga',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        comment_id = created.data['id']

        rejected = self.as_user(self.fr).patch(
            f'/api/sheets/comments/{comment_id}/',
            {'status': 'rejected'},
            format='json',
        )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='care.comment').exists()
        )

        accepted = self.as_user(self.fr).patch(
            f'/api/sheets/comments/{comment_id}/',
            {'status': 'accepted'},
            format='json',
        )
        self.assertEqual(accepted.status_code, 200, accepted.data)
        draft = SheetCellDraft.objects.get(company=self.partner, column_key='care.comment')
        self.assertEqual(draft.value, 'zaakceptowana uwaga')

        applied = self.as_user(self.fr).post(f'/api/sheets/comments/{comment_id}/apply/', {}, format='json')
        self.assertEqual(applied.status_code, 200, applied.data)
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='care.comment').exists()
        )

        self.as_user(self.fr).patch(f'/api/sheets/comments/{comment_id}/', {'status': 'rejected'}, format='json')
        self.as_user(self.fr).patch(f'/api/sheets/comments/{comment_id}/', {'status': 'accepted'}, format='json')
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='care.comment').exists()
        )

    def test_propose_draft_without_body_and_opiekun_can_discard(self):
        from sheets.models import SheetCellDraft

        StandDetails.objects.create(
            company=self.partner, stand_type='self_construction', sc_details='stare ścianki',
        )
        created = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'stand.composition',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': '',
            'mentions': [],
            'proposed_value': 'rollupy + lada',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['body'], '')
        self.assertEqual(created.data['proposed_value'], 'rollupy + lada')

        draft = SheetCellDraft.objects.get(company=self.partner, column_key='stand.composition')
        self.assertEqual(draft.value, 'rollupy + lada')

        discarded = self.as_user(self.opiekun).post(
            '/api/sheets/opiekun/glowny/cells/discard/',
            {'cells': [{'company_id': self.partner.id, 'column_key': 'stand.composition'}]},
            format='json',
        )
        self.assertEqual(discarded.status_code, 200, discarded.data)
        self.assertFalse(
            SheetCellDraft.objects.filter(company=self.partner, column_key='stand.composition').exists()
        )
        comment = SheetCellComment.objects.get(pk=created.data['id'])
        self.assertEqual(comment.status, SheetCellComment.STATUS_REJECTED)

    def test_composite_edit_parts_proposal_lifecycle(self):
        from companies.models import FinalData
        from sheets.models import SheetCellDraft

        FinalData.objects.create(
            company=self.partner, main_rep_name='Janusz', main_rep_surname='Kowalski', main_rep_phone='666 666 666',
        )
        opiekun_cols = {
            c['key']: c
            for c in self.as_user(self.opiekun).get('/api/sheets/opiekun/glowny/').data['columns']
        }
        self.assertTrue(opiekun_cols['people.firemka']['proposable'])
        self.assertEqual(
            [p['key'] for p in opiekun_cols['people.firemka']['edit_parts']],
            ['people.main_name', 'people.main_surname', 'people.main_phone'],
        )
        self.assertNotIn('proposable', opiekun_cols['people.delegates'])

        fr_dane_cols = {
            c['key']: c
            for c in self.as_user(self.fr).get('/api/sheets/fr/dane/').data['columns']
        }
        self.assertNotIn('proposable', fr_dane_cols['company.address'])
        self.assertNotIn('proposable', fr_dane_cols['company.representative'])

        bad = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'people.firemka',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': '',
            'mentions': [],
            'proposed_value': 'Janusz Kowalski | 666 666 667',
        }, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        created = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'people.firemka',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'nowy numer telefonu',
            'mentions': [],
            'proposed_value': {
                'people.main_name': 'Janusz',
                'people.main_surname': 'Kowalski',
                'people.main_phone': '666 666 667',
            },
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertFalse(created.data['can_apply'])
        comment_id = created.data['id']

        payload = self.as_user(self.opiekun).get('/api/sheets/opiekun/glowny/').data
        partner_row = next(r for r in payload['rows'] if r['company_id'] == self.partner.id)
        self.assertEqual(partner_row['cells']['people.firemka'], 'Janusz Kowalski | 666 666 667')
        self.assertTrue(payload['drafts'][f'{self.partner.id}|people.firemka'])

        discarded = self.as_user(self.opiekun).post(
            '/api/sheets/opiekun/glowny/cells/discard/',
            {'cells': [{'company_id': self.partner.id, 'column_key': 'people.firemka'}]},
            format='json',
        )
        self.assertEqual(discarded.status_code, 200, discarded.data)
        self.assertFalse(
            SheetCellDraft.objects.filter(
                company=self.partner,
                column_key__in=['people.main_name', 'people.main_surname', 'people.main_phone'],
            ).exists()
        )
        self.assertEqual(SheetCellComment.objects.get(pk=comment_id).status, SheetCellComment.STATUS_REJECTED)

        accepted = self.as_user(self.fr).patch(
            f'/api/sheets/comments/{comment_id}/',
            {'status': 'accepted'},
            format='json',
        )
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(
            SheetCellDraft.objects.get(company=self.partner, column_key='people.main_phone').value,
            '666 666 667',
        )

        applied = self.as_user(self.fr).post(f'/api/sheets/comments/{comment_id}/apply/', {}, format='json')
        self.assertEqual(applied.status_code, 200, applied.data)
        self.assertEqual(applied.data['comment']['status'], 'accepted')
        self.assertEqual(FinalData.objects.get(company=self.partner).main_rep_phone, '666 666 667')
        self.assertFalse(
            SheetCellDraft.objects.filter(
                company=self.partner,
                column_key__in=['people.main_name', 'people.main_surname', 'people.main_phone'],
            ).exists()
        )

    def test_non_commit_roles_can_only_propose_not_apply(self):
        from sheets.models import SheetCellDraft

        tr = make_user('tr-only', roles=['tr'])
        opiekun_prop = self.as_user(self.opiekun).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'care.comment',
            'sheet_key': 'opiekun',
            'tab_key': 'glowny',
            'body': 'propozycja opiekuna',
            'mentions': [],
            'proposed_value': 'proponowany tekst',
        }, format='json')
        self.assertEqual(opiekun_prop.status_code, 201, opiekun_prop.data)
        self.assertFalse(opiekun_prop.data['can_apply'])
        self.assertEqual(
            SheetCellDraft.objects.get(company=self.partner, column_key='care.comment').value,
            'proponowany tekst',
        )
        denied_opiekun = self.as_user(self.opiekun).post(
            f'/api/sheets/comments/{opiekun_prop.data["id"]}/apply/', {}, format='json',
        )
        self.assertEqual(denied_opiekun.status_code, status.HTTP_403_FORBIDDEN)

        tr_prop = self.as_user(tr).post('/api/sheets/comments/', {
            'company_id': self.partner.id,
            'column_key': 'tr.room',
            'sheet_key': 'tr',
            'tab_key': 'warsztaty',
            'body': 'sala propozycja',
            'mentions': [],
            'proposed_value': 'Sala 101',
        }, format='json')
        self.assertEqual(tr_prop.status_code, 201, tr_prop.data)
        self.assertFalse(tr_prop.data['can_apply'])
        denied_tr = self.as_user(tr).post(
            f'/api/sheets/comments/{tr_prop.data["id"]}/apply/', {}, format='json',
        )
        self.assertEqual(denied_tr.status_code, status.HTTP_403_FORBIDDEN)

        allowed_fr = self.as_user(self.fr).post(
            f'/api/sheets/comments/{opiekun_prop.data["id"]}/apply/', {}, format='json',
        )
        self.assertEqual(allowed_fr.status_code, 200, allowed_fr.data)


class FormFileUploadTests(SheetsApiBase):
    def test_sign_logo_upload_restore_and_money_pdf_rejected(self):
        from django.core.files.storage import default_storage
        from django.core.files.uploadedfile import SimpleUploadedFile

        from sheets.models import SheetCellFormOverride

        details = StandDetails.objects.create(company=self.partner, stand_type='provided_stand')
        details.logo_sign_file.save(
            'old-logo.png',
            SimpleUploadedFile('old-logo.png', b'old-png-bytes', content_type='image/png'),
            save=True,
        )
        old_name = details.logo_sign_file.name

        meta = {
            c['key']: c
            for c in self.as_user(self.fr).get('/api/sheets/lg/fryz/').data['columns']
        }
        self.assertTrue(meta['sign.logo']['can_commit'])
        self.assertTrue(meta['sign.logo']['can_draft'])

        upload = SimpleUploadedFile('new-logo.png', b'new-png-bytes', content_type='image/png')
        drafted = self.as_user(self.fr).post(
            '/api/sheets/lg/fryz/cells/file/',
            {
                'company_id': self.partner.id,
                'column_key': 'sign.logo',
                'mode': 'draft',
                'file': upload,
            },
            format='multipart',
        )
        self.assertEqual(drafted.status_code, 200, drafted.data)
        details.refresh_from_db()
        self.assertEqual(details.logo_sign_file.name, old_name)
        self.assertEqual(details.logo_sign_file.read(), b'old-png-bytes')
        payload = self.as_user(self.fr).get('/api/sheets/lg/fryz/').data
        partner = next(row for row in payload['rows'] if row['company_id'] == self.partner.id)
        self.assertEqual(partner['cells']['sign.logo']['name'], 'new-logo.png')
        self.assertTrue(payload['drafts'][f'{self.partner.id}|sign.logo'])
        self.assertIn('old-logo', payload['form_values'][f'{self.partner.id}|sign.logo']['name'])
        draft_storage_path = partner['cells']['sign.logo']['path']
        self.assertTrue(default_storage.exists(draft_storage_path))

        response = self.as_user(self.fr).post(
            '/api/sheets/lg/fryz/cells/file/',
            {
                'company_id': self.partner.id,
                'column_key': 'sign.logo',
                'mode': 'commit',
                'draft_path': draft_storage_path,
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(default_storage.exists(draft_storage_path))
        details.refresh_from_db()
        self.assertIn('new-logo', details.logo_sign_file.name)
        self.assertNotIn('sheet_file_', details.logo_sign_file.name)
        self.assertEqual(details.logo_sign_file.read(), b'new-png-bytes')
        override = SheetCellFormOverride.objects.get(company=self.partner, column_key='sign.logo')
        self.assertIsInstance(override.previous_value, dict)
        self.assertIn('old-logo', override.previous_value['name'])
        self.assertTrue(response.data['applied'][0]['form_override'])
        backup_storage_path = override.previous_value['path']
        self.assertTrue(default_storage.exists(backup_storage_path))

        restore = self.as_user(self.fr).post(
            '/api/sheets/lg/fryz/cells/restore/',
            {'cells': [{'company_id': self.partner.id, 'column_key': 'sign.logo'}]},
            format='json',
        )
        self.assertEqual(restore.status_code, 200, restore.data)
        self.assertFalse(default_storage.exists(backup_storage_path))
        details.refresh_from_db()
        self.assertEqual(details.logo_sign_file.read(), b'old-png-bytes')
        self.assertIn('old-logo', details.logo_sign_file.name)
        self.assertNotIn('sheet_file_', details.logo_sign_file.name)
        self.assertFalse(
            SheetCellFormOverride.objects.filter(company=self.partner, column_key='sign.logo').exists()
        )

        catalogue_meta = {
            c['key']: c
            for c in self.as_user(self.fr).get('/api/sheets/fr/katalog/').data['columns']
        }
        self.assertTrue(catalogue_meta['catalogue.logo']['can_commit'])

        money_meta = {
            c['key']: c
            for c in self.as_user(self.fr).get('/api/sheets/fr/rozliczenia/').data['columns']
        }
        self.assertNotIn('can_commit', money_meta['money.pdf'])
        denied = self.as_user(self.fr).post(
            '/api/sheets/fr/rozliczenia/cells/file/',
            {
                'company_id': self.partner.id,
                'column_key': 'money.pdf',
                'file': SimpleUploadedFile('x.pdf', b'%PDF', content_type='application/pdf'),
            },
            format='multipart',
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
