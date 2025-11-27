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
            'current_campus',
            'assigned_classroom',
        ).prefetch_related(
            'assigned_coordinators',
            'assigned_classrooms',
        ).all()
        
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
    
    def perform_create(self, serializer):
        """Set actor before creating teacher"""
        # Attach actor before first save so signals can see it
        instance = serializer.instance
        if instance is not None:
          instance._actor = self.request.user
        teacher = serializer.save()
        # No second save needed; post_save will have access to _actor
        return teacher
    
    def perform_update(self, serializer):
        """Set actor before updating teacher"""
        instance = serializer.instance
        user = self.request.user
        if instance is not None:
            instance._actor = user
            changed_fields = []
            try:
                # Fields we care about for "profile updated" notifications
                monitored = [
                    # Personal info
                    'full_name',
                    'dob',
                    'gender',
                    'contact_number',
                    'email',
                    'permanent_address',
                    'current_address',
                    'marital_status',
                    'cnic',
                    # Education
                    'education_level',
                    'institution_name',
                    'year_of_passing',
                    'education_subjects',
                    'education_grade',
                    # Experience
                    'previous_institution_name',
                    'previous_position',
                    'experience_from_date',
                    'experience_to_date',
                    'total_experience_years',
                    # Current role
                    'joining_date',
                    'current_role_title',
                    'current_campus',
                    'shift',
                    'current_subjects',
                    'current_classes_taught',
                    'current_extra_responsibilities',
                    'role_start_date',
                    'is_currently_active',
                ]
                for field in monitored:
                    if field in serializer.validated_data:
                        old_val = getattr(instance, field, None)
                        new_val = serializer.validated_data.get(field)
                        if old_val != new_val:
                            changed_fields.append(field)
            except Exception:
                changed_fields = []
            instance._changed_fields = changed_fields
        teacher = serializer.save()
        return teacher
    
    def destroy(self, request, *args, **kwargs):
        """Override destroy to ensure soft delete is used - NEVER calls default delete"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[DESTROY] destroy() method called for DELETE request")
        
        # Get the instance
        instance = self.get_object()
        teacher_id = instance.id
        teacher_name = instance.full_name
        
        logger.info(f"[DESTROY] Got teacher instance: ID={teacher_id}, Name={teacher_name}, is_deleted={instance.is_deleted}")
        
        # Check if already deleted
        if instance.is_deleted:
            logger.warning(f"[DESTROY] Teacher {teacher_id} is already soft deleted")
            from rest_framework.exceptions import NotFound
            raise NotFound("Teacher is already deleted.")
        
        # IMPORTANT: Call perform_destroy which does soft delete
        # DO NOT call super().destroy() as it would do hard delete
        logger.info(f"[DESTROY] Calling perform_destroy() for soft delete")
        self.perform_destroy(instance)
        
        # Verify the teacher still exists in database (soft deleted, not hard deleted)
        try:
            from .models import Teacher
            # Use with_deleted() to check if teacher exists (even if soft deleted)
            still_exists = Teacher.objects.with_deleted().filter(pk=teacher_id).exists()
            if not still_exists:
                logger.error(f"[DESTROY] CRITICAL: Teacher {teacher_id} was HARD DELETED! This should not happen!")
                raise Exception(f"CRITICAL ERROR: Teacher {teacher_id} was permanently deleted instead of soft deleted!")
            else:
                # Check if it's soft deleted
                teacher_check = Teacher.objects.with_deleted().get(pk=teacher_id)
                if teacher_check.is_deleted:
                    logger.info(f"[DESTROY] SUCCESS: Teacher {teacher_id} is soft deleted (is_deleted=True)")
                else:
                    logger.error(f"[DESTROY] ERROR: Teacher {teacher_id} exists but is_deleted is False!")
        except Teacher.DoesNotExist:
            logger.error(f"[DESTROY] CRITICAL: Teacher {teacher_id} does not exist in database - was HARD DELETED!")
            raise Exception(f"CRITICAL ERROR: Teacher {teacher_id} was permanently deleted!")
        
        logger.info(f"[DESTROY] destroy() completed successfully")
        from rest_framework import status
        from rest_framework.response import Response
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    def perform_destroy(self, instance):
        """Soft delete teacher and create audit log"""
        import logging
        logger = logging.getLogger(__name__)
        
        instance._actor = self.request.user
        
        # Store teacher info before deletion for audit log
        teacher_id = instance.id
        teacher_name = instance.full_name
        teacher_campus = instance.current_campus
        
        # Get user name for audit log
        user = self.request.user
        user_name = user.get_full_name() if hasattr(user, 'get_full_name') else (user.username or 'Unknown')
        user_role = user.get_role_display() if hasattr(user, 'get_role_display') else (user.role or 'User')
        
        # Log before soft delete
        logger.info(f"[SOFT_DELETE] Starting soft delete for teacher ID: {teacher_id}, Name: {teacher_name}")
        logger.info(f"[SOFT_DELETE] Teacher is_deleted before: {instance.is_deleted}")
        
        # Soft delete the teacher (instead of hard delete)
        # This uses update() to directly modify database, does NOT call .delete()
        # This ensures no post_delete signal is triggered
        try:
            instance.soft_delete()
            logger.info(f"[SOFT_DELETE] soft_delete() method called successfully")
            
            # Verify soft delete worked
            instance.refresh_from_db()
            logger.info(f"[SOFT_DELETE] Teacher is_deleted after refresh: {instance.is_deleted}")
            
            if not instance.is_deleted:
                logger.error(f"[SOFT_DELETE] CRITICAL ERROR: Soft delete failed! Teacher {teacher_id} is_deleted is still False!")
                raise Exception(f"Soft delete failed for teacher {teacher_id} - is_deleted is still False after soft_delete() call")
            
            logger.info(f"[SOFT_DELETE] Soft delete successful for teacher {teacher_id}")
        except Exception as e:
            logger.error(f"[SOFT_DELETE] ERROR during soft_delete(): {str(e)}")
            raise
        
        # Create audit log after soft deletion
        try:
            from attendance.models import AuditLog
            AuditLog.objects.create(
                feature='teacher',
                action='delete',
                entity_type='Teacher',
                entity_id=teacher_id,
                user=user,
                ip_address=self.request.META.get('REMOTE_ADDR'),
                changes={'name': teacher_name, 'teacher_id': teacher_id, 'campus_id': teacher_campus.id if teacher_campus else None},
                reason=f'Teacher {teacher_name} deleted by {user_role} {user_name}'
            )
        except Exception as e:
            # Log error but don't fail the deletion
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create audit log for teacher deletion: {str(e)}")
    
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