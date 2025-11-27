from django.db import models
from django.utils import timezone
from campus.models import Campus
from classes.models import Level

# Choices
GENDER_CHOICES = [
    ("male", "Male"),
    ("female", "Female"),
    ("other", "Other"),
]

SHIFT_CHOICES = [
    ('morning', 'Morning'),
    ('afternoon', 'Afternoon'),
    ('both', 'Morning + Afternoon'),
    ('all', 'All Shifts'),
]

class CoordinatorManager(models.Manager):
    """Custom manager to exclude soft deleted coordinators by default"""
    
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)
    
    def with_deleted(self):
        """Return all coordinators including soft deleted ones"""
        return super().get_queryset()
    
    def only_deleted(self):
        """Return only soft deleted coordinators"""
        return super().get_queryset().filter(is_deleted=True)


class Coordinator(models.Model):
    # Custom manager
    objects = CoordinatorManager()
    
    # Personal Information
    full_name = models.CharField(max_length=150)
    dob = models.DateField()
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    contact_number = models.CharField(max_length=20)
    email = models.EmailField(unique=True)
    cnic = models.CharField(max_length=15, unique=True)
    permanent_address = models.TextField()
    
    # Professional Information
    education_level = models.CharField(max_length=100)
    institution_name = models.CharField(max_length=200)
    year_of_passing = models.IntegerField()
    total_experience_years = models.PositiveIntegerField()
    
    # Work Assignment
    campus = models.ForeignKey(Campus, on_delete=models.SET_NULL, null=True, blank=True)
    # For single-shift coordinators, we keep a single level assignment
    level = models.ForeignKey(
        'classes.Level', 
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='coordinator_set'
    )
    # For 'both' shift coordinators, allow assignment to multiple levels (e.g. L1-M and L1-A)
    assigned_levels = models.ManyToManyField(
        'classes.Level',
        blank=True,
        related_name='assigned_coordinators',
        help_text='Levels managed by this coordinator when shift is both'
    )
    shift = models.CharField(
        max_length=20,
        choices=SHIFT_CHOICES,
        default='both',
        help_text="Shift(s) this coordinator manages"
    )
    joining_date = models.DateField()
    is_currently_active = models.BooleanField(default=True)
    
    # Add permission to assign class teachers
    can_assign_class_teachers = models.BooleanField(default=True, help_text="Can this coordinator assign class teachers?")
    
    # System Fields
    employee_code = models.CharField(max_length=20, unique=True, editable=False, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Soft Delete Fields
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    def save(self, *args, **kwargs):
        # Auto-generate employee_code if not provided
        if not self.employee_code and self.campus:
            try:
                # Get year from joining date or current year
                if self.joining_date:
                    if isinstance(self.joining_date, str):
                        from datetime import datetime
                        joining_date = datetime.strptime(self.joining_date, '%Y-%m-%d').date()
                        year = joining_date.year
                    else:
                        year = self.joining_date.year
                else:
                    year = 2025
                
                # Generate employee code using IDGenerator
                from utils.id_generator import IDGenerator
                # Choose appropriate shift for employee code generation.
                # If coordinator manages both shifts, prefer 'morning' as the canonical
                # code generator input (legacy behaviour). Otherwise use the specific shift.
                shift_for_code = self.shift if self.shift in ('morning', 'afternoon') else 'morning'
                self.employee_code = IDGenerator.generate_unique_employee_code(
                    self.campus, shift_for_code, year, 'coordinator'
                )
            except Exception as e:
                print(f"Error generating employee code: {str(e)}")
        
        super().save(*args, **kwargs)
    
    def get_assigned_teachers(self):
        """
        Get all teachers assigned to this coordinator through level -> grades -> classrooms
        Now considers coordinator's shift assignment
        """
        from teachers.models import Teacher
        from classes.models import ClassRoom
        
        # Determine which levels this coordinator manages
        managed_levels = []
        if self.shift == 'both' and self.assigned_levels.exists():
            managed_levels = list(self.assigned_levels.all())
        elif self.level:
            managed_levels = [self.level]
        else:
            return []
        
        # Get classrooms based on coordinator's shift and managed levels
        if self.shift == 'both':
            classrooms = ClassRoom.objects.filter(
                grade__level__in=managed_levels
            ).select_related('class_teacher')
        else:
            classrooms = ClassRoom.objects.filter(
                grade__level__in=managed_levels,
                shift=self.shift
            ).select_related('class_teacher')
        
        # Get teachers from those classrooms
        teachers = []
        for classroom in classrooms:
            if classroom.class_teacher:
                teachers.append(classroom.class_teacher)
        
        return teachers
    
    def get_assigned_teachers_count(self):
        """Get count of assigned teachers"""
        return len(self.get_assigned_teachers())
    
    def get_assigned_classrooms(self):
        """Get all classrooms under this coordinator's level based on shift"""
        from classes.models import ClassRoom
        
        # Determine which levels this coordinator manages
        managed_levels = []
        if self.shift == 'both' and self.assigned_levels.exists():
            managed_levels = list(self.assigned_levels.all())
        elif self.level:
            managed_levels = [self.level]
        else:
            return ClassRoom.objects.none()
        
        # Get classrooms based on coordinator's shift
        if self.shift == 'both':
            # Coordinator manages both morning and afternoon
            return ClassRoom.objects.filter(
                grade__level__in=managed_levels
            ).select_related('grade', 'class_teacher')
        else:
            # Coordinator manages specific shift
            return ClassRoom.objects.filter(
                grade__level__in=managed_levels,
                shift=self.shift
            ).select_related('grade', 'class_teacher')

    @classmethod
    def get_for_user(cls, user):
        """
        Robust lookup: try employee_code == user.username, then email == user.email.
        Returns a Coordinator instance or None. This avoids raising DoesNotExist
        when data isn't perfectly aligned and centralizes the lookup logic.
        """
        if not user:
            return None

        # Try employee_code first (legacy behaviour)
        try:
            obj = cls.objects.filter(employee_code=user.username).first()
            if obj:
                return obj
        except Exception:
            # Swallow unexpected DB issues here - caller will handle None
            pass

        # Fallback to email if available
        try:
            if getattr(user, 'email', None):
                obj = cls.objects.filter(email=user.email).first()
                if obj:
                    return obj
        except Exception:
            pass

        return None
    
    def soft_delete(self):
        """Soft delete the coordinator - uses update() to bypass signals"""
        import logging
        logger = logging.getLogger(__name__)
        
        if not self.pk:
            raise ValueError("Cannot soft delete coordinator without primary key")
        
        logger.info(f"[SOFT_DELETE] soft_delete() called for coordinator PK: {self.pk}, Name: {self.full_name}")
        
        # Use update() to directly update database without triggering signals
        # This ensures no post_delete or other signals interfere
        # IMPORTANT: Use with_deleted() to bypass custom manager's filter
        updated_count = Coordinator.objects.with_deleted().filter(pk=self.pk).update(
            is_deleted=True,
            deleted_at=timezone.now(),
            is_currently_active=False
        )
        
        logger.info(f"[SOFT_DELETE] Database update() returned updated_count: {updated_count}")
        
        if updated_count == 0:
            logger.error(f"[SOFT_DELETE] CRITICAL: update() returned 0 - no rows were updated! Coordinator PK: {self.pk}")
            raise Exception(f"Soft delete failed - no rows updated for coordinator PK: {self.pk}")
        
        # Refresh instance from database
        self.refresh_from_db()
        logger.info(f"[SOFT_DELETE] After refresh_from_db(), is_deleted: {self.is_deleted}")
    
    def restore(self):
        """Restore a soft deleted coordinator"""
        import logging
        logger = logging.getLogger(__name__)
        
        if not self.pk:
            raise ValueError("Cannot restore coordinator without primary key")
        
        logger.info(f"[RESTORE] restore() called for coordinator PK: {self.pk}, Name: {self.full_name}")
        
        # Use update() to bypass signals
        updated_count = Coordinator.objects.with_deleted().filter(pk=self.pk).update(
            is_deleted=False,
            deleted_at=None
        )
        
        if updated_count == 0:
            logger.error(f"[RESTORE] CRITICAL: update() returned 0 - no rows were updated! Coordinator PK: {self.pk}")
            raise Exception(f"Restore failed - no rows updated for coordinator PK: {self.pk}")
        
        self.refresh_from_db()
        logger.info(f"[RESTORE] After refresh_from_db(), is_deleted: {self.is_deleted}")
    
    def delete(self, using=None, keep_parents=False):
        """
        Override delete() to prevent accidental hard deletes.
        Always use soft_delete() instead.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[OVERRIDE_DELETE] delete() called for coordinator PK: {self.pk}, Name: {self.full_name}, is_deleted: {self.is_deleted}")
        
        if not self.is_deleted:
            logger.info(f"[OVERRIDE_DELETE] Calling soft_delete() instead of hard delete")
            self.soft_delete()
        else:
            raise ValueError(
                "Cannot hard delete coordinator. Use hard_delete() method explicitly if you really want to permanently delete."
            )
    
    def hard_delete(self):
        """Permanently delete the coordinator from database"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.warning(f"[HARD_DELETE] hard_delete() called for coordinator PK: {self.pk}, Name: {self.full_name}")
        super().delete()

    def __str__(self):
        return f"{self.full_name} ({self.employee_code})"