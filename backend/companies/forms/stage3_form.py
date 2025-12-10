from django.forms import ModelForm
from ..models import Company, CarData, PDIAttendee, Exhibitor

# class CompFormStage3(ModelForm):
#     class Meta:
#         model = Company
#         fields=["fire_cert",
#                 "gg_parking",
#                 "el_devices",
#                 "el_power",
#                 "pdi_tickets",
#                 "day1lunch",
#                 "day2lunch",
#                 "diet_info"]
# #TODO: zdefiniowac, że firecert i ggparking jest wtedy gdy self_construction    
# #TODO: zdefiniowac, że   day1lunch, day2lunch sie wyswietla dopiero wzgledem zmiennej day1/day2      

# class CarDataFormStage3(ModelForm):
#     class Meta:
#         model = CarData
# #gdy selfconstruction

# class PDIAttFormStage3(ModelForm):
#     class Meta:
#         model = PDIAttendee


# class ExhibitorFormStage3(ModelForm):
#     class Meta:
#         model = Exhibitor
