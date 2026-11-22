from django.urls import path

from . import views

urlpatterns = [
    path('', views.SheetCatalogView.as_view(), name='sheet-catalog'),
    path('comments/', views.SheetCommentsView.as_view(), name='sheet-comments'),
    path('comments/<int:comment_id>/', views.SheetCommentDetailView.as_view(), name='sheet-comment-detail'),
    path('comments/<int:comment_id>/apply/', views.SheetCommentApplyView.as_view(), name='sheet-comment-apply'),
    path('staff-users/', views.SheetStaffUsersView.as_view(), name='sheet-staff-users'),
    path('notifications/', views.SheetNotificationsView.as_view(), name='sheet-notifications'),
    path('notifications/read/', views.SheetNotificationsReadView.as_view(), name='sheet-notifications-read'),
    path('mail-deadlines/', views.MailDeadlinesView.as_view(), name='sheet-mail-deadlines'),
    path('<slug:sheet_key>/layout/', views.SheetLayoutDefaultView.as_view(), name='sheet-layout'),
    path('<slug:sheet_key>/<slug:tab_key>/', views.SheetTabView.as_view(), name='sheet-tab'),
    path('<slug:sheet_key>/<slug:tab_key>/cells/', views.SheetCellsView.as_view(), name='sheet-cells'),
    path(
        '<slug:sheet_key>/<slug:tab_key>/cells/restore/',
        views.SheetCellsRestoreView.as_view(),
        name='sheet-cells-restore',
    ),
    path(
        '<slug:sheet_key>/<slug:tab_key>/cells/discard/',
        views.SheetCellsDiscardView.as_view(),
        name='sheet-cells-discard',
    ),
    path(
        '<slug:sheet_key>/<slug:tab_key>/cells/file/',
        views.SheetCellsFileView.as_view(),
        name='sheet-cells-file',
    ),
    path(
        '<slug:sheet_key>/<slug:tab_key>/cells/media/',
        views.SheetCustomMediaView.as_view(),
        name='sheet-cells-media',
    ),
    path(
        '<slug:sheet_key>/<slug:tab_key>/columns/',
        views.SheetCustomColumnsView.as_view(),
        name='sheet-custom-columns',
    ),
    path(
        '<slug:sheet_key>/<slug:tab_key>/columns/<str:column_key>/',
        views.SheetCustomColumnDetailView.as_view(),
        name='sheet-custom-column-detail',
    ),
    path(
        '<slug:sheet_key>/<slug:tab_key>/groups/',
        views.SheetCustomGroupsView.as_view(),
        name='sheet-custom-groups',
    ),
    path(
        '<slug:sheet_key>/<slug:tab_key>/groups/<int:group_id>/',
        views.SheetCustomGroupDetailView.as_view(),
        name='sheet-custom-group-detail',
    ),
    path('<slug:sheet_key>/<slug:tab_key>/styles/', views.SheetCellStylesView.as_view(), name='sheet-styles'),
    path('<slug:sheet_key>/<slug:tab_key>/history/', views.SheetCellHistoryView.as_view(), name='sheet-history'),
    path('<slug:sheet_key>/<slug:tab_key>/guests/', views.StaffMealGuestCreateView.as_view(), name='sheet-staff-guests'),
    path(
        '<slug:sheet_key>/<slug:tab_key>/guests/<int:guest_id>/',
        views.StaffMealGuestDetailView.as_view(),
        name='sheet-staff-guest-detail',
    ),
    path('<slug:sheet_key>/<slug:tab_key>/xlsx/', views.SheetXlsxView.as_view(), name='sheet-xlsx'),
]
