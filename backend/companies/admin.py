from django.contrib import admin
from .models import (
    Company,
    CompanyInvitation,
    Form,
    Feedback,
)

# Register your models here.
admin.site.register(Company)
admin.site.register(CompanyInvitation)
admin.site.register(Form)
admin.site.register(Feedback)