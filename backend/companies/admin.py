from django.contrib import admin
from .models import (
    Company,
    CompanyInvitation,
    Form,
    Feedback,
)


class CompanyAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'email', 'status', 'representative', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'email']
    change_list_template = 'admin/companies/company/change_list.html'


# Register your models here.
admin.site.register(Company, CompanyAdmin)
admin.site.register(CompanyInvitation)
admin.site.register(Form)
admin.site.register(Feedback)