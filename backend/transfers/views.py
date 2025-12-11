from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from django.contrib.auth.models import User

from .models import (
    TransferRequest,
    IDHistory,
    ClassTransfer,
    ShiftTransfer,
    TransferApproval,
    GradeSkipTransfer,
    CampusTransfer,
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
    GradeSkipTransferSerializer,
    GradeSkipTransferCreateSerializer,
    CampusTransferSerializer,
    CampusTransferCreateSerializer,
)
from .services import (
    IDUpdateService,
    apply_class_transfer,
    link_and_apply_shift_transfer,
    emit_transfer_event,
    detect_grade_skip_coordinators,
    apply_grade_skip_transfer,
    apply_campus_transfer,
)
from notifications.services import create_notification
from students.models import Student
from teachers.models import Teacher
from campus.models import Campus
from classes.models import ClassRoom
from coordinator.models import Coordinator


def get_user_role_name(user):
    """Helper function to get user role display name and full name"""
    if not user:
        return "Unknown User"
    role_display = user.get_role_display() if hasattr(user, 'get_role_display') else (user.role or 'User')
    full_name = user.get_full_name() if hasattr(user, 'get_full_name') else (user.username or 'Unknown')
    return f"{role_display} {full_name}"


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
    """Return Teacher instance for given auth user, or None (with robust lookup)."""
    try:
        # Fast path: direct reverse relation
        teacher = getattr(user, 'teacher_profile', None)
        if teacher:
            return teacher

        # Fallbacks: resolve by email or employee_code-style username
        from teachers.models import Teacher
        from django.db.models import Q

        qs = Teacher.objects.all()
        email = getattr(user, 'email', None)
        username = getattr(user, 'username', None)

        q = Q()
        if email:
            q |= Q(email__iexact=email)
        if username:
            q |= Q(employee_code__iexact=username)

        if q:
            return qs.filter(q).first()
        return None
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
        # Normalize shift value for comparison
        from_shift_normalized = from_shift.lower() if from_shift else None
        
        # Find from-shift coordinator
        from_shift_coord = None
        if from_classroom.grade and from_classroom.grade.level:
            level = from_classroom.grade.level
            # Filter by campus, level, and shift
            coord_qs = Coordinator.objects.filter(
                campus=campus,
                is_currently_active=True,
            ).filter(
                Q(level=level) | Q(assigned_levels=level)
            ).distinct()
            
            # Filter by shift: include coordinators with matching shift or 'both'/'all'
            if from_shift_normalized:
                coord_qs = coord_qs.filter(
                    Q(shift=from_shift_normalized) |
                    Q(shift='both') |
                    Q(shift='all')
                )
            
            from_shift_coord = coord_qs.first()

        # Find to-shift coordinator
        to_shift_coord = None
        to_shift_normalized = to_shift.lower() if to_shift else None
        if to_classroom and to_classroom.grade and to_classroom.grade.level:
            level = to_classroom.grade.level
            # Filter by campus, level, and shift
            coord_qs = Coordinator.objects.filter(
                campus=campus,
                is_currently_active=True,
            ).filter(
                Q(level=level) | Q(assigned_levels=level)
            ).distinct()
            
            # Filter by shift: include coordinators with matching shift or 'both'/'all'
            if to_shift_normalized:
                coord_qs = coord_qs.filter(
                    Q(shift=to_shift_normalized) |
                    Q(shift='both') |
                    Q(shift='all')
                )
            
            to_shift_coord = coord_qs.first()

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

        # Notify from-shift coordinator about the new shift transfer request
        try:
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            if from_shift_coord:
                coordinator_user = getattr(from_shift_coord, 'user', None)
                if not coordinator_user and from_shift_coord.employee_code:
                    coordinator_user = UserModel.objects.filter(
                        username=from_shift_coord.employee_code
                    ).first()
                if not coordinator_user and getattr(from_shift_coord, 'email', None):
                    coordinator_user = UserModel.objects.filter(
                        email__iexact=from_shift_coord.email
                    ).first()

                if coordinator_user:
                    student_name = student.name
                    from_shift_display = from_shift.title() if from_shift else 'current shift'
                    to_shift_display = to_shift.title() if to_shift else 'destination shift'
                    verb = "New shift transfer request"
                    target_text = (
                        f"{student_name}: {from_shift_display} → {to_shift_display}"
                    )
                    create_notification(
                        recipient=coordinator_user,
                        actor=request.user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "shift_transfer.requested",
                            "shift_transfer_id": shift_transfer.id,
                            "student_id": student.id,
                        },
                    )
        except Exception as notify_err:
            pass  # Don't fail transfer creation if notification fails

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

        # Notify requesting teacher and to-shift coordinator (if exists)
        try:
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            student = shift_transfer.student
            student_name = student.name
            from_shift_display = shift_transfer.from_shift.title() if shift_transfer.from_shift else 'current shift'
            to_shift_display = shift_transfer.to_shift.title() if shift_transfer.to_shift else 'destination shift'

            # Notify requesting teacher
            teacher = shift_transfer.requesting_teacher
            if teacher:
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
                    approver_role_name = get_user_role_name(user)
                    verb = f"Your shift transfer request has been approved by {approver_role_name}"
                    target_text = (
                        f"{student_name}: {from_shift_display} → {to_shift_display}"
                    )
                    create_notification(
                        recipient=teacher_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "shift_transfer.own_coord_approved",
                            "shift_transfer_id": shift_transfer.id,
                            "student_id": student.id,
                        },
                    )

            # Notify to-shift coordinator if exists and status is pending_other_coord
            if shift_transfer.status == 'pending_other_coord' and shift_transfer.to_shift_coordinator:
                to_coord = shift_transfer.to_shift_coordinator
                to_coord_user = getattr(to_coord, 'user', None)
                if not to_coord_user and to_coord.employee_code:
                    to_coord_user = UserModel.objects.filter(
                        username=to_coord.employee_code
                    ).first()
                if not to_coord_user and getattr(to_coord, 'email', None):
                    to_coord_user = UserModel.objects.filter(
                        email__iexact=to_coord.email
                    ).first()

                if to_coord_user:
                    verb = "New shift transfer request requires your approval"
                    target_text = (
                        f"{student_name}: {from_shift_display} → {to_shift_display}"
                    )
                    create_notification(
                        recipient=to_coord_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "shift_transfer.pending_other_coord",
                            "shift_transfer_id": shift_transfer.id,
                            "student_id": student.id,
                        },
                    )
        except Exception as notify_err:
            pass  # Don't fail approval if notification fails

        # If there is no other coordinator, apply immediately by creating a TransferRequest
        if shift_transfer.status == 'approved':
            # Find appropriate principal for the transfer
            from principals.models import Principal
            
            principal_obj = Principal.objects.filter(campus=shift_transfer.campus).first()
            
            # Determine requesting and receiving principal
            principal_user = None
            
            if principal_obj and principal_obj.user:
                principal_user = principal_obj.user
            else:
                # Fallback: find any principal
                any_principal = Principal.objects.filter(user__isnull=False).first()
                if any_principal and any_principal.user:
                    principal_user = any_principal.user
                else:
                    # Last resort: check if current user is a principal
                    if _is_principal(user):
                        principal_user = user
                    else:
                        # Final fallback: use superuser or first active user with principal role
                        from django.contrib.auth import get_user_model
                        UserModel = get_user_model()
                        superuser = UserModel.objects.filter(is_superuser=True, is_active=True).first()
                        if superuser:
                            principal_user = superuser
                        else:
                            # Last option: use any active user (for system-generated transfers)
                            principal_user = UserModel.objects.filter(is_active=True).first()
                            
            if not principal_user:
                # This should never happen, but if it does, we can't proceed
                return Response(
                    {'error': 'Unable to find a principal for this transfer. Please contact administrator.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            transfer_request = TransferRequest.objects.create(
                request_type='student',
                status='pending',
                from_campus=shift_transfer.campus,
                from_shift='M' if shift_transfer.from_shift == 'morning' else 'A',
                requesting_principal=principal_user,
                to_campus=shift_transfer.campus,
                to_shift='M' if shift_transfer.to_shift == 'morning' else 'A',
                receiving_principal=principal_user,  # Same campus, same principal
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

            # Notify destination class teacher if transfer was applied immediately
            try:
                from django.contrib.auth import get_user_model
                UserModel = get_user_model()

                student = shift_transfer.student
                student_name = student.name
                dest_class = shift_transfer.to_classroom
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
                        to_class_text = f"{dest_class.grade.name if dest_class.grade else ''} - {dest_class.section}"
                        to_shift_display = shift_transfer.to_shift.title() if shift_transfer.to_shift else 'destination shift'
                        verb = "A new student has been transferred into your class"
                        target_text = (
                            f"{student_name} has been moved to {to_class_text} ({to_shift_display})"
                        )
                        create_notification(
                            recipient=dest_teacher_user,
                            actor=user,
                            verb=verb,
                            target_text=target_text,
                            data={
                                "type": "shift_transfer.applied",
                                "shift_transfer_id": shift_transfer.id,
                                "student_id": student.id,
                            },
                        )
            except Exception as notify_err:
                pass  # Don't fail if notification fails

        return Response(
            {
                'message': 'Shift transfer updated after own coordinator approval',
                'shift_transfer': ShiftTransferSerializer(shift_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Campus Transfer APIs (teacher-initiated cross-campus workflow)
# ---------------------------------------------------------------------------


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_campus_transfer(request):
    """
    Create a new campus transfer request.
    Typically initiated by a class teacher.
    """
    try:
        teacher = _get_teacher_for_user(request.user)
        if not teacher:
            return Response(
                {'error': 'Only teachers can create campus transfer requests'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CampusTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        student = validated['student']
        to_campus = validated['to_campus']
        to_shift = validated['to_shift']
        to_grade = validated.get('to_grade')
        to_classroom = validated.get('to_classroom')
        skip_grade = validated.get('skip_grade', False)

        from_campus = student.campus
        from_shift = student.shift
        from_classroom = student.classroom
        from_grade = from_classroom.grade if from_classroom else None

        if not from_campus or not from_shift:
            return Response(
                {'error': 'Student must have a current campus and shift for campus transfer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Detect from/to coordinators based on levels and campus
        from coordinator.models import Coordinator  # local import to avoid cycles
        from classes.models import ClassRoom

        level = from_grade.level if from_grade else None
        from_coord = None
        if level:
            coord_qs = Coordinator.objects.filter(
                campus=from_campus,
                is_currently_active=True,
            )
            coord_qs = coord_qs.filter(Q(level=level) | Q(assigned_levels=level)).distinct()
            from_coord = coord_qs.first()

        # For target coordinator, we try to infer from target grade (if any)
        to_coord = None
        if to_grade:
            target_level = to_grade.level
            coord_qs_to = Coordinator.objects.filter(
                campus=to_campus,
                is_currently_active=True,
            )
            coord_qs_to = coord_qs_to.filter(Q(level=target_level) | Q(assigned_levels=target_level)).distinct()
            to_coord = coord_qs_to.first()

        # Try to resolve principals for from/to campuses
        from principals.models import Principal

        from_principal_obj = Principal.objects.filter(campus=from_campus).first()
        to_principal_obj = Principal.objects.filter(campus=to_campus).first()

        from_principal_user = from_principal_obj.user if from_principal_obj else None
        to_principal_user = to_principal_obj.user if to_principal_obj else None

        campus_transfer = CampusTransfer.objects.create(
            student=student,
            from_campus=from_campus,
            to_campus=to_campus,
            from_shift=from_shift,
            to_shift=to_shift,
            from_classroom=from_classroom,
            to_classroom=to_classroom,
            from_grade=from_grade,
            to_grade=to_grade,
            from_grade_name=getattr(from_grade, 'name', None),
            to_grade_name=getattr(to_grade, 'name', None),
            from_section=getattr(from_classroom, 'section', None),
            to_section=getattr(to_classroom, 'section', None) if to_classroom else None,
            skip_grade=skip_grade,
            initiated_by_teacher=teacher,
            from_coordinator=from_coord,
            to_coordinator=to_coord,
            from_principal=from_principal_user,
            to_principal=to_principal_user,
            status='pending_from_coord',
            reason=validated['reason'],
            requested_date=validated['requested_date'],
        )

        # First approval step (teacher) in TransferApproval
        TransferApproval.objects.create(
            transfer_type='campus',
            transfer_id=campus_transfer.id,
            role='teacher',
            approved_by=request.user,
            status='approved',
            comment=validated.get('reason', ''),
            step_order=1,
        )

        # Notify from-campus coordinator
        try:
            if from_coord:
                from django.contrib.auth import get_user_model
                import logging
                logger = logging.getLogger(__name__)

                UserModel = get_user_model()

                coord_user = getattr(from_coord, 'user', None)
                logger.info(f"Campus Transfer Notification Debug:")
                logger.info(f"  Coordinator ID: {from_coord.id}")
                logger.info(f"  Coordinator Name: {from_coord.full_name}")
                logger.info(f"  Coordinator Email: {from_coord.email}")
                logger.info(f"  Coordinator Employee Code: {from_coord.employee_code}")
                logger.info(f"  coord_user from getattr: {coord_user}")
                
                if not coord_user and getattr(from_coord, 'employee_code', None):
                    coord_user = UserModel.objects.filter(
                        username=from_coord.employee_code
                    ).first()
                    logger.info(f"  coord_user from username lookup: {coord_user}")
                    
                if not coord_user and getattr(from_coord, 'email', None):
                    coord_user = UserModel.objects.filter(
                        email__iexact=from_coord.email
                    ).first()
                    logger.info(f"  coord_user from email lookup: {coord_user}")

                if coord_user:
                    logger.info(f"  ✅ Found coord_user: {coord_user.username} (ID: {coord_user.id})")
                else:
                    logger.warning(f"  ❌ No User account found for coordinator {from_coord.full_name}")

                if coord_user:
                    student_name = student.name
                    teacher_name = teacher.full_name
                    from_campus_name = getattr(from_campus, 'campus_name', str(from_campus))
                    to_campus_name = getattr(to_campus, 'campus_name', str(to_campus))

                    # 1) Informational message
                    verb1 = f"Class teacher {teacher_name} made a campus transfer request for {student_name}"
                    target_text1 = f"From {from_campus_name} to {to_campus_name}"

                    create_notification(
                        recipient=coord_user,
                        actor=request.user,
                        verb=verb1,
                        target_text=target_text1,
                        data={
                            "type": "campus_transfer.requested_info",
                            "campus_transfer_id": campus_transfer.id,
                            "student_id": student.id,
                        },
                    )

                    # 2) Needs approval message
                    verb2 = f"Request of campus transfer of {student_name} needs your approval"
                    target_text2 = f"Please review campus transfer request from {from_campus_name} to {to_campus_name}"

                    create_notification(
                        recipient=coord_user,
                        actor=request.user,
                        verb=verb2,
                        target_text=target_text2,
                        data={
                            "type": "campus_transfer.pending_from_coord",
                            "campus_transfer_id": campus_transfer.id,
                            "student_id": student.id,
                        },
                    )
        except Exception:
            # Do not break request creation on notification failure
            pass

        emit_transfer_event(
            "campus_transfer.requested",
            {
                "campus_transfer_id": campus_transfer.id,
                "student_id": student.id,
                "from_campus_id": from_campus.id,
                "to_campus_id": to_campus.id,
                "teacher_id": teacher.id,
                "from_coordinator_id": from_coord.id if from_coord else None,
            },
        )

        return Response(CampusTransferSerializer(campus_transfer).data, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_campus_transfers(request):
    """
    List campus transfer requests visible to the current user.
    - Teacher: own initiated transfers (outgoing)
    - Coordinator: transfers where they are from/to coordinator (incoming)
    - Principal: transfers where they are from/to principal (incoming/outgoing)
    """
    try:
        user = request.user
        teacher = _get_teacher_for_user(user)
        coordinator = _get_coordinator_for_user(user)
        is_principal_user = _is_principal(user) or user.is_superuser

        queryset = CampusTransfer.objects.select_related(
            'student',
            'from_campus',
            'to_campus',
            'from_classroom',
            'to_classroom',
            'initiated_by_teacher',
            'from_coordinator',
            'to_coordinator',
            'from_principal',
            'to_principal',
        )

        direction = request.GET.get('direction', 'incoming')  # incoming | outgoing | all

        if teacher:
            # Teacher: only their initiated transfers
            queryset = queryset.filter(initiated_by_teacher=teacher)
            if direction == 'incoming':
                # For teachers, all their transfers are "outgoing"
                queryset = queryset.none()
        elif coordinator:
            # Coordinator: any transfer where they are from/to coordinator
            if direction == 'incoming':
                queryset = queryset.filter(Q(from_coordinator=coordinator) | Q(to_coordinator=coordinator))
            elif direction == 'outgoing':
                # Coordinators don't initiate campus transfers; for now, same as incoming
                queryset = queryset.filter(Q(from_coordinator=coordinator) | Q(to_coordinator=coordinator))
        elif is_principal_user:
            # Principal: transfers where they are from/to principal
            if direction == 'incoming':
                queryset = queryset.filter(Q(to_principal=user))
            elif direction == 'outgoing':
                queryset = queryset.filter(Q(from_principal=user))
            elif direction == 'all':
                # Show both incoming and outgoing
                queryset = queryset.filter(Q(from_principal=user) | Q(to_principal=user))
        else:
            return Response(
                {'error': 'You do not have permission to view campus transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        status_filter = request.GET.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        serializer = CampusTransferSerializer(queryset.order_by('-created_at'), many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def approve_campus_transfer_from_coord(request, transfer_id):
    """
    From-campus coordinator approval step.
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator:
            return Response(
                {'error': 'Only coordinators can approve campus transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        campus_transfer = get_object_or_404(CampusTransfer, id=transfer_id)

        if campus_transfer.status != 'pending_from_coord':
            return Response(
                {'error': 'This campus transfer is not waiting for from-campus coordinator approval'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if campus_transfer.from_coordinator and campus_transfer.from_coordinator != coordinator:
            return Response(
                {'error': 'This campus transfer is not assigned to you'},
                status=status.HTTP_403_FORBIDDEN,
            )

        campus_transfer.status = 'pending_from_principal'
        campus_transfer.from_coordinator = coordinator
        campus_transfer.save()

        TransferApproval.objects.create(
            transfer_type='campus',
            transfer_id=campus_transfer.id,
            role='coordinator_from',
            approved_by=user,
            status='approved',
            comment=request.data.get('comment', ''),
            step_order=2,
        )

        # Notify from-campus principal
        try:
            from django.contrib.auth import get_user_model
            from principals.models import Principal

            UserModel = get_user_model()

            from_principal_user = campus_transfer.from_principal
            if not from_principal_user:
                principal_obj = Principal.objects.filter(campus=campus_transfer.from_campus).first()
                if principal_obj and principal_obj.user:
                    from_principal_user = principal_obj.user
                    campus_transfer.from_principal = from_principal_user
                    campus_transfer.save(update_fields=['from_principal'])

            if from_principal_user:
                student_name = campus_transfer.student.name
                coord_name = coordinator.full_name
                from_campus_name = getattr(campus_transfer.from_campus, 'campus_name', str(campus_transfer.from_campus))
                to_campus_name = getattr(campus_transfer.to_campus, 'campus_name', str(campus_transfer.to_campus))

                verb1 = f"Coordinator {coord_name} made a campus transfer request for {student_name}. Please review."
                target_text1 = f"From {from_campus_name} to {to_campus_name}"

                create_notification(
                    recipient=from_principal_user,
                    actor=user,
                    verb=verb1,
                    target_text=target_text1,
                    data={
                        "type": "campus_transfer.pending_from_principal_info",
                        "campus_transfer_id": campus_transfer.id,
                        "student_id": campus_transfer.student.id,
                    },
                )

                verb2 = f"Request of campus transfer of {student_name} needs your approval"
                target_text2 = f"Please review campus transfer from {from_campus_name} to {to_campus_name}"

                create_notification(
                    recipient=from_principal_user,
                    actor=user,
                    verb=verb2,
                    target_text=target_text2,
                    data={
                        "type": "campus_transfer.pending_from_principal",
                        "campus_transfer_id": campus_transfer.id,
                        "student_id": campus_transfer.student.id,
                    },
                )
        except Exception:
            pass

        emit_transfer_event(
            "campus_transfer.from_coord_approved",
            {
                "campus_transfer_id": campus_transfer.id,
                "student_id": campus_transfer.student.id,
                "coordinator_id": coordinator.id,
            },
        )

        return Response(
            {
                'message': 'Campus transfer updated after from-campus coordinator approval',
                'campus_transfer': CampusTransferSerializer(campus_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def approve_campus_transfer_from_principal(request, transfer_id):
    """
    From-campus principal approval step.
    """
    try:
        user = request.user
        if not _is_principal(user) and not user.is_superuser:
            return Response(
                {'error': 'Only principals can approve this step of campus transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        campus_transfer = get_object_or_404(CampusTransfer, id=transfer_id)

        if campus_transfer.status != 'pending_from_principal':
            return Response(
                {'error': 'This campus transfer is not waiting for from-campus principal approval'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campus_transfer.status = 'pending_to_principal'
        campus_transfer.from_principal = user
        campus_transfer.save()

        TransferApproval.objects.create(
            transfer_type='campus',
            transfer_id=campus_transfer.id,
            role='principal',
            approved_by=user,
            status='approved',
            comment=request.data.get('comment', ''),
            step_order=3,
        )

        # Notify to-campus principal
        try:
            from principals.models import Principal

            to_principal_user = campus_transfer.to_principal
            if not to_principal_user:
                principal_obj = Principal.objects.filter(campus=campus_transfer.to_campus).first()
                if principal_obj and principal_obj.user:
                    to_principal_user = principal_obj.user
                    campus_transfer.to_principal = to_principal_user
                    campus_transfer.save(update_fields=['to_principal'])

            if to_principal_user:
                student_name = campus_transfer.student.name
                from_campus_name = getattr(campus_transfer.from_campus, 'campus_name', str(campus_transfer.from_campus))
                to_campus_name = getattr(campus_transfer.to_campus, 'campus_name', str(campus_transfer.to_campus))

                verb1 = f"Principal {user.get_full_name()} made a campus transfer request for {student_name}. Please review."
                target_text1 = f"From {from_campus_name} to {to_campus_name}"

                create_notification(
                    recipient=to_principal_user,
                    actor=user,
                    verb=verb1,
                    target_text=target_text1,
                    data={
                        "type": "campus_transfer.pending_to_principal_info",
                        "campus_transfer_id": campus_transfer.id,
                        "student_id": campus_transfer.student.id,
                    },
                )

                verb2 = (
                    f"Request of campus transfer of {student_name} from {from_campus_name} "
                    f"to {to_campus_name} needs your approval"
                )
                target_text2 = (
                    f"Campus transfer from {from_campus_name} to your campus for student {student_name}"
                )

                create_notification(
                    recipient=to_principal_user,
                    actor=user,
                    verb=verb2,
                    target_text=target_text2,
                    data={
                        "type": "campus_transfer.pending_to_principal",
                        "campus_transfer_id": campus_transfer.id,
                        "student_id": campus_transfer.student.id,
                    },
                )
        except Exception:
            pass

        emit_transfer_event(
            "campus_transfer.from_principal_approved",
            {
                "campus_transfer_id": campus_transfer.id,
                "student_id": campus_transfer.student.id,
                "principal_id": user.id,
            },
        )

        return Response(
            {
                'message': 'Campus transfer updated after from-campus principal approval',
                'campus_transfer': CampusTransferSerializer(campus_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def approve_campus_transfer_to_principal(request, transfer_id):
    """
    To-campus principal approval step.
    """
    try:
        user = request.user
        if not _is_principal(user) and not user.is_superuser:
            return Response(
                {'error': 'Only principals can approve this step of campus transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        campus_transfer = get_object_or_404(CampusTransfer, id=transfer_id)

        if campus_transfer.status != 'pending_to_principal':
            return Response(
                {'error': 'This campus transfer is not waiting for to-campus principal approval'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campus_transfer.status = 'pending_to_coord'
        campus_transfer.to_principal = user
        campus_transfer.save()

        TransferApproval.objects.create(
            transfer_type='campus',
            transfer_id=campus_transfer.id,
            role='principal',
            approved_by=user,
            status='approved',
            comment=request.data.get('comment', ''),
            step_order=4,
        )

        # Notify to-campus coordinator
        try:
            from coordinator.models import Coordinator
            from django.contrib.auth import get_user_model

            UserModel = get_user_model()

            to_coord = campus_transfer.to_coordinator
            if not to_coord:
                # Try to detect coordinator from to_grade or to_classroom
                target_level = None
                if campus_transfer.to_grade:
                    target_level = campus_transfer.to_grade.level
                elif campus_transfer.to_classroom and campus_transfer.to_classroom.grade:
                    target_level = campus_transfer.to_classroom.grade.level
                
                if target_level:
                    coord_qs = Coordinator.objects.filter(
                        campus=campus_transfer.to_campus,
                        is_currently_active=True,
                    )
                    coord_qs = coord_qs.filter(Q(level=target_level) | Q(assigned_levels=target_level)).distinct()
                    to_coord = coord_qs.first()
                    if to_coord:
                        campus_transfer.to_coordinator = to_coord
                        campus_transfer.save(update_fields=['to_coordinator'])

            if to_coord:
                coord_user = getattr(to_coord, 'user', None)
                if not coord_user and getattr(to_coord, 'employee_code', None):
                    coord_user = UserModel.objects.filter(
                        username=to_coord.employee_code
                    ).first()
                if not coord_user and getattr(to_coord, 'email', None):
                    coord_user = UserModel.objects.filter(
                        email__iexact=to_coord.email
                    ).first()

                if coord_user:
                    student_name = campus_transfer.student.name
                    student_id_disp = campus_transfer.student.student_id
                    from_campus_name = getattr(campus_transfer.from_campus, 'campus_name', str(campus_transfer.from_campus))
                    to_campus_name = getattr(campus_transfer.to_campus, 'campus_name', str(campus_transfer.to_campus))
                    from_grade_label = campus_transfer.from_grade_name or ''
                    from_section_label = campus_transfer.from_section or ''
                    to_grade_label = campus_transfer.to_grade_name or from_grade_label
                    to_section_label = campus_transfer.to_section or ''

                    from_class_label = f"{from_grade_label} {from_section_label}".strip()
                    to_class_label = f"{to_grade_label} {to_section_label}".strip()

                    # 1) Detailed info message
                    verb1 = (
                        f"Principal of {to_campus_name} has made a campus transfer request for "
                        f"{student_name} ({student_id_disp}) from {from_campus_name} to {to_campus_name} "
                        f"from {from_class_label} to {to_class_label}. Please review."
                    )
                    target_text1 = (
                        f"{student_name} ({student_id_disp}) from {from_class_label} → {to_class_label}"
                    )

                    create_notification(
                        recipient=coord_user,
                        actor=user,
                        verb=verb1,
                        target_text=target_text1,
                        data={
                            "type": "campus_transfer.pending_to_coord_info",
                            "campus_transfer_id": campus_transfer.id,
                            "student_id": campus_transfer.student.id,
                        },
                    )

                    # 2) Needs approval message
                    verb2 = (
                        f"Request of campus transfer of {student_name} ({student_id_disp}) "
                        f"from {from_campus_name} ({from_class_label}) "
                        f"to {to_campus_name} ({to_class_label}) needs your approval"
                    )
                    target_text2 = target_text1

                    create_notification(
                        recipient=coord_user,
                        actor=user,
                        verb=verb2,
                        target_text=target_text2,
                        data={
                            "type": "campus_transfer.pending_to_coord",
                            "campus_transfer_id": campus_transfer.id,
                            "student_id": campus_transfer.student.id,
                        },
                    )
        except Exception:
            pass

        emit_transfer_event(
            "campus_transfer.to_principal_approved",
            {
                "campus_transfer_id": campus_transfer.id,
                "student_id": campus_transfer.student.id,
                "principal_id": user.id,
            },
        )

        return Response(
            {
                'message': 'Campus transfer updated after to-campus principal approval',
                'campus_transfer': CampusTransferSerializer(campus_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def confirm_campus_transfer(request, transfer_id):
    """
    Final confirmation by to-campus coordinator.
    Requires confirm_text == 'confirm' in payload.
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator:
            return Response(
                {'error': 'Only coordinators can confirm campus transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        campus_transfer = get_object_or_404(CampusTransfer, id=transfer_id)

        if campus_transfer.status != 'pending_to_coord':
            return Response(
                {'error': 'This campus transfer is not waiting for coordinator confirmation'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if campus_transfer.to_coordinator and campus_transfer.to_coordinator != coordinator:
            return Response(
                {'error': 'This campus transfer is not assigned to you'},
                status=status.HTTP_403_FORBIDDEN,
            )

        confirm_text = request.data.get('confirm_text', '').strip().lower()
        if confirm_text != 'confirm':
            return Response(
                {'error': "To confirm transfer, you must type 'confirm' in the confirmation field."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campus_transfer.to_coordinator = coordinator
        campus_transfer.save(update_fields=['to_coordinator'])

        # Apply transfer (ID change + classroom move)
        result = apply_campus_transfer(campus_transfer, changed_by=user)

        TransferApproval.objects.create(
            transfer_type='campus',
            transfer_id=campus_transfer.id,
            role='coordinator_to',
            approved_by=user,
            status='approved',
            comment=request.data.get('comment', ''),
            step_order=5,
        )

        # Notify initiating teacher & from-campus principal about final approval
        try:
            from django.contrib.auth import get_user_model

            UserModel = get_user_model()

            student = campus_transfer.student
            student_name = student.name
            new_id = campus_transfer.letter_new_student_id or student.student_id
            from_campus_name = getattr(campus_transfer.from_campus, 'campus_name', str(campus_transfer.from_campus))
            to_campus_name = getattr(campus_transfer.to_campus, 'campus_name', str(campus_transfer.to_campus))

            from_class_label = campus_transfer.letter_from_class_label or campus_transfer.from_grade_name
            to_class_label = campus_transfer.letter_to_class_label or campus_transfer.to_grade_name

            # Teacher who initiated request
            if campus_transfer.initiated_by_teacher:
                teacher = campus_transfer.initiated_by_teacher
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
                    verb = (
                        f"Your campus transfer request for {student_name} has been fully approved "
                        f"and applied. New ID: {new_id}."
                    )
                    target_text = (
                        f"{student_name}: {from_campus_name} ({from_class_label}) → "
                        f"{to_campus_name} ({to_class_label})"
                    )
                    create_notification(
                        recipient=teacher_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "campus_transfer.approved",
                            "campus_transfer_id": campus_transfer.id,
                            "student_id": student.id,
                            "new_student_id": new_id,
                        },
                    )

            # From-campus principal (view only)
            if campus_transfer.from_principal:
                verb = (
                    f"Campus transfer for {student_name} from your campus to {to_campus_name} "
                    f"has been confirmed. New ID: {new_id}."
                )
                target_text = (
                    f"{student_name}: {from_campus_name} ({from_class_label}) → "
                    f"{to_campus_name} ({to_class_label})"
                )
                create_notification(
                    recipient=campus_transfer.from_principal,
                    actor=user,
                    verb=verb,
                    target_text=target_text,
                    data={
                        "type": "campus_transfer.approved_view_only",
                        "campus_transfer_id": campus_transfer.id,
                        "student_id": student.id,
                        "new_student_id": new_id,
                    },
                )
        except Exception:
            pass

        emit_transfer_event(
            "campus_transfer.confirmed",
            {
                "campus_transfer_id": campus_transfer.id,
                "student_id": campus_transfer.student.id,
                "coordinator_id": coordinator.id,
                "new_student_id": campus_transfer.letter_new_student_id,
            },
        )

        return Response(
            {
                'message': 'Campus transfer confirmed and applied successfully',
                'campus_transfer': CampusTransferSerializer(campus_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def decline_campus_transfer(request, transfer_id):
    """
    Decline a campus transfer at any pending step (coordinator/principal).
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        is_principal_user = _is_principal(user) or user.is_superuser

        if not coordinator and not is_principal_user:
            return Response(
                {'error': 'Only coordinators or principals can decline campus transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        campus_transfer = get_object_or_404(CampusTransfer, id=transfer_id)

        if campus_transfer.status not in [
            'pending_from_coord',
            'pending_from_principal',
            'pending_to_principal',
            'pending_to_coord',
        ]:
            return Response(
                {'error': 'Only pending campus transfers can be declined'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TransferApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', '')

        campus_transfer.status = 'declined'
        campus_transfer.decline_reason = reason
        campus_transfer.save()

        role = 'coordinator_from'
        if coordinator and campus_transfer.status == 'pending_to_coord':
            role = 'coordinator_to'
        if is_principal_user:
            role = 'principal'

        TransferApproval.objects.create(
            transfer_type='campus',
            transfer_id=campus_transfer.id,
            role=role,
            approved_by=user,
            status='declined',
            comment=reason,
            step_order=99,
        )

        emit_transfer_event(
            "campus_transfer.declined",
            {
                "campus_transfer_id": campus_transfer.id,
                "student_id": campus_transfer.student.id,
                "by_user_id": user.id,
            },
        )

        return Response(
            {
                'message': 'Campus transfer declined',
                'campus_transfer': CampusTransferSerializer(campus_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_campus_transfer(request, transfer_id):
    """
    Allow the initiating teacher to cancel their campus transfer before approvals.
    """
    try:
        user = request.user
        teacher = _get_teacher_for_user(user)

        campus_transfer = get_object_or_404(CampusTransfer, id=transfer_id)

        if not teacher or campus_transfer.initiated_by_teacher != teacher:
            return Response(
                {'error': 'Only the teacher who created the request can cancel it'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if campus_transfer.status not in ['pending_from_coord', 'pending_from_principal']:
            return Response(
                {'error': 'Only transfers that are early in the workflow can be cancelled'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campus_transfer.status = 'cancelled'
        campus_transfer.save()

        emit_transfer_event(
            "campus_transfer.cancelled",
            {
                "campus_transfer_id": campus_transfer.id,
                "student_id": campus_transfer.student.id,
                "teacher_id": teacher.id,
            },
        )

        return Response(
            {
                'message': 'Campus transfer cancelled successfully',
                'campus_transfer': CampusTransferSerializer(campus_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_campus_transfer_letter(request, transfer_id):
    """
    Return structured data for the campus transfer approval letter.
    Frontend will render/download the letter using this payload.
    """
    try:
        campus_transfer = get_object_or_404(CampusTransfer, id=transfer_id)

        # Basic access control: teacher who initiated or principals/coordinators involved
        user = request.user
        teacher = _get_teacher_for_user(user)
        coordinator = _get_coordinator_for_user(user)
        is_principal_user = _is_principal(user) or user.is_superuser

        if not (
            (teacher and campus_transfer.initiated_by_teacher == teacher)
            or (coordinator and (campus_transfer.from_coordinator == coordinator or campus_transfer.to_coordinator == coordinator))
            or (is_principal_user and (campus_transfer.from_principal == user or campus_transfer.to_principal == user))
        ):
            return Response({'error': 'You do not have access to this letter'}, status=status.HTTP_403_FORBIDDEN)

        student = campus_transfer.student

        # Get old ID from transfer request's ID history
        old_id = student.student_id
        if campus_transfer.transfer_request:
            id_change = campus_transfer.transfer_request.id_changes.first()
            if id_change:
                old_id = id_change.old_id

        payload = {
            "student_name": student.name,
            "student_old_id": old_id,
            "student_new_id": campus_transfer.letter_new_student_id or student.student_id,
            "from_campus_name": campus_transfer.letter_from_campus_name or getattr(
                campus_transfer.from_campus, 'campus_name', str(campus_transfer.from_campus)
            ),
            "to_campus_name": campus_transfer.letter_to_campus_name or getattr(
                campus_transfer.to_campus, 'campus_name', str(campus_transfer.to_campus)
            ),
            "from_class_label": campus_transfer.letter_from_class_label,
            "to_class_label": campus_transfer.letter_to_class_label,
            "from_principal_name": campus_transfer.letter_from_principal_name,
            "to_principal_name": campus_transfer.letter_to_principal_name,
            "to_coordinator_name": campus_transfer.letter_to_coordinator_name,
            "approved_at": campus_transfer.letter_generated_at or campus_transfer.updated_at,
            "requested_date": campus_transfer.requested_date,
            "reason": campus_transfer.reason,
        }

        return Response(payload)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
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

        # Find principal BEFORE making any changes (so we can fail early if needed)
        from principals.models import Principal
        from django.contrib.auth import get_user_model
        UserModel = get_user_model()

        # Find principal for the campus
        principal_obj = Principal.objects.filter(campus=shift_transfer.campus).first()
        
        # Determine requesting and receiving principal
        # For shift transfers within same campus, both can be the same principal
        principal_user = None
        
        if principal_obj and principal_obj.user:
            principal_user = principal_obj.user
        else:
            # Fallback: find any principal
            any_principal = Principal.objects.filter(user__isnull=False).first()
            if any_principal and any_principal.user:
                principal_user = any_principal.user
            else:
                # Last resort: check if current user is a principal
                if _is_principal(user):
                    principal_user = user
                else:
                    # Final fallback: use superuser or first active user with principal role
                    superuser = UserModel.objects.filter(is_superuser=True, is_active=True).first()
                    if superuser:
                        principal_user = superuser
                    else:
                        # Last option: use any active user (for system-generated transfers)
                        principal_user = UserModel.objects.filter(is_active=True).first()
                        
        if not principal_user:
            # This should never happen, but if it does, we can't proceed
            return Response(
                {'error': 'Unable to find a principal for this transfer. Please contact administrator.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Create TransferRequest BEFORE applying transfer
        transfer_request = TransferRequest.objects.create(
            request_type='student',
            status='pending',
            from_campus=shift_transfer.campus,
            from_shift='M' if shift_transfer.from_shift == 'morning' else 'A',
            requesting_principal=principal_user,
            to_campus=shift_transfer.campus,
            to_shift='M' if shift_transfer.to_shift == 'morning' else 'A',
            receiving_principal=principal_user,  # Same campus, same principal
            student=shift_transfer.student,
            reason=shift_transfer.reason,
            requested_date=shift_transfer.requested_date,
            notes='Auto-generated from shift transfer approvals',
            transfer_category='shift',
        )

        # Apply the transfer (this moves the student and updates ID)
        link_and_apply_shift_transfer(
            shift_transfer=shift_transfer,
            transfer_request=transfer_request,
            changed_by=user,
            reason=f"Shift transfer approved: {shift_transfer.reason}",
        )

        # Mark approval AFTER successful transfer
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

        # Notify coordinator and destination class teacher
        try:
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            student = shift_transfer.student
            student_name = student.name
            # Get coordinator user to get role
            coordinator_user_obj = getattr(coordinator, 'user', None)
            if not coordinator_user_obj and hasattr(coordinator, 'employee_code') and coordinator.employee_code:
                coordinator_user_obj = UserModel.objects.filter(username=coordinator.employee_code).first()
            if not coordinator_user_obj and hasattr(coordinator, 'email') and coordinator.email:
                coordinator_user_obj = UserModel.objects.filter(email__iexact=coordinator.email).first()
            
            coordinator_name = get_user_role_name(coordinator_user_obj) if coordinator_user_obj else (coordinator.full_name if hasattr(coordinator, 'full_name') else (coordinator.name if hasattr(coordinator, 'name') else 'Coordinator'))

            # Notify coordinator (who approved the transfer)
            coordinator_user = getattr(coordinator, 'user', None)
            if not coordinator_user and hasattr(coordinator, 'employee_code') and coordinator.employee_code:
                coordinator_user = UserModel.objects.filter(
                    username=coordinator.employee_code
                ).first()
            if not coordinator_user and hasattr(coordinator, 'email') and coordinator.email:
                coordinator_user = UserModel.objects.filter(
                    email__iexact=coordinator.email
                ).first()

            if coordinator_user:
                # Get classroom information
                from_class = shift_transfer.from_classroom
                to_class = shift_transfer.to_classroom
                
                if to_class:
                    to_classroom_name = f"{to_class.grade.name if to_class.grade else ''} - {to_class.section}"
                    from_class_text = ""
                    if from_class:
                        from_class_text = f"{from_class.grade.name if from_class.grade else ''} - {from_class.section}"
                    else:
                        # Fallback to student's previous classroom info
                        # Note: student.classroom is already updated, so we use shift_transfer data
                        if hasattr(shift_transfer, 'from_classroom') and shift_transfer.from_classroom:
                            from_class_text = f"{shift_transfer.from_classroom.grade.name if shift_transfer.from_classroom.grade else ''} - {shift_transfer.from_classroom.section}"
                        else:
                            from_class_text = "Previous class"
                    
                    verb = f"{student_name} has been transferred in your assigned {to_classroom_name}"
                    target_text = f"From {from_class_text} to {to_classroom_name}"
                    
                    create_notification(
                        recipient=coordinator_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "shift_transfer.coordinator_notified",
                            "shift_transfer_id": shift_transfer.id,
                            "student_id": student.id,
                        },
                    )

            # Notify destination class teacher if exists
            dest_class = shift_transfer.to_classroom
            if dest_class:
                # Check for class teacher (both FK and M2M)
                dest_teacher = None
                if dest_class.class_teacher:
                    dest_teacher = dest_class.class_teacher
                elif hasattr(dest_class, 'class_teachers') and dest_class.class_teachers.exists():
                    dest_teacher = dest_class.class_teachers.first()
                
                if dest_teacher:
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
                        verb = f"{coordinator_name} has made a transfer of {student_name} in your class"
                        target_text = f"Student transferred to your class"
                        
                        create_notification(
                            recipient=dest_teacher_user,
                            actor=user,
                            verb=verb,
                            target_text=target_text,
                            data={
                                "type": "shift_transfer.teacher_notified",
                                "shift_transfer_id": shift_transfer.id,
                                "student_id": student.id,
                            },
                        )

            # Notify requesting teacher (optional - if they want to know)
            teacher = shift_transfer.requesting_teacher
            if teacher:
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
                    from_shift_display = shift_transfer.from_shift.title() if shift_transfer.from_shift else 'current shift'
                    to_shift_display = shift_transfer.to_shift.title() if shift_transfer.to_shift else 'destination shift'
                    verb = "Your shift transfer request has been fully approved and applied"
                    target_text = (
                        f"{student_name}: {from_shift_display} → {to_shift_display}"
                    )
                    create_notification(
                        recipient=teacher_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "shift_transfer.approved",
                            "shift_transfer_id": shift_transfer.id,
                            "student_id": student.id,
                        },
                    )
        except Exception as notify_err:
            pass  # Don't fail approval if notification fails

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

        # Notify requesting teacher about the decline
        try:
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            student = shift_transfer.student
            student_name = student.name
            from_shift_display = shift_transfer.from_shift.title() if shift_transfer.from_shift else 'current shift'
            to_shift_display = shift_transfer.to_shift.title() if shift_transfer.to_shift else 'destination shift'

            teacher = shift_transfer.requesting_teacher
            if teacher:
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
                    verb = "Your shift transfer request has been declined"
                    target_text = (
                        f"{student_name}: {from_shift_display} → {to_shift_display}"
                    )
                    if reason:
                        target_text += f" - {reason}"
                    create_notification(
                        recipient=teacher_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "shift_transfer.declined",
                            "shift_transfer_id": shift_transfer.id,
                            "student_id": student.id,
                            "reason": reason,
                        },
                    )
        except Exception as notify_err:
            pass  # Don't fail decline if notification fails

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

        if not current_classroom.grade:
            return Response(
                {'error': 'Student\'s current classroom does not have a grade assigned'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.db.models import Q
        from coordinator.models import Coordinator
        
        # Normalize shift value to match ClassRoom model format
        # ClassRoom shift values are: 'morning', 'afternoon', 'both'
        to_shift_normalized = to_shift.lower().strip()
        
        # Map frontend values to database values
        if to_shift_normalized in ['morning', 'm']:
            shift_value = 'morning'
        elif to_shift_normalized in ['afternoon', 'a']:
            shift_value = 'afternoon'
        else:
            # Fallback to exact match (case-insensitive)
            shift_value = to_shift_normalized
        
        # Filter by grade_name (not grade_id) because same grade can have different grade_ids for different shifts
        # Include both the specific shift AND 'both' shift (since 'both' sections are available for either shift)
        if shift_value in ['morning', 'afternoon']:
            shift_filter = Q(shift=shift_value) | Q(shift='both')
        else:
            shift_filter = Q(shift=shift_value)
        
        # Use grade name instead of grade_id to find all sections of the same grade across different shifts
        grade_name = current_classroom.grade.name if current_classroom.grade else None
        if grade_name:
            classrooms = ClassRoom.objects.filter(
                grade__name=grade_name,
            ).filter(shift_filter).order_by('grade__name', 'section')
        else:
            # Fallback to grade_id if grade name is not available
            classrooms = ClassRoom.objects.filter(
                grade_id=current_classroom.grade_id,
            ).filter(shift_filter).order_by('grade__name', 'section')
        
        # Get campus for coordinator lookup (but don't filter by it for shift transfers)
        # For shift transfers, grade_id filter is sufficient - we want all sections of same grade in opposite shift
        campus = None
        if current_classroom.grade and current_classroom.grade.level:
            campus = current_classroom.grade.level.campus
        
        # Note: We're NOT filtering by campus for shift transfers to ensure we get all available sections
        # The grade_id filter ensures we only get sections from the same grade

        available_data = []
        for cr in classrooms:
            # Double-check shift filter: only include if shift matches or is 'both'
            if shift_value in ['morning', 'afternoon']:
                if cr.shift not in [shift_value, 'both']:
                    continue
            
            student_count = cr.students.count()
            # Include all sections, even if at capacity (let user see all options)
            # Frontend can show capacity status if needed
            
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
                    'student_count': student_count,
                    'capacity': cr.capacity,
                    'is_full': student_count >= cr.capacity,
                }
            )
        
        return Response(available_data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Grade Skip Transfer APIs
# ---------------------------------------------------------------------------


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_grades_for_skip(request):
    """
    Return available grade for skip (exactly 1 grade ahead, e.g., Grade 1 → Grade 3).
    Returns only the skip grade (current + 2).
    """
    try:
        student_id = request.GET.get('student_id')
        if not student_id:
            return Response({'error': 'student_id parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        student = get_object_or_404(Student, id=student_id)
        current_classroom = student.classroom
        if not current_classroom:
            return Response(
                {'error': 'Student is not currently assigned to any classroom'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from_grade = current_classroom.grade
        if not from_grade:
            return Response(
                {'error': 'Student\'s current classroom does not have a grade assigned'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extract grade number and handle both "Grade-X" and "KG-X" formats
        import re
        from classes.models import Grade
        
        grade_name = from_grade.name.strip()
        grade_name_lower = grade_name.lower()
        
        # Roman numeral mapping
        roman_map = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10}
        roman_map_reverse = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X'}
        
        # Handle KG grades (KG-I, KG-II, KG-1, KG-2, etc.)
        if grade_name_lower.startswith('kg'):
            # Extract number from KG grade (KG-2, KG-II, etc.)
            kg_match = re.search(r'(\d+)', grade_name)
            if not kg_match:
                # Try Roman numerals (KG-I, KG-II)
                kg_roman = re.search(r'kg[-\s]*(i{1,3}|iv|v|vi{0,3}|ix|x)', grade_name_lower)
                if kg_roman:
                    kg_num = roman_map.get(kg_roman.group(1).lower(), 1)
                else:
                    return Response(
                        {'error': 'Unable to determine KG grade number'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                kg_num = int(kg_match.group(1))
            
            # For KG grades, skip to Grade-{kg_num} (e.g., KG-2 → Grade-2, skipping Grade-1)
            to_grade_num = kg_num
        else:
            # Handle regular Grade-X format
            from_match = re.search(r'(\d+)', grade_name)
            if not from_match:
                # Try to extract Roman numeral from grade name
                grade_roman = re.search(r'grade[-\s]*(i{1,3}|iv|v|vi{0,3}|ix|x)', grade_name_lower)
                if grade_roman:
                    from_grade_num = roman_map.get(grade_roman.group(1).lower(), 1)
                else:
                    return Response(
                        {'error': 'Unable to determine current grade number'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                from_grade_num = int(from_match.group(1))
            
            to_grade_num = from_grade_num + 2  # Skip exactly 1 grade (e.g., Grade-1 → Grade-3)

        # Map number to Roman numeral for matching
        roman_numeral = roman_map_reverse.get(to_grade_num, str(to_grade_num))
        
        # Search for both formats: "Grade-2", "Grade 2", "Grade II", "Grade-II", etc.
        # Try multiple patterns to be more flexible
        to_grades = Grade.objects.filter(
            level__campus=student.campus,
        ).filter(
            Q(name__iregex=rf'^Grade[-\s]*{to_grade_num}$') |  # Exact match "Grade-2", "Grade 2"
            Q(name__iregex=rf'^Grade[-\s]*{roman_numeral}$') |  # Exact match "Grade II", "Grade-II"
            Q(name__iexact=f'Grade-{to_grade_num}') |  # Exact "Grade-2"
            Q(name__iexact=f'Grade {to_grade_num}') |  # Exact "Grade 2"
            Q(name__iexact=f'Grade-{roman_numeral}') |  # Exact "Grade-II"
            Q(name__iexact=f'Grade {roman_numeral}') |  # Exact "Grade II"
            Q(name__icontains=f'Grade-{to_grade_num}') |  # Contains "Grade-2"
            Q(name__icontains=f'Grade {to_grade_num}') |  # Contains "Grade 2"
            Q(name__icontains=f'Grade-{roman_numeral}') |  # Contains "Grade-II"
            Q(name__icontains=f'Grade {roman_numeral}')  # Contains "Grade II"
        )

        if not to_grades.exists():
            # Last resort: try to find any grade with just the number or roman numeral
            fallback_grades = Grade.objects.filter(
                level__campus=student.campus,
            ).filter(
                Q(name__icontains=str(to_grade_num)) |
                Q(name__icontains=roman_numeral)
            ).exclude(
                name__icontains='KG'  # Exclude KG grades
            )
            
            if fallback_grades.exists():
                to_grade = fallback_grades.first()
            else:
                # Debug: list available grades in campus
                all_grades = Grade.objects.filter(level__campus=student.campus).values_list('name', flat=True)
                return Response(
                    {
                        'error': f'No skip grade found for {grade_name} in the same campus. Expected: Grade-{to_grade_num} or Grade {roman_numeral}',
                        'available_grades': list(all_grades),
                        'campus': student.campus.campus_name if student.campus else 'Unknown'
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            to_grade = to_grades.first()

        # Return the first matching grade (should be unique per campus)
        return Response({
            'id': to_grade.id,
            'name': to_grade.name,
            'level_name': to_grade.level.name if to_grade.level else None,
            'campus_name': to_grade.level.campus.campus_name if to_grade.level and to_grade.level.campus else None,
        })
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_sections_for_grade_skip(request):
    """
    Return available sections/classrooms for grade skip in target grade.
    Filters by target grade and optionally by shift.
    """
    try:
        student_id = request.GET.get('student_id')
        to_grade_id = request.GET.get('to_grade_id')
        to_shift = request.GET.get('to_shift')  # Optional

        if not student_id or not to_grade_id:
            return Response(
                {'error': 'student_id and to_grade_id parameters are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student = get_object_or_404(Student, id=student_id)
        current_classroom = student.classroom
        if not current_classroom:
            return Response(
                {'error': 'Student is not currently assigned to any classroom'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from classes.models import Grade
        to_grade = get_object_or_404(Grade, id=to_grade_id)
        
        # If shift is specified and the grade doesn't have sections for that shift,
        # try to find another Grade with the same name that has sections for that shift
        if to_shift:
            normalized_shift_for_lookup = to_shift.lower().strip()
            if normalized_shift_for_lookup == 'm':
                normalized_shift_for_lookup = 'morning'
            elif normalized_shift_for_lookup == 'a':
                normalized_shift_for_lookup = 'afternoon'
            
            # Check if current grade has sections for this shift
            has_sections_for_shift = ClassRoom.objects.filter(
                grade=to_grade,
                grade__level__campus=student.campus,
                shift=normalized_shift_for_lookup
            ).exists()
            
            # If not, try to find another Grade with the same name that has sections for this shift
            if not has_sections_for_shift:
                alternative_grade = Grade.objects.filter(
                    name=to_grade.name,  # Exact name match
                    level__campus=student.campus,
                ).exclude(id=to_grade.id).first()
                
                if alternative_grade:
                    # Check if alternative grade has sections for this shift
                    has_alt_sections = ClassRoom.objects.filter(
                        grade=alternative_grade,
                        grade__level__campus=student.campus,
                        shift=normalized_shift_for_lookup
                    ).exists()
                    
                    if has_alt_sections:
                        to_grade = alternative_grade

        # Filter classrooms by target grade and same campus
        # ClassRoom gets campus through grade->level->campus
        classrooms_query = ClassRoom.objects.filter(
            grade=to_grade,
            grade__level__campus=student.campus,
        )

        # Filter by shift if provided
        normalized_shift = None
        if to_shift:
            # Normalize shift value - handle both 'morning'/'afternoon' and 'M'/'A' formats
            normalized_shift = to_shift.lower().strip()
            if normalized_shift == 'm':
                normalized_shift = 'morning'
            elif normalized_shift == 'a':
                normalized_shift = 'afternoon'
            # If already 'morning' or 'afternoon', keep as is
            classrooms_query = classrooms_query.filter(shift=normalized_shift)
        else:
            # If no shift specified, show classrooms in current shift
            # Normalize student shift too
            student_shift = student.shift
            if student_shift:
                normalized_shift = str(student_shift).lower().strip()
                if normalized_shift == 'm':
                    normalized_shift = 'morning'
                elif normalized_shift == 'a':
                    normalized_shift = 'afternoon'
                # If already 'morning' or 'afternoon', keep as is
                classrooms_query = classrooms_query.filter(shift=normalized_shift)
        
        classrooms = classrooms_query.order_by('section')

        # Build available sections data
        available_data = []
        for cr in classrooms:
            class_teacher_name = cr.class_teacher.full_name if cr.class_teacher else None

            # Find coordinator for this classroom
            coordinator_name = None
            if cr.grade and cr.grade.level:
                coordinators = Coordinator.objects.filter(
                    is_currently_active=True,
                    campus=student.campus,
                )
                for coord in coordinators:
                    if coord.shift == 'both' and coord.assigned_levels.exists():
                        if cr.grade.level in coord.assigned_levels.all():
                            coordinator_name = coord.full_name
                            break
                    elif coord.shift == 'both' and coord.level == cr.grade.level:
                        coordinator_name = coord.full_name
                        break
                    elif coord.shift == cr.shift and coord.level == cr.grade.level:
                        coordinator_name = coord.full_name
                        break

            # Count students in classroom
            student_count = cr.students.count()

            available_data.append({
                'id': cr.id,
                'label': f"{cr.grade.name} - {cr.section} ({cr.shift})",
                'grade_name': cr.grade.name,
                'grade_id': cr.grade.id,  # Include actual grade ID used
                'section': cr.section,
                'shift': cr.shift,
                'class_teacher_name': class_teacher_name,
                'coordinator_name': coordinator_name,
                'student_count': student_count,
                'capacity': cr.capacity,
                'is_full': student_count >= cr.capacity,
            })

        return Response(available_data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def create_grade_skip_transfer(request):
    """
    Create a grade skip transfer request.
    Teacher provides student, target grade, optional target classroom, optional target shift, reason, requested_date.
    """
    try:
        user = request.user
        teacher = _get_teacher_for_user(user)
        if not teacher:
            return Response(
                {'error': 'Only teachers can create grade skip transfer requests'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = GradeSkipTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student = serializer.validated_data['student']
        to_grade = serializer.validated_data['to_grade']
        to_classroom = serializer.validated_data.get('to_classroom')
        to_shift = serializer.validated_data.get('to_shift')
        reason = serializer.validated_data['reason']
        requested_date = serializer.validated_data['requested_date']

        # Get student's current classroom and grade
        from_classroom = student.classroom
        if not from_classroom or not from_classroom.grade:
            return Response(
                {'error': 'Student is not assigned to a classroom with a grade'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from_grade = from_classroom.grade
        from_shift_actual = student.shift

        # Use provided to_shift or default to current shift
        if not to_shift:
            to_shift = from_shift_actual

        # Detect coordinators
        from_coordinator, to_coordinator, is_same_coordinator = detect_grade_skip_coordinators(
            student, to_grade, to_shift
        )

        if not from_coordinator:
            return Response(
                {'error': 'No coordinator found for student\'s current grade/level'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create grade skip transfer
        grade_skip_transfer = GradeSkipTransfer.objects.create(
            student=student,
            campus=student.campus,
            from_grade=from_grade,
            from_grade_name=from_grade.name,
            to_grade=to_grade,
            to_grade_name=to_grade.name,
            from_classroom=from_classroom,
            from_section=from_classroom.section,
            to_classroom=to_classroom,
            to_section=to_classroom.section if to_classroom else None,
            from_shift=from_shift_actual,
            to_shift=to_shift,
            initiated_by_teacher=teacher,
            from_grade_coordinator=from_coordinator,
            to_grade_coordinator=to_coordinator,
            status='pending_own_coord',
            reason=reason,
            requested_date=requested_date,
        )

        # Send notifications
        try:
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            student_name = student.name
            teacher_name = teacher.full_name

            # Notification to teacher's coordinator
            if from_coordinator:
                coordinator_user = getattr(from_coordinator, 'user', None)
                if not coordinator_user and from_coordinator.employee_code:
                    coordinator_user = UserModel.objects.filter(
                        username=from_coordinator.employee_code
                    ).first()
                if not coordinator_user and getattr(from_coordinator, 'email', None):
                    coordinator_user = UserModel.objects.filter(
                        email__iexact=from_coordinator.email
                    ).first()

                if coordinator_user:
                    verb = f"{teacher_name} has made a request of grade skipping of {student_name} please kindly review"
                    target_text = f"Grade skip: {from_grade.name} → {to_grade.name}"
                    create_notification(
                        recipient=coordinator_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "grade_skip.requested",
                            "grade_skip_transfer_id": grade_skip_transfer.id,
                            "student_id": student.id,
                        },
                    )

                    # Second notification to coordinator
                    verb2 = f"Request of grade skipping of {student_name} needs your approval please kindly review the request"
                    create_notification(
                        recipient=coordinator_user,
                        actor=user,
                        verb=verb2,
                        target_text=target_text,
                        data={
                            "type": "grade_skip.pending_approval",
                            "grade_skip_transfer_id": grade_skip_transfer.id,
                            "student_id": student.id,
                        },
                    )
        except Exception as notify_err:
            print(f"[WARN] Failed to send grade skip creation notifications: {notify_err}")

        return Response(
            GradeSkipTransferSerializer(grade_skip_transfer).data,
            status=status.HTTP_201_CREATED,
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def approve_grade_skip_own_coord(request, transfer_id):
    """
    First coordinator approval step for a grade skip transfer.
    If same coordinator: apply transfer immediately.
    If different coordinator: change status to pending_other_coord and transfer to other coordinator.
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator:
            return Response(
                {'error': 'Only coordinators can approve grade skip transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        grade_skip_transfer = get_object_or_404(GradeSkipTransfer, id=transfer_id)

        if grade_skip_transfer.status != 'pending_own_coord':
            return Response(
                {'error': 'This grade skip transfer is not waiting for coordinator approval'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if grade_skip_transfer.from_grade_coordinator and grade_skip_transfer.from_grade_coordinator != coordinator:
            return Response(
                {'error': 'This grade skip transfer is not assigned to you as coordinator'},
                status=status.HTTP_403_FORBIDDEN,
            )

        student = grade_skip_transfer.student
        student_name = student.name
        from_grade_display = grade_skip_transfer.from_grade_name or 'current grade'
        to_grade_display = grade_skip_transfer.to_grade_name or 'target grade'

        # Check if same coordinator or different
        is_same_coordinator = (
            grade_skip_transfer.from_grade_coordinator and
            grade_skip_transfer.to_grade_coordinator and
            grade_skip_transfer.from_grade_coordinator.id == grade_skip_transfer.to_grade_coordinator.id
        )

        if is_same_coordinator:
            # Same coordinator: apply immediately
            apply_grade_skip_transfer(grade_skip_transfer, user)
            grade_skip_transfer.status = 'approved'
            grade_skip_transfer.save()

            # Notifications for same coordinator approval
            try:
                from django.contrib.auth import get_user_model
                UserModel = get_user_model()

                # Notify teacher
                if grade_skip_transfer.initiated_by_teacher:
                    teacher = grade_skip_transfer.initiated_by_teacher
                    teacher_user = getattr(teacher, 'user', None)
                    if not teacher_user and teacher.employee_code:
                        teacher_user = UserModel.objects.filter(username=teacher.employee_code).first()
                    if not teacher_user and teacher.email:
                        teacher_user = UserModel.objects.filter(email__iexact=teacher.email).first()

                    if teacher_user:
                        approver_role_name = get_user_role_name(user)
                        verb = f"Your request of Grade skipping has been approved by {approver_role_name} now student can skip their grade"
                        target_text = f"{student_name}: {from_grade_display} → {to_grade_display}"
                        create_notification(
                            recipient=teacher_user,
                            actor=user,
                            verb=verb,
                            target_text=target_text,
                            data={
                                "type": "grade_skip.approved",
                                "grade_skip_transfer_id": grade_skip_transfer.id,
                                "student_id": student.id,
                            },
                        )
            except Exception as notify_err:
                print(f"[WARN] Failed to send grade skip approval notifications: {notify_err}")
        else:
            # Different coordinator: transfer to other coordinator
            grade_skip_transfer.status = 'pending_other_coord'
            grade_skip_transfer.save()

            # Notifications for different coordinator scenario
            try:
                from django.contrib.auth import get_user_model
                UserModel = get_user_model()

                # Notify teacher
                if grade_skip_transfer.initiated_by_teacher:
                    teacher = grade_skip_transfer.initiated_by_teacher
                    teacher_user = getattr(teacher, 'user', None)
                    if not teacher_user and teacher.employee_code:
                        teacher_user = UserModel.objects.filter(username=teacher.employee_code).first()
                    if not teacher_user and teacher.email:
                        teacher_user = UserModel.objects.filter(email__iexact=teacher.email).first()

                    if teacher_user:
                        verb = "Your request of grade skipping has been approved by your coordinator pending by other shift coordinator"
                        target_text = f"{student_name}: {from_grade_display} → {to_grade_display}"
                        create_notification(
                            recipient=teacher_user,
                            actor=user,
                            verb=verb,
                            target_text=target_text,
                            data={
                                "type": "grade_skip.pending_other_coord",
                                "grade_skip_transfer_id": grade_skip_transfer.id,
                                "student_id": student.id,
                            },
                        )

                # Notify other coordinator
                if grade_skip_transfer.to_grade_coordinator:
                    to_coord = grade_skip_transfer.to_grade_coordinator
                    to_coord_user = getattr(to_coord, 'user', None)
                    if not to_coord_user and to_coord.employee_code:
                        to_coord_user = UserModel.objects.filter(username=to_coord.employee_code).first()
                    if not to_coord_user and getattr(to_coord, 'email', None):
                        to_coord_user = UserModel.objects.filter(email__iexact=to_coord.email).first()

                    if to_coord_user:
                        # First notification
                        # Get coordinator user to get role
                        coord_user = getattr(coordinator, 'user', None)
                        if not coord_user and hasattr(coordinator, 'employee_code'):
                            coord_user = UserModel.objects.filter(username=coordinator.employee_code).first()
                        if not coord_user and hasattr(coordinator, 'email'):
                            coord_user = UserModel.objects.filter(email__iexact=coordinator.email).first()
                        
                        coord_role_name = get_user_role_name(coord_user) if coord_user else coordinator.full_name
                        verb1 = f"{coord_role_name} has made a request for grade skipping of {student_name} in {grade_skip_transfer.to_classroom.grade.name if grade_skip_transfer.to_classroom else to_grade_display} {grade_skip_transfer.to_section or ''}"
                        target_text1 = f"{student_name}: {from_grade_display} → {to_grade_display}"
                        create_notification(
                            recipient=to_coord_user,
                            actor=user,
                            verb=verb1,
                            target_text=target_text1,
                            data={
                                "type": "grade_skip.pending_other_coord",
                                "grade_skip_transfer_id": grade_skip_transfer.id,
                                "student_id": student.id,
                            },
                        )

                        # Second notification
                        verb2 = f"Request of grade skipping of {student_name} needs your approval please review"
                        create_notification(
                            recipient=to_coord_user,
                            actor=user,
                            verb=verb2,
                            target_text=target_text1,
                            data={
                                "type": "grade_skip.pending_approval",
                                "grade_skip_transfer_id": grade_skip_transfer.id,
                                "student_id": student.id,
                            },
                        )
            except Exception as notify_err:
                print(f"[WARN] Failed to send grade skip transfer notifications: {notify_err}")

        return Response(
            {
                'message': 'Grade skip transfer approved' + (' and applied' if is_same_coordinator else ''),
                'grade_skip_transfer': GradeSkipTransferSerializer(grade_skip_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def approve_grade_skip_other_coord(request, transfer_id):
    """
    Second coordinator approval step for a grade skip transfer (when different coordinators).
    Applies the transfer: updates student grade, classroom, shift (if changed), and ID if needed.
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator:
            return Response(
                {'error': 'Only coordinators can approve grade skip transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        grade_skip_transfer = get_object_or_404(GradeSkipTransfer, id=transfer_id)

        if grade_skip_transfer.status != 'pending_other_coord':
            return Response(
                {'error': 'This grade skip transfer is not waiting for other coordinator approval'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if grade_skip_transfer.to_grade_coordinator and grade_skip_transfer.to_grade_coordinator != coordinator:
            return Response(
                {'error': 'This grade skip transfer is not assigned to you as coordinator'},
                status=status.HTTP_403_FORBIDDEN,
            )

        student = grade_skip_transfer.student
        student_name = student.name
        from_grade_display = grade_skip_transfer.from_grade_name or 'current grade'
        to_grade_display = grade_skip_transfer.to_grade_name or 'target grade'

        # Apply the transfer
        apply_grade_skip_transfer(grade_skip_transfer, user)
        grade_skip_transfer.status = 'approved'
        grade_skip_transfer.save()

        # Send final approval notifications
        try:
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            # Notify teacher
            if grade_skip_transfer.initiated_by_teacher:
                teacher = grade_skip_transfer.initiated_by_teacher
                teacher_user = getattr(teacher, 'user', None)
                if not teacher_user and teacher.employee_code:
                    teacher_user = UserModel.objects.filter(username=teacher.employee_code).first()
                if not teacher_user and teacher.email:
                    teacher_user = UserModel.objects.filter(email__iexact=teacher.email).first()

                if teacher_user:
                    approver_role_name = get_user_role_name(user)
                    verb = f"Your request of Grade skipping has been approved by {approver_role_name} now student can skip their grade"
                    target_text = f"{student_name}: {from_grade_display} → {to_grade_display}"
                    create_notification(
                        recipient=teacher_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "grade_skip.approved",
                            "grade_skip_transfer_id": grade_skip_transfer.id,
                            "student_id": student.id,
                        },
                    )

            # Notify first coordinator
            if grade_skip_transfer.from_grade_coordinator:
                from_coord = grade_skip_transfer.from_grade_coordinator
                from_coord_user = getattr(from_coord, 'user', None)
                if not from_coord_user and from_coord.employee_code:
                    from_coord_user = UserModel.objects.filter(username=from_coord.employee_code).first()
                if not from_coord_user and getattr(from_coord, 'email', None):
                    from_coord_user = UserModel.objects.filter(email__iexact=from_coord.email).first()

                if from_coord_user:
                    approver_role_name = get_user_role_name(user)
                    verb = f"Your request of Grade skipping has been approved by {approver_role_name} now student can skip their grade"
                    target_text = f"{student_name}: {from_grade_display} → {to_grade_display}"
                    create_notification(
                        recipient=from_coord_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "grade_skip.approved",
                            "grade_skip_transfer_id": grade_skip_transfer.id,
                            "student_id": student.id,
                        },
                    )
        except Exception as notify_err:
            print(f"[WARN] Failed to send grade skip final approval notifications: {notify_err}")

        return Response(
            {
                'message': 'Grade skip transfer fully approved and applied successfully',
                'grade_skip_transfer': GradeSkipTransferSerializer(grade_skip_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_grade_skip_transfers(request):
    """
    List grade skip transfer requests visible to the current user.
    - Teacher: own initiated transfers
    - Coordinator: transfers where they are from/to coordinator
    - Principal: all for now (later can be campus-bound)
    """
    try:
        user = request.user
        teacher = _get_teacher_for_user(user)
        coordinator = _get_coordinator_for_user(user)

        queryset = GradeSkipTransfer.objects.select_related(
            'student',
            'campus',
            'from_grade',
            'to_grade',
            'from_classroom',
            'to_classroom',
            'initiated_by_teacher',
            'from_grade_coordinator',
            'to_grade_coordinator',
            'principal',
        )

        if teacher:
            queryset = queryset.filter(initiated_by_teacher=teacher)
        elif coordinator:
            queryset = queryset.filter(
                Q(from_grade_coordinator=coordinator) | Q(to_grade_coordinator=coordinator)
            )
        elif _is_principal(user) or user.is_superuser:
            pass
        else:
            return Response(
                {'error': 'You do not have permission to view grade skip transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        status_filter = request.GET.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        serializer = GradeSkipTransferSerializer(queryset.order_by('-created_at'), many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def decline_grade_skip_transfer(request, transfer_id):
    """
    Decline a grade skip transfer request from either coordinator.
    """
    try:
        user = request.user
        coordinator = _get_coordinator_for_user(user)
        if not coordinator and not _is_principal(user):
            return Response(
                {'error': 'Only coordinators or principals can decline grade skip transfers'},
                status=status.HTTP_403_FORBIDDEN,
            )

        grade_skip_transfer = get_object_or_404(GradeSkipTransfer, id=transfer_id)

        current_status = grade_skip_transfer.status
        if current_status not in ['pending_own_coord', 'pending_other_coord']:
            return Response(
                {'error': 'Only pending grade skip transfers can be declined'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TransferApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', '')

        grade_skip_transfer.status = 'declined'
        grade_skip_transfer.decline_reason = reason
        if _is_principal(user):
            grade_skip_transfer.principal = user
        grade_skip_transfer.save()

        # Send decline notifications
        try:
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            student_name = grade_skip_transfer.student.name

            # Notify teacher
            if grade_skip_transfer.initiated_by_teacher:
                teacher = grade_skip_transfer.initiated_by_teacher
                teacher_user = getattr(teacher, 'user', None)
                if not teacher_user and teacher.employee_code:
                    teacher_user = UserModel.objects.filter(username=teacher.employee_code).first()
                if not teacher_user and teacher.email:
                    teacher_user = UserModel.objects.filter(email__iexact=teacher.email).first()

                if teacher_user:
                    verb = f"Your grade skip transfer request for {student_name} has been declined"
                    target_text = f"Reason: {reason}"
                    create_notification(
                        recipient=teacher_user,
                        actor=user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "grade_skip.declined",
                            "grade_skip_transfer_id": grade_skip_transfer.id,
                            "student_id": grade_skip_transfer.student.id,
                        },
                    )
        except Exception as notify_err:
            print(f"[WARN] Failed to send grade skip decline notifications: {notify_err}")

        return Response(
            {
                'message': 'Grade skip transfer declined successfully',
                'grade_skip_transfer': GradeSkipTransferSerializer(grade_skip_transfer).data,
            }
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_campus_transfer_sections(request):
    """
    Return available classrooms/sections for a campus transfer (same grade) for a given student + target campus + target shift.
    """
    try:
        student_id = request.GET.get('student')
        to_campus_id = request.GET.get('to_campus')
        to_shift = request.GET.get('to_shift')
        
        if not student_id or not to_campus_id or not to_shift:
            return Response(
                {'error': 'student, to_campus, and to_shift parameters are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student = get_object_or_404(Student, id=student_id)
        to_campus = get_object_or_404(Campus, id=to_campus_id)
        current_classroom = student.classroom
        
        if not current_classroom:
            return Response(
                {'error': 'Student is not currently assigned to any classroom'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not current_classroom.grade:
            return Response(
                {'error': 'Student\'s current classroom does not have a grade assigned'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.db.models import Q
        from coordinator.models import Coordinator
        
        # Normalize shift value to match ClassRoom model format
        shift_normalized = to_shift.lower()
        
        # Find classrooms in the same grade at the destination campus/shift
        current_grade = current_classroom.grade
        
        # Debug logging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[Campus Transfer Sections] Student: {student.id}, Current Grade: {current_grade.name} (ID: {current_grade.id})")
        logger.info(f"[Campus Transfer Sections] To Campus: {to_campus.campus_name} (ID: {to_campus.id}), Shift: {shift_normalized}")
        
        # First check if there are ANY classrooms for this grade at destination campus
        all_classrooms_in_grade = ClassRoom.objects.filter(
            grade__name=current_grade.name,  # Match by grade name instead of grade object
            shift=shift_normalized,
            grade__level__campus=to_campus,
        ).select_related('grade', 'grade__level', 'grade__level__campus')
        
        logger.info(f"[Campus Transfer Sections] Found {all_classrooms_in_grade.count()} classrooms with grade name '{current_grade.name}' at destination")
        
        available_classrooms = all_classrooms_in_grade.exclude(
            students__id=student.id  # Exclude if student is already in this classroom
        ).select_related(
            'class_teacher', 'class_teacher__user'
        ).prefetch_related('students').order_by('section')

        options = []
        for classroom in available_classrooms:
            # Get coordinator for this classroom's level
            coordinator = Coordinator.objects.filter(
                level=classroom.grade.level,
                campus=to_campus,
            ).first()

            options.append({
                'id': classroom.id,
                'grade_name': classroom.grade.name,
                'section': classroom.section,
                'shift': classroom.shift.title(),
                'capacity': classroom.capacity,
                'current_students': classroom.students.count(),
                'class_teacher_name': classroom.class_teacher.full_name if classroom.class_teacher else None,
                'coordinator_name': coordinator.full_name if coordinator else None,
                'label': f"{classroom.grade.name} ({classroom.section}) • {classroom.shift.title()} • {to_campus.campus_name}",
            })

        return Response(options)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_grades_for_campus_skip(request):
    """
    Return available grade for campus transfer with grade skip.
    Similar to grade skip but searches in destination campus instead of current campus.
    """
    try:
        student_id = request.GET.get('student_id')
        to_campus_id = request.GET.get('to_campus_id')
        
        if not student_id or not to_campus_id:
            return Response(
                {'error': 'student_id and to_campus_id parameters are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        student = get_object_or_404(Student, id=student_id)
        to_campus = get_object_or_404(Campus, id=to_campus_id)
        current_classroom = student.classroom
        
        if not current_classroom:
            return Response(
                {'error': 'Student is not currently assigned to any classroom'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from_grade = current_classroom.grade
        if not from_grade:
            return Response(
                {'error': 'Student\'s current classroom does not have a grade assigned'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extract grade number and handle both "Grade-X" and "KG-X" formats
        import re
        from classes.models import Grade
        
        grade_name = from_grade.name.strip()
        grade_name_lower = grade_name.lower()
        
        # Roman numeral mapping
        roman_map = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10}
        roman_map_reverse = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X'}
        
        # Handle KG grades (KG-I, KG-II, KG-1, KG-2, etc.)
        if grade_name_lower.startswith('kg'):
            kg_match = re.search(r'(\d+)', grade_name)
            if not kg_match:
                kg_roman = re.search(r'kg[-\s]*(i{1,3}|iv|v|vi{0,3}|ix|x)', grade_name_lower)
                if kg_roman:
                    kg_num = roman_map.get(kg_roman.group(1).lower(), 1)
                else:
                    return Response(
                        {'error': 'Unable to determine KG grade number'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                kg_num = int(kg_match.group(1))
            
            to_grade_num = kg_num
        else:
            # Handle regular Grade-X format
            from_match = re.search(r'(\d+)', grade_name)
            if not from_match:
                grade_roman = re.search(r'grade[-\s]*(i{1,3}|iv|v|vi{0,3}|ix|x)', grade_name_lower)
                if grade_roman:
                    from_grade_num = roman_map.get(grade_roman.group(1).lower(), 1)
                else:
                    return Response(
                        {'error': 'Unable to determine current grade number'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                from_grade_num = int(from_match.group(1))
            
            to_grade_num = from_grade_num + 2  # Skip exactly 1 grade

        # Map number to Roman numeral for matching
        roman_numeral = roman_map_reverse.get(to_grade_num, str(to_grade_num))
        
        # Search for grades in DESTINATION campus (not current campus)
        to_grades = Grade.objects.filter(
            level__campus=to_campus,  # Use destination campus
        ).filter(
            Q(name__iregex=rf'^Grade[-\s]*{to_grade_num}$') |
            Q(name__iregex=rf'^Grade[-\s]*{roman_numeral}$') |
            Q(name__iexact=f'Grade-{to_grade_num}') |
            Q(name__iexact=f'Grade {to_grade_num}') |
            Q(name__iexact=f'Grade-{roman_numeral}') |
            Q(name__iexact=f'Grade {roman_numeral}') |
            Q(name__icontains=f'Grade-{to_grade_num}') |
            Q(name__icontains=f'Grade {to_grade_num}') |
            Q(name__icontains=f'Grade-{roman_numeral}') |
            Q(name__icontains=f'Grade {roman_numeral}')
        )

        if not to_grades.exists():
            # Fallback: try to find any grade with just the number or roman numeral
            fallback_grades = Grade.objects.filter(
                level__campus=to_campus,  # Use destination campus
            ).filter(
                Q(name__icontains=str(to_grade_num)) |
                Q(name__icontains=roman_numeral)
            )
            
            if fallback_grades.exists():
                to_grade = fallback_grades.first()
            else:
                return Response(
                    {
                        'error': f'No grade found for skip (looking for Grade {to_grade_num} or Grade {roman_numeral}) at destination campus'
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            to_grade = to_grades.first()

        # Return the skip grade info
        return Response({
            'id': to_grade.id,
            'name': to_grade.name,
            'level_name': to_grade.level.name if to_grade.level else None,
            'campus_id': to_campus.id,
            'campus_name': to_campus.campus_name,
        })
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"[Campus Skip Grade] Error: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_sections_for_campus_skip(request):
    """
    Return available sections for campus transfer with grade skip.
    Similar to grade skip sections but filters by destination campus instead of current campus.
    """
    try:
        student_id = request.GET.get('student_id')
        to_grade_id = request.GET.get('to_grade_id')
        to_shift = request.GET.get('to_shift')  # Optional
        to_campus_id = request.GET.get('to_campus_id')  # Required for campus transfer

        if not student_id or not to_grade_id or not to_campus_id:
            return Response(
                {'error': 'student_id, to_grade_id, and to_campus_id parameters are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student = get_object_or_404(Student, id=student_id)
        to_campus = get_object_or_404(Campus, id=to_campus_id)
        
        from classes.models import Grade
        to_grade = get_object_or_404(Grade, id=to_grade_id)
        
        # Normalize shift if provided
        normalized_shift = None
        if to_shift:
            normalized_shift = to_shift.lower().strip()
            if normalized_shift == 'm':
                normalized_shift = 'morning'
            elif normalized_shift == 'a':
                normalized_shift = 'afternoon'

        # Filter classrooms by target grade and destination campus
        classrooms_query = ClassRoom.objects.filter(
            grade=to_grade,
            grade__level__campus=to_campus,
        )

        # Filter by shift if provided
        if normalized_shift:
            classrooms_query = classrooms_query.filter(shift=normalized_shift)

        # Exclude classroom where student is already enrolled
        classrooms_query = classrooms_query.exclude(students__id=student.id)

        # Select related fields and prefetch students for capacity calculation
        classrooms = classrooms_query.select_related(
            'grade', 'grade__level', 'grade__level__campus', 'class_teacher', 'class_teacher__user'
        ).prefetch_related('students').order_by('section')

        from django.db.models import Q
        from coordinator.models import Coordinator

        options = []
        for classroom in classrooms:
            # Get coordinator for this classroom's level at destination campus
            coordinator = Coordinator.objects.filter(
                level=classroom.grade.level,
                campus=to_campus,
            ).first()

            options.append({
                'id': classroom.id,
                'grade_name': classroom.grade.name,
                'section': classroom.section,
                'shift': classroom.shift.title(),
                'capacity': classroom.capacity,
                'current_students': classroom.students.count(),
                'class_teacher_name': classroom.class_teacher.full_name if classroom.class_teacher else None,
                'coordinator_name': coordinator.full_name if coordinator else None,
                'label': f"{classroom.grade.name} ({classroom.section}) • {classroom.shift.title()} • {to_campus.campus_name}",
            })

        return Response(options)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"[Campus Skip Sections] Error: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
