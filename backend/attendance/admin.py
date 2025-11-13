from django.contrib import admin
from django.utils.html import format_html
from .models import Attendance, StudentAttendance, Weekend, Holiday


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = [
        'classroom', 'date', 'get_status_display_colored', 'marked_by', 'total_students', 
        'present_count', 'absent_count', 'leave_count', 'created_at'
    ]
    
    def get_status_display_colored(self, obj):
        """Display status with color coding"""
        status_colors = {
            'draft': '#808080',  # gray
            'submitted': '#0066CC',  # blue
            'under_review': '#FF8C00',  # orange
            'approved': '#008000',  # green
        }
        color = status_colors.get(obj.status, '#808080')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display()
        )
    get_status_display_colored.short_description = 'Status'
    get_status_display_colored.admin_order_field = 'status'
    
    list_filter = ['status', 'date', 'classroom__grade__level__campus', 'classroom__grade', 'marked_by']
    search_fields = ['classroom__code', 'marked_by__full_name']
    readonly_fields = ['total_students', 'present_count', 'absent_count', 'leave_count', 'created_at', 'updated_at']
    date_hierarchy = 'date'
    ordering = ['-date', 'classroom']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('classroom', 'date', 'marked_by', 'status')
        }),
        ('Attendance Summary', {
            'fields': ('total_students', 'present_count', 'absent_count', 'leave_count'),
            'classes': ('collapse',)
        }),
        ('Status Details', {
            'fields': ('submitted_at', 'submitted_by', 'reviewed_at', 'reviewed_by', 'finalized_at', 'finalized_by'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )


@admin.register(StudentAttendance)
class StudentAttendanceAdmin(admin.ModelAdmin):
    list_display = [
        'student', 'attendance', 'status', 'remarks', 'created_at'
    ]
    list_filter = ['status', 'attendance__date', 'attendance__classroom']
    search_fields = ['student__name', 'student__student_code', 'remarks']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['attendance__date', 'student__name']
    
    fieldsets = (
        ('Student Information', {
            'fields': ('student', 'attendance')
        }),
        ('Attendance Details', {
            'fields': ('status', 'remarks')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('student', 'attendance', 'attendance__classroom')


@admin.register(Weekend)
class WeekendAdmin(admin.ModelAdmin):
    list_display = ['date', 'level', 'created_by', 'created_at']
    list_filter = ['level__campus', 'level', 'date']
    search_fields = ['level__name']
    date_hierarchy = 'date'
    ordering = ['-date', 'level']
    readonly_fields = ['created_at']


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ['date', 'reason', 'level', 'created_by', 'created_at', 'updated_at']
    list_filter = ['level__campus', 'level', 'date', 'created_at']
    search_fields = ['reason', 'level__name']
    date_hierarchy = 'date'
    ordering = ['-date', 'level']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Holiday Information', {
            'fields': ('date', 'reason', 'level')
        }),
        ('Audit Information', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )
