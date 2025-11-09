from django.contrib import admin
from .models import Company, CompanyInvitation

# Register your models here.
admin.site.register(Company)
admin.site.register(CompanyInvitation)