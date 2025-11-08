from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'notifications'
    verbose_name = 'Notifications'

    def ready(self):
        # Import signal handlers (if any) so they get registered
        try:
            import notifications.signals  # noqa: F401
        except Exception:
            pass
