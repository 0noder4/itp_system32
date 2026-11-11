from django.conf import settings
from django.db import models

from companies.models import Company


class SheetCellValue(models.Model):
    """
    Value of an editable "extra" sheet column (data filled by LG / TR / opiekun / FR,
    not by the company form). One value per (company, column_key), shared by every
    sheet/tab that shows the column.
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
