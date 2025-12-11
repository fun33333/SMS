from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count
from django.utils import timezone

from .models import RequestComplaint, RequestComment, RequestStatusHistory
from .serializers import (
    RequestComplaintCreateSerializer,
    RequestComplaintListSerializer,
    RequestComplaintDetailSerializer,
    RequestComplaintUpdateSerializer,
    RequestCommentCreateSerializer,
    RequestCommentSerializer,
    RequestForwardToPrincipalSerializer,
    RequestApprovalSerializer,
    RequestRejectionSerializer,
    RequestTeacherConfirmationSerializer
)
from notifications.services import create_notification
from django.contrib.auth import get_user_model

# Helper function to get User object for a Coordinator
def get_coordinator_user(coordinator):
    """Find and return the User object associated with a Coordinator."""
    if not coordinator:
        return None
    
    User = get_user_model()
    coordinator_user = None
    
    # Try finding user by employee_code (username) or email
    if coordinator.employee_code:
        coordinator_user = User.objects.filter(username=coordinator.employee_code).first()
    
    if not coordinator_user and coordinator.email:
        coordinator_user = User.objects.filter(email=coordinator.email).first()
    
    return coordinator_user

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_request(request):
    """Create a new request/complaint"""
    try:
        serializer = RequestComplaintCreateSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            request_obj = serializer.save()
            
            # Create initial status history
            RequestStatusHistory.objects.create(
                request=request_obj,
                new_status='submitted',
                changed_by='teacher',
                notes='Request submitted'
            )
            
            # Send notification to coordinator
            coordinator_user = get_coordinator_user(request_obj.coordinator)
            if coordinator_user:
                create_notification(
                    recipient=coordinator_user,
                    actor=request.user,
                    verb='submitted a new request',
                    target_text=f'{request_obj.get_category_display()}: {request_obj.subject}',
                    data={
                        'request_id': request_obj.id,
                        'category': request_obj.category,
                        'priority': request_obj.priority,
                        'type': 'request_created'
                    }
                )
            
            return Response({
                'message': 'Request created successfully',
                'request_id': request_obj.id
            }, status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_my_requests(request):
    """Get teacher's own requests"""
    try:
        user = request.user
        if not user.is_teacher():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Get teacher's requests
        from teachers.models import Teacher
        teacher = Teacher.objects.get(email=user.email)
        requests = RequestComplaint.objects.filter(teacher=teacher)
        
        serializer = RequestComplaintListSerializer(requests, many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_request_detail(request, request_id):
    """Get detailed view of a request"""
    try:
        user = request.user
        request_obj = get_object_or_404(RequestComplaint, id=request_id)
        
        # Check permissions
        if user.is_teacher():
            from teachers.models import Teacher
            teacher = Teacher.objects.get(email=user.email)
            if request_obj.teacher != teacher:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        elif user.is_coordinator():
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if not coordinator or request_obj.coordinator != coordinator:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        elif not user.is_superuser:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = RequestComplaintDetailSerializer(request_obj)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_coordinator_requests(request):
    """Get requests assigned to coordinator"""
    try:
        user = request.user
        if not user.is_coordinator():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(user)
        if not coordinator:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        requests = RequestComplaint.objects.filter(coordinator=coordinator)
        
        # Get filter parameters
        status_filter = request.GET.get('status')
        priority_filter = request.GET.get('priority')
        category_filter = request.GET.get('category')
        
        if status_filter:
            requests = requests.filter(status=status_filter)
        if priority_filter:
            requests = requests.filter(priority=priority_filter)
        if category_filter:
            requests = requests.filter(category=category_filter)
        
        serializer = RequestComplaintListSerializer(requests, many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_request_status(request, request_id):
    """Update request status/priority (coordinator only)"""
    try:
        user = request.user
        if not user.is_coordinator():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(user)
        if not coordinator:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        request_obj = get_object_or_404(RequestComplaint, id=request_id, coordinator=coordinator)
        
        serializer = RequestComplaintUpdateSerializer(request_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'message': 'Request updated successfully'})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_comment(request, request_id):
    """Add comment to request"""
    try:
        user = request.user
        request_obj = get_object_or_404(RequestComplaint, id=request_id)
        
        # Check permissions
        if user.is_teacher():
            from teachers.models import Teacher
            teacher = Teacher.objects.get(email=user.email)
            if request_obj.teacher != teacher:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        elif user.is_coordinator():
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if not coordinator or request_obj.coordinator != coordinator:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        elif not user.is_superuser:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = RequestCommentCreateSerializer(
            data=request.data, 
            context={'request': request, 'request_obj': request_obj}
        )
        if serializer.is_valid():
            comment = serializer.save()
            return Response({
                'message': 'Comment added successfully',
                'comment_id': comment.id
            }, status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_coordinator_dashboard_stats(request):
    """Get coordinator dashboard statistics"""
    try:
        user = request.user
        if not user.is_coordinator():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(user)
        if not coordinator:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

        requests = RequestComplaint.objects.filter(coordinator=coordinator)
        
        stats = {
            'total_requests': requests.count(),
            'submitted': requests.filter(status='submitted').count(),
            'under_review': requests.filter(status='under_review').count(),
            'in_progress': requests.filter(status='in_progress').count(),
            'waiting': requests.filter(status='waiting').count(),
            'pending_principal': requests.filter(status='pending_principal').count(),
            'approved': requests.filter(status='approved').count(),
            'pending_confirmation': requests.filter(status='pending_confirmation').count(),
            'resolved': requests.filter(status='resolved').count(),
            'rejected': requests.filter(status='rejected').count(),
        }
        
        return Response(stats)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def forward_to_principal(request, request_id):
    """Forward request to principal (coordinator only)"""
    try:
        user = request.user
        if not user.is_coordinator():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(user)
        if not coordinator:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        request_obj = get_object_or_404(RequestComplaint, id=request_id, coordinator=coordinator)
        
        serializer = RequestForwardToPrincipalSerializer(
            data=request.data,
            context={'request_obj': request_obj}
        )
        
        if serializer.is_valid():
            # Get principal for the coordinator's campus
            from principals.models import Principal
            try:
                principal = Principal.objects.get(
                    campus=coordinator.campus,
                    is_currently_active=True
                )
            except Principal.DoesNotExist:
                return Response({'error': 'No active principal found for this campus'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Update request
            old_status = request_obj.status
            request_obj.principal = principal
            request_obj.forwarding_note = serializer.validated_data['forwarding_note']
            request_obj.status = 'pending_principal'
            request_obj.requires_principal_approval = True
            request_obj.save()
            
            # Create status history
            RequestStatusHistory.objects.create(
                request=request_obj,
                old_status=old_status,
                new_status='pending_principal',
                changed_by='coordinator',
                notes=f"Forwarded to principal: {serializer.validated_data['forwarding_note']}"
            )
            
            # Send notification to principal
            if principal.user:
                create_notification(
                    recipient=principal.user,
                    actor=user,
                    verb='forwarded a request for your approval',
                    target_text=f'{request_obj.get_category_display()}: {request_obj.subject}',
                    data={
                        'request_id': request_obj.id,
                        'category': request_obj.category,
                        'priority': request_obj.priority,
                        'type': 'request_forwarded_to_principal'
                    }
                )
            
            # Send notification to teacher
            if request_obj.teacher.user:
                create_notification(
                    recipient=request_obj.teacher.user,
                    actor=user,
                    verb='forwarded your request to principal for approval',
                    target_text=request_obj.subject,
                    data={
                        'request_id': request_obj.id,
                        'type': 'request_status_changed'
                    }
                )
            
            return Response({'message': 'Request forwarded to principal successfully'})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_request(request, request_id):
    """Approve request (coordinator or principal)"""
    try:
        user = request.user
        request_obj = get_object_or_404(RequestComplaint, id=request_id)
        
        # Check permissions
        approved_by_role = None
        if user.is_coordinator():
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if not coordinator or request_obj.coordinator != coordinator:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            approved_by_role = 'coordinator'
        elif user.is_principal():
            from principals.models import Principal
            try:
                principal = Principal.objects.get(user=user)
                if request_obj.principal != principal:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
                approved_by_role = 'principal'
            except Principal.DoesNotExist:
                return Response({'error': 'Principal profile not found'}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = RequestApprovalSerializer(
            data=request.data,
            context={'request_obj': request_obj}
        )
        
        if serializer.is_valid():
            old_status = request_obj.status
            
            # Update request
            if serializer.validated_data.get('resolution_notes'):
                request_obj.resolution_notes = serializer.validated_data['resolution_notes']
            
            request_obj.approved_by = approved_by_role
            
            # Set status based on send_for_confirmation flag
            if serializer.validated_data.get('send_for_confirmation', True):
                request_obj.status = 'pending_confirmation'
            else:
                request_obj.status = 'approved'
            
            request_obj.save()
            
            # Create status history
            RequestStatusHistory.objects.create(
                request=request_obj,
                old_status=old_status,
                new_status=request_obj.status,
                changed_by=approved_by_role,
                notes=f"Request approved by {approved_by_role}"
            )
            
            # Send notification to teacher
            if request_obj.teacher.user:
                create_notification(
                    recipient=request_obj.teacher.user,
                    actor=user,
                    verb='approved your request',
                    target_text=request_obj.subject,
                    data={
                        'request_id': request_obj.id,
                        'approved_by': approved_by_role,
                        'type': 'request_approved'
                    }
                )
            
            # If approved by principal, also notify coordinator
            if approved_by_role == 'principal':
                coordinator_user = get_coordinator_user(request_obj.coordinator)
                if coordinator_user:
                    create_notification(
                        recipient=coordinator_user,
                        actor=user,
                        verb='approved the forwarded request',
                        target_text=request_obj.subject,
                        data={
                            'request_id': request_obj.id,
                            'type': 'request_approved_by_principal'
                        }
                    )
            
            return Response({'message': 'Request approved successfully'})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reject_request(request, request_id):
    """Reject request (coordinator or principal)"""
    try:
        user = request.user
        request_obj = get_object_or_404(RequestComplaint, id=request_id)
        
        # Check permissions
        rejected_by_role = None
        if user.is_coordinator():
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if not coordinator or request_obj.coordinator != coordinator:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            rejected_by_role = 'coordinator'
        elif user.is_principal():
            from principals.models import Principal
            try:
                principal = Principal.objects.get(user=user)
                if request_obj.principal != principal:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
                rejected_by_role = 'principal'
            except Principal.DoesNotExist:
                return Response({'error': 'Principal profile not found'}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = RequestRejectionSerializer(
            data=request.data,
            context={'request_obj': request_obj}
        )
        
        if serializer.is_valid():
            old_status = request_obj.status
            
            # Update request
            request_obj.rejection_reason = serializer.validated_data['rejection_reason']
            request_obj.status = 'rejected'
            request_obj.save()
            
            # Create status history
            RequestStatusHistory.objects.create(
                request=request_obj,
                old_status=old_status,
                new_status='rejected',
                changed_by=rejected_by_role,
                notes=f"Rejected: {serializer.validated_data['rejection_reason']}"
            )
            
            # Send notification to teacher
            if request_obj.teacher.user:
                create_notification(
                    recipient=request_obj.teacher.user,
                    actor=user,
                    verb='rejected your request',
                    target_text=request_obj.subject,
                    data={
                        'request_id': request_obj.id,
                        'rejection_reason': serializer.validated_data['rejection_reason'],
                        'rejected_by': rejected_by_role,
                        'type': 'request_rejected'
                    }
                )
            
            # If rejected by principal, also notify coordinator
            if rejected_by_role == 'principal':
                coordinator_user = get_coordinator_user(request_obj.coordinator)
                if coordinator_user:
                    create_notification(
                        recipient=coordinator_user,
                        actor=user,
                        verb='rejected the forwarded request',
                        target_text=request_obj.subject,
                        data={
                            'request_id': request_obj.id,
                            'rejection_reason': serializer.validated_data['rejection_reason'],
                            'type': 'request_rejected_by_principal'
                        }
                    )
            
            return Response({'message': 'Request rejected successfully'})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_completion(request, request_id):
    """Teacher confirms request completion"""
    try:
        user = request.user
        if not user.is_teacher():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        from teachers.models import Teacher
        teacher = Teacher.objects.get(email=user.email)
        request_obj = get_object_or_404(RequestComplaint, id=request_id, teacher=teacher)
        
        serializer = RequestTeacherConfirmationSerializer(
            data=request.data,
            context={'request_obj': request_obj}
        )
        
        if serializer.is_valid():
            old_status = request_obj.status
            
            # Update request
            request_obj.teacher_confirmed = True
            if serializer.validated_data.get('teacher_satisfaction_note'):
                request_obj.teacher_satisfaction_note = serializer.validated_data['teacher_satisfaction_note']
            request_obj.save()  # This will auto-set status to resolved
            
            # Create status history
            RequestStatusHistory.objects.create(
                request=request_obj,
                old_status=old_status,
                new_status='resolved',
                changed_by='teacher',
                notes='Teacher confirmed completion'
            )
            
            # Send notification to coordinator
            coordinator_user = get_coordinator_user(request_obj.coordinator)
            if coordinator_user:
                create_notification(
                    recipient=coordinator_user,
                    actor=user,
                    verb='confirmed completion of request',
                    target_text=request_obj.subject,
                    data={
                        'request_id': request_obj.id,
                        'type': 'request_confirmed'
                    }
                )
            
            return Response({'message': 'Request confirmed and resolved successfully'})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_principal_requests(request):
    """Get requests forwarded to principal"""
    try:
        user = request.user
        if not user.is_principal():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        from principals.models import Principal
        try:
            principal = Principal.objects.get(user=user)
        except Principal.DoesNotExist:
            return Response({'error': 'Principal profile not found'}, status=status.HTTP_403_FORBIDDEN)
        
        requests = RequestComplaint.objects.filter(principal=principal)
        
        # Get filter parameters
        status_filter = request.GET.get('status')
        priority_filter = request.GET.get('priority')
        category_filter = request.GET.get('category')
        
        if status_filter:
            requests = requests.filter(status=status_filter)
        if priority_filter:
            requests = requests.filter(priority=priority_filter)
        if category_filter:
            requests = requests.filter(category=category_filter)
        
        serializer = RequestComplaintListSerializer(requests, many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
