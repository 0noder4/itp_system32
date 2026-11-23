from django.contrib import admin

from .models import (
    Company,
    CompanyInvitation,
    Form,
    Feedback,
    EquipmentItem,
    EquipmentSelection,
    Settings,
    FAQItem,
    InvitationExpiryReminderSent,
    WebsitePublication,
    compute_invitation_expires_at,
)


admin.site.site_header = 'Panel administracyjny ITP'
admin.site.site_title = 'ITP Admin'
admin.site.index_title = 'Zarządzanie systemem'


class CompanyAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'email', 'status', 'representative', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'email']
    change_list_template = 'admin/companies/company/change_list.html'


@admin.register(CompanyInvitation)
class CompanyInvitationAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'email', 'expires_at', 'is_accepted', 'is_cancelled', 'is_resigned', 'created_by')
    list_filter = ('is_accepted', 'is_cancelled', 'is_resigned', 'language')
    search_fields = ('company_name', 'email')

    def save_model(self, request, obj, form, change):
        if not change:
            obj.expires_at = compute_invitation_expires_at()
            if not obj.created_by:
                obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(WebsitePublication)
class WebsitePublicationAdmin(admin.ModelAdmin):
    list_display = (
        'company',
        'strapi_document_id',
        'content_published',
        'last_exported_at',
        'strapi_logo_id',
    )
    search_fields = ('company__name', 'strapi_document_id')
    readonly_fields = ('payload_hash', 'last_exported_at', 'last_error')


@admin.register(InvitationExpiryReminderSent)
class InvitationExpiryReminderSentAdmin(admin.ModelAdmin):
    list_display = (
        'company_name',
        'email_address',
        'sent_at',
        'days_before',
        'recipient',
        'sent_by',
    )
    list_filter = ('recipient', 'days_before', 'invitation__language', 'sent_at')
    search_fields = (
        'invitation__company_name',
        'invitation__email',
        'invitation__created_by__username',
        'invitation__created_by__email',
    )
    ordering = ('-sent_at',)
    list_select_related = ('invitation', 'invitation__created_by')

    @admin.display(description='Nazwa firmy', ordering='invitation__company_name')
    def company_name(self, obj):
        return obj.invitation.company_name

    @admin.display(description='Adres e-mail')
    def email_address(self, obj):
        if obj.recipient == InvitationExpiryReminderSent.RECIPIENT_STAFF:
            staff = obj.invitation.created_by
            return staff.email if staff and staff.email else '—'
        return obj.invitation.email

    @admin.display(description='Utworzone przez', ordering='invitation__created_by')
    def sent_by(self, obj):
        return obj.invitation.created_by or '—'


admin.site.register(Company, CompanyAdmin)


@admin.register(Form)
class FormAdmin(admin.ModelAdmin):
    list_display = (
        'company',
        'current_stage',
        'stage_1_completed',
        'stage_2_completed',
        'stage_3_completed',
        'stage_4_completed',
        'stage_5_completed',
        'updated_at',
    )
    list_filter = ('current_stage',)
    search_fields = ('company__name',)


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ('company', 'form', 'status', 'comment')
    list_filter = ('form', 'status')
    search_fields = ('company__name', 'comment')


