from django.urls import path
from . import views

urlpatterns = [
    path('create/', views.create_request, name='create_request'),
    path('my-requests/', views.get_my_requests, name='get_my_requests'),
    path('<int:request_id>/', views.get_request_detail, name='get_request_detail'),
    path('coordinator/requests/', views.get_coordinator_requests, name='get_coordinator_requests'),
    path('coordinator/dashboard-stats/', views.get_coordinator_dashboard_stats, name='get_coordinator_dashboard_stats'),
    path('<int:request_id>/update-status/', views.update_request_status, name='update_request_status'),
    path('<int:request_id>/comment/', views.add_comment, name='add_comment'),
    
    # New endpoints for workflow
    path('<int:request_id>/forward-to-principal/', views.forward_to_principal, name='forward_to_principal'),
    path('<int:request_id>/approve/', views.approve_request, name='approve_request'),
    path('<int:request_id>/reject/', views.reject_request, name='reject_request'),
    path('<int:request_id>/confirm/', views.confirm_completion, name='confirm_completion'),
    path('principal/requests/', views.get_principal_requests, name='get_principal_requests'),
]
