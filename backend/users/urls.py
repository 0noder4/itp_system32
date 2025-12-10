from django.urls import path
from . import views

urlpatterns = [
    path('token/validate/', views.CurrentUserView.as_view(), name='token_validate'),
    path('health/', views.HealthCheckView.as_view(), name='health_check'),
]

