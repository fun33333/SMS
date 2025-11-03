# backend/backend/urls.py
"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from graphene_django.views import GraphQLView
from django.views.decorators.csrf import csrf_exempt

urlpatterns = [
    path('sms-admin/', admin.site.urls),
    path("api/", include("users.urls")),
    path("api/", include("students.urls")),
    path("api/", include("campus.urls")),
    path("api/", include("teachers.urls")),
    path("api/", include("coordinator.urls")),
    path("api/", include("principals.urls")),
    path("api/attendance/", include("attendance.urls")),
    path("api/requests/", include("requests.urls")),
    path("api/result/", include("result.urls")),
    path('api/', include('classes.urls')),
    path("api/transfers/", include("transfers.urls")),
    path("api/behaviour/", include("behaviour.urls")),
    # GraphQL endpoint (enable GraphiQL only in DEBUG)
    path("graphql/", csrf_exempt(GraphQLView.as_view(graphiql=settings.DEBUG))),
    # Removed services.urls - not needed for utility apps
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)