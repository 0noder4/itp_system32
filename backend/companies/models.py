from django.db import models
from django.conf import settings

# Create your models here.


class Company(models.Model):
    name = models.CharField(max_length=100, unique=True)
    STATUS_MAIN = 'main'
    STATUS_PARTENER = 'partner'
    STATUS_BASIC = 'basic'
    email = models.EmailField()
    representative = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete = models.CASCADE, null=True) # czy email nie bedzie w User?

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

    def __str__(self):
        return self.name
    


   #----tutaj leci rozruba: 
    '''blank=True -> pole w formularzu moze byc puste
    null=True -> pole w bazie moze przyjmowac null'''

    #TODO: fr_resp = relacja do frowki
    #TODO: definicja pakietu??

    #-----stage 1------
    full_name = models.CharField(max_length=255, verbose_name="pełna nazwa firmy", blank=False, null=True) 
    street = models.CharField(max_length=255, verbose_name="ulica", blank=False, null=True)
    home_number = models.CharField(max_length=10, verbose_name="numer domu", blank=False, null=True)
    apt_number = models.CharField(max_length=10, verbose_name="numer lokalu", blank=True, null=True) #optional
    city = models.CharField(max_length=100, verbose_name="miasto", blank=False, null=True)
    country = models.CharField(max_length=100, verbose_name="kraj", blank=False, null=True)
    postal_code = models.CharField(max_length=20, verbose_name="kod pocztowy",blank=False, null=True)
    nip = models.CharField(max_length=20, verbose_name="nip firmy",blank= False, null=True)

    #uzupelniane przez fr?? - to są imo dane bardzo ważne bo zwiazne czysto z pieniędzmi, więc uwazam ze musi byc kontrola
    day1= models.BooleanField(default = False)
    day2 = models.BooleanField(default = False)
    stand_number_day1 = models.CharField(max_length=10, null=True)
    stand_number_day2 =  models.CharField(max_length=10, null=True)
    stand_size = models.CharField(max_length=10, null=True) # 4/6/8 m2 ?? ->to wlasnie nwm czy tutaj czy do wyboru

    #---stage 2 form---- 
    # parametry stoiska:
    self_construction = models.BooleanField(verbose_name="własna zabudowa", default = False) 
    sc_details = models.CharField(max_length = 255, verbose_name= "z czego się składa własna zabudowa", blank = False, null=True)
    #jak wlasna zabudowa to i tak mozliwosc wziecia od nas equipment??
    name_sign_text = models.CharField(max_length=255, verbose_name = "napis na fryz", blank = False, null=True)
    logo_sign_file = models.FileField('''TODO:upload_to ='hmmmmmm???''', verbose_name = "Logotyp na fryz", blank = False, null=True)
  
    #---stage 3 form----
#if wlasna zabudowa:
    fire_cert = models.FileField('''TODO:upload_to ='hmmmmmm???''', verbose_name = "certyfikat o niepalności", blank = False, null=True)
    gg_parking = models.BooleanField(verbose_name="czy potrzebny wjazd na gg?", default = False) 
    
    ''' Potrzebne info niby, ale imo niepotrzebne w bazie
    - Którego dnia przyjeżdżają z własną zabudową?
    - Kiedy odbierają zabudowę (data)
    - godzina przyjazdu/wyjazdu'''

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
    counter = models.BooleanField(verbose_name="lada zwykła", deafult = True) 
    trashbin = models.BooleanField(verbose_name="śmietnik", deafult = True) 
    hanger = models.BooleanField(verbose_name="wieszak", deafult = True) 
    name_sign = models.BooleanField(verbose_name="fryz podłużny z nazwą", default=True) 
    logo_sign = models.BooleanField(verbose_name="fryz poprzeczny z logotypem", deafult = True) 

class ExtendedEquipment(models.Model): #jezu a co jak ktos bedzie chciał dwa telewizory
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='extended_equipment' )
    counter = models.BooleanField(verbose_name="lada zwykła", deafult = False)
    arched_counter = models.BooleanField(verbose_name="lada łukowa", deafult = False)
    square_table = models.BooleanField(verbose_name="stolik kwadratowy", deafult = False)
    tv = models.BooleanField(verbose_name="telewizor", deafult = False)
    chair = models.BooleanField(verbose_name="krzesło", deafult = False)
    bar_table = models.BooleanField(verbose_name="stół barowy", deafult = False)
    bar_stool = models.BooleanField(verbose_name="krzesło barowe", deafult = False)
    leaflet_stand = models.BooleanField(verbose_name="stojak na ulotki", deafult = False)
    #??? jobwall = models.BooleanField(verbose_name="krzesło", deafult = False)
    #??? workshop = models.BooleanField(verbose_name="krzesło", deafult = False)

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
  
     