from django.db import models
from django.contrib.auth.models import AbstractUser

# Create your models here.
class User(AbstractUser):
    USER_TYPES = [
        ('admin', 'ADMIN'),
        ('staff', 'STAFF'),
        ('company', 'COMPANY'),
    ]
    type = models.CharField(
        max_length=10,
        choices=USER_TYPES,
        default="company"
    )
    created_at = models.DateTimeField(auto_now_add = True)
    updated_at = models.DateTimeField(auto_now = True)