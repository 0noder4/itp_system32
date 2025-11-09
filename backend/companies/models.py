from django.db import models
from django.conf import settings
import uuid
import datetime
import django.utils

STATUS_MAIN = 'main'
STATUS_PARTENER = 'partner'
STATUS_BASIC = 'basic'


COMPANY_STATUS_CHOICES = [
        (STATUS_MAIN, STATUS_MAIN),
        (STATUS_PARTENER, STATUS_PARTENER),
        (STATUS_BASIC, STATUS_BASIC),
    ]

# Create your models here.


class Company(models.Model):
    name = models.CharField(max_length=100, unique=True)
    email = models.EmailField()
    representative = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete = models.CASCADE, null=True) # czy email nie bedzie w User?

    status = models.CharField(
        max_length=10,
        choices=COMPANY_STATUS_CHOICES,
        default=STATUS_BASIC,
    )
    created_at = models.DateTimeField(auto_now_add = True)
    updated_at = models.DateTimeField(auto_now = True)

    def __str__(self):
        return self.name
    
    
def get_expiry_time():
    return django.utils.timezone.now() + datetime.timedelta(days=7)

class CompanyInvitation(models.Model):
    email = models.EmailField()
    company_name = models.CharField(max_length=255)
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    created_at = models.DateTimeField(auto_now_add = True)
    updated_at = models.DateTimeField(auto_now = True)
    expires_at = models.DateTimeField(blank=True, default=get_expiry_time())
    is_accepted = models.BooleanField(default=False)

    company_status = models.CharField(
        max_length=10,
        choices=COMPANY_STATUS_CHOICES,
        default=STATUS_BASIC,
    )

    def is_expired(self):
        return django.utils.timezone.now() > self.expires_at
    
    def get_invitation_status(self):
        if (self.is_accepted):
            return "accepted"
        elif self.is_expired():
            return "expired"
        else:
            return "not accepted"
    
    def __str__(self):
        return f'Company name: {self.company} is {self.get_invitation_status}'
   #----tutaj leci rozruba: 
    '''blank=True -> pole w formularzu moze byc puste
    null=True -> pole w bazie moze przyjmowac null'''
    #-----stage 1------
    full_name = models.CharField(max_length=255, blank=False, null=True) 
    street = models.CharField(max_length=255, blank=False, null=True)
    home_number = models.CharField(max_length=10, blank=False, null=True)
    apt_number = models.CharField(max_length=10, blank=True, null=True) #optional
    city = models.CharField(max_length=100, blank=False, null=True)
    country = models.CharField(max_length=100, blank=False, null=True)
    postal_code = models.CharField(max_length=20, blank=False, null=True)
    nip = models.CharField(max_length=20, blank= False, null=True)


    



#---stage1 -----
class ContactPerson(models.Model): #one company can have a few people
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='contact_people') # company.contact_people.all() -odwolanie dla obiektu company
    name = models.CharField(max_length=100, blank=False, null=True) 
    surname = models.CharField(max_length=100, blank=False, null=True) 
    phone_number = models.CharField(max_length=20, blank=False, null=True)
    email = models.EmailField(blank=False, null=True)
    
     


    
