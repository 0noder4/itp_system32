from django.shortcuts import render
from django.http import JsonResponse
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from textwrap import dedent
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from rest_framework import generics
from .serializers import (
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    UserSerializer,
    StaffInvitationSerializer,
)
from users.permissions import HasStaffRole
from companies.models import Company, Settings as CompanySettings, compute_invitation_expires_at
from users.models import User, StaffInvitation

class CurrentUserView(APIView):
    """
    API endpoint to get current authenticated user information.
    This endpoint validates the JWT token and returns user data.
    Used by frontend to verify authentication and user type.
    For company users, also returns company information.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        response_data = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "user_type": user.type,
            "staff_roles": sorted(user.get_staff_roles()),
            "language": user.language,
            "is_active": user.is_active,
        }
        
        # Include company information for company users
        if user.type == 'company':
            company = Company.objects.filter(representative=user).first()
            if company:
                response_data["company"] = {
                    "id": company.id,
                    "name": company.name,
                    "status": company.status,
                    "email": company.email,
                }
        
        return Response(response_data, status=status.HTTP_200_OK)


class UpdateLanguageView(APIView):
    """
    API endpoint to update user's language preference.
    Accepts {"language": "en" | "pl"}
    """
    permission_classes = [IsAuthenticated]

    def put(self, request):
        user = request.user
        language = request.data.get('language')

        if language not in ['en', 'pl']:
            return Response(
                {"detail": "Invalid language. Supported languages: 'en', 'pl'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.language = language
        user.save(update_fields=['language'])

        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "user_type": user.type,
                "language": user.language,
                "is_active": user.is_active,
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestView(APIView):
    """
    API endpoint to request password reset.
    Accepts email and sends reset link to user.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            result = serializer.save()
            return Response(result, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetConfirmView(APIView):
    """
    API endpoint to confirm password reset.
    GET: Validate token and return user info
    POST: Accepts token and new password
    """
    permission_classes = [AllowAny]

    def get(self, request):
        """Validate token and return user info"""
        from users.models import PasswordResetRequest
        import uuid

        token = request.query_params.get("token")
        if not token:
            return Response(
                {"token": ["Token query parameter is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate UUID format before querying database
        try:
            token_uuid = uuid.UUID(token)
        except (ValueError, TypeError):
            return Response(
                {"token": ["Invalid token format."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reset_request = PasswordResetRequest.objects.get(token=token_uuid, is_used=False)
            if not reset_request.is_valid():
                if reset_request.is_expired():
                    return Response(
                        {"detail": "Token has expired."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response(
                    {"detail": "Token has already been used."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except PasswordResetRequest.DoesNotExist:
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "email": reset_request.user.email,
                "username": reset_request.user.username,
                "expires_at": reset_request.expires_at,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        """Reset password with token"""
        # Get token from request body or query params
        token = request.data.get("token") or request.query_params.get("token")
        
        # Prepare data for serializer
        data = request.data.copy()
        if token:
            data["token"] = token

        serializer = PasswordResetConfirmSerializer(data=data)
        if serializer.is_valid():
            result = serializer.save()
            return Response(result, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class StaffListView(APIView):
    """
    API endpoint to get all staff members (admin and staff users).
    Used for filtering companies by responsible staff member.
    """
    permission_classes = [IsAuthenticated, HasStaffRole("fr")]

    def get(self, request):
        candidates = User.objects.filter(type__in=['admin', 'staff'], is_active=True).order_by(
            'first_name', 'last_name', 'username'
        )
        staff_users = [user for user in candidates if user.has_staff_role('fr')]
        serializer = UserSerializer(staff_users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class StaffInvitationView(generics.CreateAPIView):
    """POST /api/staff-invite/ — FR invites an opiekun; sends registration email."""

    serializer_class = StaffInvitationSerializer
    queryset = StaffInvitation.objects.all()
    permission_classes = [IsAuthenticated, HasStaffRole("fr")]

    def perform_create(self, serializer):
        invitation = serializer.save(created_by=self.request.user)
        invitation.expires_at = compute_invitation_expires_at()
        invitation.save(update_fields=['expires_at'])
        validity_days = CompanySettings.get_settings().invitation_validity_days or 7

        language = invitation.language or 'pl'
        if language not in ('en', 'pl'):
            language = 'pl'

        registration_link = (
            f"{settings.FRONTEND_BASE_URL}/auth/register?token={invitation.token}&lang={language}"
        )
        logo_url = (
            f"{settings.BACKEND_BASE_URL}{settings.STATIC_URL}"
            "images/ITP_LOGO_horizontal_black.png"
        )
        template_name = f"emails/staff_invitation_{language}.html"
        staff_email = invitation.created_by.email if invitation.created_by and invitation.created_by.email else None
        default_email = CompanySettings.get_settings().get_general_contact_email()

        if language == 'pl':
            subject = "Dokończ rejestrację opiekuna - Inżynierskie Targi Pracy - ITP System"
            plain_message = dedent(f"""
                Zostałeś zaproszony do systemu Inżynierskich Targów Pracy jako opiekun firm.
                Twój login: {invitation.email}

                Dokończ rejestrację:
                {registration_link}

                Link wygaśnie za {validity_days} dni.
            """).strip()
        else:
            subject = "Complete guardian registration - Engineering Job Fair - ITP System"
            plain_message = dedent(f"""
                You have been invited to the Engineering Job Fair platform as a company guardian.
                Your login: {invitation.email}

                Complete your registration:
                {registration_link}

                This link will expire in {validity_days} days.
            """).strip()

        html_content = render_to_string(template_name, {
            'login': invitation.email,
            'registration_link': registration_link,
            'logo_url': logo_url,
            'staff_email': staff_email,
            'default_email': default_email,
            'validity_days': validity_days,
        })
        email_message = EmailMultiAlternatives(
            subject=subject,
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[invitation.email],
        )
        email_message.attach_alternative(html_content, "text/html")
        email_message.send()
