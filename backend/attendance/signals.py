from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from django.db.models import Q
from .models import Holiday
from notifications.services import create_notification
from teachers.models import Teacher
from principals.models import Principal
from classes.models import ClassRoom

User = get_user_model()


@receiver(post_save, sender=Holiday)
def notify_holiday_created_or_updated(sender, instance, created, **kwargs):
    """Send notifications to teachers and principals when holiday is created or updated"""
    try:
        target_level = instance.level
        
        # Get all classrooms for this level
        classrooms = ClassRoom.objects.filter(grade__level=target_level).select_related('class_teacher', 'grade', 'grade__level')
        print(f"[DEBUG] Found {classrooms.count()} classrooms for level {target_level.name}")
        
        # Get all unique teachers for this level
        teacher_users = set()
        
        # Method 1: Get teachers from classrooms
        for classroom in classrooms:
            if classroom.class_teacher:
                teacher = classroom.class_teacher
                teacher_user = None
                
                # Try to find user: first check user field, then email, then employee_code
                if teacher.user:
                    teacher_user = teacher.user
                elif teacher.email:
                    teacher_user = User.objects.filter(email__iexact=teacher.email).first()
                    if teacher_user:
                        # Link the user to teacher if not already linked
                        teacher.user = teacher_user
                        teacher.save(update_fields=['user'])
                        print(f"[OK] Linked user {teacher_user.email} to teacher {teacher.full_name}")
                elif teacher.employee_code:
                    teacher_user = User.objects.filter(username=teacher.employee_code).first()
                    if teacher_user:
                        # Link the user to teacher if not already linked
                        teacher.user = teacher_user
                        teacher.save(update_fields=['user'])
                        print(f"[OK] Linked user {teacher_user.username} to teacher {teacher.full_name}")
                
                if teacher_user:
                    teacher_users.add(teacher_user)
                    print(f"[DEBUG] Found teacher user: {teacher_user.email} from classroom {classroom.code}")
                else:
                    print(f"[WARN] Teacher {teacher.full_name} (ID: {teacher.id}) has no user account (email: {teacher.email}, employee_code: {teacher.employee_code})")
        
        # Method 2: Get teachers directly assigned to classrooms in this level
        teachers_from_classrooms = Teacher.objects.filter(
            assigned_classrooms__grade__level=target_level,
            is_currently_active=True
        ).select_related('user').prefetch_related('assigned_classrooms', 'assigned_classrooms__grade', 'assigned_classrooms__grade__level').distinct()
        print(f"[DEBUG] Found {teachers_from_classrooms.count()} teachers from assigned_classrooms")
        for teacher in teachers_from_classrooms:
            teacher_user = None
            
            # Try to find user: first check user field, then email, then employee_code
            if teacher.user:
                teacher_user = teacher.user
            elif teacher.email:
                teacher_user = User.objects.filter(email__iexact=teacher.email).first()
                if teacher_user:
                    # Link the user to teacher if not already linked
                    teacher.user = teacher_user
                    teacher.save(update_fields=['user'])
                    print(f"[OK] Linked user {teacher_user.email} to teacher {teacher.full_name}")
            elif teacher.employee_code:
                teacher_user = User.objects.filter(username=teacher.employee_code).first()
                if teacher_user:
                    # Link the user to teacher if not already linked
                    teacher.user = teacher_user
                    teacher.save(update_fields=['user'])
                    print(f"[OK] Linked user {teacher_user.username} to teacher {teacher.full_name}")
            
            if teacher_user:
                teacher_users.add(teacher_user)
                print(f"[DEBUG] Found teacher user: {teacher_user.email} from assigned classrooms")
            else:
                print(f"[WARN] Teacher {teacher.full_name} (ID: {teacher.id}) has no user account (email: {teacher.email}, employee_code: {teacher.employee_code})")
        
        # Method 3: Get teachers via coordinator's assigned_teachers (ManyToMany)
        from coordinator.models import Coordinator
        coordinators_for_level = Coordinator.objects.filter(
            Q(level=target_level) | Q(assigned_levels=target_level),
            is_currently_active=True
        ).distinct()
        print(f"[DEBUG] Found {coordinators_for_level.count()} coordinators for level {target_level.name}")
        for coord in coordinators_for_level:
            assigned_teachers = coord.assigned_teachers.filter(is_currently_active=True)
            print(f"[DEBUG] Coordinator {coord.full_name} has {assigned_teachers.count()} assigned teachers")
            for teacher in assigned_teachers:
                teacher_user = None
                
                # Try to find user: first check user field, then email, then employee_code
                if teacher.user:
                    teacher_user = teacher.user
                elif teacher.email:
                    teacher_user = User.objects.filter(email__iexact=teacher.email).first()
                    if teacher_user:
                        # Link the user to teacher if not already linked
                        teacher.user = teacher_user
                        teacher.save(update_fields=['user'])
                        print(f"[OK] Linked user {teacher_user.email} to teacher {teacher.full_name}")
                elif teacher.employee_code:
                    teacher_user = User.objects.filter(username=teacher.employee_code).first()
                    if teacher_user:
                        # Link the user to teacher if not already linked
                        teacher.user = teacher_user
                        teacher.save(update_fields=['user'])
                        print(f"[OK] Linked user {teacher_user.username} to teacher {teacher.full_name}")
                
                if teacher_user:
                    teacher_users.add(teacher_user)
                    print(f"[DEBUG] Found teacher user: {teacher_user.email} from coordinator {coord.full_name}")
                else:
                    print(f"[WARN] Teacher {teacher.full_name} (ID: {teacher.id}) assigned to coordinator {coord.full_name} has no user account (email: {teacher.email}, employee_code: {teacher.employee_code})")
        
        # Method 4: Get all active teachers in the campus of this level (fallback)
        if target_level.campus:
            campus_teachers = Teacher.objects.filter(
                current_campus=target_level.campus,
                is_currently_active=True
            ).select_related('user')
            print(f"[DEBUG] Found {campus_teachers.count()} active teachers in campus {target_level.campus.campus_name}")
            # Only add if they teach grades in this level
            for teacher in campus_teachers:
                # Check if teacher teaches any grade in this level
                teacher_grades = teacher.assigned_classrooms.filter(grade__level=target_level).values_list('grade', flat=True).distinct()
                if teacher_grades.exists() and teacher.user:
                    teacher_users.add(teacher.user)
                    print(f"[DEBUG] Found teacher user: {teacher.user.email} from campus (teaches grades in this level)")
        
        print(f"[DEBUG] Total unique teacher users found: {len(teacher_users)}")
        if len(teacher_users) == 0:
            print(f"[WARN] No teachers found for level {target_level.name}. Check if:")
            print(f"  - Classrooms have class_teacher assigned")
            print(f"  - Teachers have user accounts linked")
            print(f"  - Teachers are assigned to coordinators for this level")
        
        # Get all principals for the campus of this level
        principal_users = set()
        if target_level.campus:
            principals = Principal.objects.filter(
                campus=target_level.campus,
                is_currently_active=True
            ).select_related('user')
            for principal in principals:
                if principal.user:
                    principal_users.add(principal.user)
                    print(f"[DEBUG] Found principal user: {principal.user.email}")
        
        # Send notifications
        actor = instance.created_by if instance.created_by else None
        coordinator_name = actor.get_full_name() if actor and hasattr(actor, 'get_full_name') else (str(actor) if actor else 'System')
        action_text = 'created' if created else 'updated'
        verb = f"Holiday {action_text}"
        target_text = f"by {coordinator_name} for {target_level.name} on {instance.date.strftime('%B %d, %Y')}: {instance.reason}"
        
        # Notify all teachers
        for teacher_user in teacher_users:
            create_notification(
                recipient=teacher_user,
                actor=actor,
                verb=verb,
                target_text=target_text,
                data={
                    'holiday_id': instance.id,
                    'date': str(instance.date),
                    'reason': instance.reason,
                    'level_id': target_level.id,
                    'level_name': str(target_level),
                    'action': action_text
                }
            )
        
        # Notify all principals
        for principal_user in principal_users:
            create_notification(
                recipient=principal_user,
                actor=actor,
                verb=verb,
                target_text=target_text,
                data={
                    'holiday_id': instance.id,
                    'date': str(instance.date),
                    'reason': instance.reason,
                    'level_id': target_level.id,
                    'level_name': str(target_level),
                    'action': action_text
                }
            )
        
        print(f"[OK] Sent holiday {action_text} notifications to {len(teacher_users)} teachers and {len(principal_users)} principals")
    except Exception as notif_error:
        print(f"[WARN] Failed to send holiday notifications: {notif_error}")
        import traceback
        print(f"[WARN] Traceback: {traceback.format_exc()}")


