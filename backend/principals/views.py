from rest_framework import viewsets, decorators, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from django.contrib.auth import get_user_model
from users.permissions import IsSuperAdmin
from .models import Principal
from .serializers import PrincipalSerializer

User = get_user_model()


class PrincipalViewSet(viewsets.ModelViewSet):
    queryset = Principal.objects.all()
    serializer_class = PrincipalSerializer
    permission_classes = [IsAuthenticated]
    
    # Filtering, search, and ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['campus', 'shift', 'is_currently_active']
    search_fields = ['full_name', 'employee_code', 'email', 'contact_number', 'cnic']
    ordering_fields = ['full_name', 'joining_date', 'created_at']
    ordering = ['-created_at']  # Default ordering
    
    def get_queryset(self):
        """Override to optimize queries and handle filtering"""
        # Use with_deleted() to get all records, then filter by is_deleted=False
        queryset = Principal.objects.with_deleted().filter(is_deleted=False).select_related('campus', 'user')
        
        # Role-based filtering - only super admin can access all principals
        user = self.request.user
        if not user.is_superuser and not user.is_staff:
            queryset = queryset.none()
        
        return queryset
    
    def perform_create(self, serializer):
        """Create principal and auto-generate user account"""
        # Check for existing principal on the same campus + shift
        campus_id = serializer.validated_data.get('campus')
        shift = serializer.validated_data.get('shift')
        
        if campus_id and shift:
            existing_principal = Principal.objects.filter(campus=campus_id, shift=shift).first()
            if existing_principal:
                from rest_framework.exceptions import ValidationError
                shift_display = existing_principal.get_shift_display()
                raise ValidationError({
                    'shift': f'This campus already has a principal for {shift_display} shift: {existing_principal.full_name}'
                })
        
        principal = serializer.save()
        principal._actor = self.request.user
        principal.save()
        
        # Use UserCreationService to ensure consistent user creation and notification
        try:
            from services.user_creation_service import UserCreationService
            from users.models import User
            
            if not principal.user:  # Only if no user is linked yet
                # First check if user exists
                existing_user = User.objects.filter(email=principal.email).first()
                if existing_user:
                    # Update existing user's role and link them
                    existing_user.role = 'principal'  # Update role to principal
                    if principal.campus:
                        existing_user.campus = principal.campus  # Update campus too
                    existing_user.save()
                    
                    # Link user to principal
                    principal.user = existing_user
                    principal.save()
                    print(f"[DEBUG] Updated and linked existing user to principal: {existing_user.email} (role=principal)")
                else:
                    # Create new user
                    user, message = UserCreationService.create_user_from_entity(principal, 'principal')
                    if not user:
                        print(f"[DEBUG] Failed to create user for principal: {message}")
                    else:
                        print(f"[DEBUG] Created new user for principal: {user.email}")
                    
        except Exception as e:
            print(f"[DEBUG] Error creating user for principal: {str(e)}")
    
    def perform_update(self, serializer):
        """Update principal and sync user account if needed"""
        # Check if campus, shift, or joining_date changed
        instance: Principal = self.get_object()
        old_campus = instance.campus
        old_shift = instance.shift
        old_joining_date = instance.joining_date
        
        # Save the principal
        principal: Principal = serializer.save()
        principal._actor = self.request.user
        principal.save()
        
        # Check if any code-generating field changed
        new_campus = principal.campus
        new_shift = principal.shift
        new_joining_date = principal.joining_date
        
        regenerate_code = (
            old_campus != new_campus or
            old_shift != new_shift or
            old_joining_date != new_joining_date
        )
        
        # Regenerate employee code if needed
        if regenerate_code:
            principal.save(regenerate_code=True)
        
        # Update user email if changed
        if principal.user and principal.email:
            principal.user.email = principal.email
            principal.user.save()
    
    def perform_destroy(self, instance):
        """Soft delete principal and create audit log"""
        instance._actor = self.request.user
        
        # Store principal info before deletion for audit log
        principal_id = instance.id
        principal_name = instance.full_name
        principal_campus = instance.campus
        
        # Get user name for audit log
        user = self.request.user
        user_name = user.get_full_name() if hasattr(user, 'get_full_name') else (user.username or 'Unknown')
        user_role = user.get_role_display() if hasattr(user, 'get_role_display') else (user.role or 'User')
        
        # Soft delete the principal (instead of hard delete)
        instance.soft_delete()
        
        # Create audit log after soft deletion
        try:
            from attendance.models import AuditLog
            AuditLog.objects.create(
                feature='principal',
                action='delete',
                entity_type='Principal',
                entity_id=principal_id,
                user=user,
                ip_address=self.request.META.get('REMOTE_ADDR'),
                changes={'name': principal_name, 'principal_id': principal_id, 'campus_id': principal_campus.id if principal_campus else None},
                reason=f'Principal {principal_name} deleted by {user_role} {user_name}'
            )
        except Exception as e:
            # Log error but don't fail the deletion
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create audit log for principal deletion: {str(e)}")
    
    @decorators.action(detail=False, methods=['get'])
    def stats(self, request):
        """Get principal statistics"""
        total = self.get_queryset().count()
        active = self.get_queryset().filter(is_currently_active=True).count()
        inactive = total - active
        
        return Response({
            'total': total,
            'active': active,
            'inactive': inactive
        })

