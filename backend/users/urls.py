from django.urls import path
from . import views

urlpatterns = [
    path('token/validate/', views.CurrentUserView.as_view(), name='token_validate'),
    path('password-reset/', views.PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
]

