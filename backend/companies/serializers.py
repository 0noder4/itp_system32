from rest_framework import serializers
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import (
    Company,
    CompanyInvitation,
    Form,
    Feedback,
    BasicData,
    Address,
    StandDetails,
    Stand,
    EquipmentItem,
    EquipmentSelection,
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
import re


def validate_phone_number(value):
    """
    Validate phone number format.
    Accepts international format with +, Polish format, and general formats with digits, spaces, dashes, parentheses.
    """
    if not value:
        return value
    
    # Check if it's a valid phone number format
    # Allows: + prefix, digits, and common separators
    phone_pattern = r'^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$'
    
    if not re.match(phone_pattern, value):
        raise serializers.ValidationError("Please enter a valid phone number.")
    
    # Ensure it has at least 7 digits (minimum for a valid phone number)
    digit_count = len(re.findall(r'\d', value))
    if digit_count < 7:
        raise serializers.ValidationError("Phone number must contain at least 7 digits.")
    
    if digit_count > 15:
        raise serializers.ValidationError("Phone number is too long.")
    
    return value


class CompanySerializer(serializers.ModelSerializer):
    representative_name = serializers.SerializerMethodField()
    representative_surname = serializers.SerializerMethodField()
    representative_phone_number = serializers.SerializerMethodField()
    representative_username = serializers.SerializerMethodField()
    fr_resp = serializers.IntegerField(source='fr_resp.id', read_only=True, allow_null=True)
    fr_resp_name = serializers.SerializerMethodField()
    fr_resp_surname = serializers.SerializerMethodField()
    fr_resp_email = serializers.SerializerMethodField()
    fr_resp_phone_number = serializers.SerializerMethodField()
    fr_resp_username = serializers.SerializerMethodField()
    day1_stand = serializers.SerializerMethodField()
    day2_stand = serializers.SerializerMethodField()
    completed_stages_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Company
        fields = ("id", "name", "status", "email", "representative", "representative_name", "representative_surname", "representative_phone_number", "representative_username", "fr_resp", "fr_resp_name", "fr_resp_surname", "fr_resp_email", "fr_resp_phone_number", "fr_resp_username", "day1_stand", "day2_stand", "completed_stages_count", "created_at", "updated_at")
    
    def get_representative_name(self, obj):
        if obj.representative:
            return obj.representative.first_name
        return None
    
    def get_representative_surname(self, obj):
        if obj.representative:
            return obj.representative.last_name
        return None
    
    def get_representative_phone_number(self, obj):
        if obj.representative:
            return obj.representative.phone_number or ""
        return None
    
    def get_representative_username(self, obj):
        if obj.representative:
            return obj.representative.username
        return None
    
    def get_fr_resp_name(self, obj):
        if obj.fr_resp:
            return obj.fr_resp.first_name
        return None
    
    def get_fr_resp_surname(self, obj):
        if obj.fr_resp:
            return obj.fr_resp.last_name
        return None
    
    def get_fr_resp_email(self, obj):
        if obj.fr_resp:
            return obj.fr_resp.email
        return None
    
    def get_fr_resp_phone_number(self, obj):
        if obj.fr_resp:
            return obj.fr_resp.phone_number or ""
        return None
    
    def get_fr_resp_username(self, obj):
        if obj.fr_resp:
            return obj.fr_resp.username
        return None
    
    def get_day1_stand(self, obj):
        try:
            stand = Stand.objects.filter(company=obj, day='day1').first()
            if stand:
                return {
                    "stand_number": stand.stand_number,
                    "stand_size": stand.stand_size
                }
        except Exception:
            pass
        return None
    
    def get_day2_stand(self, obj):
        try:
            stand = Stand.objects.filter(company=obj, day='day2').first()
            if stand:
                return {
                    "stand_number": stand.stand_number,
                    "stand_size": stand.stand_size
                }
        except Exception:
            pass
        return None
    
    def get_completed_stages_count(self, obj):
        try:
            form = obj.form
            count = sum([
                form.stage_1_completed,
                form.stage_2_completed,
                form.stage_3_completed,
                form.stage_4_completed,
                form.stage_5_completed,
            ])
            return count
        except AttributeError:
            # Form doesn't exist for this company
            return 0

class CompanyInvitationSerializer(serializers.ModelSerializer):
    invitation_status = serializers.SerializerMethodField()
    invitation_link = serializers.SerializerMethodField()
    fr_resp = serializers.IntegerField(source='created_by.id', read_only=True, allow_null=True)
    fr_resp_name = serializers.SerializerMethodField()
    fr_resp_surname = serializers.SerializerMethodField()
    fr_resp_email = serializers.SerializerMethodField()
    
    class Meta:
        model = CompanyInvitation
        fields = ("id", "email", "company_name", "created_at", "updated_at", "expires_at", "is_accepted", "company_status", "language", "invitation_status", "invitation_link", "fr_resp", "fr_resp_name", "fr_resp_surname", "fr_resp_email")
    
    def get_invitation_status(self, obj):
        return obj.get_invitation_status()
    
    def get_invitation_link(self, obj):
        language = obj.language or 'en'
        if language not in ['en', 'pl']:
            language = 'en'
        return f"{settings.FRONTEND_BASE_URL}/auth/register?token={obj.token}&lang={language}"
    
    def get_fr_resp_name(self, obj):
        if obj.created_by:
            return obj.created_by.first_name
        return None
    
    def get_fr_resp_surname(self, obj):
        if obj.created_by:
            return obj.created_by.last_name
        return None
    
    def get_fr_resp_email(self, obj):
        if obj.created_by:
            return obj.created_by.email
        return None
    
    def validate_email(self, value):
        """Reject email if a user exists or an active invitation is pending."""
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")

        has_active_invitation = CompanyInvitation.objects.filter(
            email__iexact=value,
            is_accepted=False,
            is_cancelled=False,
            expires_at__gt=timezone.now(),
        ).exists()
        if has_active_invitation:
            raise serializers.ValidationError(
                "An active invitation for this email already exists."
            )

        return value


class CompanyRegistrationSerializer(serializers.Serializer):
    token = serializers.UUIDField(write_only=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    first_name = serializers.CharField(write_only=True, required=True, max_length=150)
    last_name = serializers.CharField(write_only=True, required=True, max_length=150)
    phone_number = serializers.CharField(write_only=True, required=True, max_length=20, validators=[validate_phone_number])

    def validate_token(self, value):
        try:
            invitation = CompanyInvitation.objects.get(token=value, is_accepted=False)
        except CompanyInvitation.DoesNotExist:
            raise serializers.ValidationError("Invalid or expired token")
        return invitation
    
    def create(self, validated_data):
        invitation = validated_data['token']
        password = validated_data['password']
        first_name = validated_data['first_name']
        last_name = validated_data['last_name']
        phone_number = validated_data['phone_number']

        user = User.objects.create_user(
            username = invitation.company_name,
            email = invitation.email,
            type = 'company',
            password = password,
            language = invitation.language or 'en',
            first_name = first_name,
            last_name = last_name,
            phone_number = phone_number
        )

        # Set fr_resp to the staff member who created the invitation
        company = Company.objects.create(
            name = invitation.company_name,
            email = invitation.email,
            representative = user,
            status = invitation.company_status,
            fr_resp = invitation.created_by  # Set fr_resp to the staff member who created the invitation
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


# ETAP 2: Wyposażenie

class StandDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StandDetails
        fields = '__all__'
        extra_kwargs = {
            'logo_sign_file': {'required': False, 'allow_null': True},
            'fire_cert': {'required': False, 'allow_null': True},
        }


class EquipmentItemSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    
    class Meta:
        model = EquipmentItem
        fields = ('id', 'name', 'name_en', 'name_pl', 
                 'price', 'is_basic', 'included_quantity', 'category', 'is_active', 'created_at', 'updated_at')
        read_only_fields = ('name',)
    
    def get_name(self, obj):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            language = getattr(request.user, 'language', 'en') or 'en'
        else:
            # Default to English if no user or language preference
            language = 'en'
        
        if language == 'pl':
            return obj.name_pl
        return obj.name_en


class EquipmentSelectionSerializer(serializers.ModelSerializer):
    equipment_item = EquipmentItemSerializer(read_only=True, context={'request': None})
    equipment_item_id = serializers.IntegerField(write_only=True)
    
    class Meta:
        model = EquipmentSelection
        fields = ('id', 'equipment_item', 'equipment_item_id', 'quantity')
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Pass request context to nested serializer if available
        request = self.context.get('request')
        if request and 'equipment_item' in self.fields:
            self.fields['equipment_item'].context['request'] = request
    
    def create(self, validated_data):
        equipment_item_id = validated_data.pop('equipment_item_id')
        equipment_item = EquipmentItem.objects.get(id=equipment_item_id)
        validated_data['equipment_item'] = equipment_item
        return super().create(validated_data)


# ETAP 3: Warsztaty

class WorkshopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workshop
        fields = '__all__'


# ETAP 4: Jobwall

class JobwallSerializer(serializers.ModelSerializer):
    def validate_url(self, value):
        """Validate that url is either a valid URL or a valid email address"""
        if not value:
            return value
        
        # Check if it's a valid URL
        from django.core.validators import URLValidator
        from django.core.exceptions import ValidationError
        import re
        
        url_validator = URLValidator()
        try:
            url_validator(value)
            return value
        except ValidationError:
            # If not a URL, check if it's a valid email
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if re.match(email_pattern, value):
                return value
            raise serializers.ValidationError("Must be a valid URL or email address")
    
    class Meta:
        model = Jobwall
        fields = '__all__'


# ETAP 5: Inne dane

class DescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Description
        exclude = ('company',)  # Company is set by Stage4Serializer.create(), not validated here
        extra_kwargs = {
            'logo_file': {'required': False, 'allow_null': True},
        }


class FinalDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinalData
        fields = '__all__'


class LunchSerializer(serializers.ModelSerializer):
    diet_info = serializers.ChoiceField(
        choices=['meat', 'vegetarian', 'vegan'],
        required=False,
        allow_blank=True,
        default='meat',
    )

    class Meta:
        model = Lunch
        exclude = ('form',)

    def validate_diet_info(self, value):
        if not value:
            return 'meat'
        valid = {'meat', 'vegetarian', 'vegan'}
        if value not in valid:
            raise serializers.ValidationError('Invalid diet selection.')
        return value


class PDISerializer(serializers.ModelSerializer):
    class Meta:
        model = PDI
        exclude = ('form',)


class PDIAttendeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PDIAttendee
        exclude = ('form',)


class ExhibitorSerializer(serializers.ModelSerializer):
    phone_number = serializers.CharField(max_length=20, validators=[validate_phone_number])
    attendance = serializers.ChoiceField(
        choices=['both', 'day1', 'day2', 'none'],
        required=False,
        allow_blank=True,
    )

    class Meta:
        model = Exhibitor
        exclude = ('form',)


VALID_ATTENDANCE = {'both', 'day1', 'day2', 'none'}


def covers_fair_day(attendance, day_key):
    if attendance == 'both':
        return True
    return attendance == day_key


def count_day_coverage(main_rep_attendance, exhibitors, day_key):
    count = 1 if covers_fair_day(main_rep_attendance, day_key) else 0
    for exhibitor in exhibitors:
        if covers_fair_day(exhibitor.get('attendance'), day_key):
            count += 1
    return count


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

    def create(self, validated_data):
        basic_data_data = validated_data.pop('basic_data')
        address_data = validated_data.pop('address')

        basic_data_obj = BasicData.objects.create(**basic_data_data)

        address_data['form'] = basic_data_obj
        address_obj = Address.objects.create(**address_data)

        return {
            'basic_data': basic_data_obj,
            'address': address_obj,
        }

    def update(self, instance, validated_data):
        basic_data_data = validated_data.get('basic_data')
        address_data = validated_data.get('address')

        if basic_data_data:
            for key, value in basic_data_data.items():
                setattr(instance['basic_data'], key, value)
            instance['basic_data'].save()

        if address_data:
            for key, value in address_data.items():
                setattr(instance['address'], key, value)
            instance['address'].save()

        return instance


class Stage2Serializer(serializers.Serializer):
    stand_details = StandDetailsSerializer()
    equipment_selections = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_empty=True
    )

    def validate(self, data):
        # Validation is handled in the view for file uploads
        # This method can be used for additional validation if needed
        return data

    def create(self, validated_data):
        stand_details_data = validated_data.pop('stand_details')
        equipment_selections_data = validated_data.pop('equipment_selections', [])
        
        # Extract file fields separately to ensure they're file objects
        logo_file = stand_details_data.pop('logo_sign_file', None)
        fire_cert_file = stand_details_data.pop('fire_cert', None)

        stand_details_obj = StandDetails.objects.create(**stand_details_data)

        # Set file fields after creation if they exist
        if logo_file:
            stand_details_obj.logo_sign_file = logo_file
        if fire_cert_file:
            stand_details_obj.fire_cert = fire_cert_file
        if logo_file or fire_cert_file:
            stand_details_obj.save()

        equipment_selection_objs = []
        for selection_data in equipment_selections_data:
            equipment_item_id = selection_data.get('equipment_item')
            quantity = selection_data.get('quantity', 1)
            
            # Ensure equipment_item_id and quantity are integers
            try:
                if equipment_item_id:
                    equipment_item_id = int(equipment_item_id)
                if quantity is not None:
                    quantity = int(quantity)
            except (ValueError, TypeError) as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Invalid equipment_item_id or quantity: equipment_item_id={equipment_item_id}, quantity={quantity}, error={e}")
                continue
            
            if equipment_item_id:
                try:
                    equipment_item = EquipmentItem.objects.get(id=equipment_item_id)
                    selection_obj, created = EquipmentSelection.objects.get_or_create(
                        stand_details=stand_details_obj,
                        equipment_item=equipment_item,
                        defaults={'quantity': quantity}
                    )
                    if not created:
                        selection_obj.quantity = quantity
                        selection_obj.save()
                    equipment_selection_objs.append(selection_obj)
                except EquipmentItem.DoesNotExist:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"EquipmentItem with id={equipment_item_id} does not exist")
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Error creating EquipmentSelection: {e}", exc_info=True)

        return {
            'stand_details': stand_details_obj,
            'equipment_selections': equipment_selection_objs
        }

    def update(self, instance, validated_data):
        stand_details_data = validated_data.get('stand_details')
        equipment_selections_data = validated_data.get('equipment_selections')

        if stand_details_data:
            stand_details_obj = instance.get('stand_details')
            if stand_details_obj:
                # Handle file fields separately - only update if new file provided
                file_fields = ['fire_cert', 'logo_sign_file']
                for field in file_fields:
                    if field in stand_details_data:
                        file_value = stand_details_data.pop(field)
                        # Only update if a new file is provided (not None/empty)
                        if file_value is not None and file_value != '':
                            setattr(stand_details_obj, field, file_value)
                
                # Handle other fields - update all provided fields
                for key, value in stand_details_data.items():
                    if key not in file_fields and key != 'company':  # Don't update company
                        setattr(stand_details_obj, key, value)
                stand_details_obj.save()

        if equipment_selections_data is not None:
            stand_details_obj = instance.get('stand_details')
            if stand_details_obj:
                # Delete existing selections
                EquipmentSelection.objects.filter(stand_details=stand_details_obj).delete()
                
                # Create new selections
                equipment_selection_objs = []
                for selection_data in equipment_selections_data:
                    equipment_item_id = selection_data.get('equipment_item')
                    quantity = selection_data.get('quantity', 1)

                    if equipment_item_id:
                        try:
                            equipment_item = EquipmentItem.objects.get(id=equipment_item_id)
                            selection_obj = EquipmentSelection.objects.create(
                                stand_details=stand_details_obj,
                                equipment_item=equipment_item,
                                quantity=quantity
                            )
                            equipment_selection_objs.append(selection_obj)
                        except EquipmentItem.DoesNotExist:
                            pass
                
                instance['equipment_selections'] = equipment_selection_objs
            else:
                instance['equipment_selections'] = []

        return instance


class Stage4Serializer(serializers.Serializer):
    jobwalls = JobwallSerializer(many=True, required=False, allow_empty=True)
    description = DescriptionSerializer(required=False, allow_null=True)

    def to_internal_value(self, data):
        """
        Remove company field from description data before nested serializer validation.
        This prevents unique constraint validation error during nested serializer validation.
        """
        # Make a copy of data to avoid modifying the original
        data_copy = data.copy() if hasattr(data, 'copy') else dict(data) if isinstance(data, dict) else data
        
        # Remove company field from description data before validation
        if isinstance(data_copy, dict) and 'description' in data_copy:
            if isinstance(data_copy['description'], dict):
                description_data = data_copy['description'].copy()
                description_data.pop('company', None)
                data_copy['description'] = description_data
        
        # Call parent with modified data
        return super().to_internal_value(data_copy)

    def create(self, validated_data):
        jobwalls_data = validated_data.pop('jobwalls', [])
        description_data = validated_data.pop('description', None)

        company = self.context.get('company')
        if not company:
            raise serializers.ValidationError("Company is required")

        # Create jobwalls - delete existing ones first to handle resubmissions
        Jobwall.objects.filter(company=company).delete()
        jobwall_objs = []
        for jobwall_data in jobwalls_data:
            jobwall_data['company'] = company
            jobwall_objs.append(Jobwall.objects.create(**jobwall_data))

        # Create or update description if provided
        description_obj = None
        if description_data:
            # Extract file field separately to ensure it's a file object
            logo_file = description_data.pop('logo_file', None)
            description_data['company'] = company
            
            # Check if description already exists for this company
            try:
                description_obj = Description.objects.get(company=company)
                # Update existing description
                for attr, value in description_data.items():
                    if attr != 'company':  # Don't update company
                        setattr(description_obj, attr, value)
                # Handle file field separately - only update if new file provided
                if logo_file is not None and logo_file != '':
                    description_obj.logo_file = logo_file
                description_obj.save()
            except Description.DoesNotExist:
                # Create new description if it doesn't exist
                description_obj = Description.objects.create(**description_data)
                # Set file field after creation if it exists
                if logo_file:
                    description_obj.logo_file = logo_file
                    description_obj.save()

        return {
            'jobwalls': jobwall_objs,
            'description': description_obj
        }

    def update(self, instance, validated_data):
        company = self.context.get('company')
        if not company:
            raise serializers.ValidationError("Company is required")

        jobwalls_data = validated_data.get('jobwalls')
        description_data = validated_data.get('description')

        # Update jobwalls - delete old, create new
        if jobwalls_data is not None:
            # Delete existing jobwalls for this company
            Jobwall.objects.filter(company=company).delete()
            
            # Create new jobwalls
            jobwall_objs = []
            for jobwall_data in jobwalls_data:
                jobwall_data['company'] = company
                jobwall_objs.append(Jobwall.objects.create(**jobwall_data))
            instance['jobwalls'] = jobwall_objs

        # Update description
        desc_instance = instance.get('description')
        if description_data is not None:
            if desc_instance:
                # Handle file field separately - only update if new file provided
                logo_file = description_data.pop('logo_file', None)
                # Only update if a new file is provided (not None/empty)
                if logo_file is not None and logo_file != '':
                    desc_instance.logo_file = logo_file
                
                # Handle other fields - update all provided fields
                for attr, value in description_data.items():
                    if attr != 'company':  # Don't update company
                        setattr(desc_instance, attr, value)
                desc_instance.save()
            else:
                # Create new description
                logo_file = description_data.pop('logo_file', None)
                description_data['company'] = company
                desc_instance = Description.objects.create(**description_data)
                
                # Set file field after creation if it exists
                if logo_file:
                    desc_instance.logo_file = logo_file
                    desc_instance.save()
                instance['description'] = desc_instance
        elif description_data is None and desc_instance:
            # If description is explicitly set to None, delete it
            desc_instance.delete()
            instance['description'] = None

        return instance


class Stage5Serializer(serializers.Serializer):
    final_data = FinalDataSerializer()
    lunches = LunchSerializer(many=True, required=False)
    pdi = PDISerializer(required=False, allow_null=True)
    pdi_attendees = PDIAttendeeSerializer(many=True, required=False)
    exhibitors = ExhibitorSerializer(many=True, required=False)

    def validate(self, data):
        instance = getattr(self, 'instance', None) or {}
        fd_instance = instance.get('final_data')

        final_data = {}
        if fd_instance:
            final_data = {
                'el_devices': fd_instance.el_devices,
                'el_power': fd_instance.el_power,
                'el_low_power': fd_instance.el_low_power,
                'lunches_declined': fd_instance.lunches_declined,
                'no_other_delegates': fd_instance.no_other_delegates,
                'main_rep_name': fd_instance.main_rep_name,
                'main_rep_surname': fd_instance.main_rep_surname,
                'main_rep_phone': fd_instance.main_rep_phone,
                'main_rep_attendance': fd_instance.main_rep_attendance,
            }
        if 'final_data' in data:
            final_data.update(data['final_data'])
            data['final_data'] = final_data

        lunches_declined = final_data.get('lunches_declined', False)
        no_other_delegates = final_data.get('no_other_delegates', False)
        el_low_power = final_data.get('el_low_power', False)

        errors = {}

        if el_low_power:
            final_data['el_power'] = '≤100'
            if not (final_data.get('el_devices') or '').strip():
                final_data['el_devices'] = '≤100 W (np. komputer + ładowarka)'
            data['final_data'] = final_data
        else:
            if not (final_data.get('el_devices') or '').strip():
                errors.setdefault('final_data', {})['el_devices'] = (
                    'List devices separated by commas, or select low power (≤100 W).'
                )
            if not (final_data.get('el_power') or '').strip():
                errors.setdefault('final_data', {})['el_power'] = (
                    'Enter total power in watts, or select low power (≤100 W).'
                )

        if 'lunches' in data:
            lunches = data.get('lunches') or []
        elif fd_instance:
            lunches = [
                {
                    'day': lunch.day,
                    'lunch_quantity': lunch.lunch_quantity,
                    'diet_info': lunch.diet_info,
                }
                for lunch in instance.get('lunches', [])
            ]
        else:
            lunches = []

        if 'exhibitors' in data:
            exhibitors = data.get('exhibitors') or []
        elif instance.get('exhibitors') is not None:
            exhibitors = [
                {
                    'name': exhibitor.name,
                    'surname': exhibitor.surname,
                    'phone_number': exhibitor.phone_number,
                    'attendance': exhibitor.attendance,
                }
                for exhibitor in instance.get('exhibitors', [])
            ]
        else:
            exhibitors = []

        if lunches_declined:
            data['lunches'] = []
        else:
            total_lunches = sum(
                max(0, lunch.get('lunch_quantity') or 0) for lunch in lunches
            )
            if total_lunches < 1:
                errors.setdefault('final_data', {})['lunches_declined'] = (
                    'Choose lunch orders or select "Decline lunches".'
                )
            else:
                data['lunches'] = lunches

        main_rep_errors = {}
        for field in ('main_rep_name', 'main_rep_surname', 'main_rep_phone', 'main_rep_attendance'):
            value = final_data.get(field) or ''
            if field != 'main_rep_attendance':
                value = value.strip()
            if field == 'main_rep_attendance':
                if value not in VALID_ATTENDANCE:
                    main_rep_errors[field] = 'Attendance selection is required.'
            elif not value:
                main_rep_errors[field] = 'This field is required.'

        if final_data.get('main_rep_phone'):
            try:
                validate_phone_number(final_data['main_rep_phone'])
            except serializers.ValidationError as exc:
                main_rep_errors['main_rep_phone'] = exc.detail

        if main_rep_errors:
            errors['final_data'] = {**errors.get('final_data', {}), **main_rep_errors}

        if no_other_delegates:
            data['exhibitors'] = []
            exhibitors = []
        elif not exhibitors:
            errors.setdefault('final_data', {})['no_other_delegates'] = (
                'Add delegates or select "No other delegates".'
            )
        else:
            exhibitor_errors = []
            has_row_errors = False
            for exhibitor in exhibitors:
                row_errors = {}
                for field in ('name', 'surname', 'phone_number', 'attendance'):
                    value = (exhibitor.get(field) or '').strip()
                    if field == 'attendance':
                        if value not in VALID_ATTENDANCE:
                            row_errors[field] = 'Attendance selection is required.'
                    elif not value:
                        row_errors[field] = 'This field is required.'
                if exhibitor.get('phone_number'):
                    try:
                        validate_phone_number(exhibitor['phone_number'])
                    except serializers.ValidationError as exc:
                        row_errors['phone_number'] = exc.detail
                if row_errors:
                    has_row_errors = True
                exhibitor_errors.append(row_errors)
            if has_row_errors:
                errors['exhibitors'] = exhibitor_errors
            else:
                data['exhibitors'] = exhibitors

        main_rep_attendance = final_data.get('main_rep_attendance', '')
        if main_rep_attendance == 'none' and no_other_delegates:
            errors.setdefault('final_data', {})['main_rep_attendance'] = (
                'At least one person from the company must attend each fair day.'
            )
        elif main_rep_attendance in VALID_ATTENDANCE:
            for day_key in ('day1', 'day2'):
                if count_day_coverage(main_rep_attendance, data.get('exhibitors', []), day_key) < 1:
                    errors.setdefault('final_data', {})['main_rep_attendance'] = (
                        'At least one person from the company must attend each fair day.'
                    )
                    break

        if errors:
            raise ValidationError(errors)

        return data

    def _get_form(self):
        company = self.context.get('company')
        if not company:
            return None
        return Form.objects.filter(company=company).first()

    def create(self, validated_data):
        final_data_data = validated_data.pop('final_data')
        lunches_data = validated_data.pop('lunches', [])
        pdi_data = validated_data.pop('pdi', None)
        pdi_attendees_data = validated_data.pop('pdi_attendees', [])
        exhibitors_data = validated_data.pop('exhibitors', [])

        final_data_obj = FinalData.objects.create(**final_data_data)
        
        form = Form.objects.get(company=final_data_obj.company)

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

        # Exhibitors require a PDI, so create one if it doesn't exist but exhibitors are provided
        if exhibitors_data and not pdi_obj:
            # Create a default PDI with tickets_quantity=0 if not provided
            pdi_obj = PDI.objects.create(form=final_data_obj, tickets_quantity=0)

        exhibitor_objs = []
        for exhibitor_data in exhibitors_data:
            exhibitor_data['form'] = pdi_obj
            exhibitor_objs.append(Exhibitor.objects.create(**exhibitor_data))

        return {
            'final_data': final_data_obj,
            'lunches': lunch_objs,
            'pdi': pdi_obj,
            'pdi_attendees': pdi_attendee_objs,
            'exhibitors': exhibitor_objs
        }

    def update(self, instance, validated_data):
        form = self._get_form()
        
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

        if 'exhibitors' in validated_data:
            # Exhibitors require a PDI, so ensure one exists
            if not pdi_instance and fd_instance:
                # Create a default PDI if it doesn't exist
                pdi_instance = PDI.objects.create(form=fd_instance, tickets_quantity=0)
                instance['pdi'] = pdi_instance
            
            if pdi_instance:
                Exhibitor.objects.filter(form=pdi_instance).delete()
                new_exhibitors = [
                    Exhibitor(form=pdi_instance, **data)
                    for data in validated_data['exhibitors']
                ]
                Exhibitor.objects.bulk_create(new_exhibitors)
                instance['exhibitors'] = new_exhibitors

        return instance