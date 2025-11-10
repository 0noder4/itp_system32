from django.shortcuts import render
from .models import Company, CompanyInvitation
from .serializers import CompanySerializer, CompanyInvitationSerializer, CompanyRegistrationSerializer
from django.http import HttpResponse, JsonResponse
from rest_framework.parsers import JSONParser
from django.views.decorators.csrf import csrf_exempt
from django.core.mail import send_mail

from rest_framework import generics

# Create your views here.

# class CompanyList(generics.ListCreateAPIView):
#     queryset = Company.objects.all()
#     serializer_class = CompanySerializer

@csrf_exempt
def company_list(request):

    if request.method == "GET":
        companies = Company.objects.all()
        serializer = CompanySerializer(companies, many= True)
        return JsonResponse(serializer.data, safe=False)
    
    elif request.method =="POST":
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
    serializer_class = CompanyInvitationSerializer
    queryset = CompanyInvitation.objects.all()
    authentication_classes = []
    permission_classes = []

    def perform_create(self, serializer ):
        invitation = serializer.save()
        from django.core.mail import send_mail
        send_mail(
            "Invitation mail",
            f"Token{invitation.token}",
            "bs@bs.com",
            [invitation.email]
        )

class CompanyRegistrationView(generics.CreateAPIView):
    authentication_classes = []
    permission_classes = []
    serializer_class = CompanyRegistrationSerializer
