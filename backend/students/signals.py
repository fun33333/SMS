from django.db.models.signals import post_save, pre_save, post_delete
from django.db.models import Q
from django.dispatch import receiver
from .models import Student
from classes.models import ClassRoom
from teachers.models import Teacher
from coordinator.models import Coordinator
from notifications.services import create_notification
from users.models import User
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Student)
def notify_student_operations(sender, instance, created, **kwargs):
    """
    Send notifications for student create/update operations
    """
    try:
        # Get actor from instance (set by viewset before save)
        actor = getattr(instance, '_actor', None)
        
        if created:
            # New student created - notify teacher and coordinator
            verb = f"New student {instance.name} has been added"
            target_text = f"to your class" if instance.classroom else ""
            
            # Notify class teacher
            if instance.classroom and instance.classroom.class_teacher:
                teacher = instance.classroom.class_teacher
                if teacher.user:
                    create_notification(
                        recipient=teacher.user,
                        actor=actor,
                        verb=verb,
                        target_text=target_text,
                        data={"student_id": instance.id, "student_name": instance.name}
                    )
                    logger.info(f"[OK] Sent create notification to teacher {teacher.full_name} for student {instance.name}")
            
            # Notify coordinator
            if instance.classroom and instance.classroom.grade and instance.classroom.grade.level:
                level = instance.classroom.grade.level
                coordinators = Coordinator.objects.filter(
                    Q(level=level) | Q(assigned_levels=level),
                    is_currently_active=True
                ).distinct()
                
                for coordinator in coordinators:
                    if coordinator.email:
                        coordinator_user = User.objects.filter(email__iexact=coordinator.email).first()
                        if coordinator_user:
                            create_notification(
                                recipient=coordinator_user,
                                actor=actor,
                                verb=verb,
                                target_text=target_text,
                                data={"student_id": instance.id, "student_name": instance.name}
                            )
                            logger.info(f"[OK] Sent create notification to coordinator {coordinator.full_name} for student {instance.name}")
        else:
            # Student updated - notify teacher and coordinator
            verb = f"Student {instance.name}'s profile has been updated"
            target_text = f"by {actor.get_full_name() if actor and hasattr(actor, 'get_full_name') else (str(actor) if actor else 'System')}"
            
            # Notify class teacher
            if instance.classroom and instance.classroom.class_teacher:
                teacher = instance.classroom.class_teacher
                if teacher.user:
                    create_notification(
                        recipient=teacher.user,
                        actor=actor,
                        verb=verb,
                        target_text=target_text,
                        data={"student_id": instance.id, "student_name": instance.name}
                    )
                    logger.info(f"[OK] Sent update notification to teacher {teacher.full_name} for student {instance.name}")
            
            # Notify coordinator
            if instance.classroom and instance.classroom.grade and instance.classroom.grade.level:
                level = instance.classroom.grade.level
                coordinators = Coordinator.objects.filter(
                    Q(level=level) | Q(assigned_levels=level),
                    is_currently_active=True
                ).distinct()
                
                for coordinator in coordinators:
                    if coordinator.email:
                        coordinator_user = User.objects.filter(email__iexact=coordinator.email).first()
                        if coordinator_user:
                            create_notification(
                                recipient=coordinator_user,
                                actor=actor,
                                verb=verb,
                                target_text=target_text,
                                data={"student_id": instance.id, "student_name": instance.name}
                            )
                            logger.info(f"[OK] Sent update notification to coordinator {coordinator.full_name} for student {instance.name}")
    except Exception as e:
        logger.error(f"Error sending student notification: {str(e)}")
    
    # Continue with existing assignment logic
    if created:
        # New student - assign teacher and coordinator
        assign_student_to_teacher_and_coordinator(instance)
    else:
        # Existing student - check if classroom changed
        if hasattr(instance, '_previous_classroom') and instance._previous_classroom != instance.classroom:
            logger.info(f"Student {instance.name} classroom changed from {instance._previous_classroom} to {instance.classroom}")
            
            # Notify old classroom teacher (if exists)
            old_classroom = instance._previous_classroom
            if old_classroom and old_classroom.class_teacher:
                old_teacher = old_classroom.class_teacher
                if old_teacher.user:
                    verb = f"Student {instance.name} has been moved"
                    target_text = f"from your class ({old_classroom.grade.name if old_classroom.grade else 'N/A'} - {old_classroom.section})"
                    create_notification(
                        recipient=old_teacher.user,
                        actor=actor,
                        verb=verb,
                        target_text=target_text,
                        data={"student_id": instance.id, "student_name": instance.name, "old_classroom_id": old_classroom.id}
                    )
                    logger.info(f"[OK] Sent classroom change notification to old teacher {old_teacher.full_name} for student {instance.name}")
            
            # Notify new classroom teacher (if exists)
            new_classroom = instance.classroom
            if new_classroom and new_classroom.class_teacher:
                new_teacher = new_classroom.class_teacher
                if new_teacher.user:
                    verb = f"Student {instance.name} has been assigned"
                    target_text = f"to your class ({new_classroom.grade.name if new_classroom.grade else 'N/A'} - {new_classroom.section})"
                    create_notification(
                        recipient=new_teacher.user,
                        actor=actor,
                        verb=verb,
                        target_text=target_text,
                        data={"student_id": instance.id, "student_name": instance.name, "new_classroom_id": new_classroom.id}
                    )
                    logger.info(f"[OK] Sent classroom assignment notification to new teacher {new_teacher.full_name} for student {instance.name}")
            
            assign_student_to_teacher_and_coordinator(instance)

