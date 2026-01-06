from django.contrib import admin
from .models import (
    Company,
    CompanyInvitation,
    Form,
    Feedback,
    EquipmentItem,
    EquipmentSelection,
    Settings,
)

# Register your models here.
admin.site.register(Company)
admin.site.register(CompanyInvitation)
admin.site.register(Form)
admin.site.register(Feedback)


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
        ('Jobwall Pricing', {
            'fields': ('jobwall_price',),
            'description': 'Set the price for each jobwall posting. This price will be charged per jobwall entry.'
        }),
        ('Stage Deadlines', {
            'fields': ('stage_1_deadline', 'stage_2_deadline', 'stage_3_deadline', 'stage_4_deadline', 'stage_5_deadline',),
            'description': 'Set global deadlines for each form stage. Deadlines are informational only and do not block form access. Leave blank if no deadline is needed for a stage.'
        }),
    )

    def has_add_permission(self, request):
        # Only allow one settings instance
        return not Settings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        # Prevent deletion of settings
        return False