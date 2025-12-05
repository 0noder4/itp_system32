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

DAY_OPT =[
    ('day1', '10.03.2025'),
    ('day2', '11.03.2025')
]

SIZE_OPT = [
    ('podstawowy', '4m2'),
    ('standardowy', '6m2'),
    ('rozszerzony', '8m2')
]



class Company(models.Model):
    name = models.CharField(max_length=100, unique=True)
    email = models.EmailField()
    representative = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete = models.CASCADE, null=True) 
    fr_resp = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL) 

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


    '''blank=True -> pole w formularzu moze byc puste
    null=True -> pole w bazie moze przyjmowac null'''

class Stand(models.Model): 
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='stand_all')
    day= models.CharField(max_length=15, choices=DAY_OPT)
    stand_number =  models.CharField(max_length=10, null=True, default = 'brak')
    stand_size = models.CharField(max_length=10, choices =SIZE_OPT)

#FORMULARZE:
class BasicData(models.Model):
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='basic_data')
    full_name = models.CharField(max_length=255, verbose_name="pełna nazwa firmy") 
    nip = models.CharField(max_length=20, verbose_name="nip firmy")

class Adress(models.Model):
    form = models.OneToOneField(BasicData, on_delete=models, related_name='adress')
    street = models.CharField(max_length=255, verbose_name="ulica")
    home_number = models.CharField(max_length=10, verbose_name="numer domu")
    apt_number = models.CharField(max_length=10, verbose_name="numer lokalu", blank = True) #optional
    city = models.CharField(max_length=100, verbose_name="miasto")
    country = models.CharField(max_length=100, verbose_name="kraj")
    postal_code = models.CharField(max_length=20, verbose_name="kod pocztowy")
    
class Person (models.Model):
    name = models.CharField(max_length=100, verbose_name="Imię") 
    surname = models.CharField(max_length=100, verbose_name="Nazwisko") 
    phone_number = models.CharField(max_length=20, verbose_name="Numer telefonu")
    
class ContactPerson(Person): 
    form = models.ForeignKey(BasicData, on_delete =models.CASCADE, related_name='contact_person')
    email = models.EmailField(verbose_name="Adres email")
    
class StandDetails(models.Model):
    self_construction = models.BooleanField(verbose_name="własna zabudowa", default = False) 
    sc_details = models.CharField(max_length = 255, verbose_name= "z czego się składa własna zabudowa", blank = True)
    name_sign_text = models.CharField(max_length=255, verbose_name = "napis na fryz", blank = True) # trzeba zrobic walidację z basic equipment
    logo_sign_file = models.FileField(upload_to ='logos', verbose_name = "Logotyp na fryz", blank = True) # jak wyzej
  
class BasicEquipment(models.Model):
    form = models.OneToOneField(StandDetails,on_delete =models.CASCADE, related_name='basic_equipment' )
    chair = models.IntegerField(verbose_name=" ilość krzeseł", default =2)
    counter = models.BooleanField(verbose_name="lada zwykła", default= True) 
    trashbin = models.BooleanField(verbose_name="śmietnik", default = True) 
    hanger = models.BooleanField(verbose_name="wieszak", default = True) 
    name_sign = models.BooleanField(verbose_name="fryz podłużny z nazwą", default=True) 
    logo_sign = models.BooleanField(verbose_name="fryz poprzeczny z logotypem", default = True) 

class ExtendedEqupment(models.Model):
    form = models.OneToOneField(StandDetails, on_delete =models.CASCADE, related_name='ext_equipment' )
    counter = models.IntegerField(verbose_name="lada zwykła")
    arched_counter = models.IntegerField(verbose_name="lada łukowa")
    tv = models.IntegerField(verbose_name="telewizor")
    chair = models.IntegerField(verbose_name="krzesło")
    bar_table = models.IntegerField(verbose_name="stół barowy")
    bar_stool = models.IntegerField(verbose_name="krzesło barowe")
    leaflet_stand = models.IntegerField(verbose_name="stojak na ulotki")
    carpet_color = models.CharField(max_length=20, verbose_name="kolor wykładziny")





















#tutaj niewazne: 


    #---stage 3 form----
