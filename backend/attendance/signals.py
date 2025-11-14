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
        # Get all levels (from levels M2M or fallback to level field)
        target_levels = list(instance.levels.all())
        if not target_levels and instance.level:
            target_levels = [instance.level]
        
        if not target_levels:
            print(f"[WARN] Holiday {instance.id} has no levels assigned")
            return
        
        # Get all grades if specified
        target_grades = list(instance.grades.all())
        
        # Determine which classrooms to notify
        if target_grades:
            # Notify only classrooms in selected grades
            classrooms = ClassRoom.objects.filter(grade__in=target_grades).select_related('class_teacher', 'grade', 'grade__level')
        else:
            # Notify all classrooms in selected levels
            classrooms = ClassRoom.objects.filter(grade__level__in=target_levels).select_related('class_teacher', 'grade', 'grade__level')
        
        level_names = ', '.join([l.name for l in target_levels])
        print(f"[DEBUG] Found {classrooms.count()} classrooms for levels {level_names}")
        
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
        
        # Method 2: Get teachers directly assigned to classrooms in selected levels
        teachers_from_classrooms = Teacher.objects.filter(
            assigned_classrooms__grade__level__in=target_levels,
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
            Q(level__in=target_levels) | Q(assigned_levels__in=target_levels),
            is_currently_active=True
        ).distinct()
        print(f"[DEBUG] Found {coordinators_for_level.count()} coordinators for levels {level_names}")
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
        
        # Method 4: Get all active teachers in the campuses of selected levels (fallback)
        campus_ids = [l.campus.id for l in target_levels if l.campus]
        if campus_ids:
            campus_teachers = Teacher.objects.filter(
                current_campus__id__in=campus_ids,
                is_currently_active=True
            ).select_related('user')
            print(f"[DEBUG] Found {campus_teachers.count()} active teachers in campuses")
            # Only add if they teach grades in selected levels
            for teacher in campus_teachers:
                # Check if teacher teaches any grade in selected levels
                teacher_grades = teacher.assigned_classrooms.filter(grade__level__in=target_levels).values_list('grade', flat=True).distinct()
                if teacher_grades.exists() and teacher.user:
                    teacher_users.add(teacher.user)
                    print(f"[DEBUG] Found teacher user: {teacher.user.email} from campus (teaches grades in selected levels)")
        
        print(f"[DEBUG] Total unique teacher users found: {len(teacher_users)}")
        if len(teacher_users) == 0:
            print(f"[WARN] No teachers found for levels {level_names}. Check if:")
            print(f"  - Classrooms have class_teacher assigned")
            print(f"  - Teachers have user accounts linked")
            print(f"  - Teachers are assigned to coordinators for these levels")
        
        # Get all principals for the campuses of selected levels
        principal_users = set()
        if campus_ids:
            principals = Principal.objects.filter(
                campus__id__in=campus_ids,
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
        grade_text = f" (Grades: {', '.join([g.name for g in target_grades])})" if target_grades else ""
        target_text = f"by {coordinator_name} for {level_names}{grade_text} on {instance.date.strftime('%B %d, %Y')}: {instance.reason}"
        
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
                    'level_ids': [l.id for l in target_levels],
                    'level_names': level_names,
                    'grade_ids': [g.id for g in target_grades] if target_grades else [],
                    'grade_names': ', '.join([g.name for g in target_grades]) if target_grades else 'All Grades',
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
                    'level_ids': [l.id for l in target_levels],
                    'level_names': level_names,
                    'grade_ids': [g.id for g in target_grades] if target_grades else [],
                    'grade_names': ', '.join([g.name for g in target_grades]) if target_grades else 'All Grades',
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
        # Get all levels (from levels M2M or fallback to level field)
        target_levels = list(instance.levels.all())
        if not target_levels and instance.level:
            target_levels = [instance.level]
        
        if not target_levels:
            print(f"[WARN] Holiday {instance.id} has no levels assigned")
            return
        
        holiday_date = instance.date
        holiday_reason = instance.reason
        target_grades = list(instance.grades.all())
        
        # Determine which classrooms to notify
        if target_grades:
            classrooms = ClassRoom.objects.filter(grade__in=target_grades).select_related('class_teacher', 'grade', 'grade__level')
        else:
            classrooms = ClassRoom.objects.filter(grade__level__in=target_levels).select_related('class_teacher', 'grade', 'grade__level')
        
        # Get all unique teachers
        teacher_users = set()
        
        # Method 1: Get teachers from classrooms
        for classroom in classrooms:
            if classroom.class_teacher and classroom.class_teacher.user:
                teacher_users.add(classroom.class_teacher.user)
        
        # Method 2: Get teachers directly assigned to classrooms in selected levels
        teachers_from_classrooms = Teacher.objects.filter(
            assigned_classrooms__grade__level__in=target_levels,
            is_currently_active=True
        ).select_related('user').distinct()
        for teacher in teachers_from_classrooms:
            if teacher.user:
                teacher_users.add(teacher.user)
        
        # Method 3: Get teachers via coordinator's assigned_teachers
        from coordinator.models import Coordinator
        coordinators_for_level = Coordinator.objects.filter(
            Q(level__in=target_levels) | Q(assigned_levels__in=target_levels),
            is_currently_active=True
        ).distinct()
        for coord in coordinators_for_level:
            assigned_teachers = coord.assigned_teachers.filter(is_currently_active=True)
            for teacher in assigned_teachers:
                if teacher.user:
                    teacher_users.add(teacher.user)
        
        # Get all principals for the campuses of selected levels
        principal_users = set()
        campus_ids = [l.campus.id for l in target_levels if l.campus]
        if campus_ids:
            principals = Principal.objects.filter(
                campus__id__in=campus_ids,
                is_currently_active=True
            ).select_related('user')
            for principal in principals:
                if principal.user:
                    principal_users.add(principal.user)
        
        # Send notifications
        actor = instance.created_by if instance.created_by else None
        coordinator_name = actor.get_full_name() if actor and hasattr(actor, 'get_full_name') else (str(actor) if actor else 'System')
        verb = "Holiday deleted"
        level_names = ', '.join([l.name for l in target_levels])
        grade_text = f" (Grades: {', '.join([g.name for g in target_grades])})" if target_grades else ""
        target_text = f"by {coordinator_name} for {level_names}{grade_text} on {holiday_date.strftime('%B %d, %Y')}: {holiday_reason}"
        
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
                    'level_ids': [l.id for l in target_levels],
                    'level_names': level_names,
                    'grade_ids': [g.id for g in target_grades] if target_grades else [],
                    'grade_names': ', '.join([g.name for g in target_grades]) if target_grades else 'All Grades',
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
                    'level_ids': [l.id for l in target_levels],
                    'level_names': level_names,
                    'grade_ids': [g.id for g in target_grades] if target_grades else [],
                    'grade_names': ', '.join([g.name for g in target_grades]) if target_grades else 'All Grades',
                    'action': 'deleted'
                }
            )
        
        print(f"[OK] Sent holiday delete notifications to {len(teacher_users)} teachers and {len(principal_users)} principals")
    except Exception as notif_error:
        print(f"[WARN] Failed to send holiday delete notifications: {notif_error}")
        import traceback
        print(f"[WARN] Traceback: {traceback.format_exc()}")
