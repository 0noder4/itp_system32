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
    # { tabKey: [column_key, ...] } — column order after the pinned first column
    column_order_by_tab = models.JSONField(default=dict, blank=True)
    # { tabKey: { column_key: group_name } } — category overrides for columns
    column_groups_by_tab = models.JSONField(default=dict, blank=True)
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


class SheetCellDraft(models.Model):
    """
    Staff draft for a form (SOURCE_SYSTEM) cell. Does not change the company form until commit.
    Shared across sheets/tabs for the same (company, column_key).
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='sheet_cell_drafts')
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
            models.UniqueConstraint(
                fields=['company', 'column_key'],
                name='uniq_sheet_cell_draft_company_column',
            ),
        ]
        verbose_name = 'wersja robocza komórki arkusza'
        verbose_name_plural = 'wersje robocze komórek arkuszy'

    def __str__(self):
        return f'draft:{self.company_id}:{self.column_key}'


class SheetCellFormOverride(models.Model):
    """
    Marks a form field overwritten from sheets. previous_value is the value before the first
    commit; later commits keep that original so restore can bring it back.
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='sheet_form_overrides')
    column_key = models.CharField(max_length=100)
    previous_value = models.JSONField(null=True, blank=True)
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
            models.UniqueConstraint(
                fields=['company', 'column_key'],
                name='uniq_sheet_form_override_company_column',
            ),
        ]
        verbose_name = 'nadpisanie pola formularza z arkusza'
        verbose_name_plural = 'nadpisania pól formularza z arkuszy'

    def __str__(self):
        return f'override:{self.company_id}:{self.column_key}'


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
    note = models.TextField(blank=True, default='')
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


class StaffMealGuest(models.Model):
    """Manual Beściak row without a system User account on the Obiady Beściaków tab."""

    full_name = models.CharField(max_length=150)
    day1 = models.BooleanField(default=False)
    day2 = models.BooleanField(default=False)
    note = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_staff_meal_guests',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['full_name', 'id']
        verbose_name = 'obiad Beściaka (ręczny)'
        verbose_name_plural = 'obiady Beściaków (ręczne)'

    def __str__(self):
        return f'{self.full_name} d1={self.day1} d2={self.day2}'

    def delete(self, *args, **kwargs):
        from django.db import transaction

        with transaction.atomic():
            SheetCellComment.objects.filter(staff_guest_id=self.pk).delete()
            StaffMealChange.objects.filter(staff_guest_id=self.pk).delete()
            return super().delete(*args, **kwargs)


