from django.apps import AppConfig


class CoordinatorConfig(AppConfig):
    name = 'coordinator'

    def ready(self):
        # Import signal handlers
        from . import signals  # noqa: F401

from django.apps import AppConfig

class CoordinatorConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'coordinator'
    
    def ready(self):
        import coordinator.signals  # Import signals