from django.shortcuts import render
from .models import Company
from .serializers import CompanySerializer

from rest_framework import generics

# Create your views here.

class CompanyList(generics.ListCreateAPIView):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer

