from django.db.models.signals import post_save, pre_save, post_delete
from django.dispatch import receiver
from .models import Principal
from services.user_creation_service import UserCreationService
from notifications.services import create_notification
from users.models import User


@receiver(pre_save, sender=Principal)
def _capture_previous_principal_state(sender, instance, **kwargs):
    """Attach previous user id to instance for use in post_save.
    This helps detect when `user` field was assigned/changed on update.
    """
    if not instance.pk:
        # New instance, nothing to capture
        instance._previous_user_id = None
        return
    try:
        old = Principal.objects.filter(pk=instance.pk).only('user').first()
        instance._previous_user_id = old.user_id if old and old.user_id else None
    except Exception:
        instance._previous_user_id = None


@receiver(post_save, sender=Principal)
def create_principal_user(sender, instance, created, **kwargs):
    """Auto-create user when principal is created, and notify when a user is assigned.

    Cases handled:
    - created=True: when Principal row is created we try to auto-create a User and send notification to that user.
    - created=False and user assigned (previously None or changed): send notification to the assigned user.
    """
    print(f"\n[DEBUG] Principal signal triggered - created={created}")
    print(f"[DEBUG] Principal data: id={instance.id}, email={instance.email}, campus={instance.campus}, user_id={instance.user_id if hasattr(instance, 'user_id') else None}")
    try:
        from users.models import User

        # Case 1: Principal row created -> try to create a user account if it doesn't exist
        if created:
            if User.objects.filter(email=instance.email).exists():
                print(f"User already exists for principal {instance.full_name}")
                try:
                    existing_user = User.objects.filter(email=instance.email).first()
                    campus_name = instance.campus.name if instance.campus else ''
                    verb = f"You have been added as a Principal"
                    target_text = f"at {campus_name}" if campus_name else ""
                    notification = create_notification(
                        recipient=existing_user,
                        actor=None,
                        verb=verb,
                        target_text=target_text,
                        data={"principal_id": instance.id}
                    )
                    print(f"Created notification for existing user {existing_user.email}: {verb} {target_text}")
                except Exception as e:
                    print(f"Error creating notification for existing principal user: {e}")
            else:
                user, message = UserCreationService.create_user_from_entity(instance, 'principal')
                if not user:
                    print(f"Failed to create user for principal {instance.id}: {message}")
                else:
                    print(f"Success: Created user for principal: {instance.full_name} ({instance.employee_code})")
                    try:
                        # Use campus_name instead of name
                        campus_display = instance.campus.campus_name if instance.campus else ''
                        verb = f"You have been added as a Principal"
                        target_text = f"at {campus_display}" if campus_display else ""
                        # Create a notification for the new user
                        notification = create_notification(
                            recipient=user,
                            actor=None,
                            verb=verb,
                            target_text=target_text,
                            data={"principal_id": instance.id}
                        )
                        print(f"Created notification for principal {instance.full_name}: {verb} {target_text}")
                    except Exception as e:
                        print(f"Error creating notification for principal user: {e}")
            return

        # Case 2: existing Principal updated. If a `user` was assigned/changed -> notify the assigned user.
        prev_user_id = getattr(instance, '_previous_user_id', None)
        current_user = instance.user
        current_user_id = current_user.id if current_user else None

        # If previously no user (or different user) and now there is a user -> create notification
        if current_user_id and current_user_id != prev_user_id:
            try:
                campus_display = instance.campus.campus_name if instance.campus else ''
                verb = f"You have been assigned as a Principal"
                target_text = f"at {campus_display}" if campus_display else ""
                create_notification(recipient=current_user, actor=None, verb=verb, target_text=target_text, data={"principal_id": instance.id})
            except Exception as e:
                print(f"Error creating notification on principal assignment: {e}")

    except Exception as e:
        print(f"Error handling principal signals for {instance.id}: {e}")


@receiver(post_delete, sender=Principal)
def delete_user_when_principal_deleted(sender, instance: Principal, **kwargs):
    """When a Principal is deleted, remove any matching auth user by email or employee_code."""
    try:
        if instance.email:
            User.objects.filter(email__iexact=instance.email).delete()
        if instance.employee_code:
            User.objects.filter(username=instance.employee_code).delete()
    except Exception:
        pass