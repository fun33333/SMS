from rest_framework import viewsets, decorators, response, permissions
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from .models import Coordinator
from .serializers import CoordinatorSerializer
from .filters import CoordinatorFilter
from teachers.models import Teacher
from students.models import Student
from classes.models import ClassRoom
from django.db.models import Count, Q
import logging

logger = logging.getLogger(__name__)


class CoordinatorViewSet(viewsets.ModelViewSet):
    queryset = Coordinator.objects.all()
    serializer_class = CoordinatorSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    # Filtering, search, and ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = CoordinatorFilter
    search_fields = ['full_name', 'employee_code', 'email']
    ordering_fields = ['full_name', 'joining_date', 'employee_code']
    ordering = ['-joining_date']  # Default ordering
    
    def get_queryset(self):
        """Override queryset to optimize queries and handle shift filtering"""
        queryset = Coordinator.objects.select_related('level', 'campus').prefetch_related('assigned_levels')
        
        # Get shift filter value from request
        shift = self.request.query_params.get('shift')
        
        if shift:
            if shift == 'both':
                # Only coordinators with assigned_levels (both shifts)
                queryset = queryset.filter(assigned_levels__isnull=False)
            else:
                # Single shift coordinators + both shift coordinators
                queryset = queryset.filter(
                    Q(level__shift=shift) |  # Single shift
                    Q(assigned_levels__isnull=False)  # Both shifts
                )
            
            queryset = queryset.distinct()
            
        return queryset
    
    def perform_create(self, serializer):
        """Set actor before creating coordinator"""
        instance = serializer.save()
        instance._actor = self.request.user
        # Save again to trigger signals with actor
        instance.save()
    
    def perform_update(self, serializer):
        """Set actor before updating coordinator"""
        instance = serializer.save()
        instance._actor = self.request.user
        # Save again to trigger signals with actor
        instance.save()
    
    def perform_destroy(self, instance):
        """Soft delete coordinator by marking as inactive instead of removing from DB"""
        instance._actor = self.request.user
        instance.is_currently_active = False
        instance.save()
    
    def create(self, request, *args, **kwargs):
        """Override create method to add debug logging"""
        logger.info(f"Received coordinator data: {request.data}")
        logger.info(f"DOB field value: {request.data.get('dob')}")
        logger.info(f"DOB field type: {type(request.data.get('dob'))}")
        
        # Check for null values in required fields
        required_fields = ['full_name', 'dob', 'gender', 'contact_number', 'email', 'cnic', 
                          'permanent_address', 'education_level', 'institution_name', 
                          'year_of_passing', 'total_experience_years', 'joining_date']
        
        for field in required_fields:
            value = request.data.get(field)
            logger.info(f"Field {field}: {value} (type: {type(value)})")
            if value is None or value == '':
                logger.warning(f"Field {field} is null or empty!")
        
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            logger.error(f"Error creating coordinator: {str(e)}")
            logger.error(f"Request data: {request.data}")
            raise
    
    def update(self, request, *args, **kwargs):
        """Override update method to add debug logging"""
        logger.info(f"Updating coordinator {kwargs.get('pk')} with data: {request.data}")
        logger.info(f"Request method: {request.method}")
        
        try:
            return super().update(request, *args, **kwargs)
        except Exception as e:
            logger.error(f"Error updating coordinator: {str(e)}")
            logger.error(f"Request data: {request.data}")
            raise
    
    def partial_update(self, request, *args, **kwargs):
        """Override partial_update method to add debug logging"""
        logger.info(f"Partially updating coordinator {kwargs.get('pk')} with data: {request.data}")
        logger.info(f"Request method: {request.method}")
        
        try:
            return super().partial_update(request, *args, **kwargs)
        except Exception as e:
            logger.error(f"Error partially updating coordinator: {str(e)}")
            logger.error(f"Request data: {request.data}")
            raise
    
    def get_queryset(self):
        """Override to handle role-based filtering and optimize queries"""
        # Only return currently active coordinators in normal API responses
        queryset = Coordinator.objects.select_related('campus').filter(is_currently_active=True)
        
        # Role-based filtering
        user = self.request.user
        if hasattr(user, 'campus') and user.campus and hasattr(user, 'is_principal') and user.is_principal():
            # Principal: Only show coordinators from their campus
            queryset = queryset.filter(campus=user.campus)
        
        # Handle filtering for available coordinators (level__isnull=True)
        level_isnull = self.request.query_params.get('level__isnull')
        if level_isnull is not None:
            if level_isnull.lower() == 'true':
                queryset = queryset.filter(level__isnull=True)
            elif level_isnull.lower() == 'false':
                queryset = queryset.filter(level__isnull=False)
        
        # Handle shift filtering
        shift_filter = self.request.query_params.get('shift')
        if shift_filter:
            if shift_filter in ['morning', 'afternoon']:
                # Filter coordinators who work this specific shift or both
                queryset = queryset.filter(
                    Q(shift=shift_filter) | Q(shift='both')
                )
            elif shift_filter == 'both':
                # Show only coordinators who work both shifts
                queryset = queryset.filter(shift='both')
        
        return queryset

    @decorators.action(detail=True, methods=["get"])
    def teachers(self, request, pk=None):
        """Get all teachers assigned to this coordinator"""
        coordinator = self.get_object()
        
        # Get teachers assigned to this coordinator via ManyToMany
        teachers = Teacher.objects.filter(
            assigned_coordinators=coordinator,
            is_currently_active=True
        ).select_related('current_campus').prefetch_related('assigned_coordinators')
        
        # If no teachers via ManyToMany, get through classroom assignments
        if not teachers.exists():
            managed_levels = []
            if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
                managed_levels = list(coordinator.assigned_levels.all())
            elif coordinator.level:
                managed_levels = [coordinator.level]
            
            if managed_levels:
                # Get classrooms under this coordinator's levels
                classrooms = ClassRoom.objects.filter(
                    grade__level__in=managed_levels
                ).select_related('class_teacher')
                
                # Get teachers from those classrooms
                teacher_ids = set()
                for classroom in classrooms:
                    if classroom.class_teacher:
                        teacher_ids.add(classroom.class_teacher.id)
                
                teachers = Teacher.objects.filter(
                    id__in=teacher_ids,
                    is_currently_active=True
                ).select_related('current_campus').prefetch_related('assigned_coordinators')
        
        # Serialize teacher data
        teachers_data = []
        for teacher in teachers:
            teachers_data.append({
                'id': teacher.id,
                'full_name': teacher.full_name,
                'employee_code': teacher.employee_code,
                'email': teacher.email,
                'contact_number': teacher.contact_number,
                'current_subjects': teacher.current_subjects,
                'current_classes_taught': teacher.current_classes_taught,
                'shift': teacher.shift,
                'is_class_teacher': teacher.is_class_teacher,
                'assigned_classroom': f"{teacher.assigned_classroom.grade.name} - {teacher.assigned_classroom.section}" if teacher.assigned_classroom else None,
                'joining_date': teacher.joining_date,
                'total_experience_years': teacher.total_experience_years,
                'is_currently_active': teacher.is_currently_active,
            })
        
        return response.Response({
            'coordinator': {
                'id': coordinator.id,
                'full_name': coordinator.full_name,
                'employee_code': coordinator.employee_code,
                'campus_name': coordinator.campus.campus_name if coordinator.campus else None,
            },
            'teachers': teachers_data,
            'total_teachers': len(teachers_data)
        })

    @decorators.action(detail=True, methods=["get"])
    def dashboard_stats(self, request, pk=None):
        """Get dashboard statistics for coordinator"""
        coordinator = self.get_object()
        
        # Get teachers count assigned to this coordinator
        teachers_count = Teacher.objects.filter(
            assigned_coordinators=coordinator,
            is_currently_active=True
        ).count()
        
        # If no teachers assigned via ManyToMany, try to get teachers through level/classroom relationship
        if teachers_count == 0:
            # Get teachers through classroom assignments
            managed_levels = []
            if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
                managed_levels = list(coordinator.assigned_levels.all())
            elif coordinator.level:
                managed_levels = [coordinator.level]
            
            if managed_levels:
                # Get classrooms under this coordinator's levels
                classrooms = ClassRoom.objects.filter(
                    grade__level__in=managed_levels
                ).select_related('class_teacher')
                
                # Get teachers from those classrooms
                teacher_ids = set()
                for classroom in classrooms:
                    if classroom.class_teacher:
                        teacher_ids.add(classroom.class_teacher.id)
                
                teachers_count = len(teacher_ids)
        
        # Get students count from coordinator's managed classrooms
        students_count = 0
        if coordinator.campus:
            # Get students from classrooms under this coordinator's levels
            managed_levels = []
            if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
                managed_levels = list(coordinator.assigned_levels.all())
            elif coordinator.level:
                managed_levels = [coordinator.level]
            
            if managed_levels:
                classrooms = ClassRoom.objects.filter(
                    grade__level__in=managed_levels
                ).values_list('id', flat=True)
                
                students_count = Student.objects.filter(
                    classroom__in=classrooms,
                    is_deleted=False
                ).count()
            else:
                # Fallback to campus-wide count
                students_count = Student.objects.filter(
                    campus=coordinator.campus,
                    is_deleted=False
                ).count()
        
        # Get classes count for this coordinator's level and campus
        classes_count = 0
        if coordinator.campus:
            managed_levels = []
            if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
                managed_levels = list(coordinator.assigned_levels.all())
            elif coordinator.level:
                managed_levels = [coordinator.level]
            
            if managed_levels:
                classes_count = ClassRoom.objects.filter(
                    grade__level__in=managed_levels,
                    grade__level__campus=coordinator.campus
                ).count()
        
        # Get pending requests (if any)
        pending_requests = 0  # This would need to be implemented based on your request system
        
        # Get teacher distribution by subjects
        teachers = Teacher.objects.filter(
            assigned_coordinators=coordinator,
            is_currently_active=True
        )
        
        # If no teachers via ManyToMany, get through classroom assignments
        if not teachers.exists():
            managed_levels = []
            if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
                managed_levels = list(coordinator.assigned_levels.all())
            elif coordinator.level:
                managed_levels = [coordinator.level]
            
            if managed_levels:
                classrooms = ClassRoom.objects.filter(
                    grade__level__in=managed_levels
                ).select_related('class_teacher')
                
                teacher_ids = set()
                for classroom in classrooms:
                    if classroom.class_teacher:
                        teacher_ids.add(classroom.class_teacher.id)
                
                teachers = Teacher.objects.filter(
                    id__in=teacher_ids,
                    is_currently_active=True
                )
        
        subject_distribution = {}
        for teacher in teachers:
            if teacher.current_subjects:
                # Split subjects by comma and clean them
                subjects = [s.strip() for s in teacher.current_subjects.split(',') if s.strip()]
                for subject in subjects:
                    subject_distribution[subject] = subject_distribution.get(subject, 0) + 1
        
        # Convert to list format for frontend
        subject_data = []
        for subject, count in subject_distribution.items():
            subject_data.append({
                'name': subject,
                'value': count,
                'color': f'#{hash(subject) % 0xFFFFFF:06x}'  # Generate color based on subject name
            })
        
        return response.Response({
            'coordinator': {
                'id': coordinator.id,
                'full_name': coordinator.full_name,
                'employee_code': coordinator.employee_code,
                'campus_name': coordinator.campus.campus_name if coordinator.campus else None,
            },
            'stats': {
                'total_teachers': teachers_count,
                'total_students': students_count,
                'total_classes': classes_count,
                'pending_requests': pending_requests,
            },
            'subject_distribution': subject_data
        })
    
    @decorators.action(detail=True, methods=["get"])
    def classrooms(self, request, pk=None):
        """Get all classrooms under this coordinator"""
        coordinator = self.get_object()
        
        # Get classrooms using the model method
        classrooms = coordinator.get_assigned_classrooms()
        
        # Serialize classroom data
        classroom_data = []
        for classroom in classrooms:
            # Get student count for this classroom
            student_count = Student.objects.filter(
                classroom=classroom,
                is_deleted=False
            ).count()
            
            classroom_data.append({
                'id': classroom.id,
                'name': str(classroom),  # Grade - Section
                'code': classroom.code,
                'grade': classroom.grade.name,
                'section': classroom.section,
                'shift': classroom.shift,
                'level': {
                    'id': classroom.grade.level.id,
                    'name': classroom.grade.level.name
                } if classroom.grade.level else None,
                'class_teacher': {
                    'id': classroom.class_teacher.id,
                    'full_name': classroom.class_teacher.full_name,
                    'employee_code': classroom.class_teacher.employee_code
                } if classroom.class_teacher else None,
                'student_count': student_count,
                'capacity': classroom.capacity
            })
        
        return response.Response(classroom_data)