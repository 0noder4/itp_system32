from django.urls import path
from . import views

urlpatterns = [
    path('companies/', views.company_list),
    path('company/<int:id>/', views.company),
]