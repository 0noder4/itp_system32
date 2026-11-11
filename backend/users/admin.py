from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.utils.translation import gettext_lazy as _
from .models import STAFF_ROLE_CHOICES, User, PasswordResetRequest, StaffInvitation


class StaffRolesFormMixin(forms.ModelForm):
    staff_roles = forms.MultipleChoiceField(
        choices=STAFF_ROLE_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        required=False,
        label="Role staff",
        help_text="Tylko dla kont typu staff. Jedno konto może mieć kilka ról. Admin ma wszystkie.",
    )

    def clean_staff_roles(self):
        return sorted(set(self.cleaned_data.get("staff_roles") or []))


class CustomUserCreationForm(StaffRolesFormMixin, UserCreationForm):
    """Custom form for creating users in admin with proper password hashing."""
    class Meta:
        model = User
        fields = ("username", "email", "staff_roles")


class CustomUserChangeForm(StaffRolesFormMixin, UserChangeForm):
    """Custom form for changing users in admin."""
    class Meta:
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom admin for User model with proper password handling."""
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm
    
    list_display = ("username", "email", "first_name", "last_name", "type", "staff_roles_display", "language", "is_staff", "is_active")
    list_filter = ("type", "language", "is_staff", "is_active", "is_superuser")
    
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        (_("Personal info"), {"fields": ("first_name", "last_name", "email", "phone_number")}),
        (_("Permissions"), {
            "fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions"),
        }),
        (_("Important dates"), {"fields": ("last_login", "date_joined")}),
        (_("Custom fields"), {"fields": ("type", "staff_roles", "language")}),
    )
    
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("username", "email", "password1", "password2", "type", "staff_roles", "language"),
        }),
    )
    
    search_fields = ("username", "email", "first_name", "last_name")
    ordering = ("username",)

    @admin.display(description="Role staff")
    def staff_roles_display(self, obj):
        return ", ".join(sorted(obj.get_staff_roles())) or "-"


@admin.register(PasswordResetRequest)
class PasswordResetRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "token", "created_at", "expires_at", "is_used", "is_valid")
    list_filter = ("is_used", "created_at", "expires_at")
    search_fields = ("user__username", "user__email", "token")
    readonly_fields = ("token", "created_at", "expires_at")
    
    def is_valid(self, obj):
        return obj.is_valid()
    is_valid.boolean = True
    is_valid.short_description = "Is Valid"


@admin.register(StaffInvitation)
class StaffInvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "role", "language", "is_accepted", "is_cancelled", "expires_at", "created_by", "created_at")
    list_filter = ("role", "language", "is_accepted", "is_cancelled")
    search_fields = ("email", "token")
    readonly_fields = ("token", "created_at", "updated_at")