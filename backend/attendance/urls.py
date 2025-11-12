from django.urls import path
from . import views

app_name = 'attendance'

urlpatterns = [
    # Attendance list for dashboard
    path('', views.get_attendance_list, name='attendance_list'),
    
    # Attendance marking
    path('mark/', views.mark_attendance, name='mark_attendance'),
    path('mark-bulk/', views.mark_bulk_attendance, name='mark_bulk_attendance'),
    
    # Class attendance
    path('class/<int:classroom_id>/', views.get_class_attendance, name='class_attendance'),
    path('class/<int:classroom_id>/students/', views.get_class_students, name='class_students'),
    path('class/<int:classroom_id>/summary/', views.get_attendance_summary, name='attendance_summary'),
    path('class/<int:classroom_id>/attendance/<str:date>/', views.get_attendance_for_date, name='attendance_for_date'),
    
    # Student attendance
    path('student/<int:student_id>/', views.get_student_attendance, name='student_attendance'),
    
    # Teacher classes
    path('teacher/classes/', views.get_teacher_classes, name='teacher_classes'),
    
    # Edit attendance
    path('edit/<int:attendance_id>/', views.edit_attendance, name='edit_attendance'),
    
    # Coordinator endpoints
    path('coordinator/classes/', views.get_coordinator_classes, name='coordinator_classes'),
    path('level/<int:level_id>/summary/', views.get_level_attendance_summary, name='level_attendance_summary'),
    
    # State management
    path('submit/<int:attendance_id>/', views.submit_attendance, name='submit_attendance'),
    path('review/<int:attendance_id>/', views.review_attendance, name='review_attendance'),
    path('finalize/<int:attendance_id>/', views.finalize_attendance, name='finalize_attendance'),
    path('coordinator-approve/<int:attendance_id>/', views.coordinator_approve_attendance, name='coordinator_approve_attendance'),
    path('reopen/<int:attendance_id>/', views.reopen_attendance, name='reopen_attendance'),
    
    # Backfill permissions
    path('backfill/grant/', views.grant_backfill_permission, name='grant_backfill_permission'),
    path('backfill/permissions/', views.get_backfill_permissions, name='get_backfill_permissions'),
    
    # Holiday management
    path('holidays/create/', views.create_holiday, name='create_holiday'),
    path('holidays/', views.get_holidays, name='get_holidays'),
    path('holidays/<int:holiday_id>/', views.update_holiday, name='update_holiday'),
    path('holidays/<int:holiday_id>/delete/', views.delete_holiday, name='delete_holiday'),
    
    # Real-time metrics
    path('metrics/realtime/', views.get_realtime_attendance_metrics, name='realtime_metrics'),
]
