from django.forms import ModelForm
from ..models import Company, ContactPerson

class CompFormStage1(ModelForm):
    class Meta:
        model = Company
        fields = ["full_name",
                    "street",
                    "home_number",
                    "apt_number",
                    "city",
                    "country",
                    "postal_code",
                    "nip",
                    ]
        model = ContactPerson

class ContPersFormStage1(ModelForm):
    class Meta:
        model = ContactPerson
        fields = ["name", "surname", "phone_number", "email"]

        