@admin.register(EquipmentItem)
class EquipmentItemAdmin(admin.ModelAdmin):
    list_display = ('name_pl', 'name_en', 'code', 'price', 'is_basic', 'included_quantity', 'category', 'is_active', 'created_at')
    list_filter = ('is_basic', 'category', 'is_active', 'created_at')
    search_fields = ('name_pl', 'name_en', 'code')
    ordering = ('category', 'name_pl')
    fieldsets = (
        ('Nazwa pozycji', {
            'fields': ('name_pl', 'name_en')
        }),
        ('Cennik i konfiguracja', {
            'fields': ('code', 'price', 'is_basic', 'included_quantity', 'category')
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
    )


@admin.register(EquipmentSelection)
class EquipmentSelectionAdmin(admin.ModelAdmin):
    list_display = ('stand_details', 'equipment_item', 'quantity', 'mount_type')
    list_filter = ('equipment_item__is_basic', 'equipment_item__category', 'mount_type')
    search_fields = ('stand_details__company__name', 'equipment_item__name_en', 'equipment_item__name_pl')


@admin.register(Settings)
class SettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Cennik stoisk — Wystawca (netto)', {
            'fields': (
                ('stand_price_4m2_1d', 'stand_price_4m2_2d'),
                ('stand_price_6m2_1d', 'stand_price_6m2_2d'),
                ('stand_price_8m2_1d', 'stand_price_8m2_2d'),
                ('stand_price_12m2_1d', 'stand_price_12m2_2d'),
            ),
            'description': 'Kwoty w PLN netto (bez VAT).'
        }),
        ('Cennik pakietów partnerskich (netto)', {
            'fields': ('partner_package_price', 'main_partner_package_price'),
            'description': 'Pakiety dwudniowe ze stoiskiem 8 m² (kwoty w PLN netto).'
        }),
        ('JobWall — limity i pakiety (netto)', {
            'fields': (
                ('jobwall_free_basic_early', 'jobwall_early_deadline', 'jobwall_free_basic_late'),
                ('jobwall_free_partner', 'jobwall_free_main'),
                ('jobwall_pack_2_price', 'jobwall_pack_3_price', 'jobwall_max_extra_offers'),
            ),
            'description': 'Darmowe ogłoszenia w pakiecie oraz ceny netto pakietów dodatkowych.'
        }),
        ('Obiady — limity i cena (netto)', {
            'fields': (
                ('lunches_free_basic', 'lunches_free_partner', 'lunches_free_main'),
                'lunch_price',
            ),
            'description': 'Darmowe obiady dziennie wg pakietu oraz cena netto dodatkowego obiadu.'
        }),
        ('Edycja i daty targów', {
            'fields': ('edition_number', 'day1_date', 'day2_date'),
            'description': 'Numer edycji oraz daty dni targowych.'
        }),
        ('Terminy etapów formularza', {
            'fields': ('stage_1_deadline', 'stage_2_deadline', 'stage_3_deadline', 'stage_4_deadline', 'stage_5_deadline'),
            'description': 'Informacyjne terminy widoczne dla wystawców w panelu (nie blokują formularza).'
        }),
        ('Terminy wysyłki maili (Arkusze)', {
            'fields': (
                'mail_1_send_by',
                'mail_2_send_by',
                'mail_3_send_by',
                'mail_4_send_by',
                'mail_5_send_by',
            ),
            'description': 'Daty orientacyjne wyświetlane w nagłówkach grup MAIL #1–#5 w arkuszach.'
        }),
        ('Zaproszenia i przypomnienia', {
            'fields': (
                'invitation_validity_days',
                'invitation_reminder_count',
                'invitation_reminder_1_days',
                'invitation_reminder_2_days',
                'invitation_reminder_3_days',
            ),
            'description': 'Ważność nowych linków zaproszeń oraz automatyczne przypomnienia e-mail przed wygaśnięciem.'
        }),
        ('Adresy e-mail kontaktowe', {
            'fields': (
                'general_contact_email',
                'system_admin_email',
            ),
            'description': 'Adresy wyświetlane w stopkach wiadomości systemowych oraz używane do alertów.'
        }),
        ('Dokumenty i pliki', {
            'fields': ('terms_pdf', 'carpet_catalog_image'),
            'description': 'Pliki udostępniane wystawcom w formularzu zgłoszeniowym.'
        }),
    )

    def has_add_permission(self, request):
        return not Settings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FAQItem)
class FAQItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'category', 'question_pl', 'order', 'is_active', 'updated_at')
    list_filter = ('category', 'is_active')
    list_editable = ('order', 'is_active')
    search_fields = ('question_pl', 'answer_pl', 'question_en', 'answer_en')
    ordering = ('category', 'order', 'id')
