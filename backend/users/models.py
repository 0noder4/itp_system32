from django.db import models
from django.contrib.auth.models import AbstractUser
import uuid
import datetime
import django.utils

# Create your models here.
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
    created_at = models.DateTimeField(auto_now_add = True)
    updated_at = models.DateTimeField(auto_now = True)


def get_password_reset_expiry():
    return django.utils.timezone.now() + datetime.timedelta(hours=24)


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