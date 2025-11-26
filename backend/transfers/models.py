from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


class TransferRequest(models.Model):
    """
    Principal-to-principal campus/shift transfer that triggers ID changes.
    Kept as-is for backward compatibility and campus-level transfers.
    """

    REQUEST_TYPES = [
        ('student', 'Student Transfer'),
        ('teacher', 'Teacher Transfer'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
    ]

    # Optional high-level category for reporting (campus / shift_same_class / shift_next_class)
    transfer_category = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Optional category for this transfer (e.g. campus, shift_same_class).",
    )

    # Basic Info
    request_type = models.CharField(max_length=20, choices=REQUEST_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # Source Information - set to null if campus is deleted (data preservation)
    from_campus = models.ForeignKey(
        'campus.Campus',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers_from',
    )
    # Django-level shift code (M/A) used for ID segments
    from_shift = models.CharField(max_length=1, choices=[('M', 'Morning'), ('A', 'Afternoon')])
    requesting_principal = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='transfer_requests_sent',
    )

    # Destination Information - set to null if campus is deleted (data preservation)
    to_campus = models.ForeignKey(
        'campus.Campus',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers_to',
    )
    to_shift = models.CharField(max_length=1, choices=[('M', 'Morning'), ('A', 'Afternoon')])
    receiving_principal = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='transfer_requests_received',
    )

    # Student/Teacher Reference
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, null=True, blank=True)
    teacher = models.ForeignKey('teachers.Teacher', on_delete=models.CASCADE, null=True, blank=True)

    # Request Details
    reason = models.TextField()
    requested_date = models.DateField()
    notes = models.TextField(blank=True)

    # Approval Details
    reviewed_at = models.DateTimeField(null=True, blank=True)
    decline_reason = models.TextField(blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['request_type']),
            models.Index(fields=['from_campus', 'to_campus']),
            models.Index(fields=['requesting_principal', 'receiving_principal']),
        ]

    def __str__(self):
        entity_name = self.student.name if self.student else self.teacher.full_name if self.teacher else 'Unknown'
        return f"{self.get_request_type_display()} - {entity_name} ({self.get_status_display()})"

    @property
    def entity_name(self):
        """Get the name of the student or teacher being transferred."""
        if self.student:
            return self.student.name
        if self.teacher:
            return self.teacher.full_name
        return 'Unknown'

    @property
    def current_id(self):
        """Get the current ID of the student or teacher."""
        if self.student:
            return self.student.student_id
        if self.teacher:
            return self.teacher.employee_code
        return 'Unknown'


class IDHistory(models.Model):
    ENTITY_TYPES = [
        ('student', 'Student'),
        ('teacher', 'Teacher'),
    ]

    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPES)
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='id_history',
    )
    teacher = models.ForeignKey(
        'teachers.Teacher',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='id_history',
    )

    # Old ID segments
    old_id = models.CharField(max_length=50)
    old_campus_code = models.CharField(max_length=10)
    old_shift = models.CharField(max_length=1)
    old_year = models.CharField(max_length=2)

    # New ID segments
    new_id = models.CharField(max_length=50)
    new_campus_code = models.CharField(max_length=10)
    new_shift = models.CharField(max_length=1)
    new_year = models.CharField(max_length=2)

    # Immutable suffix (preserved)
    immutable_suffix = models.CharField(max_length=20)

    # Transfer reference
    transfer_request = models.ForeignKey(
        TransferRequest,
        on_delete=models.CASCADE,
        related_name='id_changes',
    )

    # Metadata
    changed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    change_reason = models.TextField()
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['entity_type']),
            models.Index(fields=['old_id']),
            models.Index(fields=['new_id']),
            models.Index(fields=['student', 'teacher']),
        ]

    def __str__(self):
        entity_name = self.student.name if self.student else self.teacher.full_name if self.teacher else 'Unknown'
        return f"{entity_name}: {self.old_id} → {self.new_id}"

    @property
    def entity_name(self):
        """Get the name of the student or teacher."""
        if self.student:
            return self.student.name
        if self.teacher:
            return self.teacher.full_name
        return 'Unknown'


