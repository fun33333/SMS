import django_filters
from django.db.models import Q
from .models import Student
from campus.models import Campus
from classes.models import ClassRoom


class StudentFilter(django_filters.FilterSet):
    """Filter for Student model with comprehensive filtering options"""
    
    # Basic filters
    campus = django_filters.ModelChoiceFilter(
        queryset=Campus.objects.all(),
        field_name='campus',
        help_text="Filter by campus"
    )
    
    current_grade = django_filters.CharFilter(
        method='filter_current_grade',
        help_text="Filter by current grade (checks both student.current_grade and classroom.grade.name)"
    )
    
    section = django_filters.CharFilter(
        method='filter_section',
        help_text="Filter by section (checks both student.section and classroom.section)"
    )
    
    # Accept 'male', 'female', 'other' (and case-insensitive) instead of strict DB choices
    gender = django_filters.CharFilter(
        field_name='gender',
        lookup_expr='iexact',
        help_text="Filter by gender (male/female/other)"
    )
    
    shift = django_filters.CharFilter(
        method='filter_shift',
        help_text="Filter by shift (checks both student.shift and classroom.shift)"
    )
    
    # Add missing filters so stats respect these params
    mother_tongue = django_filters.CharFilter(
        field_name='mother_tongue',
        lookup_expr='icontains',
        help_text="Filter by mother tongue"
    )
    
    religion = django_filters.CharFilter(
        field_name='religion',
        lookup_expr='icontains',
        help_text="Filter by religion"
    )
    
    classroom = django_filters.ModelChoiceFilter(
        queryset=ClassRoom.objects.all(),
        field_name='classroom',
        help_text="Filter by classroom"
    )
    
    # Filter for unassigned students (classroom is null)
    # Using CharFilter with method to handle 'true'/'false' strings from URL
    classroom__isnull = django_filters.CharFilter(
        method='filter_classroom_isnull',
        help_text="Filter students with no classroom assignment (pass 'true' or '1')"
    )
    
    def filter_classroom_isnull(self, queryset, name, value):
        """Custom filter method for classroom__isnull"""
        import logging
        logger = logging.getLogger(__name__)
        
        if value and value.lower() in ('true', '1', 'yes'):
            # Force evaluation to ensure we're working with fresh data
            filtered = queryset.filter(classroom__isnull=True)
            logger.info(f"Filtering for unassigned students (classroom__isnull=True)")
            return filtered
        elif value and value.lower() in ('false', '0', 'no'):
            filtered = queryset.filter(classroom__isnull=False)
            logger.info(f"Filtering for assigned students (classroom__isnull=False)")
            return filtered
        return queryset
    
    # Date range filters
    enrollment_year = django_filters.NumberFilter(
        field_name='enrollment_year',
        help_text="Filter by enrollment year"
    )
    
    created_after = django_filters.DateFilter(
        field_name='created_at',
        lookup_expr='gte',
        help_text="Students created after this date"
    )
    
    created_before = django_filters.DateFilter(
        field_name='created_at',
        lookup_expr='lte',
        help_text="Students created before this date"
    )
    
    # Advanced filters
    is_draft = django_filters.BooleanFilter(
        field_name='is_draft',
        help_text="Filter by draft status"
    )
    
    is_deleted = django_filters.BooleanFilter(
        field_name='is_deleted',
        help_text="Filter by deletion status"
    )
    
    is_active = django_filters.BooleanFilter(
        field_name='is_active',
        help_text="Filter by active status (active students appear in attendance)"
    )
    
    # Search functionality
    search = django_filters.CharFilter(
        method='filter_search',
        help_text="Search in name, student_code, gr_no, father_name"
    )
    
    def filter_search(self, queryset, name, value):
        """Custom search method for multiple fields"""
        if not value:
            return queryset
            
        return queryset.filter(
            Q(name__icontains=value) |
            Q(student_code__icontains=value) |
            Q(gr_no__icontains=value) |
            Q(father_name__icontains=value) |
            Q(student_id__icontains=value)
        )
    
    def filter_shift(self, queryset, name, value):
        """Filter by shift - check both student.shift and classroom.shift"""
        if not value:
            return queryset
        
        # Normalize the shift value
        shift_value = value.strip().lower()
        
        # Filter by both student's shift field and classroom's shift field
        return queryset.filter(
            Q(shift__iexact=shift_value) |
            Q(classroom__shift__iexact=shift_value)
        )
    
    def filter_section(self, queryset, name, value):
        """Filter by section - check both student.section and classroom.section"""
        if not value:
            return queryset
        
        # Normalize the section value (uppercase for consistency)
        section_value = value.strip().upper()
        
        # Filter by both student's section field and classroom's section field
        return queryset.filter(
            Q(section__iexact=section_value) |
            Q(classroom__section__iexact=section_value)
        )
    
    def filter_current_grade(self, queryset, name, value):
        """Filter by grade - check both student.current_grade and classroom.grade.name with precise matching"""
        if not value:
            return queryset
        
        # Normalize the grade value
        grade_value = value.strip()
        
        # Roman numeral to number mapping
        roman_to_num = {
            'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
            'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
        }
        
        # Number to Roman mapping
        num_to_roman = {v: k.upper() for k, v in roman_to_num.items()}
        
        # Extract grade type and number/roman
        grade_lower = grade_value.lower()
        grade_upper = grade_value.upper()
        
        # Build exact match variations
        exact_matches = set()
        
        # Add the original value
        exact_matches.add(grade_value)
        exact_matches.add(grade_upper)
        exact_matches.add(grade_lower)
        
        # Handle KG grades (KG-I, KG-1, KG1, etc.)
        if 'kg' in grade_lower:
            # Extract the number/roman part
            import re
            match = re.search(r'kg[-_\s]?([ivx\d]+)', grade_lower)
            if match:
                num_part = match.group(1)
                # Try to convert roman to number
                if num_part in roman_to_num:
                    num = roman_to_num[num_part]
                    exact_matches.add(f'KG-{num}')
                    exact_matches.add(f'KG-{num_part.upper()}')
                    exact_matches.add(f'KG{num}')
                    exact_matches.add(f'KG{num_part.upper()}')
                # Try to convert number to roman
                elif num_part in num_to_roman:
                    roman = num_to_roman[num_part]
                    exact_matches.add(f'KG-{roman}')
                    exact_matches.add(f'KG-{num_part}')
                    exact_matches.add(f'KG{roman}')
                    exact_matches.add(f'KG{num_part}')
                else:
                    # Keep as is
                    exact_matches.add(f'KG-{num_part.upper()}')
                    exact_matches.add(f'KG{num_part.upper()}')
        
        # Handle regular grades (Grade 1, Grade I, Grade-1, etc.)
        elif 'grade' in grade_lower:
            # Extract the number/roman part
            import re
            match = re.search(r'grade[-_\s]?([ivx\d]+)', grade_lower)
            if match:
                num_part = match.group(1)
                # Try to convert roman to number
                if num_part in roman_to_num:
                    num = roman_to_num[num_part]
                    exact_matches.add(f'Grade {num}')
                    exact_matches.add(f'Grade-{num}')
                    exact_matches.add(f'Grade {num_part.upper()}')
                    exact_matches.add(f'Grade-{num_part.upper()}')
                # Try to convert number to roman
                elif num_part in num_to_roman:
                    roman = num_to_roman[num_part]
                    exact_matches.add(f'Grade {roman}')
                    exact_matches.add(f'Grade-{roman}')
                    exact_matches.add(f'Grade {num_part}')
                    exact_matches.add(f'Grade-{num_part}')
                else:
                    # Keep as is
                    exact_matches.add(f'Grade {num_part}')
                    exact_matches.add(f'Grade-{num_part}')
        
        # Build query for student's current_grade field - use exact or iexact matching
        student_grade_query = Q()
        for match_value in exact_matches:
            # Use iexact for exact matching (case-insensitive)
            student_grade_query |= Q(current_grade__iexact=match_value)
            # Also try with spaces normalized
            student_grade_query |= Q(current_grade__iexact=match_value.replace('-', ' '))
            student_grade_query |= Q(current_grade__iexact=match_value.replace(' ', '-'))
        
        # Build query for classroom's grade name - use exact matching
        classroom_grade_query = Q()
        for match_value in exact_matches:
            # Use iexact for exact matching (case-insensitive)
            classroom_grade_query |= Q(classroom__grade__name__iexact=match_value)
            # Also try with spaces normalized
            classroom_grade_query |= Q(classroom__grade__name__iexact=match_value.replace('-', ' '))
            classroom_grade_query |= Q(classroom__grade__name__iexact=match_value.replace(' ', '-'))
        
        # Filter by both student's current_grade and classroom's grade
        return queryset.filter(student_grade_query | classroom_grade_query)
    
    class Meta:
        model = Student
        fields = [
            'campus', 'current_grade', 'section',  
            'gender', 'shift', 'classroom', 'enrollment_year',
            'mother_tongue', 'religion',
            'created_after', 'created_before', 'is_draft', 'is_deleted', 'is_active'
        ]
