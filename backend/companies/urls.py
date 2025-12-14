from django.urls import path
from . import views

urlpatterns = [
    path('companies/', views.company_list),
    path('company/<int:id>/', views.company),

    path('invite/', views.CompanyInvitationView.as_view()),
    path('register/', views.CompanyRegistrationView.as_view()),

    # Form stages - każdy etap ma endpoint który obsługuje wszystkie powiązane dane
    path('company/<int:company_id>/form/stage-1/', views.FormStage1View.as_view(), name='form-stage-1'),
    path('company/<int:company_id>/form/stage-2/', views.FormStage2View.as_view(), name='form-stage-2'),
    path('company/<int:company_id>/form/stage-3/', views.FormStage3View.as_view(), name='form-stage-3'),
    path('company/<int:company_id>/form/stage-4/', views.FormStage4View.as_view(), name='form-stage-4'),
    path('company/<int:company_id>/form/stage-5/', views.FormStage5View.as_view(), name='form-stage-5'),

    # Form review - FR może akceptować/odrzucać etapy formularza
    path('company/<int:company_id>/form/stage-<int:stage_num>/review/', views.FormReviewView.as_view(), name='form-review'),

    # Feedbacks - pobierz wszystkie feedbacki dla firmy
    path('company/<int:company_id>/feedbacks/', views.CompanyFeedbackListView.as_view(), name='company-feedbacks'),
]