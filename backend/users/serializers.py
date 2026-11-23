from collections.abc import Mapping
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.template.loader import render_to_string
from django.utils import timezone
import os
import re
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from users.models import User, PasswordResetRequest, StaffInvitation, STAFF_ROLE_FR, STAFF_ROLE_OPIEKUN

OPIEKUN_EMAIL_DOMAIN = "best.pw.edu.pl"


def opiekun_username_from_email(email: str) -> str:
    """Login opiekuna / FR = lokalna część maila Best (przed @)."""
    local, sep, domain = (email or "").strip().partition("@")
    if not sep or not local or domain.lower() != OPIEKUN_EMAIL_DOMAIN:
        raise serializers.ValidationError(
            f"Wymagany jest adres e-mail @{OPIEKUN_EMAIL_DOMAIN}."
        )
    if User.objects.filter(username__iexact=local).exists():
        raise serializers.ValidationError(
            f"Login „{local}” jest już zajęty (wynika z adresu przed @)."
        )
    return local


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token['user_type'] = user.type
        token['username'] = user.username
        token['email'] = user.email
        token['first_name'] = user.first_name or ''
        token['last_name'] = user.last_name or ''
        token['language'] = user.language
        token['staff_roles'] = sorted(user.get_staff_roles())

        return token

    def validate(self, attrs):
        identifier = (attrs.get("username") or "").strip()
        attrs["username"] = identifier

        if not User.objects.filter(username=identifier).exists():
            email_matches = User.objects.filter(email__iexact=identifier)
            if email_matches.count() == 1:
                attrs["username"] = email_matches.first().username

        data = super().validate(attrs)

        data['user_type'] = self.user.type
        data['username'] = self.user.username
        data['email'] = self.user.email
        data['first_name'] = self.user.first_name or ''
        data['last_name'] = self.user.last_name or ''
        data['language'] = self.user.language
        data['staff_roles'] = sorted(self.user.get_staff_roles())

        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user information"""
    staff_roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'type', 'staff_roles')

    def get_staff_roles(self, obj):
        return sorted(obj.get_staff_roles())


class PasswordResetRequestSerializer(serializers.Serializer):
    """
    Serializer for requesting password reset.
    Accepts email and sends reset link.
    """
    email = serializers.EmailField()

    def validate_email(self, value):
        """Validate that user with this email exists"""
        try:
            user = User.objects.get(email=value)
        except User.DoesNotExist:
            pass
        return value

    def save(self):
        """Send password reset email"""
        email = self.validated_data['email']

        try:
            user = User.objects.get(email=email)

            reset_request = PasswordResetRequest.objects.create(user=user)

            # Determine language (default to Polish)
            language = getattr(user, 'language', 'pl') or 'pl'
            
            reset_link = f"{settings.FRONTEND_BASE_URL}/auth/reset-password/confirm?token={reset_request.token}&lang={language}"
            # Use backend URL for static files (logo is hosted on backend)
            logo_url = f"{settings.BACKEND_BASE_URL}{settings.STATIC_URL}images/ITP_LOGO_horizontal_black.png"

            # Select template based on language
            template_name = f"emails/password_reset_{language}.html"

            # Subject based on language
            if language == 'en':
                subject = "Password Reset - ITP System"
                plain_message = f"""We received a request to reset your password. Click the link below to set a new password:
{reset_link}

This link will expire in 24 hours.

If you did not request a password reset, you can safely ignore this email."""
            else:
                subject = "Reset hasła - ITP System"
                plain_message = f"""Otrzymaliśmy prośbę o reset hasła. Prosimy kliknąć poniższy link, aby ustawić nowe hasło:
{reset_link}

Link wygaśnie za 24 godziny.

