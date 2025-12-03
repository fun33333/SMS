from django.contrib import admin
from .models import Subject, ClassTimeTable, TeacherTimeTable

@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'campus', 'level', 'is_active', 'created_at']
    list_display = ['name', 'code', 'campus', 'is_active', 'created_at']
    list_filter = ['campus', 'is_active']
    search_fields = ['name', 'code']
    readonly_fields = ['code', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'code', 'description')
        }),
        ('Assignment', {
            'fields': ('campus',)
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ClassTimeTable)
class ClassTimeTableAdmin(admin.ModelAdmin):
    list_display = [
        'classroom', 
        'subject', 
        'teacher', 
        'day', 
        'time_slot',
        'is_break'
    ]
    list_filter = [
        'day', 
        'is_break',
        'classroom__grade__level',
        'classroom__grade',
        'classroom__shift'
    ]
    search_fields = [
        'teacher__full_name', 
        'subject__name', 
        'classroom__code',
        'classroom__grade__name'
    ]
    autocomplete_fields = ['teacher', 'subject', 'classroom']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    
    fieldsets = (
        ('Class Period Assignment', {
            'fields': ('classroom', 'subject', 'teacher')
        }),
        ('Time Information', {
            'fields': ('day', 'start_time', 'end_time', 'is_break')
        }),
        ('Additional Information', {
            'fields': ('notes',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def save_model(self, request, obj, form, change):
        """Auto-set created_by field"""
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
    
    def get_queryset(self, request):
        """Optimize queries"""
        qs = super().get_queryset(request)
        return qs.select_related(
            'classroom',
            'classroom__grade',
            'classroom__grade__level',
            'teacher',
            'subject'
        )


@admin.register(TeacherTimeTable)
class TeacherTimeTableAdmin(admin.ModelAdmin):
    list_display = [
        'teacher', 
        'subject', 
        'classroom', 
        'day', 
        'time_slot',
        'is_break'
    ]
    list_filter = [
        'day', 
        'is_break',
        'teacher__current_campus',
        'classroom__grade__level'
    ]
    search_fields = [
        'teacher__full_name', 
        'teacher__employee_code',
        'subject__name', 
        'classroom__code'
    ]
    autocomplete_fields = ['teacher', 'subject', 'classroom']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    
    fieldsets = (
        ('Teacher Period Assignment', {
            'fields': ('teacher', 'subject', 'classroom')
        }),
        ('Time Information', {
            'fields': ('day', 'start_time', 'end_time', 'is_break')
        }),
        ('Additional Information', {
            'fields': ('notes',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def save_model(self, request, obj, form, change):
        """Auto-set created_by field"""
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
    
    def get_queryset(self, request):
        """Optimize queries"""
        qs = super().get_queryset(request)
        return qs.select_related(
            'teacher',
            'teacher__current_campus',
            'classroom',
            'classroom__grade',
            'subject'
        )
