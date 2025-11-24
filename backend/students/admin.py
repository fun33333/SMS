# admin.py

from django.contrib import admin
from django.utils import timezone
from .models import Student


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = (
        "name", 
        "get_campus_name", 
        "current_grade",
        "section",
        "display_shift",
        "classroom", 
        "get_class_teacher",
        "is_deleted",
        "terminated_on", 
    )
    list_filter = ("campus", "classroom", "is_deleted")
    search_fields = ("name", "student_code", "gr_no")
    readonly_fields = ("student_code", "student_id", "gr_no", "created_at", "updated_at", "deleted_at")
    exclude = (
        "old_gr_number",          # removed per new requirements
        "transfer_reason",        # removed from UI flow
        "terminated_on",          # managed automatically
        "termination_reason",     # managed automatically
    )

    actions = ["mark_as_terminated", "soft_delete_students", "hard_delete_students", "restore_students"]

    # --- Custom Display Methods ---
    def get_campus_name(self, obj):
        if obj.campus:
            return f"{obj.campus.campus_name} ({obj.campus.campus_code})"
        elif obj.classroom and obj.classroom.campus:
            return f"{obj.classroom.campus.campus_name} ({obj.classroom.campus.campus_code})"
        return "No Campus"
    
    get_campus_name.short_description = "Campus"
    get_campus_name.admin_order_field = "campus__campus_name"
    
    def get_class_teacher(self, obj):
        """Display the class teacher for this student"""
        if obj.classroom and obj.classroom.class_teacher:
            return f"{obj.classroom.class_teacher.full_name} ({obj.classroom.class_teacher.employee_code})"
        return "No Teacher Assigned"
    
    get_class_teacher.short_description = "Class Teacher"
    get_class_teacher.admin_order_field = "classroom__class_teacher__name"
    
    def display_shift(self, obj):
        return obj.get_shift_display() if obj.shift else "-"
    display_shift.short_description = "Shift"
    display_shift.admin_order_field = "shift"

    # --- Custom Actions ---
    def mark_as_terminated(self, request, queryset):
        count = queryset.update(terminated_on=timezone.now())
        self.message_user(request, f"{count} student(s) marked as Terminated.")
    
    mark_as_terminated.short_description = "🛑 Terminate Selected Students"
    
    def soft_delete_students(self, request, queryset):
        count = 0
        already_deleted = 0
        for student in queryset:
            if not student.is_deleted:
                # Store student info before deletion for audit log
                student_id = student.id
                student_name = student.name
                
                student.soft_delete()
                
                # Get user name for audit log
                user = request.user
                user_name = user.get_full_name() if hasattr(user, 'get_full_name') else (user.username or 'Unknown')
                user_role = user.get_role_display() if hasattr(user, 'get_role_display') else (user.role or 'User')
                
                # Create audit log after soft deletion
                try:
                    from attendance.models import AuditLog
                    AuditLog.objects.create(
                        feature='student',
                        action='delete',
                        entity_type='Student',
                        entity_id=student_id,
                        user=user,
                        ip_address=request.META.get('REMOTE_ADDR'),
                        changes={'name': student_name, 'student_id': student_id},
                        reason=f'Student {student_name} soft deleted by {user_role} {user_name}'
                    )
                except Exception as e:
                    # Log error but don't fail the deletion
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to create audit log for student soft deletion: {str(e)}")
                
                count += 1
            else:
                already_deleted += 1
        
        message = f"✅ {count} student(s) soft deleted successfully."
        if already_deleted > 0:
            message += f" ({already_deleted} were already deleted)"
        self.message_user(request, message, level='SUCCESS')
    
    soft_delete_students.short_description = "🗑️ Soft Delete Selected Students"
    
    def hard_delete_students(self, request, queryset):
        count = 0
        errors = []
        for student in queryset:
            try:
                # Store student info before deletion for audit log
                student_id = student.id
                student_name = student.name
                
                # Create exit record before deletion
                from student_status.models import ExitRecord
                ExitRecord.objects.create(
                    student=student,
                    exit_type='termination',
                    reason='other',
                    other_reason='Deleted via admin panel',
                    date_of_effect=timezone.now().date(),
                    notes='Deleted via admin panel'
                )
                student.hard_delete()
                
                # Get user name for audit log
                user = request.user
                user_name = user.get_full_name() if hasattr(user, 'get_full_name') else (user.username or 'Unknown')
                user_role = user.get_role_display() if hasattr(user, 'get_role_display') else (user.role or 'User')
                
                # Create audit log after deletion
                try:
                    from attendance.models import AuditLog
                    AuditLog.objects.create(
                        feature='student',
                        action='delete',
                        entity_type='Student',
                        entity_id=student_id,
                        user=user,
                        ip_address=request.META.get('REMOTE_ADDR'),
                        changes={'name': student_name, 'student_id': student_id},
                        reason=f'Student {student_name} deleted by {user_role} {user_name}'
                    )
                except Exception as e:
                    # Log error but don't fail the deletion
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to create audit log for student deletion: {str(e)}")
                
                count += 1
            except Exception as e:
                errors.append(f"{student.name}: {str(e)}")
        
        message = f"💀 {count} student(s) permanently deleted."
        if errors:
            message += f" Errors: {', '.join(errors[:3])}"
            if len(errors) > 3:
                message += f" and {len(errors)-3} more..."
        self.message_user(request, message, level='SUCCESS' if not errors else 'WARNING')
    
    hard_delete_students.short_description = "💀 Hard Delete Selected Students (Permanent)"
    
    def restore_students(self, request, queryset):
        count = 0
        not_deleted = 0
        for student in queryset:
            if student.is_deleted:
                student.restore()
                count += 1
            else:
                not_deleted += 1
        
        message = f"♻️ {count} student(s) restored successfully."
        if not_deleted > 0:
            message += f" ({not_deleted} were not deleted)"
        self.message_user(request, message, level='SUCCESS')
    
    restore_students.short_description = "♻️ Restore Selected Students"

    # --- Permissions ---
    def has_delete_permission(self, request, obj=None):
        # Allow deletion for superusers
        return request.user.is_superuser



