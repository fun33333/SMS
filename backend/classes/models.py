from django.db import models
from django.utils.crypto import get_random_string
from django.core.exceptions import ValidationError
from django.db.models import Q

# Teacher model assumed in 'teachers' app
TEACHER_MODEL = "teachers.Teacher"

# Level choices
LEVEL_CHOICES = [
    ('Pre-Primary', 'Pre-Primary'),
    ('Primary', 'Primary'),
    ('Secondary', 'Secondary'),
]

# Shift choices
SHIFT_CHOICES = [
    ('morning', 'Morning'),
    ('afternoon', 'Afternoon'),
    ('both', 'Both'),
]

# ----------------------
class Level(models.Model):
    """
    School levels: Pre-Primary, Primary, Secondary, etc.
    Now includes shift information for better organization.
    """
    name = models.CharField(
        max_length=50, 
        choices=LEVEL_CHOICES,
        help_text="Select educational level"
    )
    shift = models.CharField(
        max_length=20,
        choices=SHIFT_CHOICES,
        default='morning',
        help_text="Shift for this level"
    )
    code = models.CharField(max_length=25, unique=True, blank=True, null=True, editable=False)
    
    # Campus connection - set to null if campus is deleted (data preservation)
    campus = models.ForeignKey(
        'campus.Campus',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='levels',
        help_text="Campus this level belongs to"
    )
    
    # Coordinator relationship is handled via Coordinator.level field
    # This avoids circular dependencies
    coordinator_assigned_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.code:
            if self.campus and self.campus.campus_code:
                campus_code = self.campus.campus_code
                level_mapping = {
                    'Pre-Primary': 'L1',
                    'Primary': 'L2', 
                    'Secondary': 'L3'
                }
                level_num = level_mapping.get(self.name, 'L1')
                shift_code = self.shift[0].upper()  # M for morning, A for afternoon, etc.
                self.code = f"{campus_code}-{level_num}-{shift_code}"
        super().save(*args, **kwargs)

    class Meta:
        unique_together = ("campus", "name", "shift")
    
    def __str__(self):
        campus_name = self.campus.campus_name if self.campus else "No Campus"
        return f"{self.name}-{self.shift.title()} ({campus_name})"
    
    @property
    def coordinator(self):
        """Get a coordinator assigned to this level (supports FK and M2M)."""
        # Prefer direct FK assignment via Coordinator.level
        direct = self.coordinator_set.first()
        if direct:
            return direct
        # Fallback to M2M via Coordinator.assigned_levels (for shift='both')
        try:
            return self.assigned_coordinators.first()
        except Exception:
            return None
    
    @property
    def coordinator_name(self):
        """Get coordinator name(s) for display (handles multiple)."""
        names = []
        try:
            direct_list = list(self.coordinator_set.all())
        except Exception:
            direct_list = []
        try:
            m2m_list = list(self.assigned_coordinators.all())
        except Exception:
            m2m_list = []

        seen = set()
        for coord in direct_list + m2m_list:
            if coord and coord.id not in seen:
                seen.add(coord.id)
                label = f"{coord.full_name} ({coord.employee_code or '-'})"
                names.append(label)
        return ", ".join(names) if names else None

# ----------------------
class Grade(models.Model):
    """
    Top-level grade (e.g., Grade 1, Grade 2)
    """
    name = models.CharField(max_length=50)
    code = models.CharField(max_length=25, unique=True, blank=True, null=True, editable=False)
    
    # Level connection
    level = models.ForeignKey(
        Level,
        on_delete=models.CASCADE,
        related_name='grade_set',
        help_text="Level this grade belongs to"
    )

    def save(self, *args, **kwargs):
        """
        Auto-generate a human-readable grade code that is:
        - Campus-aware via the parent Level.code (e.g., C04-L2-M)
        - Clearly showing the grade number at the end (G1, G2, ..., G10)

        Examples:
        - Campus 4, Level 2, Morning, Grade 1  -> C04-L2-M-G1
        - Campus 6, Level 2, Afternoon, Grade 1 -> C06-L2-A-G1
        """
        if not self.code and self.level:
            level_code = self.level.code  # e.g. C04-L2-M

            # Normalize the name for mapping / parsing
            raw_name = (self.name or "").strip()
            normalized = raw_name.lower()

            # Explicit mappings for non-numeric grades
            grade_mapping = {
                'nursery': 'N',
                'kg-i': 'KG1',
                'kg 1': 'KG1',
                'kg-i.': 'KG1',
                'kg-ii': 'KG2',
                'kg 2': 'KG2',
                'special class': 'SC',
            }

            grade_code = None

            # 1) Try direct mapping first (after simple normalization)
            key = normalized.replace('_', ' ').replace('-', ' ').replace('  ', ' ')
            key = ' '.join(key.split())  # collapse multiple spaces
            grade_code = grade_mapping.get(key)

            # 2) If it's a "Grade X" style name, derive G1, G2, ..., G10
            if grade_code is None and normalized.startswith("grade"):
                # Case 1: Grade-1 / Grade 1 / Grade 10  -> use digits directly
                digits = "".join(ch for ch in normalized if ch.isdigit())
                if digits:
                    grade_code = f"G{digits}"  # e.g. Grade-1 / Grade 1 -> G1
                else:
                    # Case 2: Grade I / Grade II / Grade III ... (roman numerals)
                    # Normalize separators so "Grade-I" and "Grade I" both work
                    cleaned = normalized.replace('-', ' ')
                    parts = cleaned.split()
                    if len(parts) >= 2:
                        roman = parts[1].strip('.')
                        roman_map = {
                            'i': 1,
                            'ii': 2,
                            'iii': 3,
                            'iv': 4,
                            'v': 5,
                            'vi': 6,
                            'vii': 7,
                            'viii': 8,
                            'ix': 9,
                            'x': 10,
                        }
                        value = roman_map.get(roman)
                        if value:
                            grade_code = f"G{value}"

            # 3) Fallback: first 3 letters of the original name (legacy safety net)
            if grade_code is None:
                grade_code = raw_name[:3].upper() or "GRD"

            self.code = f"{level_code}-{grade_code}"

        super().save(*args, **kwargs)

    class Meta:
        unique_together = ("level", "name")
    
    def __str__(self):
        campus_name = self.level.campus.campus_name if self.level and self.level.campus else "No Campus"
        return f"{self.name} ({campus_name})"

