from django.db.models.signals import post_delete
from django.dispatch import receiver
from .models import User


@receiver(post_delete, sender=User)
def cleanup_role_entities_on_user_delete(sender, instance: User, **kwargs):
    """When an auth user is removed, also remove role entity rows that reference the same email/employee code.
    This keeps duplicate checks accurate with current data only.
    """
    try:
        # Coordinator by email or employee_code
        from coordinator.models import Coordinator
        if instance.email:
            Coordinator.objects.filter(email__iexact=instance.email).delete()
        Coordinator.objects.filter(employee_code=instance.username).delete()
    except Exception:
        pass
    try:
        # Principal by email or employee_code
        from principals.models import Principal
        if instance.email:
            Principal.objects.filter(email__iexact=instance.email).delete()
        Principal.objects.filter(employee_code=instance.username).delete()
    except Exception:
        pass
    try:
        # Teacher by email or employee_code
        from teachers.models import Teacher
        if instance.email:
            Teacher.objects.filter(email__iexact=instance.email).delete()
        Teacher.objects.filter(employee_code=instance.username).delete()
    except Exception:
        pass


