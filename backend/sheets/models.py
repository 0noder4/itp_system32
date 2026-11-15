from django.conf import settings
from django.db import models

from companies.models import Company


class SheetCellValue(models.Model):
    """
    Stored sheet cell for (company, column_key), shared across sheets/tabs.

    Used for SOURCE_EXTRA columns (LG / TR / opiekun / FR checklist notes).
    Form fields (SOURCE_SYSTEM) stay read-only in sheets.
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='sheet_cells')
    column_key = models.CharField(max_length=100)
    value = models.JSONField(null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['company', 'column_key'], name='uniq_sheet_cell_company_column'),
        ]
        verbose_name = 'komórka arkusza'
        verbose_name_plural = 'komórki arkuszy'

    def __str__(self):
        return f'{self.company_id}:{self.column_key}={self.value!r}'


class SheetCellChange(models.Model):
    """Audit log of every editable cell change made through sheets (incl. undo/redo)."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='sheet_cell_changes')
    column_key = models.CharField(max_length=100)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    batch_id = models.UUIDField(db_index=True)

    class Meta:
        indexes = [models.Index(fields=['company', 'column_key', '-changed_at'])]
        ordering = ['-changed_at']
        verbose_name = 'zmiana komórki arkusza'
        verbose_name_plural = 'historia zmian arkuszy'

    def __str__(self):
        return f'{self.company_id}:{self.column_key} {self.old_value!r} -> {self.new_value!r}'


class SheetLayoutDefault(models.Model):
    """
    Admin-published default column widths for one sheet.
    Personal browser layouts are separate — applying this default is an explicit user action
    (sync in sheet settings). Publishing a new default does not overwrite existing accounts.
    """

    sheet_key = models.CharField(max_length=50, unique=True)
    column_widths = models.JSONField(default=dict, blank=True)
    # { tabKey: [column_key, ...] } — columns hidden by default for that tab
    hidden_by_tab = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'domyślny układ arkusza'
        verbose_name_plural = 'domyślne układy arkuszy'

    def __str__(self):
        return f'layout:{self.sheet_key}'


class SheetCellStyle(models.Model):
    """Optional fill colour for a sheet cell (company × column), shared across tabs."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='sheet_cell_styles')
    column_key = models.CharField(max_length=100)
    bg_color = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text='Pusty = brak koloru. Hex, np. #FEF08A.',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'column_key'],
                name='uniq_sheet_cell_style_company_column',
            ),
        ]
        verbose_name = 'styl komórki arkusza'
        verbose_name_plural = 'style komórek arkuszy'

    def __str__(self):
        return f'{self.company_id}:{self.column_key} bg={self.bg_color!r}'


class StaffMeal(models.Model):
    """Lunch vouchers for Beściaki / opiekunowie. One row per staff user, not per company."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_meal',
    )
    day1 = models.BooleanField(default=False)
    day2 = models.BooleanField(default=False)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'obiad Beściaka'
        verbose_name_plural = 'obiady Beściaków'

    def __str__(self):
        return f'{self.user_id} d1={self.day1} d2={self.day2}'


class StaffMealChange(models.Model):
    """Audit log for StaffMeal edits. Kept off SheetCellChange so company uniqueness stays intact."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_meal_changes',
    )
    column_key = models.CharField(max_length=100)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    batch_id = models.UUIDField(db_index=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'column_key', '-changed_at'], name='staffmealchange_user_col')]
        ordering = ['-changed_at']
        verbose_name = 'zmiana obiadu Beściaka'
        verbose_name_plural = 'historia obiadów Beściaków'

    def __str__(self):
        return f'{self.user_id}:{self.column_key} {self.old_value!r} -> {self.new_value!r}'