#if wlasna zabudowa:
'''    
    fire_cert = models.FileField(uploadto, verbose_name = "certyfikat o niepalności", blank = False, null=True)
    gg_parking = models.BooleanField(verbose_name="czy potrzebny wjazd na gg?", default = False) 
    
  

#else: 
    el_devices = models.CharField(max_length=255, verbose_name="przyniesiona elektronika", blank = False, null=True)
    el_power = models.CharField(max_length=30, verbose_name="moc elektroniki w watach", blank= False, null=True )
    PDI_CHOICES = {"ZERO":'0 os', "ONE": '1 os', "TWO": '2 os', "THREE": '3 os', "FOUR":'4 os', "FIVE":'5 os'}
    pdi_tickets =models.CharField(max_length=4, verbose_name="liczba osób na gali PDI", help_text="2 bielty w cenie ...",choices = PDI_CHOICES, default = "TWO")
    LUNCH_CHOICES = {"ZERO":'0 os', "ONE": '1 os', "TWO": '2 os', "THREE": '3 os', "FOUR":'4 os', "FIVE":'5 os'}
    day1lunch = models.CharField(max_length=4, verbose_name="liczba potrzebnych obiadów [data]", help_text="2 obiadt w cenie ...",choices = LUNCH_CHOICES, default = "TWO")
    day2lunch = models.CharField(max_length=4, verbose_name="liczba potrzebnych obiadów [data]", help_text="2 obiadt w cenie ...",choices = LUNCH_CHOICES, default = "TWO")
    diet_info = models.CharField(max_length=255, verbose_name="informacje o dietach (ile, jakie)", blank= False, null=True)

    #czy to nie lepiej już z opiekunem ustalić?
    #arrive_hour_d1 = models.CharField(max_length=20, verbose_name="godzina przyjazdu [data]", blank= False, null=True)
    #arrive_hour_d2 = models.CharField(max_length=20, verbose_name="godzina przyjazdu [data]", blank= False, null=True)

    #co z tym :OFERTY PRACY, DANE DO KATALOGU  ??

    
#---stage1 -----
class ContactPerson(models.Model): #one company can have a few people
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='contact_people') # company.contact_people.all() -odwolanie dla obiektu company
    name = models.CharField(max_length=100, verbose_name="Imię", blank=False, null=True) 
    surname = models.CharField(max_length=100, verbose_name="Nazwisko",blank=False, null=True) 
    phone_number = models.CharField(max_length=20, verbose_name="Numer telefonu", blank=False, null=True)
    email = models.EmailField(blank=False, verbose_name="Adres email", null=True)
    
#-----stage2----  
class BasicEquipment(models.Model):
    #jebac gniazdka i punkty swietlne? (wyswietlane w ramach stand_size?)

    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='basic_equipment' ) #relacja tu zeby company sie nie usunelo
    CHAIR_CHOICES = {"ZERO":'0 szt', "ONE": '1 szt', "TWO": '2 szt'}

    chair = models.CharField(max_length=5, verbose_name="krzesła", choices=CHAIR_CHOICES, default = "TWO")
    counter = models.BooleanField(verbose_name="lada zwykła", default = True) 
    trashbin = models.BooleanField(verbose_name="śmietnik", default = True) 
    hanger = models.BooleanField(verbose_name="wieszak", default = True) 
    name_sign = models.BooleanField(verbose_name="fryz podłużny z nazwą", default=True) 
    logo_sign = models.BooleanField(verbose_name="fryz poprzeczny z logotypem", default = True) 

class ExtendedEquipment(models.Model): #jezu a co jak ktos bedzie chciał dwa telewizory
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='extended_equipment' )
    counter = models.BooleanField(verbose_name="lada zwykła", default = False)
    arched_counter = models.BooleanField(verbose_name="lada łukowa", default = False)
    square_table = models.BooleanField(verbose_name="stolik kwadratowy", default = False)
    tv = models.BooleanField(verbose_name="telewizor", default = False)
    chair = models.BooleanField(verbose_name="krzesło", default = False)
    bar_table = models.BooleanField(verbose_name="stół barowy", default = False)
    bar_stool = models.BooleanField(verbose_name="krzesło barowe", default = False)
    leaflet_stand = models.BooleanField(verbose_name="stojak na ulotki", default = False)
    #??? jobwall = models.BooleanField(verbose_name="krzesło", default = False)
    #??? workshop = models.BooleanField(verbose_name="krzesło", default = False)

#-----stage 3---
class CarData(ContactPerson):
    #wow dziedziczenie flex tylko czy teraz trzeba ukryc email?
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='car_data')
    car_brand = models.CharField(max_length=30, blank=False, null=True)
    plate_number = models.CharField(max_length=10, blank=False, null=True)

class PDIAttendee(ContactPerson):
    company = models.ForeignKey(Company, on_delete=models.CASCADE,related_name='pdi_att' )
    
class Exhibitor(ContactPerson): 
    #jakie dane tu wymagane?
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='exhibitor') # company.contact_people.all() -odwolanie dla obiektu company
'''
  
     
