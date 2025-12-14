from rest_framework import serializers
from .models import (
    Company,
    CompanyInvitation,
    Form,
    Feedback,
    BasicData,
    Address,
    ContactPerson,
    StandDetails,
    BasicEquipment,
    ExtendedEquipment,
    Jobwall,
    Workshop,
    Description,
    FinalData,
    Lunch,
    PDI,
    PDIAttendee,
    Exhibitor
)
from users.models import User
from django.contrib.auth.password_validation import validate_password

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ("id", "name", "status", "email", "representative", "created_at", "updated_at")

class CompanyInvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyInvitation
        fields = ("id", "email", "company_name", "created_at", "updated_at", "expires_at", "is_accepted", "company_status", "language")


class CompanyRegistrationSerializer(serializers.Serializer):
    token = serializers.UUIDField(write_only=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_token(self, value):
        try:
            invitation = CompanyInvitation.objects.get(token=value, is_accepted=False)
        except CompanyInvitation.DoesNotExist:
            raise serializers.ValidationError("Invalid or expired token")
        return invitation
    
    def create(self, validated_data):
        invitation = validated_data['token']
        password = validated_data['password']

        user = User.objects.create_user(
            username = invitation.company_name,
            email = invitation.email,
            type = 'company',
            password = password,
            language = invitation.language or 'en'
        )

        company = Company.objects.create(
            name = invitation.company_name,
            email = invitation.email,
            representative = user,
            status = invitation.company_status
        )

        invitation.is_accepted = True
        invitation.save()
        return user


# SERIALIZERS DLA FORMULARZA - FLAT APPROACH  -  GET
# Etapy 3 i 4

class FormSerializer(serializers.ModelSerializer):
    class Meta:
        model = Form
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


# ETAP 1: Dane podstawowe

class BasicDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = BasicData
        fields = '__all__'


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        exclude = ('form',)


class ContactPersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactPerson
        exclude = ('form',)


# ETAP 2: Wyposażenie

class StandDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StandDetails
        fields = '__all__'


class BasicEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = BasicEquipment
        fields = '__all__'


class ExtendedEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExtendedEquipment
        fields = '__all__'


# ETAP 3: Warsztaty

class WorkshopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workshop
        fields = '__all__'


# ETAP 4: Jobwall

class JobwallSerializer(serializers.ModelSerializer):
    class Meta:
        model = Jobwall
        fields = '__all__'


# ETAP 5: Inne dane

class DescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Description
        fields = '__all__'


class FinalDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinalData
        fields = '__all__'


class LunchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lunch
        exclude = ('form',)


class PDISerializer(serializers.ModelSerializer):
    class Meta:
        model = PDI
        exclude = ('form',)


class PDIAttendeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PDIAttendee
        exclude = ('form',)


class ExhibitorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exhibitor
        exclude = ('form',)


class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = '__all__'


# NESTED SERIALIZERS - DLA CAŁYCH ETAPÓW -  POST, PATCH
# 1 request zamiast kilku
# Etap 1, 2, 5
class Stage1Serializer(serializers.Serializer):
    basic_data = BasicDataSerializer()
    address = AddressSerializer()
    contact_person = ContactPersonSerializer()

    def create(self, validated_data):
        basic_data_data = validated_data.pop('basic_data')
        address_data = validated_data.pop('address')
        contact_person_data = validated_data.pop('contact_person')

        basic_data_obj = BasicData.objects.create(**basic_data_data)

        address_data['form'] = basic_data_obj
        address_obj = Address.objects.create(**address_data)

        contact_person_data['form'] = basic_data_obj
        contact_person_obj = ContactPerson.objects.create(**contact_person_data)

        return {
            'basic_data': basic_data_obj,
            'address': address_obj,
            'contact_person': contact_person_obj
        }

    def update(self, instance, validated_data):
        basic_data_data = validated_data.get('basic_data')
        address_data = validated_data.get('address')
        contact_person_data = validated_data.get('contact_person')

        if basic_data_data:
            for key, value in basic_data_data.items():
                setattr(instance['basic_data'], key, value)
            instance['basic_data'].save()

        if address_data:
            for key, value in address_data.items():
                setattr(instance['address'], key, value)
            instance['address'].save()

        if contact_person_data:
            for key, value in contact_person_data.items():
                setattr(instance['contact_person'], key, value)
            instance['contact_person'].save()

        return instance


class Stage2Serializer(serializers.Serializer):
    stand_details = StandDetailsSerializer()
    basic_equipment = BasicEquipmentSerializer(required=False)
    extended_equipment = ExtendedEquipmentSerializer(required=False)

    def create(self, validated_data):
        stand_details_data = validated_data.pop('stand_details')
        basic_equipment_data = validated_data.pop('basic_equipment', None)
        extended_equipment_data = validated_data.pop('extended_equipment', None)

        stand_details_obj = StandDetails.objects.create(**stand_details_data)

        basic_equipment_obj = None
        if basic_equipment_data:
            basic_equipment_data['stand_details'] = stand_details_obj
            basic_equipment_obj = BasicEquipment.objects.create(**basic_equipment_data)

        extended_equipment_obj = None
        if extended_equipment_data:
            extended_equipment_data['stand_details'] = stand_details_obj
            extended_equipment_obj = ExtendedEquipment.objects.create(**extended_equipment_data)

        return {
            'stand_details': stand_details_obj,
            'basic_equipment': basic_equipment_obj,
            'extended_equipment': extended_equipment_obj
        }

    def update(self, instance, validated_data):
        stand_details_data = validated_data.get('stand_details')
        basic_equipment_data = validated_data.get('basic_equipment')
        extended_equipment_data = validated_data.get('extended_equipment')

        if stand_details_data:
            for key, value in stand_details_data.items():
                setattr(instance['stand_details'], key, value)
            instance['stand_details'].save()

        if basic_equipment_data and instance.get('basic_equipment'):
            for key, value in basic_equipment_data.items():
                setattr(instance['basic_equipment'], key, value)
            instance['basic_equipment'].save()

        if extended_equipment_data and instance.get('extended_equipment'):
            for key, value in extended_equipment_data.items():
                setattr(instance['extended_equipment'], key, value)
            instance['extended_equipment'].save()

        return instance


class Stage5Serializer(serializers.Serializer):
    description = DescriptionSerializer()
    final_data = FinalDataSerializer()
    lunches = LunchSerializer(many=True, required=False)
    pdi = PDISerializer(required=False, allow_null=True)
    pdi_attendees = PDIAttendeeSerializer(many=True, required=False)
    exhibitors = ExhibitorSerializer(many=True, required=False)

    def _get_form(self):
        company = self.context.get('company')
        if not company:
            return None
        return Form.objects.filter(company=company).first()

    def create(self, validated_data):
        description_data = validated_data.pop('description')
        final_data_data = validated_data.pop('final_data')
        lunches_data = validated_data.pop('lunches', [])
        pdi_data = validated_data.pop('pdi', None)
        pdi_attendees_data = validated_data.pop('pdi_attendees', [])
        exhibitors_data = validated_data.pop('exhibitors', [])

        description_obj = Description.objects.create(**description_data)
        final_data_obj = FinalData.objects.create(**final_data_data)
        
        form = Form.objects.get(company=description_obj.company)

        lunch_objs = []
        for lunch_data in lunches_data:
            lunch_data['form'] = final_data_obj
            lunch_objs.append(Lunch.objects.create(**lunch_data))

        pdi_obj = None
        if pdi_data:
            pdi_data['form'] = final_data_obj
            pdi_obj = PDI.objects.create(**pdi_data)

        pdi_attendee_objs = []
        for attendee_data in pdi_attendees_data:
            if pdi_obj:
                attendee_data['form'] = pdi_obj
            pdi_attendee_objs.append(PDIAttendee.objects.create(**attendee_data))

        exhibitor_objs = []
        for exhibitor_data in exhibitors_data:
            exhibitor_data['form'] = form
            exhibitor_objs.append(Exhibitor.objects.create(**exhibitor_data))

        return {
            'description': description_obj,
            'final_data': final_data_obj,
            'lunches': lunch_objs,
            'pdi': pdi_obj,
            'pdi_attendees': pdi_attendee_objs,
            'exhibitors': exhibitor_objs
        }

    def update(self, instance, validated_data):
        form = self._get_form()
        
        desc_instance = instance.get('description')
        desc_data = validated_data.get('description')
        if desc_instance and desc_data:
            for attr, value in desc_data.items():
                setattr(desc_instance, attr, value)
            desc_instance.save()

        fd_instance = instance.get('final_data')
        fd_data = validated_data.get('final_data')
        if fd_instance and fd_data:
            for attr, value in fd_data.items():
                setattr(fd_instance, attr, value)
            fd_instance.save()

        pdi_instance = instance.get('pdi')
        pdi_data = validated_data.get('pdi')
        if pdi_instance and pdi_data:
            for attr, value in pdi_data.items():
                setattr(pdi_instance, attr, value)
            pdi_instance.save()
        elif not pdi_instance and pdi_data and fd_instance:
            pdi_instance = PDI.objects.create(form=fd_instance, **pdi_data)
            instance['pdi'] = pdi_instance


        if 'lunches' in validated_data and fd_instance:
            Lunch.objects.filter(form=fd_instance).delete()
            new_lunches = [
                Lunch(form=fd_instance, **data)
                for data in validated_data['lunches']
            ]
            Lunch.objects.bulk_create(new_lunches)
            instance['lunches'] = new_lunches


        if 'pdi_attendees' in validated_data and pdi_instance:
            PDIAttendee.objects.filter(form=pdi_instance).delete()
            new_attendees = [
                PDIAttendee(form=pdi_instance, **data)
                for data in validated_data['pdi_attendees']
            ]
            PDIAttendee.objects.bulk_create(new_attendees)
            instance['pdi_attendees'] = new_attendees

        if 'exhibitors' in validated_data and form:
            Exhibitor.objects.filter(form=form).delete()
            new_exhibitors = [
                Exhibitor(form=form, **data)
                for data in validated_data['exhibitors']
            ]
            Exhibitor.objects.bulk_create(new_exhibitors)
            instance['exhibitors'] = new_exhibitors

        return instance