from django.shortcuts import render
from .models import Company, CompanyInvitation
from .serializers import (
    CompanySerializer,
    CompanyInvitationSerializer,
    CompanyRegistrationSerializer,
)
from django.http import HttpResponse, JsonResponse
from rest_framework.parsers import JSONParser
from django.views.decorators.csrf import csrf_exempt
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.template.loader import render_to_string
import os

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from users.permissions import IsAdminOrStaff

# Create your views here.

# class CompanyList(generics.ListCreateAPIView):
#     queryset = Company.objects.all()
#     serializer_class = CompanySerializer

@csrf_exempt
def company_list(request):
    # Note: This view should be converted to use DRF viewsets/views
    # with proper permission classes for better security
    if request.method == "GET":
        companies = Company.objects.all()
        serializer = CompanySerializer(companies, many= True)
        return JsonResponse(serializer.data, safe=False)
    
    elif request.method =="POST":
        # POST should require authentication and admin/staff permissions
        # For now, keeping @csrf_exempt but should be converted to DRF view
        data = JSONParser().parse(request)
        serializer = CompanySerializer(data = data)
        if serializer.is_valid():
            serializer.save()
            return JsonResponse(serializer.data, status=201)
        return JsonResponse(serializer.errors, status=400)


@csrf_exempt
def company(request, id): #stowrzyc/wyswietlic/usunac/.. FIRMĘ
    
    try:
        company = Company.objects.get(id=id)
    except Company.DoesNotExist:
        return HttpResponse(status = 404)
    
    if request.method == "GET":
        serializer = CompanySerializer(company)
        return JsonResponse(serializer.data)
    
    elif request.method == "PUT":
        data = JSONParser().parse(request)
        serializer = CompanySerializer(company, data=data)
        if serializer.is_valid():
            serializer.save()
            return JsonResponse(serializer.data)
        return JsonResponse(serializer.errors, status=400)

    elif request.method == "DELETE":
        company.delete()
        return HttpResponse(status=204)

class CompanyInvitationView(generics.CreateAPIView):
    """
    View to create company invitations.
    Requires admin or staff permissions.
    """
    serializer_class = CompanyInvitationSerializer
    queryset = CompanyInvitation.objects.all()
    permission_classes = [IsAuthenticated, IsAdminOrStaff]

    def perform_create(self, serializer):
        invitation = serializer.save()
        
        # Get language from invitation model (default to English)
        language = invitation.language or 'en'
        if language not in ['en', 'pl']:
            language = 'en'
        
        # Get registration link with language parameter
        registration_link = f"{settings.FRONTEND_BASE_URL}/auth/register?token={invitation.token}&lang={language}"
        # Use backend URL for static files (logo is hosted on backend)
        backend_url = os.environ.get('BACKEND_BASE_URL', 'http://localhost:8000')
        logo_url = f"{backend_url}{settings.STATIC_URL}images/ITP_LOGO_horizontal_black.png"

        # Select template based on language
        template_name = f"emails/invitation_{language}.html"

        # Subject and plain text based on language
        if language == 'pl':
            subject = "Zaproszenie do firmy - ITP System"
            plain_message = f"""Zostałeś zaproszony do platformy ITP System.

Firma: {invitation.company_name}

Aby dokończyć rejestrację, kliknij poniższy link i ustaw hasło:
{registration_link}

Link do zaproszenia wygaśnie za 7 dni.

Jeśli nie spodziewałeś się tego zaproszenia, możesz zignorować tę wiadomość."""
        else:
            subject = "Company Invitation - ITP System"
            plain_message = f"""You have been invited to join the ITP System platform.

Company: {invitation.company_name}

To complete your registration, click the link below and set your password:
{registration_link}

This invitation link will expire in 7 days.

If you did not expect this invitation, you can safely ignore this email."""

        # Render HTML template
        html_content = render_to_string(template_name, {
            'company_name': invitation.company_name,
            'registration_link': registration_link,
            'logo_url': logo_url,
        })

        # Send email with HTML and plain text alternatives
        email_message = EmailMultiAlternatives(
            subject=subject,
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[invitation.email],
        )
        email_message.attach_alternative(html_content, "text/html")
        email_message.send()


class CompanyRegistrationView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, *args, **kwargs):
        token = request.query_params.get("token")
        if not token:
            return Response(
                {"token": ["Token query parameter is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            invitation = CompanyInvitation.objects.get(token=token, is_accepted=False)
        except CompanyInvitation.DoesNotExist:
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "company_name": invitation.company_name,
                "email": invitation.email,
                "company_status": invitation.company_status,
                "expires_at": invitation.expires_at,
            }
        )

    def post(self, request, *args, **kwargs):
        token = request.data.get("token") or request.query_params.get("token")
        if not token:
            return Response(
                {"token": ["Token is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data.copy()
        data["token"] = token

        serializer = CompanyRegistrationSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            {"message": "Registration successful."},
            status=status.HTTP_201_CREATED,
        )

#from .forms.stage1_form import CompFormStage1, ContPersFormStage1
#---forms:----
'''
TODO: polaczyc dwa formularze do stage1. 
najpierw trzeba zapisac company, a potem odczytac contact person, ktoremu przypiszę relację z company i wtedy zapisac CP

forms stage2 :
jak z wlasna no to details i pytanie co chca od nas 

'''
