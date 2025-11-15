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
        field_name='current_grade',
        lookup_expr='icontains',
        help_text="Filter by current grade"
    )
    
    section = django_filters.CharFilter(
        field_name='section',
        lookup_expr='icontains',
        help_text="Filter by section"
    )
    
    
    gender = django_filters.ChoiceFilter(
        choices=Student._meta.get_field('gender').choices,
        help_text="Filter by gender"
    )
    
    shift = django_filters.CharFilter(
        field_name='shift',
        lookup_expr='icontains',
        help_text="Filter by shift"
    )
    
    classroom = django_filters.ModelChoiceFilter(
        queryset=ClassRoom.objects.all(),
        field_name='classroom',
        help_text="Filter by classroom"
    )
    
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
    
    class Meta:
        model = Student
        fields = [
            'campus', 'current_grade', 'section',  
            'gender', 'shift', 'classroom', 'enrollment_year',
            'created_after', 'created_before', 'is_draft', 'is_deleted', 'is_active'
        ]
