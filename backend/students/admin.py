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
    
    def get_queryset(self, request):
        """Override to show soft-deleted students in admin"""
        qs = Student.objects.with_deleted().all()
        ordering = self.get_ordering(request)
        if ordering:
            qs = qs.order_by(*ordering)
        return qs
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
                student.soft_delete()
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

    # --- Override Delete to Use Soft Delete ---
    def delete_model(self, request, obj):
        """Override to use soft delete instead of hard delete"""
        obj._actor = request.user
        obj.soft_delete()
        
        # Create audit log
        try:
            from attendance.models import AuditLog
            AuditLog.objects.create(
                feature='student',
                action='delete',
                entity_type='Student',
                entity_id=obj.id,
                user=request.user,
                ip_address=request.META.get('REMOTE_ADDR'),
                changes={'name': obj.name, 'student_id': obj.id, 'campus_id': obj.campus.id if obj.campus else None},
                reason=f'Student {obj.name} deleted by admin user {request.user.get_full_name() or request.user.username}'
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create audit log for student deletion: {str(e)}")
    
    def delete_queryset(self, request, queryset):
        """Override bulk delete to use soft delete"""
        count = 0
        for obj in queryset:
            obj._actor = request.user
            if not obj.is_deleted:
                obj.soft_delete()
                count += 1
                
                # Create audit log for each deletion
                try:
                    from attendance.models import AuditLog
                    AuditLog.objects.create(
                        feature='student',
                        action='delete',
                        entity_type='Student',
                        entity_id=obj.id,
                        user=request.user,
                        ip_address=request.META.get('REMOTE_ADDR'),
                        changes={'name': obj.name, 'student_id': obj.id, 'campus_id': obj.campus.id if obj.campus else None},
                        reason=f'Student {obj.name} deleted by admin user {request.user.get_full_name() or request.user.username}'
                    )
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to create audit log for student deletion: {str(e)}")
        
        self.message_user(request, f"✅ {count} student(s) soft deleted successfully.", level='SUCCESS')

    # --- Permissions ---
    def has_delete_permission(self, request, obj=None):
        # Allow deletion for superusers
        return request.user.is_superuser



