from django.contrib import admin

from .models import SheetCellChange, SheetCellStyle, SheetCellValue, SheetLayoutDefault


@admin.register(SheetCellValue)
class SheetCellValueAdmin(admin.ModelAdmin):
    list_display = ('company', 'column_key', 'value', 'updated_by', 'updated_at')
    list_filter = ('column_key',)
    search_fields = ('company__name', 'column_key')
    raw_id_fields = ('company', 'updated_by')


@admin.register(SheetCellChange)
class SheetCellChangeAdmin(admin.ModelAdmin):
    list_display = ('company', 'column_key', 'old_value', 'new_value', 'changed_by', 'changed_at')
    list_filter = ('column_key',)
    search_fields = ('company__name', 'column_key')
    readonly_fields = [f.name for f in SheetCellChange._meta.fields]


@admin.register(SheetLayoutDefault)
class SheetLayoutDefaultAdmin(admin.ModelAdmin):
    list_display = ('sheet_key', 'updated_by', 'updated_at')
    search_fields = ('sheet_key',)


@admin.register(SheetCellStyle)
class SheetCellStyleAdmin(admin.ModelAdmin):
    list_display = ('company', 'column_key', 'bg_color', 'updated_by', 'updated_at')
    list_filter = ('column_key', 'bg_color')
    search_fields = ('company__name', 'column_key')
    raw_id_fields = ('company', 'updated_by')
