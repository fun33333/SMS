from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models import Q, Count, Sum
from datetime import datetime, timedelta
import json

User = get_user_model()


class Attendance(models.Model):
    """Model for tracking classroom attendance with audit trail"""
    classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.CASCADE,
        related_name='attendances'
    )
    date = models.DateField()
    marked_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='marked_attendances'
    )
    
    # Audit fields
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_attendances'
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_attendances'
    )
    marked_at = models.DateTimeField(auto_now_add=True)
    last_edited_at = models.DateTimeField(null=True, blank=True)
    update_history = models.JSONField(default=list, blank=True)
    is_final = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deleted_attendances'
    )
    
    # State management
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('under_review', 'Under Review'),
        ('approved', 'Approved'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    submitted_at = models.DateTimeField(null=True, blank=True)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='submitted_attendances')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_attendances')
    finalized_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='finalized_attendances')
    reopened_at = models.DateTimeField(null=True, blank=True)
    reopened_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reopened_attendances')
    reopen_reason = models.TextField(null=True, blank=True)
    
    # Archive fields for holiday replacement
    replaced_by_holiday = models.BooleanField(default=False)
    replaced_at = models.DateTimeField(null=True, blank=True)
    archived_data = models.JSONField(null=True, blank=True)
    
    # Calculated fields
    total_students = models.PositiveIntegerField(default=0)
    present_count = models.PositiveIntegerField(default=0)
    absent_count = models.PositiveIntegerField(default=0)
    late_count = models.PositiveIntegerField(default=0)
    leave_count = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['classroom', 'date']
        ordering = ['-date', 'classroom']
        verbose_name = "Attendance"
        verbose_name_plural = "Attendances"
    
    def __str__(self):
        return f"{self.classroom} - {self.date}"
    
    @property
    def is_editable(self):
        """Check if attendance can be edited based on status"""
        if self.status == 'approved':
            return False
        if self.status == 'under_review':
            # Teachers can edit within 7 days, coordinators can always edit
            return (timezone.now().date() - self.date).days <= 7
        if self.status == 'draft':
            # Legacy support for draft status
            return (timezone.now().date() - self.date).days <= 7
        if self.status == 'submitted':
            # Legacy support for submitted status
            return True  # Coordinator can edit
        return False
    
    @property
    def attendance_percentage(self):
        """Calculate attendance percentage"""
        if self.total_students == 0:
            return 0
        return round((self.present_count / self.total_students) * 100, 2)
    
    def clean(self):
        """Validate attendance data"""
        # Prevent future dates
        if self.date and self.date > timezone.now().date():
            raise ValidationError("Cannot mark attendance for future dates")
        
        # Validate classroom exists and is active
        if self.classroom and not self.classroom.grade:
            raise ValidationError("Classroom must have an associated grade")
    
    def update_counts(self):
        """Update attendance counts from student attendance records"""
        student_attendances = self.student_attendances.all()
        self.total_students = student_attendances.count()
        self.present_count = student_attendances.filter(status='present').count()
        self.absent_count = student_attendances.filter(status='absent').count()
        self.late_count = student_attendances.filter(status='late').count()
        self.leave_count = student_attendances.filter(status='leave').count()
        # Use update_fields to prevent infinite recursion
        super(Attendance, self).save(update_fields=[
            'total_students', 'present_count', 'absent_count', 
            'late_count', 'leave_count', 'updated_at'
        ])
    
    def add_edit_history(self, user, action, reason=None, changes=None):
        """Add entry to edit history"""
        history_entry = {
            'timestamp': timezone.now().isoformat(),
            'user_id': user.id,
            'user_name': user.get_full_name() or user.username,
            'action': action,
            'reason': reason,
            'changes': changes or {}
        }
        self.update_history.append(history_entry)
        self.last_edited_at = timezone.now()
        self.updated_by = user
        self.save(update_fields=['update_history', 'last_edited_at', 'updated_by'])
    
    def soft_delete(self, user, reason=None):
        """Soft delete attendance record"""
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.add_edit_history(user, 'deleted', reason)
        self.save()
    
    def restore(self, user, reason=None):
        """Restore soft deleted attendance record"""
        self.is_deleted = False
        self.deleted_at = None
        self.deleted_by = None
        self.add_edit_history(user, 'restored', reason)
        self.save()
    
    def save(self, *args, **kwargs):
        # Run validation
        self.clean()
        
        # Set created_by if not set
        if not self.pk and not self.created_by:
            # This will be set by the view
            pass
        
        # Don't call update_counts here to avoid recursion
        # update_counts will be called explicitly when needed
        super().save(*args, **kwargs)


