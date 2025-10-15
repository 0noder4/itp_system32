from django.db import models

# Create your models here.

class Company(models.Model):
    name = models.CharField(max_length=100)
    STATUS_MAIN = 'main'
    STATUS_PARTENER = 'partner'
    STATUS_BASIC = 'basic'

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
     