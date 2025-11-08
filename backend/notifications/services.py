from typing import Optional
from django.conf import settings
from .models import Notification


def create_notification(recipient, actor: Optional[settings.AUTH_USER_MODEL] = None, verb: str = '', target_text: str = '', data: dict = None):
    """Helper to create a notification record."""
    if data is None:
        data = {}
    print(f"\n[DEBUG] Creating notification - recipient={recipient}, verb={verb}, target_text={target_text}")
    # recipient may be a user instance or id
    try:
        notification = Notification.objects.create(
            recipient=recipient,
            actor=actor,
            verb=verb,
            target_text=target_text or '',
            data=data or {},
        )
        print(f"[DEBUG] Successfully created notification: {notification}")
        return notification
    except Exception as e:
        print(f"[DEBUG] Failed to create notification: {e}")
        print(f"[DEBUG] Error details: recipient={type(recipient)}, recipient_id={getattr(recipient, 'id', None)}")
        import traceback
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        return None
