"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
http://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

# Import routing after Django setup
from notifications import routing as notifications_routing

# WebSocket middleware stack
websocket_stack = AuthMiddlewareStack(
    URLRouter(
        notifications_routing.websocket_urlpatterns
    )
)

# In development, allow all origins for WebSocket (for localhost testing)
# In production, use AllowedHostsOriginValidator for security
if settings.DEBUG:
    # Development: Allow all origins
    websocket_middleware = websocket_stack
else:
    # Production: Validate origins
    websocket_middleware = AllowedHostsOriginValidator(websocket_stack)

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": websocket_middleware,
})
