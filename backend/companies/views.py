from django.shortcuts import render
from .models import Company
from .serializers import CompanySerializer
from django.http import HttpResponse, JsonResponse
from rest_framework.parsers import JSONParser
from django.views.decorators.csrf import csrf_exempt

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