# ----------------------
class ClassRoom(models.Model):
    """
    Represents a specific class (Grade + Section)
    Example: "Grade 1 - A"
    """
    SECTION_CHOICES = [(c, c) for c in ("A", "B", "C", "D", "E")]

    grade = models.ForeignKey(Grade, related_name="classrooms", on_delete=models.CASCADE)
    section = models.CharField(max_length=3, choices=SECTION_CHOICES)
    
    # Shift information
    shift = models.CharField(
        max_length=20,
        choices=SHIFT_CHOICES,
        default='morning',
        help_text="Shift for this classroom"
    )
    
    # Allow a teacher to be class teacher of multiple classrooms (e.g., both shifts)
    class_teacher = models.ForeignKey(
        TEACHER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='classroom_set',
        help_text="Class teacher for this classroom"
    )
    capacity = models.PositiveIntegerField(default=30)
    code = models.CharField(max_length=30, unique=True, editable=False)
    
    # Assignment tracking
    assigned_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='classroom_assignments_made',
        help_text="User who assigned the class teacher"
    )
    assigned_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("grade", "section", "shift")
        ordering = ("grade__name", "section", "shift")

    def __str__(self):
        return f"{self.grade.name} - {self.section}"

    def get_display_code_components(self):
        # Use grade code if available, otherwise generate from name
        if self.grade and self.grade.code:
            grade_code = self.grade.code
        else:
            grade_code = "".join(self.grade.name.split()).upper()
        return grade_code, self.section

    def get_expected_coordinator(self):
        """Get the coordinator that should be assigned for this classroom"""
        if self.grade and self.grade.level and self.campus:
            from coordinator.models import Coordinator
            return Coordinator.objects.filter(
                level=self.grade.level,
                campus=self.campus,
                is_currently_active=True
            ).first()
        return None

    def save(self, *args, **kwargs):
        if not self.code and self.grade:
            grade_code = self.grade.code
            section = self.section
            self.code = f"{grade_code}-{section}"
        super().save(*args, **kwargs)
    
    # Properties for easy access
    @property
    def level(self):
        return self.grade.level if self.grade else None
    
    @property
    def campus(self):
        return self.grade.level.campus if self.grade and self.grade.level else None
    
    def get_students_for_teacher(self, teacher):
        """
        Get students assigned to this classroom for a specific teacher
        Only returns students from the same campus as the teacher
        """
        if not teacher or not teacher.current_campus:
            return self.students.none()
        
        return self.students.filter(
            campus=teacher.current_campus,
            is_draft=False
        )
    
    def get_available_students_for_assignment(self):
        """
        Get students from same campus and grade who can be assigned to this classroom
        """
        if not self.campus or not self.grade:
            return Student.objects.none()
        
        from students.models import Student
        
        # Normalize grade names for matching
        grade_name_variations = [
            self.grade.name,
            self.grade.name.replace('-', ' '),  # Grade-4 -> Grade 4
            self.grade.name.replace(' ', '-'),  # Grade 4 -> Grade-4
        ]
        
        grade_query = Q()
        for grade_var in grade_name_variations:
            grade_query |= Q(current_grade__icontains=grade_var)
        
        return Student.objects.filter(
            campus=self.campus,
            is_draft=False
        ).filter(grade_query).filter(
            Q(classroom__isnull=True) | Q(classroom=self)
        )