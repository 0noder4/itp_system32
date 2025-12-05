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
from django.core.mail import send_mail
from django.conf import settings

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

    def perform_create(self, serializer ):
        invitation = serializer.save()
        registration_link = f"{settings.FRONTEND_BASE_URL}/auth/register?token={invitation.token}"
        message = (
            "You have been invited to join the itp_system32 platform.\n\n"
            f"Company: {invitation.company_name}\n"
            f"Status: {invitation.company_status}\n\n"
            "To complete your registration, please click the link below and set your password:\n"
            f"{registration_link}\n\n"
            "This link will expire in 7 days."
        )
        send_mail(
            "Your company invitation",
            message,
            "bs@bs.com",
            [invitation.email]
        )


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

from .forms.stage1_form import CompFormStage1, ContPersFormStage1
#---forms:----
'''TODO: polaczyc dwa formularze do stage1. 
najpierw trzeba zapisac company, a potem odczytac contact person, ktoremu przypiszę relację z company i wtedy zapisac CP

forms stage2 :
jak z wlasna no to details i pytanie co chca od nas 

'''
