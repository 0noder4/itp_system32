from django.contrib import admin
from .models import User, PasswordResetRequest

# Register your models here.
admin.site.register(User)
admin.site.register(PasswordResetRequest)