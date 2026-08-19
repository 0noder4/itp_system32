from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.template.loader import render_to_string
import os
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from users.models import User, PasswordResetRequest


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token['user_type'] = user.type
        token['username'] = user.username
        token['email'] = user.email
        token['language'] = user.language

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
        data['language'] = self.user.language

        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user information"""
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'type')


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
                plain_message = f"""Hello {user.username},

We received a request to reset your password. Click the link below to set a new password:
{reset_link}

This link will expire in 24 hours.

If you did not request a password reset, you can safely ignore this email."""
            else:
                subject = "Reset hasła - ITP System"
                plain_message = f"""Cześć {user.username},

Otrzymaliśmy prośbę o reset hasła. Kliknij poniższy link, aby ustawić nowe hasło:
{reset_link}

Link wygaśnie za 24 godziny.

Jeśli nie prosiłeś o reset hasła, możesz zignorować tę wiadomość."""

            # Get staff contact email if user is a company user
            staff_email = None
            default_email = 'best@best.pw.edu.pl'
            if user.type == 'company':
                from companies.models import Company
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
