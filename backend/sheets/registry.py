"""
Sheet registry: code-defined sheets, tabs and columns.

A column is defined once (ColumnDef) and may appear in many tabs/sheets; an editable
"extra" column therefore shows the same stored value everywhere (like IMPORTRANGE in
the old Master Google Sheet, without copying data).

How to add a sheet / tab / column: see docs/arkusze-handoff.md.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import QuerySet

from companies.models import Company

KIND_TEXT = 'text'
KIND_LONGTEXT = 'longtext'
KIND_NUMBER = 'number'
KIND_BOOL = 'bool'
KIND_SELECT = 'select'
KIND_DATE = 'date'
KIND_TIME = 'time'
KIND_FILE = 'file_link'
KIND_USER = 'user_select'
KINDS = frozenset({
    KIND_TEXT, KIND_LONGTEXT, KIND_NUMBER, KIND_BOOL, KIND_SELECT,
    KIND_DATE, KIND_TIME, KIND_FILE, KIND_USER,
})
EDITABLE_KINDS = KINDS - {KIND_FILE}

# system   = read-only value from company form models
# computed = read-only value derived in Python (e.g. package equipment from stand size)
# extra    = editable, stored in SheetCellValue (shared across sheets)
# custom   = editable, stored on an existing model via getter/setter (e.g. Company.opiekun)
SOURCE_SYSTEM = 'system'
SOURCE_COMPUTED = 'computed'
SOURCE_EXTRA = 'extra'
SOURCE_CUSTOM = 'custom'
SOURCES = frozenset({SOURCE_SYSTEM, SOURCE_COMPUTED, SOURCE_EXTRA, SOURCE_CUSTOM})
EDITABLE_SOURCES = frozenset({SOURCE_EXTRA, SOURCE_CUSTOM})

AGGREGATES = frozenset({'sum', 'count_true'})
# Frontend highlight rules (cell background):
# truthy = True/non-empty, positive = number > 0, over_five = number > 5,
# over_included = number > ColumnDef.highlight_above (equipment free threshold).
HIGHLIGHTS = frozenset({'truthy', 'positive', 'over_five', 'over_included'})

Option = tuple[str, str]


@dataclass
class RowContext:
    """Everything a column getter may need for one company row (all relations prefetched)."""

    company: Company
    extras: dict[str, Any]
    resigned: bool = False
    invitation_language: str = ''
    # Filled once per tab (deadlines, prices, how many firms share an arrival slot).
    shared: dict[str, Any] = field(default_factory=dict)

    def related(self, attr: str):
        """Reverse one-to-one access that returns None instead of raising."""
        try:
            return getattr(self.company, attr)
        except ObjectDoesNotExist:
            return None

    def stand(self, day: str):
        for stand in self.company.stand_all.all():
            if stand.day == day:
                return stand
        return None

    def feedback(self, stage: int):
        latest = None
        form_key = f'stage_{stage}'
        for fb in self.company.feedback.all():
            if fb.form == form_key and (latest is None or fb.id > latest.id):
                latest = fb
        return latest


@dataclass(frozen=True)
class ColumnDef:
    key: str
    label: str
    kind: str
    source: str
    getter: Callable[[RowContext], Any] | None = None
    setter: Callable[[Company, Any], None] | None = None
    group: str = ''
    edit_roles: frozenset[str] = frozenset()
    view_roles: frozenset[str] | None = None
    options: tuple[Option, ...] | Callable[[], tuple[Option, ...]] = ()
    source_fields: tuple[str, ...] = ()
    width: int = 140
    aggregate: str | None = None
    highlight: str | None = None
    # When highlight == 'over_included', frontend compares the cell value to this threshold.
    highlight_above: int | None = None
    help: str = ''
    max_length: int = 2000

    def __post_init__(self):
        if self.kind not in KINDS:
            raise ValueError(f'{self.key}: unknown kind {self.kind!r}')
        if self.source not in SOURCES:
            raise ValueError(f'{self.key}: unknown source {self.source!r}')
        if self.aggregate is not None and self.aggregate not in AGGREGATES:
            raise ValueError(f'{self.key}: unknown aggregate {self.aggregate!r}')
        if self.highlight is not None and self.highlight not in HIGHLIGHTS:
            raise ValueError(f'{self.key}: unknown highlight {self.highlight!r}')
        if self.highlight == 'over_included' and self.highlight_above is None:
            raise ValueError(f'{self.key}: over_included highlight needs highlight_above')
        if self.highlight_above is not None and self.highlight != 'over_included':
            raise ValueError(f'{self.key}: highlight_above only valid with over_included')
        if self.source in EDITABLE_SOURCES:
            if not self.edit_roles:
                raise ValueError(f'{self.key}: editable column needs edit_roles')
            if self.kind not in EDITABLE_KINDS:
                raise ValueError(f'{self.key}: kind {self.kind!r} cannot be editable')
        elif self.edit_roles:
            raise ValueError(f'{self.key}: read-only column must not declare edit_roles')
        if self.source in (SOURCE_SYSTEM, SOURCE_COMPUTED, SOURCE_CUSTOM) and self.getter is None:
            raise ValueError(f'{self.key}: {self.source} column needs a getter')
        if self.source == SOURCE_CUSTOM and self.setter is None:
            raise ValueError(f'{self.key}: custom column needs a setter')
        if self.source == SOURCE_EXTRA and (self.getter or self.setter):
            raise ValueError(f'{self.key}: extra column is stored in SheetCellValue, no getter/setter')

    @property
    def is_editable_source(self) -> bool:
        return self.source in EDITABLE_SOURCES

    def resolve_options(self) -> tuple[Option, ...]:
        return self.options() if callable(self.options) else self.options

    def read(self, ctx: RowContext) -> Any:
        if self.source == SOURCE_EXTRA:
            return ctx.extras.get(self.key)
        return self.getter(ctx)

    def visible_to(self, user) -> bool:
        return self.view_roles is None or user.has_staff_role(*self.view_roles)

    def editable_by(self, user) -> bool:
        return self.is_editable_source and user.has_staff_role(*self.edit_roles)


@dataclass(frozen=True)
class TabDef:
    key: str
    title: str
    columns: tuple[ColumnDef, ...]
    row_filter: Callable[[QuerySet], QuerySet] | None = None
    select_related: tuple[str, ...] = ()
    prefetch_related: tuple[str, ...] = ()
    frozen_columns: int = 1
    roles: frozenset[str] | None = None

    def column(self, key: str) -> ColumnDef | None:
        for col in self.columns:
            if col.key == key:
                return col
        return None


@dataclass(frozen=True)
class SheetDef:
    """
    roles        = full access (all rows)
    scoped_roles = only rows where Company.opiekun == user (unless the user also has a full role)
    """

    key: str
    title: str
    roles: frozenset[str]
    tabs: tuple[TabDef, ...]
    scoped_roles: frozenset[str] = frozenset()

    def tab(self, key: str) -> TabDef | None:
        for tab in self.tabs:
            if tab.key == key:
                return tab
        return None

    def accessible_by(self, user) -> bool:
        return user.has_staff_role(*(self.roles | self.scoped_roles))

    def is_scoped_for(self, user) -> bool:
        return not user.has_staff_role(*self.roles)

    def tabs_for(self, user) -> list[TabDef]:
        return [t for t in self.tabs if t.roles is None or user.has_staff_role(*t.roles)]


class Catalog:
    def __init__(self, sheets: Iterable[SheetDef]):
        self.sheets: dict[str, SheetDef] = {}
        self.columns: dict[str, ColumnDef] = {}
        for sheet in sheets:
            if sheet.key in self.sheets:
                raise ValueError(f'duplicate sheet key {sheet.key!r}')
            self.sheets[sheet.key] = sheet
            tab_keys = set()
            for tab in sheet.tabs:
                if tab.key in tab_keys:
                    raise ValueError(f'{sheet.key}: duplicate tab key {tab.key!r}')
                tab_keys.add(tab.key)
                seen = set()
                for col in tab.columns:
                    if col.key in seen:
                        raise ValueError(f'{sheet.key}/{tab.key}: duplicate column {col.key!r}')
                    seen.add(col.key)
                    existing = self.columns.get(col.key)
                    if existing is not None and existing is not col:
                        raise ValueError(f'column key {col.key!r} defined twice with different definitions')
                    self.columns[col.key] = col

    def sheets_for(self, user) -> list[SheetDef]:
        return [s for s in self.sheets.values() if s.accessible_by(user) and s.tabs_for(user)]

    def all_source_fields(self) -> set[str]:
        return {f for col in self.columns.values() for f in col.source_fields}
