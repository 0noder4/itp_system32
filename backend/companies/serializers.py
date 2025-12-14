from rest_framework import serializers
from .models import Company, CompanyInvitation
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