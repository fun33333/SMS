from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create router for ViewSets
router = DefaultRouter()
router.register(r'subjects', views.SubjectViewSet, basename='subject')
router.register(r'class-timetable', views.ClassTimeTableViewSet, basename='class-timetable')
router.register(r'teacher-timetable', views.TeacherTimeTableViewSet, basename='teacher-timetable')
router.register(r'shift-timings', views.ShiftTimingViewSet, basename='shift-timings')

urlpatterns = [
    path('', include(router.urls)),
]
