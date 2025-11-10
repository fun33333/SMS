from rest_framework import viewsets, decorators
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Q
from users.permissions import IsSuperAdminOrPrincipal
from .models import Teacher
from .serializers import TeacherSerializer
from .filters import TeacherFilter

class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.all()
    serializer_class = TeacherSerializer
    permission_classes = [IsAuthenticated]  # Allow all authenticated users to view teachers
    
    # Filtering, search, and ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = TeacherFilter
    search_fields = ['full_name', 'employee_code', 'email', 'contact_number', 'current_subjects']
    ordering_fields = ['full_name', 'joining_date', 'total_experience_years', 'employee_code']
    ordering = ['-joining_date']  # Default ordering
    
    def get_queryset(self):
        """Override to handle role-based filtering and optimize queries"""
        queryset = Teacher.objects.select_related(
            'current_campus', 'assigned_classroom'
        ).prefetch_related('assigned_coordinators').all()
        
        # Role-based filtering
        user = self.request.user
        if hasattr(user, 'campus') and user.campus and user.is_principal():
            # Principal: Only show teachers from their campus
            queryset = queryset.filter(current_campus=user.campus)
        elif user.is_coordinator():
            # Coordinator: Only show teachers assigned to them (using ManyToMany)
            from coordinator.models import Coordinator
            try:
                coordinator_obj = Coordinator.get_for_user(user)
                if coordinator_obj:
                    queryset = queryset.filter(assigned_coordinators=coordinator_obj)
                else:
                    queryset = queryset.none()
            except Exception:
                # If coordinator resolution fails, return empty queryset
                queryset = queryset.none()
        
        # Handle shift filtering
        shift_filter = self.request.query_params.get('shift')
        if shift_filter:
            if shift_filter in ['morning', 'afternoon']:
                # Filter teachers who work this specific shift or both
                queryset = queryset.filter(
                    Q(shift=shift_filter) | Q(shift='both')
                )
            elif shift_filter == 'both':
                # Show only teachers who work both shifts
                queryset = queryset.filter(shift='both')
        
        return queryset
    
    @decorators.action(detail=False, methods=['get'])
    def by_coordinator(self, request):
        """Get teachers assigned to a specific coordinator"""
        coordinator_id = request.query_params.get('coordinator_id')
        if not coordinator_id:
            return Response({'error': 'coordinator_id parameter is required'}, status=400)
        
        teachers = Teacher.objects.filter(
            assigned_coordinators=coordinator_id,
            is_currently_active=True
        ).select_related('current_campus').prefetch_related('assigned_coordinators')
        
        serializer = self.get_serializer(teachers, many=True)
        return Response(serializer.data)
    
    @decorators.action(detail=False, methods=['get'], url_path='total')
    def total_teachers(self, request):
        """Get total teacher count"""
        queryset = self.get_queryset()
        total = queryset.count()
        return Response({'totalTeachers': total})
    
    @decorators.action(detail=False, methods=['get'], url_path='gender_stats')
    def gender_stats(self, request):
        """Get gender distribution stats"""
        queryset = self.get_queryset()
        
        stats = queryset.aggregate(
            male=Count('id', filter=Q(gender='male')),
            female=Count('id', filter=Q(gender='female')),
            other=Count('id', filter=Q(gender__isnull=True) | Q(gender='other'))
        )
        
        return Response(stats)
    
    @decorators.action(detail=False, methods=['get'], url_path='campus_stats')
    def campus_stats(self, request):
        """Get campus-wise teacher distribution"""
        queryset = self.get_queryset()
        
        campus_data = queryset.values('current_campus__campus_name').annotate(
            count=Count('id')
        ).order_by('-count')
        
        data = []
        for item in campus_data:
            campus_name = item['current_campus__campus_name'] or 'Unknown Campus'
            data.append({
                'campus': campus_name,
                'count': item['count']
            })
        
        return Response(data)
    
    @decorators.action(detail=False, methods=['get'], url_path='check-email', permission_classes=[])
    def check_email(self, request):
        """Check if email already exists"""
        email = request.query_params.get('email')
        if not email:
            return Response({'exists': False})
        
        exists = Teacher.objects.filter(email=email).exists()
        return Response({'exists': exists})
    
    @decorators.action(detail=False, methods=['get'], url_path='check-cnic', permission_classes=[])
    def check_cnic(self, request):
        """Check if CNIC already exists"""
        cnic = request.query_params.get('cnic')
        if not cnic:
            return Response({'exists': False})
        
        # Clean CNIC (remove non-numeric characters)
        clean_cnic = ''.join(filter(str.isdigit, cnic))
        exists = Teacher.objects.filter(cnic=clean_cnic).exists()
        return Response({'exists': exists})