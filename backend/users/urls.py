from django.urls import path
from . import views
from users.permissions import IsAdminOrStaff

urlpatterns = [
    path('token/validate/', views.CurrentUserView.as_view(), name='token_validate'),
    path('staff/', views.StaffListView.as_view(), name='staff-list'),
    path('password-reset/', views.PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('users/language/', views.UpdateLanguageView.as_view(), name='update_language'),
]

