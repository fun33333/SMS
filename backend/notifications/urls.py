from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import NotificationViewSet

router = DefaultRouter()
router.register(r'notifications', NotificationViewSet, basename='notifications')

# Register router at package root so project `include("notifications.urls")`
# mounted at `/api/` yields `/api/notifications/...` (avoid double `api/api/`)
urlpatterns = [
    path('', include(router.urls)),
]