class StaffMealChange(models.Model):
    """Audit log for StaffMeal and StaffMealGuest edits. Kept off SheetCellChange so company uniqueness stays intact."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='staff_meal_changes',
    )
    staff_guest = models.ForeignKey(
        StaffMealGuest,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='meal_changes',
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
        indexes = [
            models.Index(fields=['user', 'column_key', '-changed_at'], name='staffmealchange_user_col'),
            models.Index(fields=['staff_guest', 'column_key', '-changed_at'], name='staffmealchange_guest_col'),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(user__isnull=False, staff_guest__isnull=True)
                    | models.Q(user__isnull=True, staff_guest__isnull=False)
                ),
                name='staffmealchange_user_xor_guest',
            ),
        ]
        ordering = ['-changed_at']
        verbose_name = 'zmiana obiadu Beściaka'
        verbose_name_plural = 'historia obiadów Beściaków'

    def __str__(self):
        target = f'u:{self.user_id}' if self.user_id else f'g:{self.staff_guest_id}'
        return f'{target}:{self.column_key} {self.old_value!r} -> {self.new_value!r}'


class SheetCellComment(models.Model):
    """
    Comment on one sheet cell: either a company row, a staff (Beściak) user row, or a manual guest row.
    Exactly one of company / staff_user / staff_guest is set.
    """

    STATUS_PROGRESS = 'progress'
    STATUS_ACCEPTED = 'accepted'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PROGRESS, 'W toku'),
        (STATUS_ACCEPTED, 'Zaakceptowane'),
        (STATUS_REJECTED, 'Niezaakceptowane'),
    ]
    STATUS_VALUES = frozenset(code for code, _label in STATUS_CHOICES)

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='sheet_comments',
    )
    staff_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='sheet_row_comments',
    )
    staff_guest = models.ForeignKey(
        StaffMealGuest,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='sheet_row_comments',
    )
    column_key = models.CharField(max_length=100)
    sheet_key = models.CharField(max_length=50)
    tab_key = models.CharField(max_length=50)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='authored_sheet_comments',
    )
    body = models.TextField(max_length=2000)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PROGRESS,
        db_index=True,
    )
    # null = ordinary comment; set = proposed new cell value awaiting review / apply
    proposed_value = models.JSONField(null=True, blank=True)
    mentions = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='mentioned_in_sheet_comments',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['company', 'column_key', '-created_at'], name='sheetcomment_co_col'),
            models.Index(fields=['staff_user', 'column_key', '-created_at'], name='sheetcomment_u_col'),
            models.Index(fields=['staff_guest', 'column_key', '-created_at'], name='sheetcomment_g_col'),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(company__isnull=False, staff_user__isnull=True, staff_guest__isnull=True)
                    | models.Q(company__isnull=True, staff_user__isnull=False, staff_guest__isnull=True)
                    | models.Q(company__isnull=True, staff_user__isnull=True, staff_guest__isnull=False)
                ),
                name='sheetcomment_company_xor_staff',
            ),
        ]
        ordering = ['created_at']
        verbose_name = 'komentarz komórki arkusza'
        verbose_name_plural = 'komentarze komórek arkuszy'

    def __str__(self):
        if self.company_id:
            target = f'c:{self.company_id}'
        elif self.staff_user_id:
            target = f'u:{self.staff_user_id}'
        else:
            target = f'g:{self.staff_guest_id}'
        return f'{target}:{self.column_key} by={self.author_id}'


class SheetNotification(models.Model):
    """In-panel notification for a @mention on a sheet comment."""

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sheet_notifications',
    )
    comment = models.ForeignKey(
        SheetCellComment,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['recipient', 'comment'],
                name='uniq_sheet_notification_recipient_comment',
            ),
        ]
        indexes = [
            models.Index(fields=['recipient', '-created_at'], name='sheetnotif_recipient_created'),
        ]
        ordering = ['-created_at']
        verbose_name = 'powiadomienie arkusza'
        verbose_name_plural = 'powiadomienia arkuszy'

    def __str__(self):
        return f'to={self.recipient_id} comment={self.comment_id} read={self.read_at is not None}'


class SheetCustomGroup(models.Model):
    """User-defined column category for a specific sheet tab."""

    sheet_key = models.CharField(max_length=50, db_index=True)
    tab_key = models.CharField(max_length=50, db_index=True)
    name = models.CharField(max_length=120)
    color = models.CharField(max_length=20, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['sheet_key', 'tab_key', 'name'],
                name='uniq_sheet_custom_group_tab_name',
            ),
        ]
        indexes = [
            models.Index(fields=['sheet_key', 'tab_key'], name='sheetcustomgroup_sheet_tab'),
        ]
        ordering = ['id']
        verbose_name = 'własna kategoria kolumn'
        verbose_name_plural = 'własne kategorie kolumn'

    def __str__(self):
        return f'{self.sheet_key}/{self.tab_key}: {self.name}'


class SheetCustomColumn(models.Model):
    """Staff-created (admin / FR / LG) extra column scoped to one sheet tab."""

    KIND_TEXT = 'text'
    KIND_LONGTEXT = 'longtext'
    KIND_FILE = 'file_link'
    KIND_CHOICES = [
        (KIND_TEXT, 'Tekst'),
        (KIND_LONGTEXT, 'Opis (długi tekst)'),
        (KIND_FILE, 'Pliki mediowe'),
    ]

    sheet_key = models.CharField(max_length=50, db_index=True)
    tab_key = models.CharField(max_length=50, db_index=True)
    key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=120)
    group = models.CharField(max_length=120, blank=True, default='')
    help_text = models.TextField(max_length=1000, blank=True, default='')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_TEXT)
    edit_roles = models.JSONField(default=list, blank=True)
    position = models.IntegerField(default=0)
    hidden_for_all = models.BooleanField(default=False, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['position', 'id']
        indexes = [
            models.Index(fields=['sheet_key', 'tab_key'], name='sheetcustomcol_sheet_tab'),
        ]
        verbose_name = 'własna kolumna arkusza'
        verbose_name_plural = 'własne kolumny arkuszy'

    def __str__(self):
        return f'{self.sheet_key}/{self.tab_key}:{self.key} ({self.label})'
