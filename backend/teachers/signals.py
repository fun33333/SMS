from django.db.models.signals import post_save, pre_save, post_delete
from django.dispatch import receiver
from .models import Teacher
from services.user_creation_service import UserCreationService
from users.models import User
from notifications.services import create_notification
import sys

def safe_str(obj):
    """Safely convert object to string, handling Unicode encoding errors"""
    try:
        return str(obj)
    except UnicodeEncodeError:
        return repr(obj).encode('ascii', 'replace').decode('ascii')

@receiver(post_save, sender=Teacher)
def create_teacher_user(sender, instance, created, **kwargs):
    """Auto-create user when ANY teacher is created"""
    if created:  # Only on creation, not updates
        try:
            # Get actor from instance (set by viewset before save)
            actor = getattr(instance, '_actor', None)
            
            # Check if user already exists
            if User.objects.filter(email=instance.email).exists():
                print(f"User already exists for {instance.full_name}")
                try:
                    existing_user = User.objects.filter(email=instance.email).first()
                    campus_name = getattr(getattr(instance, 'current_campus', None), 'campus_name', '')
                    verb = "You have been added as a Teacher"
                    target_text = f"at {campus_name}" if campus_name else ""
                    create_notification(recipient=existing_user, actor=actor, verb=verb, target_text=target_text, data={"teacher_id": instance.id})
                except Exception:
                    pass
                return

            user, message = UserCreationService.create_user_from_entity(instance, 'teacher')
            if not user:
                print(f"Failed to create user for teacher {instance.id}: {message}")
            else:
                print(f"[OK] Created user for teacher: {instance.full_name} ({instance.employee_code})")
                try:
                    campus_name = getattr(getattr(instance, 'current_campus', None), 'campus_name', '')
                    verb = "You have been added as a Teacher"
                    target_text = f"at {campus_name}" if campus_name else ""
                    create_notification(recipient=user, actor=actor, verb=verb, target_text=target_text, data={"teacher_id": instance.id})
                except Exception:
                    pass
        except Exception as e:
            print(f"Error creating user for teacher {instance.id}: {str(e)}")

@receiver(pre_save, sender=Teacher)
def update_class_teacher_status(sender, instance, **kwargs):
    """Update class teacher status when classroom is assigned"""
    if instance.assigned_classroom and not instance.is_class_teacher:
        instance.is_class_teacher = True
    elif not instance.assigned_classroom and instance.is_class_teacher:
        instance.is_class_teacher = False

# NEW: Signal to sync classroom assignment when teacher is updated
@receiver(post_save, sender=Teacher)
def sync_teacher_classroom_assignment(sender, instance, created, **kwargs):
    """
    Jab teacher ko classroom assign karte hain, to classroom ki class_teacher field bhi update karo
    """
    if instance.assigned_classroom:
        # Classroom mein teacher assign karo
        classroom = instance.assigned_classroom
        if classroom.class_teacher != instance:
            classroom.class_teacher = instance
            classroom.save(update_fields=['class_teacher'])
            print(f"[OK] Synced: Classroom {classroom} assigned teacher {instance.full_name}")
    else:
        # Agar teacher se classroom remove kiya gaya hai
        # Pehle check karo ke koi classroom is teacher se assigned hai ya nahi
        try:
            from classes.models import ClassRoom
            classroom = ClassRoom.objects.get(class_teacher=instance)
            classroom.class_teacher = None
            classroom.save(update_fields=['class_teacher'])
            print(f"[OK] Synced: Classroom {classroom} removed teacher {instance.full_name}")
        except ClassRoom.DoesNotExist:
            pass  # Koi classroom assigned nahi tha

@receiver(post_save, sender=Teacher)
def auto_assign_teacher_to_coordinators(sender, instance, created, **kwargs):
    """
    Automatically assign teacher to coordinators based on their teaching levels
    """
    if not instance.is_currently_active or not instance.current_campus:
        return
    
    try:
        from coordinator.models import Coordinator
        
        # Get all active coordinators for this campus
        coordinators = Coordinator.objects.filter(
            campus=instance.current_campus,
            is_currently_active=True
        )
        
        assigned_count = 0
        for coordinator in coordinators:
            # Check if teacher teaches grades in this coordinator's levels
            if teacher_teaches_coordinator_levels(instance, coordinator):
                # Assign coordinator to teacher (this allows multiple coordinators per teacher)
                if coordinator not in instance.assigned_coordinators.all():
                    instance.assigned_coordinators.add(coordinator)
                    assigned_count += 1
                    print(f"[OK] Auto-assigned coordinator {coordinator.full_name} to teacher {instance.full_name}")
        
        if assigned_count > 0:
            print(f"[OK] Auto-assigned {assigned_count} coordinators to teacher {instance.full_name}")
            
    except Exception as e:
        print(f"Error auto-assigning coordinators to teacher {instance.full_name}: {str(e)}")

