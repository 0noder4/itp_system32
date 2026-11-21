from django.contrib import admin

from .models import (
    SheetCellChange,
    SheetCellComment,
    SheetCellStyle,
    SheetCellValue,
    SheetCustomColumn,
    SheetCustomGroup,
    SheetLayoutDefault,
    SheetNotification,
    StaffMeal,
    StaffMealChange,
)


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


@admin.register(StaffMeal)
class StaffMealAdmin(admin.ModelAdmin):
    list_display = ('user', 'day1', 'day2', 'updated_by', 'updated_at')
    list_filter = ('day1', 'day2')
    raw_id_fields = ('user', 'updated_by')


@admin.register(StaffMealChange)
class StaffMealChangeAdmin(admin.ModelAdmin):
    list_display = ('user', 'column_key', 'old_value', 'new_value', 'changed_by', 'changed_at')
    list_filter = ('column_key',)
    raw_id_fields = ('user', 'changed_by')


@admin.register(SheetCellStyle)
class SheetCellStyleAdmin(admin.ModelAdmin):
    list_display = ('company', 'column_key', 'bg_color', 'updated_by', 'updated_at')
    list_filter = ('column_key', 'bg_color')
    search_fields = ('company__name', 'column_key')
    raw_id_fields = ('company', 'updated_by')


@admin.register(SheetCellComment)
class SheetCellCommentAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'company', 'staff_user', 'column_key', 'sheet_key', 'tab_key',
        'author', 'status', 'created_at',
    )
    list_filter = ('status', 'sheet_key', 'column_key')
    search_fields = ('body', 'company__name', 'column_key')
    raw_id_fields = ('company', 'staff_user', 'author')
    filter_horizontal = ('mentions',)


@admin.register(SheetNotification)
class SheetNotificationAdmin(admin.ModelAdmin):
    list_display = ('id', 'recipient', 'comment', 'created_at', 'read_at')
    list_filter = ('read_at',)
    raw_id_fields = ('recipient', 'comment')


@admin.register(SheetCustomGroup)
class SheetCustomGroupAdmin(admin.ModelAdmin):
    list_display = ('sheet_key', 'tab_key', 'name', 'color', 'created_by', 'created_at')
    list_filter = ('sheet_key', 'tab_key')
    search_fields = ('name', 'sheet_key', 'tab_key')
    raw_id_fields = ('created_by',)


@admin.register(SheetCustomColumn)
class SheetCustomColumnAdmin(admin.ModelAdmin):
    list_display = ('sheet_key', 'tab_key', 'key', 'label', 'group', 'kind', 'hidden_for_all', 'position')
    list_filter = ('sheet_key', 'tab_key', 'kind', 'hidden_for_all')
    search_fields = ('key', 'label', 'group')
    raw_id_fields = ('created_by', 'updated_by')
