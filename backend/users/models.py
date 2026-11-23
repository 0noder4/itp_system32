from django.db import models
from django.contrib.auth.models import AbstractUser
import uuid
import datetime
import django.utils

STAFF_ROLE_FR = 'fr'
STAFF_ROLE_LG = 'lg'
STAFF_ROLE_TR = 'tr'
STAFF_ROLE_OPIEKUN = 'opiekun'
STAFF_ROLE_CHOICES = [
    (STAFF_ROLE_FR, 'FR (Panel FR)'),
    (STAFF_ROLE_LG, 'LG (logistyka)'),
    (STAFF_ROLE_TR, 'TR (warsztaty)'),
    (STAFF_ROLE_OPIEKUN, 'Opiekun firm'),
]
ALL_STAFF_ROLES = frozenset(code for code, _label in STAFF_ROLE_CHOICES)


class User(AbstractUser):
    USER_TYPES = [
        ('admin', 'ADMIN'),
        ('staff', 'STAFF'),
        ('company', 'COMPANY'),
    ]
    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('pl', 'Polish'),
    ]
    type = models.CharField(
        max_length=10,
        choices=USER_TYPES,
        default="company",
        verbose_name="typ konta",
    )
    language = models.CharField(
        max_length=5,
        choices=LANGUAGE_CHOICES,
        default="pl",
        verbose_name="język",
    )
    phone_number = models.CharField(max_length=20, verbose_name="numer telefonu", blank=True)
    staff_roles = models.JSONField(
        default=list,
        blank=True,
        verbose_name="role staff",
        help_text="Dotyczy kont typu staff (administrator posiada wszystkie role).",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="utworzono")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="zmodyfikowano")

    class Meta:
        verbose_name = "użytkownik"
        verbose_name_plural = "użytkownicy"

    def get_staff_roles(self) -> frozenset:
        if self.type == 'admin':
            return ALL_STAFF_ROLES
        if self.type != 'staff':
            return frozenset()
        return frozenset(r for r in (self.staff_roles or []) if r in ALL_STAFF_ROLES)

    def has_staff_role(self, *roles: str) -> bool:
        return bool(self.get_staff_roles() & set(roles))


def get_password_reset_expiry():
    return django.utils.timezone.now() + datetime.timedelta(hours=24)


def get_staff_invitation_expiry():
    """Fallback 7 days; create view overwrites from Settings.invitation_validity_days."""
    return django.utils.timezone.now() + datetime.timedelta(days=7)


class PasswordResetRequest(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="użytkownik")
    token = models.UUIDField(default=uuid.uuid4, unique=True, verbose_name="token")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="utworzono")
    expires_at = models.DateTimeField(default=get_password_reset_expiry, verbose_name="wygasa")
    is_used = models.BooleanField(default=False, verbose_name="użyto")

    class Meta:
        verbose_name = "żądanie resetu hasła"
        verbose_name_plural = "żądania resetu hasła"

    def is_expired(self):
        return django.utils.timezone.now() > self.expires_at

    def is_valid(self):
        return not self.is_used and not self.is_expired()

    def __str__(self):
        return f"Password reset for {self.user.email}"


class StaffInvitation(models.Model):
    """Invite a new staff account (opiekun, FR, LG, or TR) by email — mirrors company invite flow."""

    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('pl', 'Polish'),
    ]
    ROLE_CHOICES = [
        (STAFF_ROLE_OPIEKUN, 'Opiekun firm'),
        (STAFF_ROLE_FR, 'FR (Panel FR)'),
        (STAFF_ROLE_LG, 'LG (logistyka)'),
        (STAFF_ROLE_TR, 'TR (warsztaty)'),
    ]

    email = models.EmailField(verbose_name="e-mail")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=STAFF_ROLE_OPIEKUN, verbose_name="rola")
    language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default='pl', verbose_name="język")
    token = models.UUIDField(default=uuid.uuid4, unique=True, verbose_name="token")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="utworzono")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="zmodyfikowano")
    expires_at = models.DateTimeField(blank=True, default=get_staff_invitation_expiry, verbose_name="wygasa")
    is_accepted = models.BooleanField(default=False, verbose_name="zaakceptowane")
    is_cancelled = models.BooleanField(default=False, verbose_name="anulowane")
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_staff_invitations',
        verbose_name="utworzone przez",
    )

    class Meta:
        verbose_name = "zaproszenie staff"
        verbose_name_plural = "zaproszenia staff"

    def is_expired(self):
        return django.utils.timezone.now() > self.expires_at

    def __str__(self):
        status = 'accepted' if self.is_accepted else ('cancelled' if self.is_cancelled else 'pending')
        return f'Staff invite {self.email} ({self.role}) — {status}'