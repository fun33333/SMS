from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS
from users.permissions import IsPrincipal
from django_filters.rest_framework import DjangoFilterBackend

from .models import Subject, ClassTimeTable, TeacherTimeTable, ShiftTiming
from .serializers import (
    SubjectSerializer,
    ClassTimeTableSerializer,
    ClassTimeTableCreateSerializer,
    TeacherTimeTableSerializer,
    TeacherTimeTableCreateSerializer,
    ShiftTimingSerializer
)


class ShiftTimingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ShiftTiming CRUD operations
    Only Principals can add/edit/delete timings. Others (e.g., Coordinators) can only view.
    """
    queryset = ShiftTiming.objects.all()
    serializer_class = ShiftTimingSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['campus', 'shift']
    ordering_fields = ['order', 'start_time']
    ordering = ['order', 'start_time']

    def get_permissions(self):
        # Only allow unsafe methods (POST, PUT, PATCH, DELETE) for Principals
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsPrincipal()]


class SubjectViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Subject CRUD operations
    """
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    # Subjects are now universal across levels; only filter by campus/is_active
    filterset_fields = ['campus', 'is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        """Filter subjects based on user role"""
        queryset = super().get_queryset()
        user = self.request.user
        params = self.request.query_params

        # Allow explicit campus filtering via query params (frontend can pass campus id)
        campus_param = params.get('campus')

        if campus_param:
            queryset = queryset.filter(campus_id=campus_param)
        else:
            # Default to user's current campus if available (non-staff users)
            if user.is_staff or user.is_superuser:
                pass
            elif hasattr(user, 'teacher_profile') and getattr(user.teacher_profile, 'current_campus', None):
                queryset = queryset.filter(campus=user.teacher_profile.current_campus)
            elif hasattr(user, 'coordinator_profile') and getattr(user.coordinator_profile, 'campus', None):
                queryset = queryset.filter(campus=user.coordinator_profile.campus)

        return queryset.select_related('campus')

    def destroy(self, request, *args, **kwargs):
        """Delete a Subject and report how many related timetable periods were removed.

        The database already uses CASCADE on the timetable foreign keys, so
        deleting the Subject will remove related ClassTimeTable and
        TeacherTimeTable rows. This method counts them before deletion and
        returns those counts in the response for UI feedback.
        """
        instance = self.get_object()

        # Count related periods before deletion
        class_periods_count = instance.class_periods.count()
        teacher_periods_count = instance.teacher_periods.count()

        # Perform deletion
        self.perform_destroy(instance)

        return Response(
            {
                'deleted': True,
                'subject_id': kwargs.get('pk') or getattr(instance, 'pk', None),
                'class_periods_deleted': class_periods_count,
                'teacher_periods_deleted': teacher_periods_count,
            },
            status=status.HTTP_200_OK
        )


class ClassTimeTableViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Class Time Table CRUD operations
    """
    queryset = ClassTimeTable.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['classroom', 'teacher', 'subject', 'day', 'is_break']
    search_fields = ['teacher__full_name', 'subject__name', 'classroom__code']
    ordering_fields = ['day', 'start_time']
    ordering = ['day', 'start_time']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ClassTimeTableCreateSerializer
        return ClassTimeTableSerializer
    
    def get_queryset(self):
        """Filter periods based on query parameters"""
        queryset = super().get_queryset()
        
        # Filter by grade
        grade = self.request.query_params.get('grade', None)
        if grade:
            queryset = queryset.filter(classroom__grade__name=grade)
        
        # Filter by section
        section = self.request.query_params.get('section', None)
        if section:
            queryset = queryset.filter(classroom__section=section)
        
        # Filter by level
        level = self.request.query_params.get('level', None)
        if level:
            queryset = queryset.filter(classroom__grade__level__id=level)
        
        return queryset.select_related(
            'classroom', 'classroom__grade', 'classroom__grade__level',
            'teacher', 'subject', 'created_by'
        )
    
    @action(detail=False, methods=['get'])
    def by_classroom(self, request):
        """Get all periods for a specific classroom"""
        classroom_id = request.query_params.get('classroom_id')
        if not classroom_id:
            return Response(
                {'error': 'classroom_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        periods = self.get_queryset().filter(classroom_id=classroom_id)
        serializer = self.get_serializer(periods, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Create multiple periods at once"""
        periods_data = request.data.get('periods', [])
        
        if not periods_data:
            return Response(
                {'error': 'No periods data provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        created_periods = []
        errors = []
        
        for idx, period_data in enumerate(periods_data):
            serializer = ClassTimeTableCreateSerializer(
                data=period_data,
                context={'request': request}
            )
            
            if serializer.is_valid():
                try:
                    period = serializer.save()
                    created_periods.append(period)
                except Exception as e:
                    errors.append({'index': idx, 'error': str(e)})
            else:
                errors.append({'index': idx, 'errors': serializer.errors})
        
        response_serializer = ClassTimeTableSerializer(created_periods, many=True)
        
        return Response({
            'created': len(created_periods),
            'failed': len(errors),
            'periods': response_serializer.data,
            'errors': errors
        }, status=status.HTTP_201_CREATED if created_periods else status.HTTP_400_BAD_REQUEST)


class TeacherTimeTableViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Teacher Time Table CRUD operations
    """
    queryset = TeacherTimeTable.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['teacher', 'subject', 'classroom', 'day', 'is_break']
    search_fields = ['teacher__full_name', 'teacher__employee_code', 'subject__name']
    ordering_fields = ['day', 'start_time']
    ordering = ['day', 'start_time']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return TeacherTimeTableCreateSerializer
        return TeacherTimeTableSerializer
    
    def get_queryset(self):
        """Filter periods based on query parameters"""
        queryset = super().get_queryset()
        
        # Filter by teacher
        teacher_id = self.request.query_params.get('teacher_id', None)
        if teacher_id:
            queryset = queryset.filter(teacher_id=teacher_id)
        
        return queryset.select_related(
            'teacher', 'teacher__current_campus',
            'classroom', 'classroom__grade',
            'subject', 'created_by'
        )
    
    @action(detail=False, methods=['get'])
    def by_teacher(self, request):
        """Get all periods for a specific teacher"""
        teacher_id = request.query_params.get('teacher_id')
        if not teacher_id:
            return Response(
                {'error': 'teacher_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        periods = self.get_queryset().filter(teacher_id=teacher_id)
        serializer = self.get_serializer(periods, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def my_timetable(self, request):
        """Get timetable for the logged-in teacher"""
        user = request.user
        
        if not hasattr(user, 'teacher_profile'):
            return Response(
                {'error': 'User is not a teacher'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        teacher = user.teacher_profile
        periods = self.get_queryset().filter(teacher=teacher)
        serializer = self.get_serializer(periods, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Create multiple periods at once"""
        periods_data = request.data.get('periods', [])
        
        if not periods_data:
            return Response(
                {'error': 'No periods data provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        created_periods = []
        errors = []
        
        for idx, period_data in enumerate(periods_data):
            serializer = TeacherTimeTableCreateSerializer(
                data=period_data,
                context={'request': request}
            )
            
            if serializer.is_valid():
                try:
                    period = serializer.save()
                    created_periods.append(period)
                except Exception as e:
                    errors.append({'index': idx, 'error': str(e)})
            else:
                errors.append({'index': idx, 'errors': serializer.errors})
        
        response_serializer = TeacherTimeTableSerializer(created_periods, many=True)
        
        return Response({
            'created': len(created_periods),
            'failed': len(errors),
            'periods': response_serializer.data,
            'errors': errors
        }, status=status.HTTP_201_CREATED if created_periods else status.HTTP_400_BAD_REQUEST)