@receiver(post_delete, sender=Student)
def notify_student_deletion(sender, instance, **kwargs):
    """
    Send notification when student is deleted
    """
    try:
        # Get actor from instance (set by viewset before delete)
        actor = getattr(instance, '_actor', None)
        
        verb = f"Student {instance.name} has been deleted"
        target_text = f"by {actor.get_full_name() if actor and hasattr(actor, 'get_full_name') else (str(actor) if actor else 'System')}"
        
        # Notify class teacher (if classroom still exists in memory)
        if hasattr(instance, 'classroom') and instance.classroom and instance.classroom.class_teacher:
            teacher = instance.classroom.class_teacher
            if teacher.user:
                create_notification(
                    recipient=teacher.user,
                    actor=actor,
                    verb=verb,
                    target_text=target_text,
                    data={"student_id": instance.id, "student_name": instance.name}
                )
                logger.info(f"[OK] Sent deletion notification to teacher {teacher.full_name} for student {instance.name}")
        
        # Notify coordinator (if classroom still exists in memory)
        if hasattr(instance, 'classroom') and instance.classroom and instance.classroom.grade and instance.classroom.grade.level:
            level = instance.classroom.grade.level
            coordinators = Coordinator.objects.filter(
                Q(level=level) | Q(assigned_levels=level),
                is_currently_active=True
            ).distinct()
            
            for coordinator in coordinators:
                if coordinator.email:
                    coordinator_user = User.objects.filter(email__iexact=coordinator.email).first()
                    if coordinator_user:
                        create_notification(
                            recipient=coordinator_user,
                            actor=actor,
                            verb=verb,
                            target_text=target_text,
                            data={"student_id": instance.id, "student_name": instance.name}
                        )
                        logger.info(f"[OK] Sent deletion notification to coordinator {coordinator.full_name} for student {instance.name}")
    except Exception as e:
        logger.error(f"Error sending student deletion notification: {str(e)}")


@receiver(pre_save, sender=Student)
def store_previous_classroom(sender, instance, **kwargs):
    """
    Store previous classroom before save to detect changes
    """
    if instance.pk:
        try:
            old_instance = Student.objects.get(pk=instance.pk)
            instance._previous_classroom = old_instance.classroom
        except Student.DoesNotExist:
            instance._previous_classroom = None
    else:
        instance._previous_classroom = None