def teacher_teaches_coordinator_levels(teacher, coordinator):
    """Check if teacher teaches grades in coordinator's managed levels"""
    if not teacher.current_classes_taught:
        return False
    
    # Determine coordinator's managed levels
    managed_levels = []
    if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
        managed_levels = list(coordinator.assigned_levels.all())
    elif coordinator.level:
        managed_levels = [coordinator.level]
    else:
        return False
    
    # Get grades for these levels
    from classes.models import Grade
    grades = Grade.objects.filter(level__in=managed_levels)
    grade_names = [g.name for g in grades]
    
    if not grade_names:
        return False
    
    # Check if teacher teaches any of these grades
    classes_text = teacher.current_classes_taught.lower()
    
    # Map level names to grade patterns
    level_patterns = {
        'Pre-Primary': ['nursery', 'kg-1', 'kg-2', 'kg1', 'kg2', 'kg-i', 'kg-ii', 'pre-primary', 'pre primary'],
        'Primary': ['grade 1', 'grade 2', 'grade 3', 'grade 4', 'grade 5', 'grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5', 'primary'],
        'Secondary': ['grade 6', 'grade 7', 'grade 8', 'grade 9', 'grade 10', 'grade-6', 'grade-7', 'grade-8', 'grade-9', 'grade-10', 'secondary']
    }
    
    for level in managed_levels:
        patterns = level_patterns.get(level.name, [])
        if any(pattern in classes_text for pattern in patterns):
            return True
    
    return False

@receiver(post_save, sender=Teacher)
def notify_teacher_on_update(sender, instance, created, **kwargs):
    """Send notification to teacher when their profile is updated"""
    if not created:  # Only on updates, not creation
        try:
            # Get actor from instance (set by viewset before save)
            actor = getattr(instance, '_actor', None)
            
            # Find the teacher's user account - check user field first, then email/employee_code
            teacher_user = None
            if hasattr(instance, 'user') and instance.user:
                teacher_user = instance.user
            elif instance.email:
                teacher_user = User.objects.filter(email__iexact=instance.email).first()
            elif instance.employee_code:
                teacher_user = User.objects.filter(username=instance.employee_code).first()
            
            if teacher_user:
                campus_name = getattr(getattr(instance, 'current_campus', None), 'campus_name', '')
                actor_name = actor.get_full_name() if actor and hasattr(actor, 'get_full_name') else (str(actor) if actor else 'System')
                verb = "Your Teacher profile has been updated"
                target_text = f"by {actor_name}" + (f" at {campus_name}" if campus_name else "")
                create_notification(
                    recipient=teacher_user, 
                    actor=actor, 
                    verb=verb, 
                    target_text=target_text, 
                    data={"teacher_id": instance.id}
                )
                print(f"[OK] Sent update notification to teacher {instance.full_name} (user: {teacher_user.email})")
            else:
                print(f"[WARN] No user found for teacher {instance.full_name} (email: {instance.email}, employee_code: {instance.employee_code})")
        except Exception as e:
            error_msg = safe_str(e)
            print(f"[ERROR] Error sending update notification to teacher {instance.id}: {error_msg}")
            import traceback
            try:
                traceback.print_exc()
            except UnicodeEncodeError:
                print("[ERROR] Could not print traceback due to encoding error")

# Cleanup: when a Teacher is deleted, remove matching auth user
@receiver(post_delete, sender=Teacher)
def delete_user_when_teacher_deleted(sender, instance: Teacher, **kwargs):
    """Send notification before deleting teacher, then cleanup user"""
    try:
        # Get actor from instance (set by viewset before delete)
        actor = getattr(instance, '_actor', None)
        
        # Find the teacher's user account before deleting
        teacher_user = None
        if instance.email:
            teacher_user = User.objects.filter(email__iexact=instance.email).first()
        elif instance.employee_code:
            teacher_user = User.objects.filter(username=instance.employee_code).first()
        
        # Send notification before deletion
        if teacher_user:
            campus_name = getattr(getattr(instance, 'current_campus', None), 'campus_name', '')
            verb = "Your Teacher profile has been deleted"
            target_text = f"by {actor.get_full_name() if actor and hasattr(actor, 'get_full_name') else (str(actor) if actor else 'System')}" + (f" at {campus_name}" if campus_name else "")
            create_notification(
                recipient=teacher_user, 
                actor=actor, 
                verb=verb, 
                target_text=target_text, 
                data={"teacher_id": instance.id}
            )
            print(f"[OK] Sent deletion notification to teacher {instance.full_name}")
        
        # Now cleanup user
        if instance.email:
            User.objects.filter(email__iexact=instance.email).delete()
        if instance.employee_code:
            User.objects.filter(username=instance.employee_code).delete()
    except Exception as e:
        error_msg = safe_str(e)
        print(f"[ERROR] Error in delete_user_when_teacher_deleted: {error_msg}")