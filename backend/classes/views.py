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

            # Update teacher flags
            old_teacher.assigned_classroom = None
            old_teacher.is_class_teacher = False
            old_teacher.classroom_assigned_by = None
            old_teacher.classroom_assigned_at = None
            old_teacher.save()

            serializer = self.get_serializer(classroom)
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

        old_teacher.assigned_classroom = None
        old_teacher.is_class_teacher = False
        old_teacher.classroom_assigned_by = None
        old_teacher.classroom_assigned_at = None
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
        """Get teachers who are not assigned to any classroom"""
        from teachers.models import Teacher
        
        # Filter by campus if provided (for principals)
        campus_id = request.query_params.get('campus_id')
        shift_param = request.query_params.get('shift')
        user = request.user
        
        # Principal: Only teachers from their campus
        if hasattr(user, 'role') and user.role == 'principal':
            if campus_id:
                teachers = Teacher.objects.filter(
                    current_campus_id=campus_id,
                    is_class_teacher=False
                )
            else:
                teachers = Teacher.objects.filter(is_class_teacher=False)
        elif campus_id:
            teachers = Teacher.objects.filter(
                current_campus_id=campus_id,
                is_class_teacher=False
            )
        else:
            teachers = Teacher.objects.filter(is_class_teacher=False)
        
        # Optional shift filter - allow teachers who work this shift or both
        if shift_param in ['morning', 'afternoon']:
            teachers = teachers.filter(Q(shift=shift_param) | Q(shift='both'))

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
            existing_classroom = ClassRoom.objects.filter(
                class_teacher=teacher
            ).exclude(pk=classroom.pk).first()
            
            if existing_classroom:
                return Response(
                    {'error': f'Teacher {teacher.full_name} is already assigned to {existing_classroom.grade.name}-{existing_classroom.section}. Please unassign them first or choose a different teacher.'}, 
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
            teacher.assigned_classroom = classroom
            teacher.is_class_teacher = True
            teacher.classroom_assigned_by = request.user
            teacher.classroom_assigned_at = timezone.now()
            teacher.save()
            
            # Update old teacher if exists
            if old_teacher and old_teacher.id != teacher.id:
                old_teacher.assigned_classroom = None
                old_teacher.is_class_teacher = False
                old_teacher.classroom_assigned_by = None
                old_teacher.classroom_assigned_at = None
                old_teacher.save()
            
            serializer = self.get_serializer(classroom)
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