from django.urls import path
from . import views

urlpatterns = [
    # Transfer Request Management (principal-to-principal campus/shift transfers)
    path('request/', views.create_transfer_request, name='create_transfer_request'),
    path('request/list/', views.list_transfer_requests, name='list_transfer_requests'),
    path('request/<int:request_id>/', views.get_transfer_request, name='get_transfer_request'),
    path('request/<int:request_id>/approve/', views.approve_transfer, name='approve_transfer'),
    path('request/<int:request_id>/decline/', views.decline_transfer, name='decline_transfer'),
    path('request/<int:request_id>/cancel/', views.cancel_transfer, name='cancel_transfer'),

    # Class/Section Transfer Management (same campus, same shift)
    path('class/request/', views.create_class_transfer, name='create_class_transfer'),
    path('class/list/', views.list_class_transfers, name='list_class_transfers'),
    path('class/<int:transfer_id>/approve/', views.approve_class_transfer, name='approve_class_transfer'),
    path('class/<int:transfer_id>/decline/', views.decline_class_transfer, name='decline_class_transfer'),
    path('available-class-sections/', views.available_class_sections, name='available_class_sections'),

    # Shift Transfer Management (same campus, different shift)
    path('shift/request/', views.create_shift_transfer, name='create_shift_transfer'),
    path('shift/list/', views.list_shift_transfers, name='list_shift_transfers'),
    path('shift/<int:transfer_id>/approve-own/', views.approve_shift_transfer_own_coord, name='approve_shift_transfer_own'),
    path('shift/<int:transfer_id>/approve-other/', views.approve_shift_transfer_other_coord, name='approve_shift_transfer_other'),
    path('shift/<int:transfer_id>/decline/', views.decline_shift_transfer, name='decline_shift_transfer'),
    path('available-shift-sections/', views.available_shift_sections, name='available_shift_sections'),

    # ID History Management
    path('history/<str:entity_type>/<int:entity_id>/', views.get_id_history, name='get_id_history'),
    path('search-by-old-id/', views.search_by_old_id, name='search_by_old_id'),

    # ID Preview
    path('preview-id-change/', views.preview_id_change, name='preview_id_change'),

    # Grade Skip Transfer Management
    path('grade-skip/available-grades/', views.available_grades_for_skip, name='available_grades_for_skip'),
    path('grade-skip/available-sections/', views.available_sections_for_grade_skip, name='available_sections_for_grade_skip'),
    path('grade-skip/list/', views.list_grade_skip_transfers, name='list_grade_skip_transfers'),
    path('grade-skip/create/', views.create_grade_skip_transfer, name='create_grade_skip_transfer'),
    path('grade-skip/<int:transfer_id>/approve-own/', views.approve_grade_skip_own_coord, name='approve_grade_skip_own_coord'),
    path('grade-skip/<int:transfer_id>/approve-other/', views.approve_grade_skip_other_coord, name='approve_grade_skip_other_coord'),
    path('grade-skip/<int:transfer_id>/decline/', views.decline_grade_skip_transfer, name='decline_grade_skip_transfer'),

    # Campus Transfer Management (cross-campus, teacher-initiated)
    path('campus/create/', views.create_campus_transfer, name='create_campus_transfer'),
    path('campus/list/', views.list_campus_transfers, name='list_campus_transfers'),
    path('campus/<int:transfer_id>/approve-from-coord/', views.approve_campus_transfer_from_coord, name='approve_campus_transfer_from_coord'),
    path('campus/<int:transfer_id>/approve-from-principal/', views.approve_campus_transfer_from_principal, name='approve_campus_transfer_from_principal'),
    path('campus/<int:transfer_id>/approve-to-principal/', views.approve_campus_transfer_to_principal, name='approve_campus_transfer_to_principal'),
    path('campus/<int:transfer_id>/confirm/', views.confirm_campus_transfer, name='confirm_campus_transfer'),
    path('campus/<int:transfer_id>/decline/', views.decline_campus_transfer, name='decline_campus_transfer'),
    path('campus/<int:transfer_id>/cancel/', views.cancel_campus_transfer, name='cancel_campus_transfer'),
    path('campus/<int:transfer_id>/letter/', views.get_campus_transfer_letter, name='get_campus_transfer_letter'),
]

