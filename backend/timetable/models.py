from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone

class Subject(models.Model):
    """
    Subject model for managing school subjects
    """
    name = models.CharField(max_length=100, help_text="Subject name (e.g., Mathematics, English)")
    code = models.CharField(max_length=20, unique=True, blank=True, help_text="Auto-generated subject code")
    description = models.TextField(blank=True, null=True, help_text="Subject description")
    
    # Campus-specific subjects
    campus = models.ForeignKey(
        'campus.Campus',
        on_delete=models.CASCADE,
        related_name='subjects',
        help_text="Campus this subject belongs to"
    )
    
    # Level-specific (optional - some subjects are for specific levels)
    level = models.ForeignKey(
        'classes.Level',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='subjects',
        help_text="Level this subject is for (optional)"
    )
    
    is_active = models.BooleanField(default=True, help_text="Is this subject currently active?")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        # Make subjects unique per campus (not per level) so a subject
        # added once can be reused across all levels.
        unique_together = ('name', 'campus')
        ordering = ['name']
        verbose_name = "Subject"
        verbose_name_plural = "Subjects"
    
    def save(self, *args, **kwargs):
        # Auto-generate code if not provided
        if not self.code:
            # Create code from name (first 3 letters + campus code)
            name_part = ''.join(self.name.split())[:3].upper()
            campus_code = self.campus.campus_code if self.campus else 'XXX'
            base_code = f"{campus_code}-{name_part}"
            
            # Ensure uniqueness
            counter = 1
            self.code = base_code
            while Subject.objects.filter(code=self.code).exists():
                self.code = f"{base_code}{counter}"
                counter += 1
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        campus_name = self.campus.campus_name if self.campus else "No Campus"
        return f"{self.name} ({campus_name})"


class ClassTimeTable(models.Model):
    """
    Time Table for a specific classroom
    """
    DAY_CHOICES = [
        ('monday', 'Monday'),
        ('tuesday', 'Tuesday'),
        ('wednesday', 'Wednesday'),
        ('thursday', 'Thursday'),
        ('friday', 'Friday'),
        ('saturday', 'Saturday'),
    ]
    
    # Classroom
    classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.CASCADE,
        related_name='class_timetable_periods',
        help_text="Classroom for this period"
    )
    
    # Subject and Teacher
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name='class_periods',
        help_text="Subject being taught"
    )
    teacher = models.ForeignKey(
        'teachers.Teacher',
        on_delete=models.CASCADE,
        related_name='class_teaching_periods',
        help_text="Teacher assigned to this period"
    )
    
    # Time Information
    day = models.CharField(max_length=10, choices=DAY_CHOICES, help_text="Day of the week")
    start_time = models.TimeField(help_text="Period start time")
    end_time = models.TimeField(help_text="Period end time")
    
    # Additional Info
    is_break = models.BooleanField(default=False, help_text="Is this a break period?")
    notes = models.TextField(blank=True, null=True, help_text="Additional notes")
    
    # Metadata
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_class_periods',
        help_text="User who created this period"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['classroom', 'day', 'start_time'],
                name='unique_class_period'
            ),
        ]
        ordering = ['classroom', 'day', 'start_time']
        verbose_name = "Class Time Table"
        verbose_name_plural = "Class Time Tables"
    
    def clean(self):
        """Validate period data"""
        super().clean()
        
        # Validate time range
        if self.start_time and self.end_time:
            if self.start_time >= self.end_time:
                raise ValidationError("Start time must be before end time")
        
        # Check for overlapping periods for the same classroom
        if self.classroom and self.day and self.start_time and self.end_time:
            overlapping = ClassTimeTable.objects.filter(
                classroom=self.classroom,
                day=self.day,
                start_time__lt=self.end_time,
                end_time__gt=self.start_time
            ).exclude(pk=self.pk)
            
            if overlapping.exists():
                raise ValidationError(
                    f"This classroom already has a period scheduled during this time on {self.get_day_display()}"
                )
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.classroom} - {self.subject.name} ({self.get_day_display()} {self.start_time.strftime('%H:%M')})"
    
    @property
    def time_slot(self):
        return f"{self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')}"


