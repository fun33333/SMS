from django.db import models
from django.utils import timezone

# Choices
CATEGORY_CHOICES = [
    ('leave', 'Leave Request'),
    ('salary', 'Salary Issue'),
    ('facility', 'Facility Complaint'),
    ('resource', 'Resource Request'),
    ('student', 'Student Related'),
    ('admin', 'Administrative Issue'),
    ('other', 'Other'),
]

PRIORITY_CHOICES = [
    ('low', 'Low'),
    ('medium', 'Medium'),
    ('high', 'High'),
    ('urgent', 'Urgent'),
]

STATUS_CHOICES = [
    ('submitted', 'Submitted'),
    ('under_review', 'Under Review'),
    ('in_progress', 'In Progress'),
    ('waiting', 'Waiting'),
    ('pending_principal', 'Pending Principal Approval'),
    ('approved', 'Approved'),
    ('pending_confirmation', 'Pending Teacher Confirmation'),
    ('resolved', 'Resolved'),
    ('rejected', 'Rejected'),
]

class RequestComplaint(models.Model):
    """Model for teacher requests and complaints"""
    
    # Foreign Keys
    teacher = models.ForeignKey('teachers.Teacher', on_delete=models.CASCADE, related_name='requests')
    coordinator = models.ForeignKey('coordinator.Coordinator', on_delete=models.CASCADE, related_name='assigned_requests')
    principal = models.ForeignKey('principals.Principal', on_delete=models.SET_NULL, null=True, blank=True, related_name='forwarded_requests')
    
    # Request Details
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    subject = models.CharField(max_length=200)
    description = models.TextField()
    
    # Status & Priority
    status = models.CharField(max_length=25, choices=STATUS_CHOICES, default='submitted')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='low')
    
    # Principal Approval
    requires_principal_approval = models.BooleanField(default=False)
    forwarding_note = models.TextField(blank=True, null=True, help_text="Coordinator's note when forwarding to principal")
    
    # Approval Tracking
    approved_by = models.CharField(max_length=20, blank=True, null=True, help_text="coordinator or principal")
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # Teacher Confirmation
    teacher_confirmed = models.BooleanField(default=False)
    teacher_confirmed_at = models.DateTimeField(null=True, blank=True)
    teacher_satisfaction_note = models.TextField(blank=True, null=True)
    
    # Rejection
    rejection_reason = models.TextField(blank=True, null=True)
    
    # Coordinator Response
    coordinator_notes = models.TextField(blank=True, null=True)
    resolution_notes = models.TextField(blank=True, null=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    forwarded_to_principal_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = "Request/Complaint"
        verbose_name_plural = "Requests/Complaints"
    
    def __str__(self):
        return f"{self.get_category_display()} - {self.subject} ({self.get_status_display()})"
    
    def save(self, *args, **kwargs):
        # Auto-set reviewed_at when status changes to under_review
        if self.status == 'under_review' and not self.reviewed_at:
            self.reviewed_at = timezone.now()
        
        # Auto-set forwarded_to_principal_at when status changes to pending_principal
        if self.status == 'pending_principal' and not self.forwarded_to_principal_at:
            self.forwarded_to_principal_at = timezone.now()
        
        # Auto-set approved_at when status changes to approved
        if self.status == 'approved' and not self.approved_at:
            self.approved_at = timezone.now()
        
        # Auto-set teacher_confirmed_at when teacher confirms
        if self.teacher_confirmed and not self.teacher_confirmed_at:
            self.teacher_confirmed_at = timezone.now()
            # Auto-set status to resolved when teacher confirms
            if self.status == 'pending_confirmation':
                self.status = 'resolved'
        
        # Auto-set resolved_at when status changes to resolved
        if self.status == 'resolved' and not self.resolved_at:
            self.resolved_at = timezone.now()
        
        super().save(*args, **kwargs)

class RequestComment(models.Model):
    """Model for comments on requests"""
    
    USER_TYPE_CHOICES = [
        ('teacher', 'Teacher'),
        ('coordinator', 'Coordinator'),
    ]
    
    request = models.ForeignKey(RequestComplaint, on_delete=models.CASCADE, related_name='comments')
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES)
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = "Request Comment"
        verbose_name_plural = "Request Comments"
    
    def __str__(self):
        return f"Comment on {self.request.subject} by {self.get_user_type_display()}"

class RequestStatusHistory(models.Model):
    """Model to track status changes"""
    
    request = models.ForeignKey(RequestComplaint, on_delete=models.CASCADE, related_name='status_history')
    old_status = models.CharField(max_length=20, choices=STATUS_CHOICES, null=True, blank=True)
    new_status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    changed_by = models.CharField(max_length=20)  # 'teacher' or 'coordinator'
    notes = models.TextField(blank=True, null=True)
    changed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-changed_at']
        verbose_name = "Status History"
        verbose_name_plural = "Status Histories"
    
    def __str__(self):
        return f"{self.request.subject}: {self.old_status} → {self.new_status}"