Jeśli nie prosili Państwo o reset hasła, prosimy zignorować tę wiadomość."""

            # Get staff contact email if user is a company user
            staff_email = None
            from companies.models import Company, Settings as CompanySettings
            default_email = CompanySettings.get_settings().get_general_contact_email()
            if user.type == 'company':
                try:
                    company = Company.objects.get(representative=user)
                    if company.fr_resp and company.fr_resp.email:
                        staff_email = company.fr_resp.email
                except Company.DoesNotExist:
                    pass  # Company not found, use default
            
            # Render HTML template
            html_content = render_to_string(template_name, {
                'username': user.username,
                'reset_link': reset_link,
                'logo_url': logo_url,
                'staff_email': staff_email,
                'default_email': default_email,
            })

            # Send email with HTML and plain text alternatives
            email_message = EmailMultiAlternatives(
                subject=subject,
                body=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email],
            )
            email_message.attach_alternative(html_content, "text/html")
            email_message.send(fail_silently=False)

        except User.DoesNotExist:
            pass

        return {"detail": "If the email exists, a reset link has been sent."}


class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Serializer for confirming password reset.
    Accepts token and new password.
    """
    token = serializers.UUIDField(write_only=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_token(self, value):
        """Validate that token exists and is valid"""
        try:
            reset_request = PasswordResetRequest.objects.get(token=value, is_used=False)
            if reset_request.is_expired():
                raise serializers.ValidationError("Token has expired.")
        except PasswordResetRequest.DoesNotExist:
            raise serializers.ValidationError("Invalid or expired token.")
        return reset_request

    def save(self):
        """Set new password"""
        reset_request = self.validated_data['token']
        password = self.validated_data['password']

        user = reset_request.user
        user.set_password(password)
        user.save()

        reset_request.is_used = True
        reset_request.save()

        return {"detail": "Password has been reset successfully."}


def _validate_phone_number(value):
    if not value:
        return value
    phone_pattern = r'^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$'
    if not re.match(phone_pattern, value):
        raise serializers.ValidationError("Please enter a valid phone number.")
    digit_count = len(re.findall(r'\d', value))
    if digit_count < 7:
        raise serializers.ValidationError("Phone number must contain at least 7 digits.")
    if digit_count > 15:
        raise serializers.ValidationError("Phone number is too long.")
    return value


class StaffInvitationSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(
        choices=StaffInvitation.ROLE_CHOICES,
        required=False,
        default=STAFF_ROLE_OPIEKUN,
    )

    class Meta:
        model = StaffInvitation
        fields = ("id", "email", "role", "language", "created_at", "expires_at", "is_accepted")
        read_only_fields = ("id", "created_at", "expires_at", "is_accepted")

    def to_internal_value(self, data):
        if isinstance(data, Mapping) and isinstance(data.get("email"), str):
            raw = data["email"].strip()
            if raw and "@" not in raw:
                data = data.copy() if hasattr(data, "copy") else dict(data)
                data["email"] = f"{raw}@{OPIEKUN_EMAIL_DOMAIN}"
            elif raw != data["email"]:
                data = data.copy() if hasattr(data, "copy") else dict(data)
                data["email"] = raw
        return super().to_internal_value(data)

    def validate_email(self, value):
        value = (value or "").strip()
        # Waliduje domenę Best i wolny login (= część przed @).
        opiekun_username_from_email(value)
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")

        from companies.models import CompanyInvitation

        if CompanyInvitation.objects.filter(
            email__iexact=value,
            is_accepted=False,
            is_cancelled=False,
            expires_at__gt=timezone.now(),
        ).exists():
            raise serializers.ValidationError(
                "An active company invitation for this email already exists."
            )
        if StaffInvitation.objects.filter(
            email__iexact=value,
            is_accepted=False,
            is_cancelled=False,
            expires_at__gt=timezone.now(),
        ).exists():
            raise serializers.ValidationError(
                "An active staff invitation for this email already exists."
            )
        return value

    def create(self, validated_data):
        validated_data.setdefault('role', STAFF_ROLE_OPIEKUN)
        return super().create(validated_data)


class StaffRegistrationSerializer(serializers.Serializer):
    token = serializers.UUIDField(write_only=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    first_name = serializers.CharField(write_only=True, required=True, max_length=150)
    last_name = serializers.CharField(write_only=True, required=True, max_length=150)
    phone_number = serializers.CharField(
        write_only=True, required=True, max_length=20, validators=[_validate_phone_number]
    )

    def validate_token(self, value):
        try:
            invitation = StaffInvitation.objects.get(
                token=value,
                is_accepted=False,
                is_cancelled=False,
            )
        except StaffInvitation.DoesNotExist:
            raise serializers.ValidationError("Invalid or expired token")
        if invitation.is_expired():
            raise serializers.ValidationError("Invalid or expired token")
        return invitation

    def validate(self, attrs):
        invitation = attrs["token"]
        # Login = część przed @; domena musi być Best.
        attrs["username"] = opiekun_username_from_email(invitation.email)
        return attrs

    def create(self, validated_data):
        invitation = validated_data['token']
        email = invitation.email.strip()
        username = validated_data.pop("username")
        user = User.objects.create_user(
            username=username,
            email=email,
            type='staff',
            password=validated_data['password'],
            language=invitation.language or 'pl',
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            phone_number=validated_data['phone_number'],
            staff_roles=[invitation.role],
        )
        invitation.is_accepted = True
        invitation.save(update_fields=['is_accepted', 'updated_at'])
        return user