def assign_student_to_teacher_and_coordinator(student):
    """
    Assign student to appropriate teacher and coordinator based on academic details
    """
    try:
        # Get student's classroom
        classroom = student.classroom
        if not classroom:
            logger.warning(f"No classroom found for student {student.name}")
            return
        
        # Get classroom teacher
        class_teacher = classroom.class_teacher
        if class_teacher:
            logger.info(f"Student {student.name} is in classroom {classroom} with teacher {class_teacher.full_name}")
            
            # Auto-assign teacher to coordinators if not already assigned
            auto_assign_teacher_to_coordinators(class_teacher)
        else:
            logger.warning(f"No class teacher found for classroom {classroom}")
        
        # Note: Student model doesn't have coordinator fields, 
        # but teacher-coordinator assignment is handled above
        
    except Exception as e:
        logger.error(f"Error assigning student {student.name}: {str(e)}")


def auto_assign_teacher_to_coordinators(teacher):
    """
    Auto-assign teacher to coordinators based on teaching levels
    """
    try:
        # Get coordinators who manage the teacher's levels
        if teacher.assigned_classroom:
            classroom = teacher.assigned_classroom
            level = classroom.grade.level
            
            # Find coordinators for this level
            coordinators = Coordinator.objects.filter(
                level=level,
                is_currently_active=True
            )
            
            # Also check coordinators with assigned_levels
            coordinators_with_levels = Coordinator.objects.filter(
                assigned_levels=level,
                is_currently_active=True
            )
            
            all_coordinators = coordinators.union(coordinators_with_levels)
            
            # Assign teacher to coordinators
            for coordinator in all_coordinators:
                if not teacher.assigned_coordinators.filter(id=coordinator.id).exists():
                    teacher.assigned_coordinators.add(coordinator)
                    logger.info(f"Auto-assigned teacher {teacher.full_name} to coordinator {coordinator.full_name}")
        
        # Also handle assigned_classrooms (for multi-classroom teachers)
        for classroom in teacher.assigned_classrooms.all():
            level = classroom.grade.level
            
            coordinators = Coordinator.objects.filter(
                level=level,
                is_currently_active=True
            )
            
            coordinators_with_levels = Coordinator.objects.filter(
                assigned_levels=level,
                is_currently_active=True
            )
            
            all_coordinators = coordinators.union(coordinators_with_levels)
            
            for coordinator in all_coordinators:
                if not teacher.assigned_coordinators.filter(id=coordinator.id).exists():
                    teacher.assigned_coordinators.add(coordinator)
                    logger.info(f"Auto-assigned teacher {teacher.full_name} to coordinator {coordinator.full_name} (via classroom {classroom})")
                    
    except Exception as e:
        logger.error(f"Error auto-assigning teacher {teacher.full_name} to coordinators: {str(e)}")




@receiver(post_save, sender=ClassRoom)
def update_classroom_assignments(sender, instance, created, **kwargs):
    """
    When classroom changes, update all students in that classroom
    """
    if not created:  # Only for updates, not new classrooms
        try:
            # Get all students in this classroom
            students = Student.objects.filter(classroom=instance)
            
            for student in students:
                # Re-assign student to teacher and coordinators
                assign_student_to_teacher_and_coordinator(student)
                
            logger.info(f"Updated assignments for {students.count()} students in classroom {instance}")
            
        except Exception as e:
            logger.error(f"Error updating classroom assignments for {instance}: {str(e)}")


@receiver(post_save, sender=Teacher)
def update_teacher_assignments(sender, instance, created, **kwargs):
    """
    When teacher's classroom assignments change, update coordinator assignments
    """
    if not created:  # Only for updates
        try:
            # Auto-assign teacher to coordinators
            auto_assign_teacher_to_coordinators(instance)
            
            # Update all students in classrooms assigned to this teacher
            students = Student.objects.filter(classroom__class_teacher=instance)
            for student in students:
                assign_student_to_teacher_and_coordinator(student)
                
            logger.info(f"Updated assignments for teacher {instance.full_name}")
            
        except Exception as e:
            logger.error(f"Error updating teacher assignments for {instance.full_name}: {str(e)}")
