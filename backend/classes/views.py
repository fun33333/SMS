from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Count
from django.utils import timezone
from .models import Level, Grade, ClassRoom
from .serializers import LevelSerializer, GradeSerializer, ClassRoomSerializer
from notifications.services import create_notification

class LevelViewSet(viewsets.ModelViewSet):
    queryset = Level.objects.all()
    serializer_class = LevelSerializer
    
    # Filtering, search, and ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']  # Default ordering
    
    def get_queryset(self):
        user = self.request.user
        queryset = Level.objects.select_related('campus')
        
        # Principal: Only their campus
        if user.is_principal() and hasattr(user, 'campus') and user.campus:
            queryset = queryset.filter(campus=user.campus)
        else:
            # Other users: Filter by campus_id if provided
            campus_id = self.request.query_params.get('campus_id')
            if campus_id:
                queryset = queryset.filter(campus_id=campus_id)
        
        return queryset
    
    def perform_create(self, serializer):
        # Auto-assign campus for Principal
        if hasattr(self.request.user, 'role') and self.request.user.role == 'principal':
            # Get campus from user profile stored in localStorage
            campus_id = self.request.data.get('campus')
            if campus_id:
                from campus.models import Campus
                try:
                    campus = Campus.objects.get(id=campus_id)
                    serializer.save(campus=campus)
                except Campus.DoesNotExist:
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError({'campus': 'Invalid campus ID provided'})
            else:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'campus': 'Campus field is required for principals'})
        else:
            # For non-principals, campus should be provided in the data
            if not self.request.data.get('campus'):
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'campus': 'Campus field is required'})
            serializer.save()
    
    @action(detail=True, methods=['post'])
    def assign_coordinator(self, request, pk=None):
        """Assign a coordinator to this level"""
        level = self.get_object()
        coordinator_id = request.data.get('coordinator_id')
        
        if not coordinator_id:
            return Response(
                {'error': 'coordinator_id is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from coordinator.models import Coordinator
            
            # Get the coordinator
            coordinator = Coordinator.objects.get(id=coordinator_id)
            
            # Validate coordinator has a campus assigned
            if not coordinator.campus:
                return Response(
                    {'error': 'Coordinator must be assigned to a campus first'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Validate coordinator belongs to same campus
            if level.campus != coordinator.campus:
                return Response(
                    {'error': 'Coordinator must belong to the same campus as the level'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Update assignment logic:
            # If coordinator is 'both' shift, attach via assigned_levels M2M
            # Otherwise keep single level FK
            from coordinator.models import Coordinator as CoordModel
            if coordinator.shift == 'both':
                coordinator.assigned_levels.add(level)
            else:
                coordinator.level = level
                coordinator.save()
            
            serializer = self.get_serializer(level)
            return Response({
                'message': 'Coordinator assigned successfully',
                'level': serializer.data
            })
            
        except Coordinator.DoesNotExist:
            return Response(
                {'error': 'Coordinator not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def unassign_teacher(self, request, pk=None):
        """Unassign the current class teacher from this classroom"""
        classroom = self.get_object()
        try:
            old_teacher = classroom.class_teacher
            if not old_teacher:
                return Response({'message': 'No teacher assigned'}, status=status.HTTP_200_OK)

            # Clear classroom assignment
            classroom.class_teacher = None
            classroom.assigned_by = request.user
            classroom.assigned_at = timezone.now()
            classroom.save()

            # Update teacher flags (respect multi-classroom setup)
            # Remove this classroom from the teacher's multi-classroom list
            try:
                old_teacher.assigned_classrooms.remove(classroom)
            except Exception:
                pass

            # Clear legacy single-class link only if it was pointing to this classroom
            if old_teacher.assigned_classroom_id == classroom.id:
                old_teacher.assigned_classroom = None

            # Recalculate is_class_teacher based on remaining classrooms
            has_other_classes = (
                old_teacher.assigned_classroom is not None
                or old_teacher.assigned_classrooms.exists()
            )
            old_teacher.is_class_teacher = has_other_classes

            old_teacher.classroom_assigned_by = None if not has_other_classes else old_teacher.classroom_assigned_by
            if not has_other_classes:
                old_teacher.classroom_assigned_at = None

            # Skip generic "profile updated" notification; we'll send a specific one
            setattr(old_teacher, '_skip_profile_notification', True)
            old_teacher.save()

            serializer = self.get_serializer(classroom)

            # Send specific unassign notification
            teacher_user = getattr(old_teacher, 'user', None)
            if not teacher_user and old_teacher.email:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                teacher_user = User.objects.filter(email__iexact=old_teacher.email).first()
            if not teacher_user and old_teacher.employee_code:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                teacher_user = User.objects.filter(username=old_teacher.employee_code).first()

            if teacher_user:
                campus_name = getattr(getattr(classroom, 'campus', None), 'campus_name', '')
                actor = request.user
                actor_name = actor.get_full_name() if hasattr(actor, 'get_full_name') else str(actor)
                grade_name = getattr(getattr(classroom, 'grade', None), 'name', None) or getattr(classroom, 'grade_name', None) or 'Class'
                section = getattr(classroom, 'section', '') or ''
                shift = getattr(classroom, 'shift', '') or ''
                class_label = f"{grade_name} - {section}"
                if shift:
                    class_label = f"{class_label} ({shift})"

                verb = "You have been unassigned as class teacher"
                target_text = (
                    f"from {class_label} "
                    f"by {actor_name}"
                    + (f" at {campus_name}" if campus_name else "")
                )
                create_notification(
                    recipient=teacher_user,
                    actor=actor,
                    verb=verb,
                    target_text=target_text,
                    data={
                        "teacher_id": old_teacher.id,
                        "classroom_id": classroom.id,
                        "class_label": class_label,
                        "action": "unassigned_class_teacher",
                    },
                )

            return Response({'message': 'Teacher unassigned successfully', 'classroom': serializer.data})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def unassign_classroom_teacher(request, pk: int):
    """Unassign the current class teacher (function-based alternative)."""
    try:
        classroom = ClassRoom.objects.get(pk=pk)
        old_teacher = classroom.class_teacher
        if not old_teacher:
            return Response({'message': 'No teacher assigned'})

        classroom.class_teacher = None
        classroom.assigned_by = request.user
        classroom.assigned_at = timezone.now()
        classroom.save()

        # Mirror logic from viewset unassign
        try:
            old_teacher.assigned_classrooms.remove(classroom)
        except Exception:
            pass

        if old_teacher.assigned_classroom_id == classroom.id:
            old_teacher.assigned_classroom = None

        has_other_classes = (
            old_teacher.assigned_classroom is not None
            or old_teacher.assigned_classrooms.exists()
        )
        old_teacher.is_class_teacher = has_other_classes
        old_teacher.classroom_assigned_by = None if not has_other_classes else old_teacher.classroom_assigned_by
        if not has_other_classes:
            old_teacher.classroom_assigned_at = None

        setattr(old_teacher, '_skip_profile_notification', True)
        old_teacher.save()

        serializer = ClassRoomSerializer(classroom)
        return Response({'message': 'Teacher unassigned successfully', 'classroom': serializer.data})
    except ClassRoom.DoesNotExist:
        return Response({'error': 'Classroom not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    
    # Filtering, search, and ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']  # Default ordering
    
    def get_queryset(self):
        user = self.request.user
        queryset = Grade.objects.select_related('level', 'level__campus')
        
        # Get query parameters
        level_id = self.request.query_params.get('level_id')
        campus_id = self.request.query_params.get('campus_id')
        shift = self.request.query_params.get('shift')
        
        # Principal: Only their campus + level filtering
        if hasattr(user, 'role') and user.role == 'principal':
            if campus_id:
                queryset = queryset.filter(level__campus_id=campus_id)
            if level_id:
                queryset = queryset.filter(level_id=level_id)
        else:
            # Other users: Filter by parameters if provided
            if level_id:
                queryset = queryset.filter(level_id=level_id)
            if campus_id:
                queryset = queryset.filter(level__campus_id=campus_id)
        
        # Filter by shift if provided
        if shift:
            queryset = queryset.filter(level__shift=shift)
        
        return queryset
    
    def perform_create(self, serializer):
        # Validate that level is provided
        level_id = self.request.data.get('level')
        if not level_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'level': 'Level field is required'})
        
        # Validate that level exists and belongs to principal's campus
        if hasattr(self.request.user, 'role') and self.request.user.role == 'principal':
            from classes.models import Level
            try:
                level = Level.objects.get(id=level_id)
                # Check if level belongs to principal's campus
                campus_id = self.request.data.get('campus_id') or self.request.query_params.get('campus_id')
                if campus_id and level.campus.id != int(campus_id):
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError({'level': 'Level does not belong to your campus'})
            except Level.DoesNotExist:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'level': 'Invalid level ID provided'})
        
        serializer.save()

class ClassRoomViewSet(viewsets.ModelViewSet):
    queryset = ClassRoom.objects.all()
    serializer_class = ClassRoomSerializer
    
    # Filtering, search, and ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['code', 'section']
    ordering_fields = ['code', 'section', 'created_at']
    ordering = ['code', 'section']  # Default ordering
    
    def get_queryset(self):
        user = self.request.user
        queryset = ClassRoom.objects.select_related(
            'grade', 'grade__level', 'grade__level__campus', 'class_teacher'
        )
        
        # Get query parameters
        grade_id = self.request.query_params.get('grade_id')
        level_id = self.request.query_params.get('level_id')
        campus_id = self.request.query_params.get('campus_id')
        teacher_id = self.request.query_params.get('teacher_id')
        shift_filter = self.request.query_params.get('shift')
        
        # Principal: Only their campus + all filtering options
        if hasattr(user, 'role') and user.role == 'principal':
            if campus_id:
                queryset = queryset.filter(grade__level__campus_id=campus_id)
            if grade_id:
                queryset = queryset.filter(grade_id=grade_id)
            if level_id:
                queryset = queryset.filter(grade__level_id=level_id)
            if teacher_id:
                queryset = queryset.filter(class_teacher_id=teacher_id)
        else:
            # Other users: Filter by parameters if provided
            if grade_id:
                queryset = queryset.filter(grade_id=grade_id)
            if level_id:
                queryset = queryset.filter(grade__level_id=level_id)
            if campus_id:
                queryset = queryset.filter(grade__level__campus_id=campus_id)
            if teacher_id:
                queryset = queryset.filter(class_teacher_id=teacher_id)
        
        # Handle shift filtering
        if shift_filter:
            if shift_filter in ['morning', 'afternoon']:
                # Filter classrooms by shift
                queryset = queryset.filter(shift=shift_filter)
            elif shift_filter == 'both':
                # Show classrooms from both shifts (no additional filtering needed)
                pass
        
        return queryset
    
    @action(detail=False, methods=['get'], url_path='campus_stats')
    def campus_stats(self, request):
        """Get campus-wise classroom distribution"""
        queryset = self.get_queryset()
        
        campus_data = queryset.values('grade__level__campus__campus_name').annotate(
            count=Count('id')
        ).order_by('-count')
        
        data = []
        for item in campus_data:
            campus_name = item['grade__level__campus__campus_name'] or 'Unknown Campus'
            data.append({
                'campus': campus_name,
                'count': item['count']
            })
        
        return Response(data)
    
    @action(detail=False, methods=['get'])
    def available_teachers(self, request):
        """
        Get teachers who are available to be assigned as class teachers.

        Rules:
        - Filter by campus if provided (or by principal's campus)
        - Optional shift filter:
          - Only teachers who work in that shift OR in both shifts
          - Exclude teachers who are already class teacher for a classroom in that shift
        - When no shift is provided, return teachers who are not class teacher
          of any classroom (legacy behaviour for generic lists).
        """
        from teachers.models import Teacher
        
        # Filter by campus if provided (for principals)
        campus_id = request.query_params.get('campus_id')
        shift_param = request.query_params.get('shift')
        user = request.user
        
        teachers = Teacher.objects.all()

        # Principal: default to their campus if no explicit campus_id
        if campus_id:
            teachers = teachers.filter(current_campus_id=campus_id)
        elif hasattr(user, 'role') and user.role == 'principal' and getattr(user, 'campus_id', None):
            teachers = teachers.filter(current_campus_id=user.campus_id)

        # Optional shift filter - allow teachers who work this shift or both
        if shift_param in ['morning', 'afternoon']:
            teachers = teachers.filter(Q(shift=shift_param) | Q(shift='both'))

            # Exclude teachers who are already class teacher in this shift
            # (teacher with shift='both' can take one class per shift)
            teachers = teachers.exclude(classroom_set__shift=shift_param)
        else:
            # Legacy behaviour: only teachers who are not class teacher anywhere
            teachers = teachers.filter(classroom_set__isnull=True)

        return Response(teachers.values('id', 'full_name', 'employee_code', 'shift', 'current_campus__campus_name'))
    
    @action(detail=False, methods=['get'])
    def unassigned_classrooms(self, request):
        """Get classrooms that don't have a class teacher"""
        unassigned = ClassRoom.objects.filter(
            class_teacher__isnull=True
        )
        serializer = self.get_serializer(unassigned, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def assign_teacher(self, request, pk=None):
        """Assign a teacher to this classroom"""
        classroom = self.get_object()
        teacher_id = request.data.get('teacher_id')
        
        if not teacher_id:
            return Response(
                {'error': 'teacher_id is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from teachers.models import Teacher
            
            # Get the teacher
            teacher = Teacher.objects.get(id=teacher_id)
            
            # Validate teacher belongs to same campus
            if classroom.campus != teacher.current_campus:
                return Response(
                    {'error': 'Teacher must belong to the same campus as the classroom'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if teacher is already assigned to another classroom
            existing_classrooms = ClassRoom.objects.filter(
                class_teacher=teacher
            ).exclude(pk=classroom.pk)

            if existing_classrooms.exists():
                # Teachers who work BOTH shifts can be class teacher in at most
                # one classroom per shift (one morning + one afternoon).
                if teacher.shift == 'both':
                    # If teacher already has a class in this shift, block.
                    same_shift = existing_classrooms.filter(shift=classroom.shift).first()
                    if same_shift:
                        return Response(
                            {
                                'error': (
                                    f'Teacher {teacher.full_name} is already assigned to '
                                    f'{same_shift.grade.name}-{same_shift.section} in the '
                                    f'{same_shift.shift} shift. Teachers who work both shifts '
                                    f'can only be class teacher for one class per shift.'
                                )
                            },
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    # Otherwise allow assignment (this will give them a class in the
                    # other shift as well).
                else:
                    # Single-shift teachers can only be class teacher of one classroom.
                    existing_classroom = existing_classrooms.first()
                    return Response(
                        {
                            'error': (
                                f'Teacher {teacher.full_name} is already assigned to '
                                f'{existing_classroom.grade.name}-{existing_classroom.section}. '
                                f'Please unassign them first or choose a different teacher.'
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Store old teacher for cleanup
            old_teacher = classroom.class_teacher
            
            # Update classroom
            classroom.class_teacher = teacher
            classroom.assigned_by = request.user
            classroom.assigned_at = timezone.now()
            classroom.save()
            
            # Update new teacher profile
            teacher.assigned_classroom = classroom  # LEGACY single-class link (keeps last assigned)
            teacher.is_class_teacher = True
            teacher.classroom_assigned_by = request.user
            teacher.classroom_assigned_at = timezone.now()
            # Skip generic "profile updated" notification; we'll send a specific one
            setattr(teacher, '_skip_profile_notification', True)
            teacher.save()
            # Track in ManyToMany for multi-classroom support (idempotent add)
            try:
                teacher.assigned_classrooms.add(classroom)
            except Exception:
                pass
            
            # Update old teacher if exists (and is different from new teacher)
            if old_teacher and old_teacher.id != teacher.id:
                old_teacher.assigned_classroom = None
                # Remove this classroom from their multi-classroom list
                try:
                    old_teacher.assigned_classrooms.remove(classroom)
                except Exception:
                    pass
                # Recalculate is_class_teacher based on remaining classrooms
                has_other_classes = (
                    old_teacher.assigned_classroom is not None
                    or old_teacher.assigned_classrooms.exists()
                )
                old_teacher.is_class_teacher = has_other_classes
                old_teacher.classroom_assigned_by = None if not has_other_classes else old_teacher.classroom_assigned_by
                if not has_other_classes:
                    old_teacher.classroom_assigned_at = None
                # Skip generic "profile updated" notification; we'll send a specific one
                setattr(old_teacher, '_skip_profile_notification', True)
                old_teacher.save()
            
            serializer = self.get_serializer(classroom)

            # Send specific assign notification to the teacher
            teacher_user = getattr(teacher, 'user', None)
            if not teacher_user and teacher.email:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                teacher_user = User.objects.filter(email__iexact=teacher.email).first()
            if not teacher_user and teacher.employee_code:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                teacher_user = User.objects.filter(username=teacher.employee_code).first()

            if teacher_user:
                campus_name = getattr(getattr(classroom, 'campus', None), 'campus_name', '')
                actor = request.user
                actor_name = actor.get_full_name() if hasattr(actor, 'get_full_name') else str(actor)
                grade_name = getattr(getattr(classroom, 'grade', None), 'name', None) or getattr(classroom, 'grade_name', None) or 'Class'
                section = getattr(classroom, 'section', '') or ''
                shift = getattr(classroom, 'shift', '') or ''
                class_label = f"{grade_name} - {section}"
                if shift:
                    class_label = f"{class_label} ({shift})"

                verb = "You have been assigned as class teacher"
                target_text = (
                    f"for {class_label} "
                    f"by {actor_name}"
                    + (f" at {campus_name}" if campus_name else "")
                )
                create_notification(
                    recipient=teacher_user,
                    actor=actor,
                    verb=verb,
                    target_text=target_text,
                    data={
                        "teacher_id": teacher.id,
                        "classroom_id": classroom.id,
                        "class_label": class_label,
                        "action": "assigned_class_teacher",
                    },
                )

            return Response({
                'message': 'Teacher assigned successfully',
                'classroom': serializer.data
            })
            
        except Teacher.DoesNotExist:
            return Response(
                {'error': 'Teacher not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )