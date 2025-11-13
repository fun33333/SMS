from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from datetime import timedelta
import secrets

class User(AbstractUser):
    """
    Custom User model with role-based access control
    """
    ROLE_CHOICES = [
        ('superadmin', 'Super Admin'),
        ('principal', 'Principal'),
        ('coordinator', 'Teacher Coordinator'),
        ('teacher', 'Teacher'),
    ]
    
    # Override default fields
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True)
    
    # Custom fields
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    campus = models.ForeignKey('campus.Campus', on_delete=models.SET_NULL, null=True, blank=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    has_changed_default_password = models.BooleanField(default=False)
    
    # System fields
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email', 'role']
    
    def __str__(self):
        return f"{self.get_full_name()} ({self.get_role_display()})"
    
    def get_role_display(self):
        return dict(self.ROLE_CHOICES).get(self.role, self.role)
    
    def is_superadmin(self):
        return self.role == 'superadmin'
    
    def is_principal(self):
        return self.role == 'principal'
    
    def is_coordinator(self):
        return self.role == 'coordinator'
    
    def is_teacher(self):
        return self.role == 'teacher'
    
    def can_manage_campus(self):
        return self.role in ['superadmin', 'principal']
    
    def can_approve_requests(self):
        return self.role in ['superadmin', 'principal', 'coordinator']
    
    def can_view_all_data(self):
        return self.role in ['superadmin', 'principal']
    
    def save(self, *args, **kwargs):
        # Auto-generate employee code for super admin if not provided
        if self.role == 'superadmin' and not self.username.startswith('S'):
            try:
                from utils.id_generator import IDGenerator
                
                # Generate super admin employee code without campus dependency
                employee_code = IDGenerator.generate_superadmin_code()
                
                # Set username to employee code
                self.username = employee_code
                print(f"[OK] Auto-generated super admin employee code: {employee_code}")
                    
            except Exception as e:
                error_msg = str(e).encode('ascii', 'replace').decode('ascii') if isinstance(str(e), str) else repr(e)
                print(f"[ERROR] Error generating super admin employee code: {error_msg}")
        
        # Ensure super admin doesn't have campus assignment
        if self.role == 'superadmin':
            self.campus = None
        
        super().save(*args, **kwargs)
    
    class Meta:
        db_table = 'users_user'
        verbose_name = 'User'
        verbose_name_plural = 'Users'


class PasswordChangeOTP(models.Model):
    """Model to store OTP codes for password change verification"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_change_otps')
    otp_code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    session_token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    
    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=5)
        if not self.otp_code:
            self.otp_code = self.generate_otp()
        if not self.session_token:
            self.session_token = secrets.token_hex(32)
        super().save(*args, **kwargs)
    
    def generate_otp(self):
        """Generate a 6-digit random OTP"""
        return str(secrets.randbelow(900000) + 100000)
    
    def is_expired(self):
        """Check if OTP has expired (5 minutes)"""
        return timezone.now() > self.expires_at
    
    def verify_otp(self, code):
        """Verify OTP code and mark as used if valid"""
        if self.is_used or self.is_expired():
            return False
        
        if self.otp_code == code:
            self.is_used = True
            self.save()
            return True
        return False
    
    def __str__(self):
        return f"OTP for {self.user.email} - {self.otp_code}"
    
    class Meta:
        db_table = 'users_password_change_otp'
        verbose_name = 'Password Change OTP'
        verbose_name_plural = 'Password Change OTPs'
