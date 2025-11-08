from django.db.models.signals import post_delete
from django.dispatch import receiver
from .models import Coordinator
from users.models import User


@receiver(post_delete, sender=Coordinator)
def delete_user_when_coordinator_deleted(sender, instance: Coordinator, **kwargs):
    """Ensure associated auth user is removed when a coordinator record is deleted.
    We match by email first, then by username (employee_code) if present.
    """
    # Delete by email
    if instance.email:
        User.objects.filter(email__iexact=instance.email).delete()
    # Delete by employee_code as username
    if instance.employee_code:
        User.objects.filter(username=instance.employee_code).delete()

from django.db.models.signals import post_save, m2m_changed
from django.dispatch import receiver
from coordinator.models import Coordinator
from teachers.models import Teacher
from classes.models import Grade
from services.user_creation_service import UserCreationService
from notifications.services import create_notification

@receiver(post_save, sender=Coordinator)
def create_coordinator_user(sender, instance, created, **kwargs):
    """Auto-create user when coordinator is created"""
    if created:
        try:
            # If shift is both and no level(s) yet (M2M set after initial save),
            # defer user creation to the m2m_changed handler
            if getattr(instance, 'shift', None) == 'both':
                has_levels = (getattr(instance, 'level_id', None) is not None) or (
                    hasattr(instance, 'assigned_levels') and instance.assigned_levels.exists()
                )
                if not has_levels:
                    print("Deferring user creation until levels are attached (both shift)")
                    return
            
            # Check if user already exists
            from users.models import User
            if User.objects.filter(email=instance.email).exists():
                print(f"User already exists for coordinator {instance.full_name}")
                try:
                    existing_user = User.objects.filter(email=instance.email).first()
                    campus_name = instance.campus.campus_name if instance.campus else ''
                    verb = "You have been added as a Coordinator"
                    target_text = f"at {campus_name}" if campus_name else ""
                    create_notification(recipient=existing_user, actor=None, verb=verb, target_text=target_text, data={"coordinator_id": instance.id})
                except Exception:
                    pass
                return
            
            user, message = UserCreationService.create_user_from_entity(instance, 'coordinator')
            if not user:
                print(f"Failed to create user for coordinator {instance.id}: {message}")
            else:
                print(f"✅ Created user for coordinator: {instance.full_name} ({instance.employee_code})")
                try:
                    campus_name = instance.campus.campus_name if instance.campus else ''
                    verb = "You have been added as a Coordinator"
                    target_text = f"at {campus_name}" if campus_name else ""
                    create_notification(recipient=user, actor=None, verb=verb, target_text=target_text, data={"coordinator_id": instance.id})
                except Exception:
                    pass
        except Exception as e:
            print(f"Error creating user for coordinator {instance.id}: {str(e)}")

def _auto_assign_for_coordinator(instance):
    """Shared logic to auto-assign teachers based on coordinator's managed levels."""
    # Determine managed levels (supports shift 'both')
    managed_levels = []
    if getattr(instance, 'shift', None) == 'both' and hasattr(instance, 'assigned_levels') and instance.assigned_levels.exists():
        managed_levels = list(instance.assigned_levels.all())
    elif instance.level:
        managed_levels = [instance.level]

    level_name = ", ".join([lvl.name for lvl in managed_levels]) if managed_levels else "No Level"
    campus_name = instance.campus.campus_name if instance.campus else "No Campus"
    print(f"Coordinator sync: {instance.full_name} for {level_name} in {campus_name}")

    try:
        # Check if any level is assigned
        if not managed_levels:
            print(f"No level assigned to coordinator {instance.full_name}")
            return
            
        # Get grades for these levels
        grades = Grade.objects.filter(level__in=managed_levels)
        grade_names = [g.name for g in grades]
        
        if not grade_names:
            print(f"No grades found for level list: {level_name}")
            return
        
        # Find teachers for this campus who teach grades in these levels
        teachers = Teacher.objects.filter(
            current_campus=instance.campus,
            current_classes_taught__isnull=False
        )
        
        assigned_count = 0
        for teacher in teachers:
            try:
                # Extract grade from current_classes_taught
                classes_text = teacher.current_classes_taught.lower()
                grade_name = None
                
                # Try to extract grade from classes taught
                import re
                grade_match = re.search(r'grade\s*[-]?\s*(\d+)', classes_text)
                if grade_match:
                    grade_number = grade_match.group(1)
                    grade_name = f"Grade {grade_number}"  # Use space format to match database
                else:
                    # Check for Pre-Primary classes
                    if any(term in classes_text for term in ['nursery', 'kg-1', 'kg-2', 'kg1', 'kg2', 'kg-ii', 'kg-i']):
                        if 'nursery' in classes_text:
                            grade_name = 'Nursery'  # Fix typo
                        elif 'kg-1' in classes_text or 'kg1' in classes_text or 'kg-i' in classes_text:
                            grade_name = 'KG-I'  # Use database format
                        elif 'kg-2' in classes_text or 'kg2' in classes_text or 'kg-ii' in classes_text:
                            grade_name = 'KG-II'  # Use database format
                
                if grade_name and grade_name in grade_names:
                    # Add coordinator (not replace) - use ManyToMany
                    if instance not in teacher.assigned_coordinators.all():
                        teacher.assigned_coordinators.add(instance)
                        assigned_count += 1
                        print(f"Added coordinator {instance.full_name} to {teacher.full_name}")
                    
            except Exception as e:
                print(f"Error assigning teacher {teacher.full_name}: {str(e)}")
        
        print(f"Auto-assigned {assigned_count} teachers to coordinator {instance.full_name}")
        
    except Exception as e:
        print(f"Error auto-assigning teachers to coordinator {instance.full_name}: {str(e)}")


@receiver(post_save, sender=Coordinator)
def auto_assign_teachers_to_new_coordinator(sender, instance, created, **kwargs):
    """
    Automatically assign teachers to newly created coordinators
    """
    if created and instance.is_currently_active:
        _auto_assign_for_coordinator(instance)


@receiver(m2m_changed, sender=Coordinator.assigned_levels.through)
def on_assigned_levels_changed(sender, instance, action, reverse, model, pk_set, **kwargs):
    """Re-run auto assignment when assigned levels change for a coordinator."""
    if action in {"post_add", "post_remove", "post_clear"} and instance.is_currently_active:
        # If the coordinator doesn't yet have a user/employee code because we deferred on create,
        # attempt to create the user now that levels are available
        try:
            # Create user if there's not already a matching user by email or username.
            # Rationale: when Coordinator with shift 'both' is created DRF saves the model first
            # (employee_code gets generated) and assigned_levels are set after via M2M. The
            # post_save handler defers creation and relies on this m2m_changed handler to
            # finish user creation. We must not skip creation just because employee_code exists.
            from users.models import User
            user_exists = False
            if instance.email:
                user_exists = User.objects.filter(email__iexact=instance.email).exists()
            if not user_exists and instance.employee_code:
                user_exists = User.objects.filter(username=instance.employee_code).exists()

            if not user_exists:
                user, message = UserCreationService.create_user_from_entity(instance, 'coordinator')
                if not user:
                    print(f"Failed to create user after levels set for coordinator {instance.id}: {message}")
                else:
                    print(f"✅ Created user after levels set for coordinator: {instance.full_name} ({instance.employee_code})")
        except Exception as e:
            print(f"Error creating user after levels set for coordinator {instance.id}: {str(e)}")

        _auto_assign_for_coordinator(instance)