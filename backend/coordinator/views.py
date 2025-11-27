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
    
    def destroy(self, request, *args, **kwargs):
        """Override destroy to ensure soft delete is used - NEVER calls default delete"""
        logger.info(f"[DESTROY] destroy() method called for DELETE request")
        
        # Get the instance
        instance = self.get_object()
        coordinator_id = instance.id
        coordinator_name = instance.full_name
        
        logger.info(f"[DESTROY] Got coordinator instance: ID={coordinator_id}, Name={coordinator_name}, is_deleted={instance.is_deleted}")
        
        # Check if already deleted
        if instance.is_deleted:
            logger.warning(f"[DESTROY] Coordinator {coordinator_id} is already soft deleted")
            from rest_framework.exceptions import NotFound
            raise NotFound("Coordinator is already deleted.")
        
        # IMPORTANT: Call perform_destroy which does soft delete
        # DO NOT call super().destroy() as it would do hard delete
        logger.info(f"[DESTROY] Calling perform_destroy() for soft delete")
        self.perform_destroy(instance)
        
        # Verify the coordinator still exists in database (soft deleted, not hard deleted)
        try:
            from .models import Coordinator
            # Use with_deleted() to check if coordinator exists (even if soft deleted)
            still_exists = Coordinator.objects.with_deleted().filter(pk=coordinator_id).exists()
            if not still_exists:
                logger.error(f"[DESTROY] CRITICAL: Coordinator {coordinator_id} was HARD DELETED! This should not happen!")
                raise Exception(f"CRITICAL ERROR: Coordinator {coordinator_id} was permanently deleted instead of soft deleted!")
            else:
                # Check if it's soft deleted
                coordinator_check = Coordinator.objects.with_deleted().get(pk=coordinator_id)
                if coordinator_check.is_deleted:
                    logger.info(f"[DESTROY] SUCCESS: Coordinator {coordinator_id} is soft deleted (is_deleted=True)")
                else:
                    logger.error(f"[DESTROY] ERROR: Coordinator {coordinator_id} exists but is_deleted is False!")
        except Coordinator.DoesNotExist:
            logger.error(f"[DESTROY] CRITICAL: Coordinator {coordinator_id} does not exist in database - was HARD DELETED!")
            raise Exception(f"CRITICAL ERROR: Coordinator {coordinator_id} was permanently deleted!")
        
        logger.info(f"[DESTROY] destroy() completed successfully")
        from rest_framework import status
        from rest_framework.response import Response
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    def perform_destroy(self, instance):
        """Soft delete coordinator and create audit log"""
        import logging
        logger = logging.getLogger(__name__)
        
        instance._actor = self.request.user
        
        # Store coordinator info before deletion for audit log
        coordinator_id = instance.id
        coordinator_name = instance.full_name
        coordinator_campus = instance.campus
        
        # Get user name for audit log
        user = self.request.user
        user_name = user.get_full_name() if hasattr(user, 'get_full_name') else (user.username or 'Unknown')
        user_role = user.get_role_display() if hasattr(user, 'get_role_display') else (user.role or 'User')
        
        # Log before soft delete
        logger.info(f"[SOFT_DELETE] Starting soft delete for coordinator ID: {coordinator_id}, Name: {coordinator_name}")
        logger.info(f"[SOFT_DELETE] Coordinator is_deleted before: {instance.is_deleted}")
        
        # Soft delete the coordinator (instead of hard delete)
        # This uses update() to directly modify database, does NOT call .delete()
        # This ensures no post_delete signal is triggered
        try:
            instance.soft_delete()
            logger.info(f"[SOFT_DELETE] soft_delete() method called successfully")
            
            # Verify soft delete worked
            instance.refresh_from_db()
            logger.info(f"[SOFT_DELETE] Coordinator is_deleted after refresh: {instance.is_deleted}")
            
            if not instance.is_deleted:
                logger.error(f"[SOFT_DELETE] CRITICAL ERROR: Soft delete failed! Coordinator {coordinator_id} is_deleted is still False!")
                raise Exception(f"Soft delete failed for coordinator {coordinator_id} - is_deleted is still False after soft_delete() call")
            
            logger.info(f"[SOFT_DELETE] Soft delete successful for coordinator {coordinator_id}")
        except Exception as e:
            logger.error(f"[SOFT_DELETE] ERROR during soft_delete(): {str(e)}")
            raise
        
        # Create audit log after soft deletion
        try:
            from attendance.models import AuditLog
            AuditLog.objects.create(
                feature='coordinator',
                action='delete',
                entity_type='Coordinator',
                entity_id=coordinator_id,
                user=user,
                ip_address=self.request.META.get('REMOTE_ADDR'),
                changes={'name': coordinator_name, 'coordinator_id': coordinator_id, 'campus_id': coordinator_campus.id if coordinator_campus else None},
                reason=f'Coordinator {coordinator_name} deleted by {user_role} {user_name}'
            )
        except Exception as e:
            # Log error but don't fail the deletion
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create audit log for coordinator deletion: {str(e)}")
    
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
        queryset = Coordinator.objects.select_related('campus').all()
        
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
        teachers_with_subjects = 0
        
        for teacher in teachers:
            if teacher.current_subjects:
                # Split subjects by comma and clean them
                subjects = [s.strip() for s in teacher.current_subjects.split(',') if s.strip()]
                if subjects:
                    teachers_with_subjects += 1
                for subject in subjects:
                    subject_distribution[subject] = subject_distribution.get(subject, 0) + 1
        
        # Calculate total teachers for percentage calculation
        total_teachers_for_subjects = teachers_count if teachers_count > 0 else len(teachers)
        
        # Add "none" category for teachers without subjects
        teachers_without_subjects = total_teachers_for_subjects - teachers_with_subjects
        if teachers_without_subjects > 0:
            subject_distribution['none'] = teachers_without_subjects
        
        # Convert to list format for frontend with percentage
        subject_data = []
        for subject, count in subject_distribution.items():
            # Calculate percentage based on total teachers
            percentage = (count / total_teachers_for_subjects * 100) if total_teachers_for_subjects > 0 else 0
            subject_data.append({
                'name': subject,
                'value': count,
                'percentage': round(percentage, 1),  # Round to 1 decimal place
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