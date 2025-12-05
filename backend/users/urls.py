from django.urls import path
from . import views

urlpatterns = [
    path('token/validate/', views.CurrentUserView.as_view(), name='token_validate'),
]

