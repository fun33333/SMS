from django.db import models
from django.utils import timezone
from campus.models import Campus
from users.models import User

# Choices
GENDER_CHOICES = [
    ("male", "Male"),
    ("female", "Female"),
    ("other", "Other"),
]

MARITAL_STATUS_CHOICES = [
    ("single", "Single"),
    ("married", "Married"),
    ("divorced", "Divorced"),
    ("widowed", "Widowed"),
]

SAVE_STATUS_CHOICES = [
    ("draft", "Draft"),
    ("final", "Final"),
]

class TeacherRole(models.Model):
    name = models.CharField(max_length=150)
    date_created = models.DateTimeField(auto_now_add=True)  # Added to fix ordering error

    class Meta:
        ordering = ['date_created']
        verbose_name = "Teacher Role"
        verbose_name_plural = "Teacher Roles"

    def __str__(self):
        return self.name


class TeacherManager(models.Manager):
    """Custom manager to exclude soft deleted teachers by default"""
    
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)
    
    def with_deleted(self):
        """Return all teachers including soft deleted ones"""
        return super().get_queryset()
    
    def only_deleted(self):
        """Return only soft deleted teachers"""
        return super().get_queryset().filter(is_deleted=True)


class Teacher(models.Model):
    # Custom manager
    objects = TeacherManager()
    
    # User Account
    user = models.OneToOneField(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='teacher_profile')
    
    # Personal Information
    full_name = models.CharField(max_length=150)
    dob = models.DateField(verbose_name="Date of Birth")
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    contact_number = models.CharField(max_length=20)
    email = models.EmailField(unique=True)
    permanent_address = models.TextField(blank=True, null=True)
    current_address = models.TextField(blank=True, null=True)
    marital_status = models.CharField(max_length=20, choices=MARITAL_STATUS_CHOICES, blank=True, null=True)
    cnic = models.CharField(max_length=15, unique=True)

    # Education Information
    education_level = models.CharField(max_length=100, blank=True, null=True)
    institution_name = models.CharField(max_length=200, blank=True, null=True)
    year_of_passing = models.IntegerField(blank=True, null=True)
    education_subjects = models.CharField(max_length=200, blank=True, null=True)
    education_grade = models.CharField(max_length=50, blank=True, null=True)
    
    # Additional Education Fields
    # additional_education_level = models.CharField(max_length=100, blank=True, null=True)
    # additional_institution_name = models.CharField(max_length=200, blank=True, null=True)
    # additional_year_of_passing = models.IntegerField(blank=True, null=True)
    # additional_education_subjects = models.CharField(max_length=200, blank=True, null=True)
    # additional_education_grade = models.CharField(max_length=50, blank=True, null=True)
    
    # Experience Information
    previous_institution_name = models.CharField(max_length=200, blank=True, null=True)
    previous_position = models.CharField(max_length=150, blank=True, null=True)
    experience_from_date = models.DateField(blank=True, null=True)
    experience_to_date = models.DateField(blank=True, null=True)
    # experience_subjects_classes_taught = models.CharField(max_length=200, blank=True, null=True)
    # previous_responsibilities = models.TextField(blank=True, null=True)
    total_experience_years = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    
    # # Additional Experience Fields
    # additional_institution_name_exp = models.CharField(max_length=200, blank=True, null=True)
    # additional_position = models.CharField(max_length=150, blank=True, null=True)
    # additional_experience_from_date = models.DateField(blank=True, null=True)
    # additional_experience_to_date = models.DateField(blank=True, null=True)
    # additional_experience_subjects_classes = models.CharField(max_length=200, blank=True, null=True)
    # additional_responsibilities = models.TextField(blank=True, null=True)
    
    # Current Role Information
    joining_date = models.DateField(blank=True, null=True)
    current_role_title = models.CharField(max_length=150, blank=True, null=True)
    current_campus = models.ForeignKey(Campus, on_delete=models.SET_NULL, related_name="teachers", blank=True, null=True)
    
    # Coordinator Assignment - NEW FIELD (ManyToMany for multi-level teachers)
    assigned_coordinators = models.ManyToManyField(
        'coordinator.Coordinator',
        blank=True,
        related_name='assigned_teachers',
        help_text="Coordinators assigned to this teacher based on grades/levels taught"
    )
    
    # Keep old field temporarily for migration compatibility
    assigned_coordinator = models.ForeignKey(
        'coordinator.Coordinator',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='legacy_assigned_teachers',
        help_text="LEGACY: Single coordinator (use assigned_coordinators instead)"
    )
    
    # Shift Information - NEW FIELD
    shift = models.CharField(
        max_length=20, 
        choices=[
            ('morning', 'Morning'),
            ('afternoon', 'Afternoon'),
            ('both', 'Both'),
        ],
        default='morning',
        help_text="Teacher's working shift"
    )
    
    current_subjects = models.CharField(max_length=200, blank=True, null=True)
    current_classes_taught = models.CharField(max_length=200, blank=True, null=True)
    current_extra_responsibilities = models.TextField(blank=True, null=True)
    role_start_date = models.DateField(blank=True, null=True)
    # role_end_date = models.DateField(blank=True, null=True)
    is_currently_active = models.BooleanField(default=True)
    
    # Auto Generated Fields
    teacher_id = models.CharField(max_length=20, unique=True, editable=False, null=True, blank=True)
    employee_code = models.CharField(max_length=20, unique=True, editable=False, null=True, blank=True)
    
    # System Fields
    save_status = models.CharField(max_length=10, choices=SAVE_STATUS_CHOICES, default="draft")
    date_created = models.DateTimeField(auto_now_add=True)
    date_updated = models.DateTimeField(auto_now=True)
    
    # Soft Delete Fields
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    # Class Teacher Information - FIXED
    is_class_teacher = models.BooleanField(default=False, help_text="Is this teacher a class teacher?")
    class_teacher_level = models.ForeignKey(
        'classes.Level',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_teachers',
        help_text="Level for class teacher assignment"
    )
    class_teacher_grade = models.CharField(
        max_length=50, 
        blank=True, 
        null=True,
        help_text="Grade for class teacher assignment"
    )
    class_teacher_section = models.CharField(
        max_length=10, 
        blank=True, 
        null=True,
        help_text="Section for class teacher assignment"
    )
    # Multiple classroom assignments for teachers working both shifts
    assigned_classrooms = models.ManyToManyField(
        'classes.ClassRoom', 
        blank=True,
        related_name='class_teachers',  # Changed related_name for ManyToMany
        help_text="Classrooms assigned to this class teacher (can be multiple for both shifts)"
    )
    
    # Keep legacy field for backward compatibility during migration
    assigned_classroom = models.OneToOneField(
        'classes.ClassRoom', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='legacy_class_teacher',  # Changed related_name to avoid conflicts
        help_text="LEGACY: Single classroom assignment (use assigned_classrooms instead)"
    )
    
    # Assignment tracking
    classroom_assigned_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='teacher_assignments_made',
        help_text="User who assigned this teacher to classroom"
    )
    classroom_assigned_at = models.DateTimeField(null=True, blank=True)
    
    def save(self, *args, **kwargs):
        if not self.employee_code and self.current_campus:
            try:
                shift = self.shift if self.shift else 'morning'
                
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
                self.employee_code = IDGenerator.generate_unique_employee_code(
                    self.current_campus, shift, year, 'teacher'
                )
            except Exception as e:
                print(f"Error generating employee code: {str(e)}")
        
        # FIX: Auto-set class teacher status when classrooms are assigned
        has_classrooms = (self.assigned_classroom or 
                         (self.pk and self.assigned_classrooms.exists()))
        
        if has_classrooms and not self.is_class_teacher:
            self.is_class_teacher = True
            print(f"Setting {self.full_name} as class teacher")
        elif not has_classrooms and self.is_class_teacher:
            self.is_class_teacher = False
            print(f"Removing class teacher status from {self.full_name}")
        
        # Save first to get ID for ManyToMany operations
        is_new = self.pk is None
        super().save(*args, **kwargs)
        
        # Auto-assign coordinators based on assigned_classroom (legacy)
        if self.assigned_classroom and self.current_campus:
            self._assign_coordinators_from_classroom()
        
        # Auto-assign coordinators based on assigned_classrooms (new)
        elif self.assigned_classrooms.exists() and self.current_campus:
            self._assign_coordinators_from_classrooms()
        
        # Auto-assign coordinators based on current_classes_taught
        elif self.current_campus and self.current_classes_taught:
            self._assign_coordinators_from_classes()
    
    def _assign_coordinators_from_classroom(self):
        """Assign coordinator from assigned classroom"""
        try:
            from coordinator.models import Coordinator
            classroom = self.assigned_classroom
            if classroom.grade and classroom.grade.level:
                level = classroom.grade.level
                coordinator = Coordinator.objects.filter(
                    level=level,
                    campus=self.current_campus,
                    is_currently_active=True
                ).first()
                
                if coordinator:
                    # Add coordinator (not replace)
                    if coordinator not in self.assigned_coordinators.all():
                        self.assigned_coordinators.add(coordinator)
                        print(f"[OK] Added coordinator {coordinator.full_name} for level {level.name}")
                else:
                    print(f"[WARN] No coordinator for level {level.name}")
        except Exception as e:
            print(f"Error: {str(e)}")

    def _assign_coordinators_from_classrooms(self):
        """Assign coordinators from all assigned classrooms"""
        try:
            from coordinator.models import Coordinator
            
            # Clear existing coordinators
            self.assigned_coordinators.clear()
            
            # Get coordinators for all assigned classrooms
            for classroom in self.assigned_classrooms.all():
                if classroom.grade and classroom.grade.level:
                    level = classroom.grade.level
                    coordinator = Coordinator.objects.filter(
                        level=level,
                        campus=self.current_campus,
                        is_currently_active=True
                    ).first()
                    
                    if coordinator and coordinator not in self.assigned_coordinators.all():
                        self.assigned_coordinators.add(coordinator)
                        print(f"[OK] Added coordinator {coordinator.full_name} for level {level.name}")
            
            print(f"[OK] Assigned {self.assigned_coordinators.count()} coordinators to {self.full_name}")
            
        except Exception as e:
            print(f"Error: {str(e)}")

    def _assign_coordinators_from_classes(self):
        """Extract all grades and assign all relevant coordinators"""
        try:
            from classes.models import Grade
            from coordinator.models import Coordinator
            import re
            
            classes_text = self.current_classes_taught.lower()
            
            # Extract ALL grade numbers from text
            grade_numbers = re.findall(r'grade\s*[-]?\s*(\d+)', classes_text)
            
            # Check for pre-primary classes
            has_nursery = 'nursery' in classes_text
            has_kg1 = any(term in classes_text for term in ['kg-1', 'kg1', 'kg-i'])
            has_kg2 = any(term in classes_text for term in ['kg-2', 'kg2', 'kg-ii'])
            
            # Build list of grade names
            grade_names = []
            if has_nursery:
                grade_names.append('Nursery')
            if has_kg1:
                grade_names.append('KG-I')
            if has_kg2:
                grade_names.append('KG-II')
            for num in grade_numbers:
                grade_names.append(f"Grade {num}")
            
            # Find all unique levels
            levels = set()
            for grade_name in grade_names:
                grade = Grade.objects.filter(
                    name__icontains=grade_name,
                    level__campus=self.current_campus
                ).first()
                if grade and grade.level:
                    levels.add(grade.level)
            
            # Clear existing coordinators and add new ones
            self.assigned_coordinators.clear()
            
            # Get coordinators for all levels
            for level in levels:
                coordinator = Coordinator.objects.filter(
                    level=level,
                    campus=self.current_campus,
                    is_currently_active=True
                ).first()
                
                if coordinator:
                    self.assigned_coordinators.add(coordinator)
                    print(f"[OK] Added coordinator {coordinator.full_name} for level {level.name}")
            
            print(f"[OK] Assigned {self.assigned_coordinators.count()} coordinators to {self.full_name}")
            
        except Exception as e:
            print(f"Error: {str(e)}")
    
    def soft_delete(self):
        """Soft delete the teacher - uses update() to bypass signals"""
        import logging
        logger = logging.getLogger(__name__)
        
        if not self.pk:
            raise ValueError("Cannot soft delete teacher without primary key")
        
        logger.info(f"[SOFT_DELETE] soft_delete() called for teacher PK: {self.pk}, Name: {self.full_name}")
        
        # Use update() to directly update database without triggering signals
        # This ensures no post_delete or other signals interfere
        # IMPORTANT: Use with_deleted() to bypass custom manager's filter
        updated_count = Teacher.objects.with_deleted().filter(pk=self.pk).update(
            is_deleted=True,
            deleted_at=timezone.now(),
            is_currently_active=False
        )
        
        logger.info(f"[SOFT_DELETE] Database update() returned updated_count: {updated_count}")
        
        if updated_count == 0:
            logger.error(f"[SOFT_DELETE] CRITICAL: update() returned 0 - no rows were updated! Teacher PK: {self.pk}")
            raise Exception(f"Soft delete failed - no rows updated for teacher PK: {self.pk}")
        
        # Refresh instance from database
        self.refresh_from_db()
        logger.info(f"[SOFT_DELETE] After refresh_from_db(), is_deleted: {self.is_deleted}")
    
    def restore(self):
        """Restore a soft deleted teacher"""
        import logging
        logger = logging.getLogger(__name__)
        
        if not self.pk:
            raise ValueError("Cannot restore teacher without primary key")
        
        logger.info(f"[RESTORE] restore() called for teacher PK: {self.pk}, Name: {self.full_name}")
        
        # Use update() to bypass signals
        updated_count = Teacher.objects.with_deleted().filter(pk=self.pk).update(
            is_deleted=False,
            deleted_at=None
        )
        
        if updated_count == 0:
            logger.error(f"[RESTORE] CRITICAL: update() returned 0 - no rows were updated! Teacher PK: {self.pk}")
            raise Exception(f"Restore failed - no rows updated for teacher PK: {self.pk}")
        
        self.refresh_from_db()
        logger.info(f"[RESTORE] After refresh_from_db(), is_deleted: {self.is_deleted}")
    
    def delete(self, using=None, keep_parents=False):
        """
        Override delete() to prevent accidental hard deletes.
        Always use soft_delete() instead.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[OVERRIDE_DELETE] delete() called for teacher PK: {self.pk}, Name: {self.full_name}, is_deleted: {self.is_deleted}")
        
        if not self.is_deleted:
            logger.info(f"[OVERRIDE_DELETE] Calling soft_delete() instead of hard delete")
            self.soft_delete()
        else:
            raise ValueError(
                "Cannot hard delete teacher. Use hard_delete() method explicitly if you really want to permanently delete."
            )
    
    def hard_delete(self):
        """Permanently delete the teacher from database"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.warning(f"[HARD_DELETE] hard_delete() called for teacher PK: {self.pk}, Name: {self.full_name}")
        super().delete()

    def __str__(self):
        return f"{self.full_name} ({self.employee_code or 'No Code'})"

    class Meta:
        verbose_name = "Teacher"
        verbose_name_plural = "Teachers"
        ordering = ['-date_created'] 