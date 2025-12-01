from rest_framework import serializers
from .models import RequestComplaint, RequestComment, RequestStatusHistory

class RequestCommentSerializer(serializers.ModelSerializer):
    """Serializer for request comments"""
    
    class Meta:
        model = RequestComment
        fields = ['id', 'user_type', 'comment', 'created_at']
        read_only_fields = ['id', 'created_at']

class RequestStatusHistorySerializer(serializers.ModelSerializer):
    """Serializer for status history"""
    
    class Meta:
        model = RequestStatusHistory
        fields = ['id', 'old_status', 'new_status', 'changed_by', 'notes', 'changed_at']
        read_only_fields = ['id', 'changed_at']

class RequestComplaintListSerializer(serializers.ModelSerializer):
    """Serializer for request list view"""
    
    teacher_name = serializers.SerializerMethodField(read_only=True)
    coordinator_name = serializers.CharField(source='coordinator.full_name', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    
    def get_teacher_name(self, obj):
        """Return teacher name with employee code"""
        teacher = obj.teacher
        if teacher.employee_code:
            return f"{teacher.full_name} ({teacher.employee_code})"
        return teacher.full_name
    
    class Meta:
        model = RequestComplaint
        fields = [
            'id', 'category', 'category_display', 'subject', 'status', 'status_display',
            'priority', 'priority_display', 'teacher_name', 'coordinator_name',
            'created_at', 'updated_at', 'reviewed_at', 'resolved_at'
        ]

class RequestComplaintDetailSerializer(serializers.ModelSerializer):
    """Serializer for detailed request view"""
    
    teacher_name = serializers.SerializerMethodField(read_only=True)
    teacher_email = serializers.CharField(source='teacher.email', read_only=True)
    coordinator_name = serializers.CharField(source='coordinator.full_name', read_only=True)
    coordinator_email = serializers.CharField(source='coordinator.email', read_only=True)
    principal_name = serializers.SerializerMethodField(read_only=True)
    principal_email = serializers.SerializerMethodField(read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    
    comments = RequestCommentSerializer(many=True, read_only=True)
    status_history = RequestStatusHistorySerializer(many=True, read_only=True)
    
    def get_teacher_name(self, obj):
        """Return teacher name with employee code"""
        teacher = obj.teacher
        if teacher.employee_code:
            return f"{teacher.full_name} ({teacher.employee_code})"
        return teacher.full_name
    
    def get_principal_name(self, obj):
        """Return principal name if assigned"""
        if obj.principal:
            return f"{obj.principal.full_name} ({obj.principal.employee_code})" if obj.principal.employee_code else obj.principal.full_name
        return None
    
    def get_principal_email(self, obj):
        """Return principal email if assigned"""
        return obj.principal.email if obj.principal else None
    
    class Meta:
        model = RequestComplaint
        fields = [
            'id', 'category', 'category_display', 'subject', 'description',
            'status', 'status_display', 'priority', 'priority_display',
            'coordinator_notes', 'resolution_notes', 'forwarding_note', 'rejection_reason',
            'teacher_name', 'teacher_email', 'coordinator_name', 'coordinator_email',
            'principal_name', 'principal_email',
            'requires_principal_approval', 'approved_by', 'approved_at',
            'teacher_confirmed', 'teacher_confirmed_at', 'teacher_satisfaction_note',
            'created_at', 'updated_at', 'reviewed_at', 'forwarded_to_principal_at', 'resolved_at',
            'comments', 'status_history'
        ]

class RequestComplaintCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new requests"""
    
    class Meta:
        model = RequestComplaint
        fields = ['category', 'subject', 'description', 'priority']
    
    def create(self, validated_data):
        # Ensure boolean fields are set to False explicitly to avoid DB null errors
        validated_data['requires_principal_approval'] = False
        validated_data['teacher_confirmed'] = False
        
        # Set default priority if not provided
        if 'priority' not in validated_data:
            validated_data['priority'] = 'low'
        
        # Get teacher from request user
        user = self.context['request'].user
        try:
            from teachers.models import Teacher
            teacher = Teacher.objects.get(email=user.email)
        except Teacher.DoesNotExist:
            raise serializers.ValidationError("Teacher profile not found")
        
        # Get teacher's assigned coordinator
        if not teacher.assigned_coordinators.exists():
            raise serializers.ValidationError("No coordinator assigned to this teacher")
        
        # Get the first assigned coordinator (assuming one coordinator per teacher)
        coordinator = teacher.assigned_coordinators.first()
        
        validated_data['teacher'] = teacher
        validated_data['coordinator'] = coordinator
        
        return super().create(validated_data)

class RequestComplaintUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating request status/priority (coordinator only)"""
    
    class Meta:
        model = RequestComplaint
        fields = ['status', 'priority', 'coordinator_notes', 'resolution_notes']
    
    def update(self, instance, validated_data):
        # Create status history entry
        old_status = instance.status
        new_status = validated_data.get('status', old_status)
        
        if old_status != new_status:
            RequestStatusHistory.objects.create(
                request=instance,
                old_status=old_status,
                new_status=new_status,
                changed_by='coordinator',
                notes=validated_data.get('coordinator_notes', '')
            )
        
        return super().update(instance, validated_data)

class RequestCommentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating comments"""
    
    class Meta:
        model = RequestComment
        fields = ['comment']
    
    def create(self, validated_data):
        # Get user type from request user
        user = self.context['request'].user
        if user.is_teacher():
            user_type = 'teacher'
        elif user.is_coordinator():
            user_type = 'coordinator'
        else:
            raise serializers.ValidationError("Invalid user type")
        
        validated_data['user_type'] = user_type
        validated_data['request'] = self.context['request_obj']
        
        return super().create(validated_data)

class RequestForwardToPrincipalSerializer(serializers.Serializer):
    """Serializer for forwarding request to principal"""
    
    forwarding_note = serializers.CharField(required=True, help_text="Reason for forwarding to principal")
    
    def validate(self, data):
        request_obj = self.context.get('request_obj')
        if not request_obj:
            raise serializers.ValidationError("Request object not found")
        
        if request_obj.status == 'pending_principal':
            raise serializers.ValidationError("Request is already forwarded to principal")
        
        if request_obj.status in ['resolved', 'rejected']:
            raise serializers.ValidationError("Cannot forward a closed request")
        
        return data

class RequestApprovalSerializer(serializers.Serializer):
    """Serializer for approving a request"""
    
    resolution_notes = serializers.CharField(required=False, allow_blank=True, help_text="Notes about the approval")
    send_for_confirmation = serializers.BooleanField(default=True, help_text="Send to teacher for confirmation")
    
    def validate(self, data):
        request_obj = self.context.get('request_obj')
        if not request_obj:
            raise serializers.ValidationError("Request object not found")
        
        if request_obj.status in ['resolved', 'rejected']:
            raise serializers.ValidationError("Request is already closed")
        
        if request_obj.status == 'approved':
            raise serializers.ValidationError("Request is already approved")
        
        return data

class RequestRejectionSerializer(serializers.Serializer):
    """Serializer for rejecting a request"""
    
    rejection_reason = serializers.CharField(required=True, help_text="Reason for rejection")
    
    def validate(self, data):
        request_obj = self.context.get('request_obj')
        if not request_obj:
            raise serializers.ValidationError("Request object not found")
        
        if request_obj.status in ['resolved', 'rejected']:
            raise serializers.ValidationError("Request is already closed")
        
        if not data.get('rejection_reason', '').strip():
            raise serializers.ValidationError("Rejection reason is required")
        
        return data

class RequestTeacherConfirmationSerializer(serializers.Serializer):
    """Serializer for teacher confirming request completion"""
    
    teacher_satisfaction_note = serializers.CharField(required=False, allow_blank=True, help_text="Teacher's satisfaction feedback")
    
    def validate(self, data):
        request_obj = self.context.get('request_obj')
        if not request_obj:
            raise serializers.ValidationError("Request object not found")
        
        if request_obj.status != 'approved' and request_obj.status != 'pending_confirmation':
            raise serializers.ValidationError("Request must be approved before confirmation")
        
        if request_obj.teacher_confirmed:
            raise serializers.ValidationError("Request is already confirmed")
        
        return data
