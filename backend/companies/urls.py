from django.urls import path
from . import views

urlpatterns = [
    path('companies/', views.company_list),
    path('company/<int:id>/', views.company),
    path('invite/', views.CompanyInvitationView.as_view()),
    path('register/', views.CompanyRegistrationView.as_view())
]