from django.forms import ModelForm
from ..models import Company, BasicEquipment, ExtendedEquipment

class CompFormStage2(ModelForm):
    class Meta:
        model = Company
        fields = ["self_construction"
                "sc_details", #gdy self_construction
                "name_sign_text",
                "logo_sign_file"]

class BasicEquipFormStage2(ModelForm):
    class Meta:
        model: BasicEquipment
        #fields all wiec nie pisze

class ExtEquipFormStage2(ModelForm):  
    class Meta:
        model =  ExtendedEquipment