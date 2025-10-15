from django.urls import path
from . import views

urlpatterns = [
    path('all/', views.CompanyList.as_view()),
]