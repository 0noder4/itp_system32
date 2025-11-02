from django.db import models
from django.contrib.auth.models import User

# Create your models here.

class Company(models.Model):
    name = models.CharField(max_length=100, unique=True)
    STATUS_MAIN = 'main'
    STATUS_PARTENER = 'partner'
    STATUS_BASIC = 'basic'
    email = models.EmailField()
    representative = models.ForeignKey(User, on_delete = models.CASCADE, null=True) # czy email nie bedzie w User?

    STATUS_CHOICES = [
        (STATUS_MAIN, 'main'),
        (STATUS_PARTENER, 'partner'),
        (STATUS_BASIC, 'basic'),
    ]

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=STATUS_BASIC,
    )
    created_at = models.DateTimeField(auto_now_add = True)
    updated_at = models.DateTimeField(auto_now = True)
    
     