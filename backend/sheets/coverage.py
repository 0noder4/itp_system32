"""
Field coverage for company form models (checked by sheets.tests.FieldCoverageTests).

Every concrete field of FORM_MODELS must be either mapped in some column's
`source_fields`, excluded below with a reason, or listed in NOT_YET_MAPPED.
When a new form field appears, the test fails until someone decides where it goes.
"""
from companies.models import (
    PDI,
    Address,
    BasicData,
    Description,
    Exhibitor,
    FinalData,
    Jobwall,
    Lunch,
    PDIAttendee,
    StandDetails,
    EquipmentSelection,
    Workshop,
    WorkshopFacilitator,
)

FORM_MODELS = (
    BasicData, Address, StandDetails, EquipmentSelection, Workshop, WorkshopFacilitator,
    Description, Jobwall, FinalData, Lunch, PDI, PDIAttendee, Exhibitor,
)

# Primary keys and relations to the parent row / Deadline are technical, skipped on every model.
PARENT_RELATIONS = {'company', 'form', 'stand_details', 'dl'}

EXCLUDED_FIELDS: dict[str, str] = {
    'WorkshopFacilitator.workshop': 'powiązanie z warsztatem (techniczne)',
}

# Fields still waiting for a column. Empty once every form field has a home.
NOT_YET_MAPPED: set[str] = set()


def form_field_names() -> set[str]:
    names = set()
    for model in FORM_MODELS:
        for field in model._meta.get_fields():
            if not getattr(field, 'concrete', False) or getattr(field, 'primary_key', False):
                continue
            if field.is_relation and field.name in PARENT_RELATIONS:
                continue
            names.add(f'{model.__name__}.{field.name}')
    return names
