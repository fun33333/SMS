from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from django.contrib.auth.models import User

from .models import (
    TransferRequest,
    IDHistory,
    ClassTransfer,
    ShiftTransfer,
    TransferApproval,
)
from .serializers import (
    TransferRequestSerializer,
    TransferRequestCreateSerializer,
    TransferApprovalSerializer,
    IDHistorySerializer,
    IDPreviewSerializer,
    ClassTransferSerializer,
    ClassTransferCreateSerializer,
    ShiftTransferSerializer,
    ShiftTransferCreateSerializer,
    TransferApprovalStepSerializer,
)
from .services import (
    IDUpdateService,
    apply_class_transfer,
    link_and_apply_shift_transfer,
    emit_transfer_event,
)
from notifications.services import create_notification
from students.models import Student
from teachers.models import Teacher
from campus.models import Campus
from classes.models import ClassRoom
from coordinator.models import Coordinator


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_transfer_request(request):
    """Create a new transfer request"""
    try:
        # Check if user is a principal
        user_role = getattr(request.user, 'role', '').lower()
        if user_role != 'principal':
            return Response({'error': 'Only principals can create transfer requests'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        serializer = TransferRequestCreateSerializer(data=request.data)
        if serializer.is_valid():
            # Find receiving principal before creating the transfer request
            from principals.models import Principal
            receiving_principal = None
            
            try:
                print(f"Looking for principal for campus: {serializer.validated_data['to_campus']}")
                
                receiving_principal_obj = Principal.objects.filter(
                    campus_id=serializer.validated_data['to_campus']
                ).first()
                
                print(f"Found principal: {receiving_principal_obj}")
                
                if receiving_principal_obj:
                    receiving_principal = receiving_principal_obj.user
                    print(f"Set receiving principal to: {receiving_principal_obj.user}")
                else:
                    # If no principal found for destination campus, find any available principal
                    print(f"No principal found for campus {serializer.validated_data['to_campus']}, looking for any principal...")
                    any_principal = Principal.objects.first()
                    if any_principal:
                        receiving_principal = any_principal.user
                        print(f"Set receiving principal to any available principal: {any_principal.user}")
                    else:
                        # Last resort: set to requesting principal
                        receiving_principal = request.user
                        print(f"No principals found at all, set to requesting principal: {request.user}")
                        
            except Exception as e:
                # If error, set to requesting principal
                print(f"Error finding principal: {e}")
                receiving_principal = request.user
                print(f"Set receiving principal to requesting principal due to error: {request.user}")
            
            # Create transfer request with receiving principal
            transfer_request = serializer.save(
                requesting_principal=request.user,
                receiving_principal=receiving_principal,
                status='pending'
            )
            
            print(f"Transfer request created with receiving_principal: {transfer_request.receiving_principal}")
            
            return Response(TransferRequestSerializer(transfer_request).data, 
                          status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_transfer_requests(request):
    """List transfer requests for the current user"""
    try:
        user = request.user
        
        # Get query parameters
        request_type = request.GET.get('type')
        status_filter = request.GET.get('status')
        direction = request.GET.get('direction', 'all')  # all, outgoing, incoming
        
        # Base queryset
        queryset = TransferRequest.objects.all()
        
        # Check if user is a principal
        user_role = getattr(user, 'role', '').lower()
        if user_role != 'principal':
            return Response({'error': 'Only principals can view transfer requests'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        # Filter by direction
        if direction == 'outgoing':
            queryset = queryset.filter(requesting_principal=user)
        elif direction == 'incoming':
            queryset = queryset.filter(receiving_principal=user)
        # 'all' shows both outgoing and incoming
        
        # Apply filters
        if request_type:
            queryset = queryset.filter(request_type=request_type)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Serialize and return
        serializer = TransferRequestSerializer(queryset, many=True)
        return Response(serializer.data)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_transfer_request(request, request_id):
    """Get details of a specific transfer request"""
    try:
        transfer_request = get_object_or_404(TransferRequest, id=request_id)
        
        # Check if user has permission to view this request
        user = request.user
        if not (user == transfer_request.requesting_principal or 
                user == transfer_request.receiving_principal or
                user.is_superuser):
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = TransferRequestSerializer(transfer_request)
        return Response(serializer.data)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_transfer(request, request_id):
    """Approve a transfer request"""
    try:
        transfer_request = get_object_or_404(TransferRequest, id=request_id)
        
        # Check if user is the receiving principal
        if request.user != transfer_request.receiving_principal:
            return Response({'error': 'Only the receiving principal can approve transfers'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        # Check if request is pending
        if transfer_request.status != 'pending':
            return Response({'error': 'Only pending requests can be approved'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Update IDs based on request type
        if transfer_request.request_type == 'student' and transfer_request.student:
            result = IDUpdateService.update_student_id(
                student=transfer_request.student,
                new_campus=transfer_request.to_campus,
                new_shift=transfer_request.to_shift,
                transfer_request=transfer_request,
                changed_by=request.user,
                reason=f"Transfer approved: {transfer_request.reason}"
            )
            
        elif transfer_request.request_type == 'teacher' and transfer_request.teacher:
            # Determine new role (keep existing role for now)
            new_role = transfer_request.teacher.role
            result = IDUpdateService.update_teacher_id(
                teacher=transfer_request.teacher,
                new_campus=transfer_request.to_campus,
                new_shift=transfer_request.to_shift,
                new_role=new_role,
                transfer_request=transfer_request,
                changed_by=request.user,
                reason=f"Transfer approved: {transfer_request.reason}"
            )
        else:
            return Response({'error': 'Invalid transfer request'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Update transfer request status
        transfer_request.status = 'approved'
        transfer_request.reviewed_at = timezone.now()
        transfer_request.save()
        
        return Response({
            'message': 'Transfer approved successfully',
            'new_id': result['new_id'],
            'transfer_request': TransferRequestSerializer(transfer_request).data
        })
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def decline_transfer(request, request_id):
    """Decline a transfer request"""
    try:
        transfer_request = get_object_or_404(TransferRequest, id=request_id)
        
        # Check if user is the receiving principal
        if request.user != transfer_request.receiving_principal:
            return Response({'error': 'Only the receiving principal can decline transfers'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        # Check if request is pending
        if transfer_request.status != 'pending':
            return Response({'error': 'Only pending requests can be declined'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        serializer = TransferApprovalSerializer(data=request.data)
        if serializer.is_valid():
            # Update transfer request status
            transfer_request.status = 'declined'
            transfer_request.reviewed_at = timezone.now()
            transfer_request.decline_reason = serializer.validated_data.get('reason', '')
            transfer_request.save()
            
            return Response({
                'message': 'Transfer declined successfully',
                'transfer_request': TransferRequestSerializer(transfer_request).data
            })
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_transfer(request, request_id):
    """Cancel a transfer request"""
    try:
        transfer_request = get_object_or_404(TransferRequest, id=request_id)
        
        # Check if user is the requesting principal
        if request.user != transfer_request.requesting_principal:
            return Response({'error': 'Only the requesting principal can cancel transfers'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        # Check if request can be cancelled
        if transfer_request.status not in ['draft', 'pending']:
            return Response({'error': 'Only draft or pending requests can be cancelled'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Update transfer request status
        transfer_request.status = 'cancelled'
        transfer_request.save()
        
        return Response({
            'message': 'Transfer cancelled successfully',
            'transfer_request': TransferRequestSerializer(transfer_request).data
        })
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_id_history(request, entity_type, entity_id):
    """Get ID history for a student or teacher"""
    try:
        # Get the entity
        if entity_type == 'student':
            entity = get_object_or_404(Student, id=entity_id)
        elif entity_type == 'teacher':
            entity = get_object_or_404(Teacher, id=entity_id)
        else:
            return Response({'error': 'Invalid entity type'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get ID history
        history = IDHistory.objects.filter(
            entity_type=entity_type,
            **{entity_type: entity}
        ).order_by('-changed_at')
        
        serializer = IDHistorySerializer(history, many=True)
        return Response(serializer.data)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_by_old_id(request):
    """Search for entity by old ID"""
    try:
        old_id = request.GET.get('id')
        if not old_id:
            return Response({'error': 'ID parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Search in ID history
        history = IDHistory.objects.filter(old_id=old_id).first()
        if history:
            if history.entity_type == 'student':
                entity = history.student
                current_id = entity.student_id
            else:
                entity = history.teacher
                current_id = entity.employee_code
            
            return Response({
                'found': True,
                'entity_type': history.entity_type,
                'entity_id': entity.id,
                'entity_name': history.entity_name,
                'old_id': old_id,
                'current_id': current_id,
                'history': IDHistorySerializer(history).data
            })
        else:
            return Response({'found': False, 'message': 'No entity found with this old ID'})
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def preview_id_change(request):
    """Preview what an ID change would look like"""
    try:
        old_id = request.data.get('old_id')
        new_campus_code = request.data.get('new_campus_code')
        new_shift = request.data.get('new_shift')
        new_role = request.data.get('new_role')
        
        if not all([old_id, new_campus_code, new_shift]):
            return Response({'error': 'old_id, new_campus_code, and new_shift are required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        preview = IDUpdateService.preview_id_change(
            old_id=old_id,
            new_campus_code=new_campus_code,
            new_shift=new_shift,
            new_role=new_role
        )
        
        if preview:
            serializer = IDPreviewSerializer(preview)
            return Response(serializer.data)
        else:
            return Response({'error': 'Invalid ID format'}, status=status.HTTP_400_BAD_REQUEST)
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# New Class/Section transfer APIs (same campus, same shift)
# ---------------------------------------------------------------------------


def _get_teacher_for_user(user):
    """Return Teacher instance for given auth user, or None."""
    try:
        return getattr(user, 'teacher_profile', None)
    except Exception:
        return None


def _get_coordinator_for_user(user):
    """Return Coordinator instance for given auth user, using robust lookup."""
    try:
        return Coordinator.get_for_user(user)
    except Exception:
        return None


def _is_principal(user) -> bool:
    """Check if user has principal role in the system."""
    role = getattr(user, 'role', '') or ''
    return str(role).lower().startswith('principal')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_class_transfer(request):
    """
    Create a new class/section transfer request.
    Typically initiated by a class teacher.
    """
    try:
        teacher = _get_teacher_for_user(request.user)
        if not teacher:
            return Response(
                {'error': 'Only teachers can create class transfer requests'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ClassTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        student = validated['student']
        to_classroom = validated['to_classroom']
        from_classroom = student.classroom

        if not from_classroom:
            return Response(
                {'error': 'Student is not currently assigned to any classroom'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Try to find coordinator(s) responsible for this level/campus
        level = from_classroom.grade.level if from_classroom.grade else None
        coord_qs = Coordinator.objects.filter(
            campus=from_classroom.campus,
            is_currently_active=True,
        )
        if level:
            coord_qs = coord_qs.filter(Q(level=level) | Q(assigned_levels=level)).distinct()
        coordinator = coord_qs.first()

        # Snapshot grade/section labels for display even while pending
        from_section = from_classroom.section if from_classroom else None
        from_grade_name = (
            from_classroom.grade.name if from_classroom and from_classroom.grade else None
        )
        to_section = to_classroom.section if to_classroom else None
        to_grade_name = (
            to_classroom.grade.name if to_classroom and to_classroom.grade else None
        )

        class_transfer = ClassTransfer.objects.create(
            student=student,
            from_classroom=from_classroom,
            to_classroom=to_classroom,
            from_section=from_section,
            from_grade_name=from_grade_name,
            to_section=to_section,
            to_grade_name=to_grade_name,
            initiated_by_teacher=teacher,
            coordinator=coordinator,
            status='pending',
            reason=validated['reason'],
            requested_date=validated['requested_date'],
        )

        # First approval step is teacher initiation
        TransferApproval.objects.create(
            transfer_type='class',
            transfer_id=class_transfer.id,
            role='teacher',
            approved_by=request.user,
            status='approved',
            comment=validated.get('reason', ''),
            step_order=1,
        )

        emit_transfer_event(
            'class_transfer.requested',
            {
                'class_transfer_id': class_transfer.id,
                'student_id': student.id,
                'from_classroom_id': from_classroom.id,
                'to_classroom_id': to_classroom.id,
                'teacher_id': teacher.id,
                'coordinator_id': coordinator.id if coordinator else None,
            },
        )

        # Notify all coordinators for this level about the new request
        try:
            if level:
                from django.contrib.auth import get_user_model

                UserModel = get_user_model()

                for coord in coord_qs:
                    coordinator_user = None

                    # Prefer direct user relation if present
                    if getattr(coord, 'user', None):
                        coordinator_user = coord.user
                    # Try by employee_code (username)
                    elif getattr(coord, 'employee_code', None):
                        coordinator_user = UserModel.objects.filter(
                            username=coord.employee_code
                        ).first()
                    # Fallback to email
                    elif getattr(coord, 'email', None):
                        coordinator_user = UserModel.objects.filter(
                            email__iexact=coord.email
                        ).first()

                    if not coordinator_user:
                        continue

                    actor = request.user
                    student_name = student.name
                    from_text = f"{from_grade_name or ''}{f' ({from_section})' if from_section else ''}"
                    to_text = f"{to_grade_name or ''}{f' ({to_section})' if to_section else ''}"
                    verb = "New class transfer request"
                    target_text = (
                        f"{student_name}: {from_text or 'current class'} → {to_text or 'destination class'}"
                    )
                    create_notification(
                        recipient=coordinator_user,
                        actor=actor,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "class_transfer.requested",
                            "class_transfer_id": class_transfer.id,
                            "student_id": student.id,
                        },
                    )
        except Exception as notify_err:
            print(f"[WARN] Failed to send class_transfer.requested notification: {notify_err}")

        return Response(ClassTransferSerializer(class_transfer).data, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_class_transfers(request):
    """
    List class/section transfer requests visible to the current user.
    - Teacher: own initiated transfers
    - Coordinator: transfers assigned to them
    - Principal: all transfers for their campuses (for now: all)
    """
    try:
        user = request.user
        teacher = _get_teacher_for_user(user)
        coordinator = _get_coordinator_for_user(user)

        queryset = ClassTransfer.objects.select_related(
            'student',
            'from_classroom',
            'to_classroom',
            'initiated_by_teacher',
            'coordinator',
            'principal',
        )

        if teacher:
            # Teacher: only see transfers they initiated
            queryset = queryset.filter(initiated_by_teacher=teacher)
        elif coordinator:
            # Coordinator: see any transfers explicitly assigned to them OR
            # any transfers whose classrooms fall under their managed levels/campus.
            from django.db.models import Q
            from classes.models import ClassRoom

            managed_levels = []
            if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
                managed_levels = list(coordinator.assigned_levels.all())
            elif coordinator.level:
                managed_levels = [coordinator.level]

            classroom_ids = []
            if managed_levels:
                classroom_ids = list(
                    ClassRoom.objects.filter(
                        grade__level__in=managed_levels,
                        grade__level__campus=coordinator.campus,
                    ).values_list('id', flat=True)
                )

            queryset = queryset.filter(
                Q(coordinator=coordinator)
                | Q(from_classroom_id__in=classroom_ids)
                | Q(to_classroom_id__in=classroom_ids)
            )
        elif _is_principal(user) or user.is_superuser:
            # For now principals see all; can be narrowed to campus-based later
            pass
        else:
            return Response(
                {'error': 'You do not have permission to view class transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        status_filter = request.GET.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        serializer = ClassTransferSerializer(queryset.order_by('-created_at'), many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_class_transfer(request, transfer_id):
    """
    Approve a class/section transfer.
    Currently only coordinators can approve and apply class transfers.
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator:
            return Response(
                {'error': 'Only coordinators can approve class transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        class_transfer = get_object_or_404(ClassTransfer, id=transfer_id)

        if class_transfer.status != 'pending':
            return Response(
                {'error': 'Only pending class transfers can be approved'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if class_transfer.coordinator and class_transfer.coordinator != coordinator:
            return Response(
                {'error': 'This class transfer is not assigned to you'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Mark approved and apply classroom change
        class_transfer.status = 'approved'
        class_transfer.coordinator = coordinator

        apply_class_transfer(class_transfer, changed_by=user)

        TransferApproval.objects.create(
            transfer_type='class',
            transfer_id=class_transfer.id,
            role='coordinator_from',
            approved_by=user,
            status='approved',
            comment=request.data.get('comment', ''),
            step_order=2,
        )

        emit_transfer_event(
            'class_transfer.approved',
            {
                'class_transfer_id': class_transfer.id,
                'student_id': class_transfer.student_id,
                'coordinator_id': coordinator.id,
            },
        )

        # Notifications on approval:
        # 1) Back to teacher who created the request
        # 2) To destination class teacher (if any)
        try:
            from django.contrib.auth import get_user_model

            UserModel = get_user_model()

            student = class_transfer.student
            student_name = student.name
            from_text = f"{class_transfer.from_grade_name or ''}{f' ({class_transfer.from_section})' if class_transfer.from_section else ''}"
            to_text = f"{class_transfer.to_grade_name or ''}{f' ({class_transfer.to_section})' if class_transfer.to_section else ''}"

            # Teacher notification
            if class_transfer.initiated_by_teacher:
                teacher = class_transfer.initiated_by_teacher
                teacher_user = getattr(teacher, 'user', None)
                if not teacher_user and teacher.employee_code:
                    teacher_user = UserModel.objects.filter(
                        username=teacher.employee_code
                    ).first()
                if not teacher_user and teacher.email:
                    teacher_user = UserModel.objects.filter(
                        email__iexact=teacher.email
                    ).first()

                if teacher_user:
                    verb = "Your class transfer request has been approved"
                    target_text = (
                        f"{student_name}: {from_text or 'current class'} → {to_text or 'new class'}"
                    )
                    create_notification(
                        recipient=teacher_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "class_transfer.approved",
                            "class_transfer_id": class_transfer.id,
                            "student_id": student.id,
                        },
                    )

            # Destination class teacher notification
            dest_class = class_transfer.to_classroom
            if dest_class and dest_class.class_teacher:
                dest_teacher = dest_class.class_teacher
                dest_teacher_user = getattr(dest_teacher, 'user', None)
                if not dest_teacher_user and dest_teacher.employee_code:
                    dest_teacher_user = UserModel.objects.filter(
                        username=dest_teacher.employee_code
                    ).first()
                if not dest_teacher_user and dest_teacher.email:
                    dest_teacher_user = UserModel.objects.filter(
                        email__iexact=dest_teacher.email
                    ).first()

                if dest_teacher_user:
                    verb = "A new student has been transferred into your class"
                    target_text = (
                        f"{student_name} has been moved to {to_text or 'your class'}"
                    )
                    create_notification(
                        recipient=dest_teacher_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "class_transfer.applied",
                            "class_transfer_id": class_transfer.id,
                            "student_id": student.id,
                        },
                    )
        except Exception as notify_err:
            print(f"[WARN] Failed to send class_transfer.approved notifications: {notify_err}")

        return Response(
            {
                'message': 'Class transfer approved and applied successfully',
                'class_transfer': ClassTransferSerializer(class_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def decline_class_transfer(request, transfer_id):
    """Decline a class/section transfer with a reason."""
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator and not _is_principal(user):
            return Response(
                {'error': 'Only coordinators or principals can decline class transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        class_transfer = get_object_or_404(ClassTransfer, id=transfer_id)

        if class_transfer.status != 'pending':
            return Response(
                {'error': 'Only pending class transfers can be declined'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TransferApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', '')

        class_transfer.status = 'declined'
        class_transfer.decline_reason = reason
        if coordinator:
            class_transfer.coordinator = coordinator
        elif _is_principal(user):
            class_transfer.principal = user
        class_transfer.save()

        TransferApproval.objects.create(
            transfer_type='class',
            transfer_id=class_transfer.id,
            role='coordinator_from' if coordinator else 'principal',
            approved_by=user,
            status='declined',
            comment=reason,
            step_order=2,
        )

        emit_transfer_event(
            'class_transfer.declined',
            {
                'class_transfer_id': class_transfer.id,
                'student_id': class_transfer.student_id,
                'by_user_id': user.id,
            },
        )

        return Response(
            {
                'message': 'Class transfer declined',
                'class_transfer': ClassTransferSerializer(class_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_class_sections(request):
    """
    Return available classrooms/sections for a class transfer for a given student.
    Filters by same campus & shift and (optionally) capacity.
    """
    try:
        student_id = request.GET.get('student')
        if not student_id:
            return Response({'error': 'student parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        student = get_object_or_404(Student, id=student_id)
        current_classroom = student.classroom
        if not current_classroom:
            return Response(
                {'error': 'Student is not currently assigned to any classroom'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Same campus + shift, optionally same grade
        classrooms = ClassRoom.objects.filter(
            grade__level__campus=current_classroom.campus,
            shift=current_classroom.shift,
            grade=current_classroom.grade,
        ).order_by('grade__name', 'section')

        # Capacity filter (simple: capacity > students.count())
        available_data = []
        from django.db.models import Q
        from coordinator.models import Coordinator

        for cr in classrooms:
            if cr.id == current_classroom.id:
                # Skip the current classroom as target
                continue
            student_count = cr.students.count()
            if student_count >= cr.capacity:
                continue
            # Destination class teacher & coordinator (if available)
            class_teacher_name = getattr(cr.class_teacher, 'full_name', None)
            coordinator_name = None
            try:
                level = cr.grade.level if cr.grade else None
                if level and cr.campus:
                    coord_qs = Coordinator.objects.filter(
                        campus=cr.campus,
                        is_currently_active=True,
                    ).filter(
                        Q(level=level) | Q(assigned_levels=level)
                    ).distinct()
                    coord = coord_qs.first()
                    if coord:
                        coordinator_name = coord.full_name
            except Exception:
                coordinator_name = None
            available_data.append(
                {
                    'id': cr.id,
                    'label': f"{cr.grade.name} - {cr.section} ({cr.shift})",
                    'grade_name': cr.grade.name,
                    'section': cr.section,
                    'shift': cr.shift,
                    'class_teacher_name': class_teacher_name,
                    'coordinator_name': coordinator_name,
                }
            )

        return Response(available_data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# New Shift transfer APIs (same campus, shift change)
# ---------------------------------------------------------------------------


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_shift_transfer(request):
    """
    Create a new shift transfer request for a student.
    Initiated by a class teacher.
    """
    try:
        teacher = _get_teacher_for_user(request.user)
        if not teacher:
            return Response(
                {'error': 'Only teachers can create shift transfer requests'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ShiftTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        student = validated['student']
        to_shift = validated['to_shift']
        to_classroom = validated.get('to_classroom')

        from_classroom = student.classroom
        if not from_classroom:
            return Response(
                {'error': 'Student is not currently assigned to any classroom'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campus = from_classroom.campus or student.campus
        if not campus:
            return Response(
                {'error': 'Student has no associated campus for shift transfer'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine coordinators for from/to shifts in this campus
        from_shift = student.shift or from_classroom.shift
        from_shift_coord = Coordinator.objects.filter(
            campus=campus,
            is_currently_active=True,
        )
        if from_classroom.grade and from_classroom.grade.level:
            from_shift_coord = from_shift_coord.filter(level=from_classroom.grade.level)
        from_shift_coord = from_shift_coord.first()

        to_shift_coord = Coordinator.objects.filter(
            campus=campus,
            is_currently_active=True,
        )
        if to_classroom and to_classroom.grade and to_classroom.grade.level:
            to_shift_coord = to_shift_coord.filter(level=to_classroom.grade.level)
        to_shift_coord = to_shift_coord.first()

        shift_transfer = ShiftTransfer.objects.create(
            student=student,
            campus=campus,
            from_shift=from_shift,
            to_shift=to_shift,
            from_classroom=from_classroom,
            to_classroom=to_classroom,
            requesting_teacher=teacher,
            from_shift_coordinator=from_shift_coord,
            to_shift_coordinator=to_shift_coord,
            status='pending_own_coord',
            reason=validated['reason'],
            requested_date=validated['requested_date'],
        )

        # Teacher step is implicitly approved
        TransferApproval.objects.create(
            transfer_type='shift',
            transfer_id=shift_transfer.id,
            role='teacher',
            approved_by=request.user,
            status='approved',
            comment=validated.get('reason', ''),
            step_order=1,
        )

        emit_transfer_event(
            'shift_transfer.requested',
            {
                'shift_transfer_id': shift_transfer.id,
                'student_id': student.id,
                'from_shift': from_shift,
                'to_shift': to_shift,
                'from_coord_id': from_shift_coord.id if from_shift_coord else None,
                'to_coord_id': to_shift_coord.id if to_shift_coord else None,
            },
        )

        return Response(ShiftTransferSerializer(shift_transfer).data, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_shift_transfers(request):
    """
    List shift transfer requests visible to the current user.
    - Teacher: own initiated transfers
    - Coordinator: transfers where they are from/to coordinator
    - Principal: all for now (later can be campus-bound)
    """
    try:
        user = request.user
        teacher = _get_teacher_for_user(user)
        coordinator = _get_coordinator_for_user(user)

        queryset = ShiftTransfer.objects.select_related(
            'student',
            'campus',
            'from_classroom',
            'to_classroom',
            'requesting_teacher',
            'from_shift_coordinator',
            'to_shift_coordinator',
            'principal',
        )

        if teacher:
            queryset = queryset.filter(requesting_teacher=teacher)
        elif coordinator:
            queryset = queryset.filter(
                Q(from_shift_coordinator=coordinator) | Q(to_shift_coordinator=coordinator)
            )
        elif _is_principal(user) or user.is_superuser:
            pass
        else:
            return Response(
                {'error': 'You do not have permission to view shift transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        status_filter = request.GET.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        serializer = ShiftTransferSerializer(queryset.order_by('-created_at'), many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_shift_transfer_own_coord(request, transfer_id):
    """
    Own-shift coordinator approval step for a shift transfer.
    Moves status from pending_own_coord → pending_other_coord (or approved if no other coordinator).
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator:
            return Response(
                {'error': 'Only coordinators can approve shift transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        shift_transfer = get_object_or_404(ShiftTransfer, id=transfer_id)

        if shift_transfer.status != 'pending_own_coord':
            return Response(
                {'error': 'This shift transfer is not waiting for own coordinator approval'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if shift_transfer.from_shift_coordinator and shift_transfer.from_shift_coordinator != coordinator:
            return Response(
                {'error': 'This shift transfer is not assigned to you as from-shift coordinator'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Mark approval
        shift_transfer.status = 'pending_other_coord' if shift_transfer.to_shift_coordinator else 'approved'
        shift_transfer.from_shift_coordinator = coordinator
        shift_transfer.save()

        TransferApproval.objects.create(
            transfer_type='shift',
            transfer_id=shift_transfer.id,
            role='coordinator_from',
            approved_by=user,
            status='approved',
            comment=request.data.get('comment', ''),
            step_order=2,
        )

        emit_transfer_event(
            'shift_transfer.own_coord_approved',
            {
                'shift_transfer_id': shift_transfer.id,
                'student_id': shift_transfer.student_id,
                'coordinator_id': coordinator.id,
            },
        )

        # If there is no other coordinator, apply immediately by creating a TransferRequest
        if shift_transfer.status == 'approved':
            transfer_request = TransferRequest.objects.create(
                request_type='student',
                status='pending',
                from_campus=shift_transfer.campus,
                from_shift='M' if shift_transfer.from_shift == 'morning' else 'A',
                requesting_principal=user,
                to_campus=shift_transfer.campus,
                to_shift='M' if shift_transfer.to_shift == 'morning' else 'A',
                receiving_principal=user,
                student=shift_transfer.student,
                reason=shift_transfer.reason,
                requested_date=shift_transfer.requested_date,
                notes='Auto-generated from shift transfer approval',
                transfer_category='shift',
            )

            link_and_apply_shift_transfer(
                shift_transfer=shift_transfer,
                transfer_request=transfer_request,
                changed_by=user,
                reason=f"Shift transfer approved: {shift_transfer.reason}",
            )

        return Response(
            {
                'message': 'Shift transfer updated after own coordinator approval',
                'shift_transfer': ShiftTransferSerializer(shift_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_shift_transfer_other_coord(request, transfer_id):
    """
    Target-shift coordinator approval step for a shift transfer.
    On success, creates a TransferRequest and applies the ID + classroom changes.
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator:
            return Response(
                {'error': 'Only coordinators can approve shift transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        shift_transfer = get_object_or_404(ShiftTransfer, id=transfer_id)

        if shift_transfer.status != 'pending_other_coord':
            return Response(
                {'error': 'This shift transfer is not waiting for other coordinator approval'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if shift_transfer.to_shift_coordinator and shift_transfer.to_shift_coordinator != coordinator:
            return Response(
                {'error': 'This shift transfer is not assigned to you as target-shift coordinator'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Mark approval
        shift_transfer.status = 'approved'
        shift_transfer.to_shift_coordinator = coordinator
        shift_transfer.save()

        TransferApproval.objects.create(
            transfer_type='shift',
            transfer_id=shift_transfer.id,
            role='coordinator_to',
            approved_by=user,
            status='approved',
            comment=request.data.get('comment', ''),
            step_order=3,
        )

        emit_transfer_event(
            'shift_transfer.other_coord_approved',
            {
                'shift_transfer_id': shift_transfer.id,
                'student_id': shift_transfer.student_id,
                'coordinator_id': coordinator.id,
            },
        )

        # Create a TransferRequest representing the actual ID change
        # For now, we set both requesting and receiving principal as the same user (or use campus principal if configured)
        from principals.models import Principal

        principal_obj = Principal.objects.filter(campus=shift_transfer.campus).first()
        principal_user = principal_obj.user if principal_obj else user

        transfer_request = TransferRequest.objects.create(
            request_type='student',
            status='pending',
            from_campus=shift_transfer.campus,
            from_shift='M' if shift_transfer.from_shift == 'morning' else 'A',
            requesting_principal=principal_user,
            to_campus=shift_transfer.campus,
            to_shift='M' if shift_transfer.to_shift == 'morning' else 'A',
            receiving_principal=principal_user,
            student=shift_transfer.student,
            reason=shift_transfer.reason,
            requested_date=shift_transfer.requested_date,
            notes='Auto-generated from shift transfer approvals',
            transfer_category='shift',
        )

        link_and_apply_shift_transfer(
            shift_transfer=shift_transfer,
            transfer_request=transfer_request,
            changed_by=user,
            reason=f"Shift transfer approved: {shift_transfer.reason}",
        )

        return Response(
            {
                'message': 'Shift transfer fully approved and applied successfully',
                'shift_transfer': ShiftTransferSerializer(shift_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def decline_shift_transfer(request, transfer_id):
    """
    Decline a shift transfer request from either own-shift or other-shift coordinator.
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator and not _is_principal(user):
            return Response(
                {'error': 'Only coordinators or principals can decline shift transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        shift_transfer = get_object_or_404(ShiftTransfer, id=transfer_id)

        current_status = shift_transfer.status
        if current_status not in ['pending_own_coord', 'pending_other_coord']:
            return Response(
                {'error': 'Only pending shift transfers can be declined'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TransferApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', '')

        shift_transfer.status = 'declined'
        shift_transfer.decline_reason = reason
        if _is_principal(user):
            shift_transfer.principal = user
        shift_transfer.save()

        TransferApproval.objects.create(
            transfer_type='shift',
            transfer_id=shift_transfer.id,
            role='coordinator_from' if current_status == 'pending_own_coord' else 'coordinator_to',
            approved_by=user,
            status='declined',
            comment=reason,
            step_order=2,
        )

        emit_transfer_event(
            'shift_transfer.declined',
            {
                'shift_transfer_id': shift_transfer.id,
                'student_id': shift_transfer.student_id,
                'by_user_id': user.id,
            },
        )

        return Response(
            {
                'message': 'Shift transfer declined',
                'shift_transfer': ShiftTransferSerializer(shift_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_shift_sections(request):
    """
    Return available classrooms/sections for a shift transfer for a given student + target shift.
    """
    try:
        student_id = request.GET.get('student')
        to_shift = request.GET.get('to_shift')
        if not student_id or not to_shift:
            return Response(
                {'error': 'student and to_shift parameters are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student = get_object_or_404(Student, id=student_id)
        current_classroom = student.classroom
        if not current_classroom:
            return Response(
                {'error': 'Student is not currently assigned to any classroom'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campus = current_classroom.campus or student.campus
        classrooms = ClassRoom.objects.filter(
            grade=current_classroom.grade,
            grade__level__campus=campus,
            shift=to_shift,
        ).order_by('grade__name', 'section')

        from django.db.models import Q
        from coordinator.models import Coordinator

        available_data = []
        for cr in classrooms:
            student_count = cr.students.count()
            if student_count >= cr.capacity:
                continue
            # Destination class teacher & coordinator (if available)
            class_teacher_name = getattr(cr.class_teacher, 'full_name', None)
            coordinator_name = None
            try:
                level = cr.grade.level if cr.grade else None
                if level and campus:
                    coord_qs = Coordinator.objects.filter(
                        campus=campus,
                        is_currently_active=True,
                    ).filter(
                        Q(level=level) | Q(assigned_levels=level)
                    ).distinct()
                    coord = coord_qs.first()
                    if coord:
                        coordinator_name = coord.full_name
            except Exception:
                coordinator_name = None
            available_data.append(
                {
                    'id': cr.id,
                    'label': f"{cr.grade.name} - {cr.section} ({cr.shift})",
                    'grade_name': cr.grade.name,
                    'section': cr.section,
                    'shift': cr.shift,
                    'class_teacher_name': class_teacher_name,
                    'coordinator_name': coordinator_name,
                }
            )

        return Response(available_data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
