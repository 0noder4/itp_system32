from django.contrib import admin

from .models import (
    Company,
    CompanyInvitation,
    Form,
    Feedback,
    EquipmentItem,
    EquipmentSelection,
    Settings,
    InvitationExpiryReminderSent,
    compute_invitation_expires_at,
)


class CompanyAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'email', 'status', 'representative', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'email']
    change_list_template = 'admin/companies/company/change_list.html'


@admin.register(CompanyInvitation)
class CompanyInvitationAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'email', 'expires_at', 'is_accepted', 'is_cancelled', 'created_by')
    list_filter = ('is_accepted', 'is_cancelled', 'language')
    search_fields = ('company_name', 'email')

    def save_model(self, request, obj, form, change):
        if not change:
            obj.expires_at = compute_invitation_expires_at()
            if not obj.created_by:
                obj.created_by = request.user
        super().save_model(request, obj, form, change)


admin.site.register(Company, CompanyAdmin)
admin.site.register(Form)
admin.site.register(Feedback)
admin.site.register(InvitationExpiryReminderSent)


@admin.register(EquipmentItem)
class EquipmentItemAdmin(admin.ModelAdmin):
    list_display = ('name_en', 'name_pl', 'price', 'is_basic', 'included_quantity', 'category', 'is_active', 'created_at')
    list_filter = ('is_basic', 'category', 'is_active', 'created_at')
    search_fields = ('name_en', 'name_pl')
    ordering = ('category', 'name_en')
    fieldsets = (
        ('English Information', {
            'fields': ('name_en',)
        }),
        ('Polish Information', {
            'fields': ('name_pl',)
        }),
        ('Pricing & Configuration', {
            'fields': ('price', 'is_basic', 'included_quantity', 'category')
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
    )


@admin.register(EquipmentSelection)
class EquipmentSelectionAdmin(admin.ModelAdmin):
    list_display = ('stand_details', 'equipment_item', 'quantity')
    list_filter = ('equipment_item__is_basic', 'equipment_item__category')
    search_fields = ('stand_details__company__name', 'equipment_item__name_en', 'equipment_item__name_pl')


@admin.register(Settings)
class SettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Pricing', {
            'fields': ('jobwall_price', 'lunch_price',),
            'description': 'Set prices for jobwall postings and additional lunches. Jobwall price is charged per posting. Lunch price is charged for each lunch beyond the 2 free lunches per day included in the package (4 free lunches total for 2 days).'
        }),
        ('Stage Deadlines', {
            'fields': ('stage_1_deadline', 'stage_2_deadline', 'stage_3_deadline', 'stage_4_deadline', 'stage_5_deadline',),
            'description': 'Set global deadlines for each form stage. Deadlines are informational only and do not block form access. Leave blank if no deadline is needed for a stage.'
        }),
        ('Job Fair Dates', {
            'fields': ('day1_date', 'day2_date',),
            'description': 'Set the dates for the job fair days. These dates will be used in emails, PDFs, and throughout the system. Format: YYYY-MM-DD (e.g., 2025-03-10)'
        }),
        ('Invitation settings', {
            'fields': (
                'invitation_validity_days',
                'invitation_reminder_count',
                'invitation_reminder_1_days',
                'invitation_reminder_2_days',
                'invitation_reminder_3_days',
                'invitation_reminder_4_days',
                'invitation_reminder_5_days',
            ),
            'description': (
                'Validity applies to newly created invitations only. '
                'Reminder count 0 disables expiry reminder emails. '
                'Reminder slots are days before expiry and must be less than validity days.'
            ),
        }),
        ('Email contact', {
            'fields': (
                'general_contact_email',
                'system_admin_email',
            ),
            'description': (
                'General contact appears in emails to companies/exhibitors. '
                'System admin appears in emails to FR/staff (stage pending, invitation expiry reminders). '
                'Set real production addresses in admin after deploy.'
            ),
        }),
    )

    def has_add_permission(self, request):
        return not Settings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
