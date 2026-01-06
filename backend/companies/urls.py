from django.urls import path
from . import views

urlpatterns = [
    path('companies/', views.CompanyListView.as_view(), name='company-list'),
    path('company/<int:id>/', views.CompanyDetailView.as_view(), name='company-detail'),

    path('invitations/', views.CompanyInvitationListView.as_view(), name='invitation-list'),
    path('invitation/<int:id>/', views.CompanyInvitationDetailView.as_view(), name='invitation-detail'),
    path('invite/', views.CompanyInvitationView.as_view()),
    path('register/', views.CompanyRegistrationView.as_view()),

    # Equipment items - public catalog
    path('equipment-items/', views.EquipmentItemsView.as_view(), name='equipment-items'),
    
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
    
    # Form status - consolidates form completion flags and latest feedbacks
    path('company/<int:company_id>/form/status/', views.FormStatusView.as_view(), name='form-status'),
    
    # Jobwall price
    path('jobwall-price/', views.JobwallPriceView.as_view(), name='jobwall-price'),
    
    # Stage deadlines
    path('stage-deadlines/', views.StageDeadlinesView.as_view(), name='stage-deadlines'),
    
    # Send stage reminders
    path('companies/send-stage-reminders/', views.SendStageReminderView.as_view(), name='send-stage-reminders'),
    
    # Order summary PDF
    path('company/<int:company_id>/order-summary-pdf/', views.OrderSummaryPDFView.as_view(), name='order-summary-pdf'),
]