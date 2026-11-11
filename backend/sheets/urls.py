from django.urls import path

from . import views

urlpatterns = [
    path('', views.SheetCatalogView.as_view(), name='sheet-catalog'),
    path('<slug:sheet_key>/layout/', views.SheetLayoutDefaultView.as_view(), name='sheet-layout'),
    path('<slug:sheet_key>/<slug:tab_key>/', views.SheetTabView.as_view(), name='sheet-tab'),
    path('<slug:sheet_key>/<slug:tab_key>/cells/', views.SheetCellsView.as_view(), name='sheet-cells'),
    path('<slug:sheet_key>/<slug:tab_key>/styles/', views.SheetCellStylesView.as_view(), name='sheet-styles'),
    path('<slug:sheet_key>/<slug:tab_key>/history/', views.SheetCellHistoryView.as_view(), name='sheet-history'),
    path('<slug:sheet_key>/<slug:tab_key>/xlsx/', views.SheetXlsxView.as_view(), name='sheet-xlsx'),
]
