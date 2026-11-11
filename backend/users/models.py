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
        default="company"
    )
    language = models.CharField(
        max_length=5,
        choices=LANGUAGE_CHOICES,
        default="pl"
    )
    phone_number = models.CharField(max_length=20, verbose_name="Phone number", blank=True)
    staff_roles = models.JSONField(
        default=list,
        blank=True,
        verbose_name="role staff",
        help_text="Tylko dla kont typu staff. Admin ma wszystkie role automatycznie.",
    )
    created_at = models.DateTimeField(auto_now_add = True)
    updated_at = models.DateTimeField(auto_now = True)

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
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=get_password_reset_expiry)
    is_used = models.BooleanField(default=False)

    def is_expired(self):
        return django.utils.timezone.now() > self.expires_at

    def is_valid(self):
        return not self.is_used and not self.is_expired()

    def __str__(self):
        return f"Password reset for {self.user.email}"


class StaffInvitation(models.Model):
    """Invite a new staff account (currently: opiekun) by email — mirrors company invite flow."""

    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('pl', 'Polish'),
    ]
    ROLE_CHOICES = [
        (STAFF_ROLE_OPIEKUN, 'Opiekun firm'),
    ]

    email = models.EmailField()
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=STAFF_ROLE_OPIEKUN)
    language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default='pl')
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(blank=True, default=get_staff_invitation_expiry)
    is_accepted = models.BooleanField(default=False)
    is_cancelled = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_staff_invitations',
    )

    def is_expired(self):
        return django.utils.timezone.now() > self.expires_at

    def __str__(self):
        status = 'accepted' if self.is_accepted else ('cancelled' if self.is_cancelled else 'pending')
        return f'Staff invite {self.email} ({self.role}) — {status}'