class TeacherTimeTable(models.Model):
    """
    Time Table for a specific teacher
    """
    DAY_CHOICES = [
        ('monday', 'Monday'),
        ('tuesday', 'Tuesday'),
        ('wednesday', 'Wednesday'),
        ('thursday', 'Thursday'),
        ('friday', 'Friday'),
        ('saturday', 'Saturday'),
    ]
    
    # Teacher
    teacher = models.ForeignKey(
        'teachers.Teacher',
        on_delete=models.CASCADE,
        related_name='teacher_timetable_periods',
        help_text="Teacher for this period"
    )
    
    # Subject and Classroom
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name='teacher_periods',
        help_text="Subject being taught"
    )
    classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.CASCADE,
        related_name='teacher_teaching_periods',
        help_text="Classroom where teaching"
    )
    
    # Time Information
    day = models.CharField(max_length=10, choices=DAY_CHOICES, help_text="Day of the week")
    start_time = models.TimeField(help_text="Period start time")
    end_time = models.TimeField(help_text="Period end time")
    
    # Additional Info
    is_break = models.BooleanField(default=False, help_text="Is this a break period?")
    notes = models.TextField(blank=True, null=True, help_text="Additional notes")
    
    # Metadata
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_teacher_periods',
        help_text="User who created this period"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['teacher', 'day', 'start_time'],
                name='unique_teacher_period'
            ),
        ]
        ordering = ['teacher', 'day', 'start_time']
        verbose_name = "Teacher Time Table"
        verbose_name_plural = "Teacher Time Tables"
    
    def clean(self):
        """Validate period data"""
        super().clean()
        
        # Validate time range
        if self.start_time and self.end_time:
            if self.start_time >= self.end_time:
                raise ValidationError("Start time must be before end time")
        
        # Check for teacher conflicts
        if self.teacher and self.day and self.start_time and self.end_time:
            teacher_conflicts = TeacherTimeTable.objects.filter(
                teacher=self.teacher,
                day=self.day,
                start_time__lt=self.end_time,
                end_time__gt=self.start_time
            ).exclude(pk=self.pk)
            
            if teacher_conflicts.exists():
                raise ValidationError(
                    f"Teacher {self.teacher.full_name} is already assigned to another class during this time"
                )
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.teacher.full_name} - {self.subject.name} ({self.get_day_display()} {self.start_time.strftime('%H:%M')})"
    
    @property
    def time_slot(self):
        return f"{self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')}"


class ShiftTiming(models.Model):
    """
    Dynamic shift timings for campuses
    """
    SHIFT_CHOICES = [
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
    ]
    
    TIMETABLE_TYPE_CHOICES = [
        ('class', 'Class Timetable'),
        ('teacher', 'Teacher Timetable'),
    ]

    campus = models.ForeignKey(
        'campus.Campus',
        on_delete=models.CASCADE,
        related_name='shift_timings',
        help_text="Campus this timing belongs to"
    )
    shift = models.CharField(max_length=20, choices=SHIFT_CHOICES)
    timetable_type = models.CharField(
        max_length=20, 
        choices=TIMETABLE_TYPE_CHOICES, 
        default='class',
        help_text="Type of timetable (class or teacher)"
    )
    name = models.CharField(max_length=50, help_text="Period name (e.g., Period 1, Break)")
    
    start_time = models.TimeField(help_text="Start time")
    end_time = models.TimeField(help_text="End time")
    
    is_break = models.BooleanField(default=False, help_text="Is this a break?")
    order = models.PositiveIntegerField(default=0, help_text="Ordering for display")
    days = models.JSONField(default=list, blank=True, null=True, help_text="Days this timing applies to (e.g., ['Monday', 'Tuesday']). Empty means all days.")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['campus', 'shift', 'timetable_type', 'order', 'start_time']
        verbose_name = "Shift Timing"
        verbose_name_plural = "Shift Timings"
        constraints = [
            models.UniqueConstraint(
                fields=['campus', 'shift', 'timetable_type', 'name'],
                name='unique_shift_period_name'
            )
        ]

    def __str__(self):
        days_str = ', '.join(self.days) if self.days else 'All days'
        timetable_label = dict(self.TIMETABLE_TYPE_CHOICES).get(self.timetable_type, self.timetable_type)
        return f"{self.campus.campus_name} ({self.shift} - {timetable_label}) - {self.name}: {self.start_time.strftime('%H:%M')}-{self.end_time.strftime('%H:%M')} [{days_str}]"

