from django.contrib import admin
from django.core.exceptions import ValidationError
from .models import Teacher

@admin.register(Teacher)
class TeacherAdmin(admin.ModelAdmin):
    list_display = (
        "full_name",
        "email",
        "contact_number",
        "is_class_teacher",
        "assigned_classrooms_display",
        "current_campus",
        "get_coordinator_info",
        "shift",
        "employee_code",
        "is_deleted",
    )
    list_filter = ("is_class_teacher", "shift", "current_campus", "assigned_classroom", "assigned_coordinators", "is_deleted")
    search_fields = ("full_name", "email", "contact_number", "employee_code", "assigned_coordinators__full_name")
    ordering = ("-date_created",)
    
    # FIX: Exclude non-editable fields
    readonly_fields = ("employee_code", "teacher_id", "assigned_coordinator", "date_created", "date_updated", "deleted_at")
    
    def get_queryset(self, request):
        """Override to show soft-deleted teachers in admin"""
        qs = Teacher.objects.with_deleted().all()
        ordering = self.get_ordering(request)
        if ordering:
            qs = qs.order_by(*ordering)
        return qs
        
    # teachers/admin.py me ye fieldsets use karo
    fieldsets = (
        ('Personal Information', {
            'fields': (
                'full_name', 'dob', 'gender', 'contact_number', 'email', 
                'permanent_address', 'current_address', 'marital_status', 'cnic'
            )
        }),
        ('Education Information', {
            'fields': (
                'education_level', 'institution_name', 'year_of_passing', 
                'education_subjects', 'education_grade'
            ),
        }),
        ('Experience Information', {
            'fields': (
                'previous_institution_name', 'previous_position', 
                'experience_from_date', 'experience_to_date', 
                'total_experience_years'
            ),
        }),
        ('Current Role Information', {
            'fields': (
                'joining_date', 'current_role_title', 'current_campus', 'shift',
                'current_subjects', 'current_classes_taught', 'current_extra_responsibilities',
                'assigned_coordinators', 'is_currently_active'
            )
        }),
        ('Class Teacher Information', {
            'fields': ('is_class_teacher', 'class_teacher_level', 'class_teacher_grade', 'class_teacher_section', 'assigned_classroom'),
        }),
        ('System Fields', {
            'fields': ('employee_code', 'teacher_id', 'save_status', 'date_created', 'date_updated'),
        }),
    )

    def get_coordinator_info(self, obj):
        """Display coordinator information with level"""
        coordinators = obj.assigned_coordinators.all()
        if coordinators:
            coordinator_names = []
            for coordinator in coordinators:
                level_obj = getattr(coordinator, 'level', None)
                level_name = getattr(level_obj, 'name', None)
                if level_name:
                    coordinator_names.append(f"{coordinator.full_name} ({level_name})")
                else:
                    coordinator_names.append(f"{coordinator.full_name}")
            return ", ".join(coordinator_names)
        return "Not Assigned"
    get_coordinator_info.short_description = "Coordinators"
    get_coordinator_info.admin_order_field = "assigned_coordinators__full_name"

    def assigned_classrooms_display(self, obj):
        """Unified display: show M2M classrooms if present, else legacy single assignment."""
        try:
            if obj.assigned_classrooms.exists():
                return ", ".join(str(c) for c in obj.assigned_classrooms.all())
            if obj.assigned_classroom:
                return str(obj.assigned_classroom)
            return "-"
        except Exception:
            return "-"
    assigned_classrooms_display.short_description = "Assigned Classroom(s)"

    def clean(self):
        cleaned_data = super().clean()
        
        # Check if teacher is being assigned to a classroom that already has a class teacher
        if self.assigned_classroom and self.is_class_teacher:
            existing_teacher = Teacher.objects.filter(
                assigned_classroom=self.assigned_classroom,
                is_class_teacher=True
            ).exclude(pk=self.pk)
            
            if existing_teacher.exists():
                raise ValidationError(
                    f"Classroom {self.assigned_classroom} already has a class teacher: {existing_teacher.first().full_name}"
                )
        
        return cleaned_data
    
    # --- Override Delete to Use Soft Delete ---
    def delete_model(self, request, obj):
        """Override to use soft delete instead of hard delete for single object deletion"""
        obj._actor = request.user
        obj.soft_delete()
        self.message_user(request, f"✅ Teacher {obj.full_name} soft deleted successfully.", level='SUCCESS')
    
    def delete_queryset(self, request, queryset):
        """Override to use soft delete instead of hard delete for bulk deletion"""
        count = 0
        already_deleted = 0
        for obj in queryset:
            if not obj.is_deleted:
                obj._actor = request.user
                obj.soft_delete()
                count += 1
            else:
                already_deleted += 1
        message = f"✅ {count} teacher(s) soft deleted successfully."
        if already_deleted > 0:
            message += f" ({already_deleted} were already deleted)"
        self.message_user(request, message, level='SUCCESS')
