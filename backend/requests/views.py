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
    RequestCommentSerializer
)

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
            'resolved': requests.filter(status='resolved').count(),
            'rejected': requests.filter(status='rejected').count(),
        }
        
        return Response(stats)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
