from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import (
    Company,
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
from .models import SheetCellChange, SheetCellStyle, SheetCellValue
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
        url = '/api/sheets/opiekun/firmy/cells/'
        saved = self.patch(self.opiekun, [
            {'company_id': self.partner.id, 'column_key': 'care.car_registration', 'value': 'WX 123', 'base': None},
        ], url=url)
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(SheetCellValue.objects.get(column_key='care.car_registration').value, 'WX 123')
        denied = self.patch(self.opiekun, [
            {'company_id': self.partner.id, 'column_key': 'lg.extra_orders', 'value': 'krzesła', 'base': None},
        ], url=url)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_opiekun_does_not_see_other_companies(self):
        self.partner.opiekun = self.opiekun
        self.partner.save()
        rows = self.as_user(self.opiekun).get('/api/sheets/opiekun/firmy/').data['rows']
        self.assertEqual([row['company_id'] for row in rows], [self.partner.id])

    def test_fr_mine_flag_and_slot_load(self):
        self.partner.fr_resp = self.fr
        self.partner.save()
        SheetCellValue.objects.create(company=self.partner, column_key='care.slot', value='rano')
        SheetCellValue.objects.create(company=self.basic, column_key='care.slot', value='rano')
        data = self.as_user(self.fr).get('/api/sheets/opiekun/firmy/').data
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

    def test_pdi_emails_hidden_from_opiekun_role(self):
        self.assertFalse(PDI_EMAILS.visible_to(self.opiekun))
        self.assertTrue(PDI_EMAILS.visible_to(self.fr))

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