@receiver(post_delete, sender=Holiday)
def notify_holiday_deleted(sender, instance, **kwargs):
    """Send notifications to teachers and principals when holiday is deleted"""
    try:
        target_level = instance.level
        holiday_date = instance.date
        holiday_reason = instance.reason
        
        # Get all classrooms for this level
        classrooms = ClassRoom.objects.filter(grade__level=target_level).select_related('class_teacher', 'grade', 'grade__level')
        
        # Get all unique teachers for this level
        teacher_users = set()
        
        # Method 1: Get teachers from classrooms
        for classroom in classrooms:
            if classroom.class_teacher and classroom.class_teacher.user:
                teacher_users.add(classroom.class_teacher.user)
        
        # Method 2: Get teachers directly assigned to classrooms in this level
        teachers_from_classrooms = Teacher.objects.filter(
            assigned_classrooms__grade__level=target_level,
            is_currently_active=True
        ).select_related('user').distinct()
        for teacher in teachers_from_classrooms:
            if teacher.user:
                teacher_users.add(teacher.user)
        
        # Method 3: Get teachers via coordinator's assigned_teachers
        from coordinator.models import Coordinator
        coordinators_for_level = Coordinator.objects.filter(
            Q(level=target_level) | Q(assigned_levels=target_level),
            is_currently_active=True
        ).distinct()
        for coord in coordinators_for_level:
            assigned_teachers = coord.assigned_teachers.filter(is_currently_active=True)
            for teacher in assigned_teachers:
                if teacher.user:
                    teacher_users.add(teacher.user)
        
        # Get all principals for the campus of this level
        principal_users = set()
        if target_level.campus:
            principals = Principal.objects.filter(
                campus=target_level.campus,
                is_currently_active=True
            ).select_related('user')
            for principal in principals:
                if principal.user:
                    principal_users.add(principal.user)
        
        # Send notifications
        actor = instance.created_by if instance.created_by else None
        coordinator_name = actor.get_full_name() if actor and hasattr(actor, 'get_full_name') else (str(actor) if actor else 'System')
        verb = "Holiday deleted"
        target_text = f"by {coordinator_name} for {target_level.name} on {holiday_date.strftime('%B %d, %Y')}: {holiday_reason}"
        
        # Notify all teachers
        for teacher_user in teacher_users:
            create_notification(
                recipient=teacher_user,
                actor=actor,
                verb=verb,
                target_text=target_text,
                data={
                    'holiday_id': instance.id,
                    'date': str(holiday_date),
                    'reason': holiday_reason,
                    'level_id': target_level.id,
                    'level_name': str(target_level),
                    'action': 'deleted'
                }
            )
        
        # Notify all principals
        for principal_user in principal_users:
            create_notification(
                recipient=principal_user,
                actor=actor,
                verb=verb,
                target_text=target_text,
                data={
                    'holiday_id': instance.id,
                    'date': str(holiday_date),
                    'reason': holiday_reason,
                    'level_id': target_level.id,
                    'level_name': str(target_level),
                    'action': 'deleted'
                }
            )
        
        print(f"[OK] Sent holiday delete notifications to {len(teacher_users)} teachers and {len(principal_users)} principals")
    except Exception as notif_error:
        print(f"[WARN] Failed to send holiday delete notifications: {notif_error}")
        import traceback
        print(f"[WARN] Traceback: {traceback.format_exc()}")
