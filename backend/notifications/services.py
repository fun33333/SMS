from typing import Optional
from django.conf import settings
from .models import Notification
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def create_notification(recipient, actor: Optional[settings.AUTH_USER_MODEL] = None, verb: str = '', target_text: str = '', data: dict = None):
    """Helper to create a notification record and send via WebSocket."""
    if data is None:
        data = {}
    print(f"\n[DEBUG] Creating notification - recipient={recipient}, verb={verb}, target_text={target_text}")
    # recipient may be a user instance or id
    try:
        # Get recipient user ID
        if hasattr(recipient, 'id'):
            recipient_id = recipient.id
            recipient_user = recipient
        else:
            recipient_id = recipient
            from django.contrib.auth import get_user_model
            User = get_user_model()
            recipient_user = User.objects.get(id=recipient_id)
        
        # Get actor name
        actor_name = None
        if actor:
            if hasattr(actor, 'get_full_name'):
                actor_name = actor.get_full_name() or str(actor)
            else:
                actor_name = str(actor)
        
        notification = Notification.objects.create(
            recipient=recipient_user,
            actor=actor,
            verb=verb,
            target_text=target_text or '',
            data=data or {},
        )
        print(f"[DEBUG] Successfully created notification: {notification}")
        
        # Send notification via WebSocket
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                # Serialize notification data
                notification_data = {
                    'id': notification.id,
                    'verb': notification.verb,
                    'target_text': notification.target_text,
                    'actor_name': actor_name,
                    'timestamp': notification.timestamp.isoformat(),
                    'data': notification.data,
                    'unread': notification.unread,
                }
                
                # Send to user's channel group
                async_to_sync(channel_layer.group_send)(
                    f'user_{recipient_id}',
                    {
                        'type': 'notification_message',
                        'message': notification_data
                    }
                )
                print(f"[DEBUG] Sent WebSocket notification to user_{recipient_id}")
        except Exception as ws_error:
            print(f"[DEBUG] Failed to send WebSocket notification: {ws_error}")
            # Don't fail notification creation if WebSocket fails
        
        return notification
    except Exception as e:
        print(f"[DEBUG] Failed to create notification: {e}")
        print(f"[DEBUG] Error details: recipient={type(recipient)}, recipient_id={getattr(recipient, 'id', None)}")
        import traceback
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        return None