class ClassTransfer(models.Model):
    """
    Class/section transfer within the same campus and shift.
    Does NOT change the student's ID – only classroom/section assignment.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
    ]

    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='class_transfers',
    )

    from_classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_transfers_from',
        help_text="Original classroom for this student.",
    )
    to_classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_transfers_to',
        help_text="Destination classroom after transfer.",
    )

    # Cached section/grade labels for audit (even if classrooms are later deleted)
    from_section = models.CharField(max_length=10, null=True, blank=True)
    to_section = models.CharField(max_length=10, null=True, blank=True)
    from_grade_name = models.CharField(max_length=50, null=True, blank=True)
    to_grade_name = models.CharField(max_length=50, null=True, blank=True)

    initiated_by_teacher = models.ForeignKey(
        'teachers.Teacher',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_transfers_initiated',
    )
    coordinator = models.ForeignKey(
        'coordinator.Coordinator',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_transfers_reviewed',
    )
    principal = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_transfers_approved',
        help_text="Optional final approver for class changes.",
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reason = models.TextField()
    requested_date = models.DateField(help_text="Effective date requested for this change.")
    decline_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['student']),
        ]

    def __str__(self):
        return f"Class transfer for {self.student.name} ({self.status})"


class ShiftTransfer(models.Model):
    """
    Shift transfer within the same campus.
    This may later link to a TransferRequest to actually change the ID.
    """

    STATUS_CHOICES = [
        ('pending_own_coord', 'Pending Own Coordinator'),
        ('pending_other_coord', 'Pending Other Coordinator'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
    ]

    SHIFT_CHOICES = [
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
    ]

    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='shift_transfers',
    )
    campus = models.ForeignKey(
        'campus.Campus',
        on_delete=models.CASCADE,
        related_name='shift_transfers',
    )

    from_shift = models.CharField(max_length=20, choices=SHIFT_CHOICES)
    to_shift = models.CharField(max_length=20, choices=SHIFT_CHOICES)

    from_classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_transfers_from',
    )
    to_classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_transfers_to',
    )

    requesting_teacher = models.ForeignKey(
        'teachers.Teacher',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_transfers_initiated',
    )
    from_shift_coordinator = models.ForeignKey(
        'coordinator.Coordinator',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_transfers_from_shift',
    )
    to_shift_coordinator = models.ForeignKey(
        'coordinator.Coordinator',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_transfers_to_shift',
    )
    principal = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_transfers_approved',
    )

    # Optional link to the underlying TransferRequest which did the ID change
    transfer_request = models.OneToOneField(
        TransferRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_transfer',
    )

    status = models.CharField(max_length=40, choices=STATUS_CHOICES, default='pending_own_coord')
    reason = models.TextField()
    requested_date = models.DateField(help_text="Effective date requested for this shift change.")
    decline_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['student']),
            models.Index(fields=['campus']),
        ]

    def __str__(self):
        return f"Shift transfer for {self.student.name} ({self.from_shift} → {self.to_shift})"


class TransferApproval(models.Model):
    """
    Generic approval step for any transfer type (class, shift, campus).
    This keeps workflows flexible without bloating the main models.
    """

    TRANSFER_TYPES = [
        ('class', 'Class Transfer'),
        ('shift', 'Shift Transfer'),
        ('campus', 'Campus Transfer'),
    ]

    ROLE_CHOICES = [
        ('teacher', 'Teacher'),
        ('coordinator_from', 'From Shift/Level Coordinator'),
        ('coordinator_to', 'To Shift/Level Coordinator'),
        ('principal', 'Principal'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
    ]

    transfer_type = models.CharField(max_length=20, choices=TRANSFER_TYPES)
    transfer_id = models.PositiveIntegerField(
        help_text="Primary key of the underlying transfer object (ClassTransfer, ShiftTransfer, or TransferRequest).",
    )

    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfer_approvals',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    comment = models.TextField(blank=True)
    step_order = models.PositiveIntegerField(
        default=1,
        help_text="Logical order of this step within the workflow.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['transfer_type', 'transfer_id', 'step_order', '-created_at']
        indexes = [
            models.Index(fields=['transfer_type', 'transfer_id']),
            models.Index(fields=['role']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.transfer_type}#{self.transfer_id} - {self.role} ({self.status})"


class GradeSkipTransfer(models.Model):
    """
    Grade skipping transfer - allows students to skip exactly 1 grade (e.g., Grade 1 → Grade 3).
    Shift and section changes are optional.
    Supports two approval workflows: same-coordinator (single approval) and 
    different-coordinator (two-step approval with automatic transfer).
    """

    STATUS_CHOICES = [
        ('pending_own_coord', 'Pending Own Coordinator'),
        ('pending_other_coord', 'Pending Other Coordinator'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
    ]

    SHIFT_CHOICES = [
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
    ]

    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='grade_skip_transfers',
    )
    campus = models.ForeignKey(
        'campus.Campus',
        on_delete=models.CASCADE,
        related_name='grade_skip_transfers',
    )

    # Grade information
    from_grade = models.ForeignKey(
        'classes.Grade',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfers_from',
        help_text="Original grade for this student.",
    )
    to_grade = models.ForeignKey(
        'classes.Grade',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfers_to',
        help_text="Destination grade after skip (must be exactly 1 grade ahead, e.g., Grade 1 → Grade 3).",
    )

    # Cached grade names for audit (even if grades are later deleted)
    from_grade_name = models.CharField(max_length=50, null=True, blank=True)
    to_grade_name = models.CharField(max_length=50, null=True, blank=True)

    # Classroom information
    from_classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfers_from',
        help_text="Original classroom for this student.",
    )
    to_classroom = models.ForeignKey(
        'classes.ClassRoom',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfers_to',
        help_text="Destination classroom after grade skip.",
    )

    # Cached section labels for audit
    from_section = models.CharField(max_length=10, null=True, blank=True)
    to_section = models.CharField(max_length=10, null=True, blank=True)

    # Shift information (optional - can change shift during grade skip)
    from_shift = models.CharField(max_length=20, choices=SHIFT_CHOICES)
    to_shift = models.CharField(
        max_length=20,
        choices=SHIFT_CHOICES,
        null=True,
        blank=True,
        help_text="Optional: destination shift (if different from current shift).",
    )

    # Teacher and coordinator references
    initiated_by_teacher = models.ForeignKey(
        'teachers.Teacher',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfers_initiated',
    )
    from_grade_coordinator = models.ForeignKey(
        'coordinator.Coordinator',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfers_from_grade',
        help_text="Coordinator for the student's current grade/level.",
    )
    to_grade_coordinator = models.ForeignKey(
        'coordinator.Coordinator',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfers_to_grade',
        help_text="Coordinator for the target grade/level.",
    )
    principal = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfers_approved',
        help_text="Optional final approver for grade skip.",
    )

    # Optional link to TransferRequest if ID change is needed
    transfer_request = models.OneToOneField(
        TransferRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_skip_transfer',
        help_text="Link to TransferRequest if student ID needs to be updated (e.g., shift/campus change).",
    )

    status = models.CharField(max_length=40, choices=STATUS_CHOICES, default='pending_own_coord')
    reason = models.TextField()
    requested_date = models.DateField(help_text="Effective date requested for this grade skip.")
    decline_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['student']),
            models.Index(fields=['campus']),
            models.Index(fields=['from_grade', 'to_grade']),
        ]

    def __str__(self):
        from_grade_display = self.from_grade_name or (self.from_grade.name if self.from_grade else 'Unknown')
        to_grade_display = self.to_grade_name or (self.to_grade.name if self.to_grade else 'Unknown')
        return f"Grade skip for {self.student.name} ({from_grade_display} → {to_grade_display})"