class StudentAttendance(models.Model):
    """Model for tracking individual student attendance with audit trail"""
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('leave', 'Leave'),
        ('excused', 'Excused'),
    ]
    
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='attendances'
    )
    attendance = models.ForeignKey(
        Attendance,
        on_delete=models.CASCADE,
        related_name='student_attendances'
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='present'
    )
    remarks = models.TextField(blank=True, null=True)
    
    # Audit fields
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_student_attendances'
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_student_attendances'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        unique_together = ['student', 'attendance']
        ordering = ['attendance__date', 'student__name']
        verbose_name = "Student Attendance"
        verbose_name_plural = "Student Attendances"
    
    def __str__(self):
        return f"{self.student.name} - {self.attendance.date} - {self.get_status_display()}"
    
    def clean(self):
        """Validate student attendance data"""
        # Ensure student belongs to the classroom
        if self.student and self.attendance and self.student.classroom != self.attendance.classroom:
            raise ValidationError("Student must belong to the same classroom as the attendance record")
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class Holiday(models.Model):
    """Model for tracking holidays defined by coordinators"""
    date = models.DateField()
    reason = models.CharField(max_length=200)
    level = models.ForeignKey('classes.Level', on_delete=models.CASCADE, related_name='holidays')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_holidays')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['date', 'level']
        ordering = ['-date']
    
    def __str__(self):
        return f"{self.date} - {self.reason}"


class AttendanceBackfillPermission(models.Model):
    """Model for tracking backfill permissions granted by coordinators"""
    classroom = models.ForeignKey('classes.ClassRoom', on_delete=models.CASCADE)
    date = models.DateField()
    granted_to = models.ForeignKey(User, on_delete=models.CASCADE, related_name='backfill_permissions')
    granted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='granted_backfill_permissions')
    reason = models.TextField()
    deadline = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['classroom', 'date', 'granted_to']
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.classroom} - {self.date} - {self.granted_to.username}"
    
    @property
    def is_expired(self):
        return timezone.now() > self.deadline


class AuditLog(models.Model):
    """Unified audit log for all system actions"""
    ACTION_TYPES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('submit', 'Submit'),
        ('review', 'Review'),
        ('finalize', 'Finalize'),
        ('reopen', 'Reopen'),
        ('approve', 'Approve'),
        ('reject', 'Reject'),
        ('assign', 'Assign'),
        ('unassign', 'Unassign'),
    ]
    
    FEATURE_TYPES = [
        ('attendance', 'Attendance'),
        ('student', 'Student'),
        ('teacher', 'Teacher'),
        ('coordinator', 'Coordinator'),
        ('principal', 'Principal'),
        ('classroom', 'Classroom'),
        ('grade', 'Grade'),
        ('level', 'Level'),
        ('campus', 'Campus'),
        ('user', 'User'),
    ]
    
    feature = models.CharField(max_length=50, choices=FEATURE_TYPES)
    action = models.CharField(max_length=50, choices=ACTION_TYPES)
    entity_type = models.CharField(max_length=100)
    entity_id = models.IntegerField()
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    reason = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['feature', 'action']),
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['user', 'timestamp']),
        ]
    
    def __str__(self):
        return f"{self.feature} - {self.action} by {self.user.username if self.user else 'System'}"


class Weekend(models.Model):
    """Model to track weekends (Sundays) for each level"""
    # Make date non-unique; uniqueness is enforced on (level, date)
    date = models.DateField()
    level = models.ForeignKey('classes.Level', on_delete=models.CASCADE, related_name='weekends')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_weekends')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-date']
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['level', 'date']),
        ]
        unique_together = ['date', 'level']
    
    def __str__(self):
        return f"Weekend - {self.date} ({self.level.name})"
