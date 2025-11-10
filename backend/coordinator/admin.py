# backend/coordinator/admin.py
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.utils.html import format_html
from .models import Coordinator
from classes.models import Level

@admin.register(Coordinator)
class CoordinatorAdmin(admin.ModelAdmin):
    list_display = (
        "full_name",
        "email",
        "contact_number", 
        "gender",
        "display_levels",
        "campus",
        "assigned_teachers_count",
        "is_currently_active",  
        "created_at",
    )
    list_filter = ("level", "campus", "is_currently_active", "gender") 
    search_fields = ("full_name", "email", "contact_number", "cnic")  
    ordering = ("-created_at",)
    autocomplete_fields = ("campus",)  
    
    def display_levels(self, obj):
        """Display assigned levels based on whether coordinator has multiple levels"""
        assigned = obj.assigned_levels.all()
        if assigned.exists():
            return ", ".join([level.name for level in assigned])
        return obj.level.name if obj.level else "-"
    display_levels.short_description = "Level(s)"
    
    def assigned_teachers_count(self, obj):
        """Display count of assigned teachers"""
        count = obj.get_assigned_teachers_count()
        return f"{count} teachers"
    assigned_teachers_count.short_description = "Assigned Teachers"
    assigned_teachers_count.admin_order_field = "level"
    
    def get_queryset(self, request):
        """Optimize queryset with select_related and prefetch_related"""
        return super().get_queryset(request).select_related('level', 'campus').prefetch_related('assigned_levels')
    
    def change_view(self, request, object_id, form_url='', extra_context=None):
        """Add assigned teachers to context"""
        extra_context = extra_context or {}
        if object_id:
            coordinator = self.get_object(request, object_id)
            if coordinator:
                extra_context['assigned_teachers'] = coordinator.get_assigned_teachers()
                extra_context['assigned_classrooms'] = coordinator.get_assigned_classrooms()
        return super().change_view(request, object_id, form_url, extra_context)

    def save_model(self, request, obj, form, change):
        """When saving a coordinator from admin, if shift is 'both' and a single
        level FK was provided, auto-attach both morning and afternoon Level
        records (same name) from the same campus into the assigned_levels M2M.
        Also clear the single FK field to avoid confusion (we use M2M for both).
        """
        super().save_model(request, obj, form, change)

        try:
            # Only run this logic for 'both' shift coordinators
            if getattr(obj, 'shift', None) == 'both':
                # If admin provided assigned_levels explicitly, respect that
                provided_m2m = form.cleaned_data.get('assigned_levels') if hasattr(form, 'cleaned_data') else None
                if provided_m2m:
                    # If admin already selected assigned_levels, nothing to do
                    return

                # If a single level FK is selected, find both shifts for that level name
                selected_level = form.cleaned_data.get('level') if hasattr(form, 'cleaned_data') else None
                if selected_level and selected_level.campus:
                    # Find all Level records with same name in this campus (morning+afternoon)
                    levels_qs = Level.objects.filter(campus=selected_level.campus, name=selected_level.name)
                    if levels_qs.exists():
                        obj.assigned_levels.set(levels_qs)
                        # Clear the single FK to avoid ambiguity
                        obj.level = None
                        obj.save()
        except Exception as e:
            # Avoid breaking admin save; log to console for debugging
            print(f"Error auto-assigning levels in admin for coordinator {obj}: {e}")

    def clean_email(self):
        email = self.cleaned_data.get('email')
        if email and Coordinator.objects.filter(email=email).exclude(pk=self.pk).exists():
            raise ValidationError("A coordinator with this email already exists.")
        return email