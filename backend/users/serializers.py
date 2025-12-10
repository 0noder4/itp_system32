from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
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

        return token

    def validate(self, attrs):
        data = super().validate(attrs)

        data['user_type'] = self.user.type
        data['username'] = self.user.username
        data['email'] = self.user.email

        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


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

            reset_link = f"{settings.FRONTEND_BASE_URL}/auth/reset-password?token={reset_request.token}"


            subject = "Reset hasła - System32"
            message = f"""
Cześć {user.username},

Aby ustawić nowe hasło, kliknij poniższy link:
{reset_link}

            """

            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )

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

