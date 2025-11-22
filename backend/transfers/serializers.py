from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import (
    TransferRequest,
    IDHistory,
    ClassTransfer,
    ShiftTransfer,
    TransferApproval,
)
from students.models import Student
from teachers.models import Teacher
from campus.models import Campus
from classes.models import ClassRoom
from coordinator.models import Coordinator

User = get_user_model()


class TransferRequestSerializer(serializers.ModelSerializer):
    """Serializer for TransferRequest model (campus/shift transfers handled by principals)."""

    from_campus_name = serializers.CharField(source='from_campus.campus_name', read_only=True)
    to_campus_name = serializers.CharField(source='to_campus.campus_name', read_only=True)
    requesting_principal_name = serializers.CharField(source='requesting_principal.get_full_name', read_only=True)
    receiving_principal_name = serializers.CharField(source='receiving_principal.get_full_name', read_only=True)
    entity_name = serializers.CharField(read_only=True)
    current_id = serializers.CharField(read_only=True)

    class Meta:
        model = TransferRequest
        fields = [
            'id',
            'request_type',
            'transfer_category',
            'status',
            'from_campus',
            'from_campus_name',
            'from_shift',
            'requesting_principal',
            'requesting_principal_name',
            'to_campus',
            'to_campus_name',
            'to_shift',
            'receiving_principal',
            'receiving_principal_name',
            'student',
            'teacher',
            'reason',
            'requested_date',
            'notes',
            'reviewed_at',
            'decline_reason',
            'created_at',
            'updated_at',
            'entity_name',
            'current_id',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'reviewed_at']


class TransferRequestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating TransferRequest."""

    class Meta:
        model = TransferRequest
        fields = [
            'request_type',
            'from_campus',
            'from_shift',
            'to_campus',
            'to_shift',
            'student',
            'teacher',
            'reason',
            'requested_date',
            'notes',
            'receiving_principal',
            'transfer_category',
        ]
        read_only_fields = ['receiving_principal']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Add transfer_type as a non-model field for validation (campus vs shift)
        self.fields['transfer_type'] = serializers.CharField(required=False, write_only=True)

    def validate_reason(self, value):
        """Validate reason field: minimum 20, maximum 500 characters."""
        if not value or not value.strip():
            raise serializers.ValidationError("Reason for transfer is required.")
        if len(value.strip()) < 20:
            raise serializers.ValidationError("Reason for transfer must be at least 20 characters long.")
        if len(value) > 500:
            raise serializers.ValidationError("Reason for transfer cannot exceed 500 characters.")
        return value.strip()

    def validate(self, data):
        """Validate transfer request data."""
        request_type = data.get('request_type')
        student = data.get('student')
        teacher = data.get('teacher')

        # Ensure either student or teacher is provided based on request type
        if request_type == 'student' and not student:
            raise serializers.ValidationError("Student is required for student transfer requests")
        if request_type == 'teacher' and not teacher:
            raise serializers.ValidationError("Teacher is required for teacher transfer requests")
        if request_type == 'student' and teacher:
            raise serializers.ValidationError("Teacher should not be provided for student transfer requests")
        if request_type == 'teacher' and student:
            raise serializers.ValidationError("Student should not be provided for teacher transfer requests")

        # Validate campus constraints for campus vs shift transfers
        transfer_type = data.get('transfer_type', 'campus')
        if transfer_type == 'campus' and data.get('from_campus') == data.get('to_campus'):
            raise serializers.ValidationError(
                "Source and destination campuses must be different for campus transfers",
            )

        if transfer_type == 'shift' and data.get('from_campus') != data.get('to_campus'):
            raise serializers.ValidationError(
                "Source and destination campuses must be the same for shift transfers",
            )

        return data


class TransferApprovalSerializer(serializers.Serializer):
    """
    Simple serializer for approve/decline actions that only need a reason.
    This is used for legacy TransferRequest approval/decline endpoints.
    """

    reason = serializers.CharField(required=False, allow_blank=True)

    def validate_reason(self, value):
        """Normalize the reason field."""
        if not value or not value.strip():
            return "No reason provided"
        return value.strip()


class IDHistorySerializer(serializers.ModelSerializer):
    """Serializer for IDHistory model."""

    entity_name = serializers.CharField(read_only=True)
    changed_by_name = serializers.CharField(source='changed_by.get_full_name', read_only=True)

    class Meta:
        model = IDHistory
        fields = [
            'id',
            'entity_type',
            'student',
            'teacher',
            'old_id',
            'old_campus_code',
            'old_shift',
            'old_year',
            'new_id',
            'new_campus_code',
            'new_shift',
            'new_year',
            'immutable_suffix',
            'transfer_request',
            'changed_by',
            'changed_by_name',
            'change_reason',
            'changed_at',
            'entity_name',
        ]
        read_only_fields = ['id', 'changed_at']


class IDPreviewSerializer(serializers.Serializer):
    """Serializer for ID change preview."""

    old_id = serializers.CharField()
    new_id = serializers.CharField()
    changes = serializers.DictField()


#
# New serializers for ClassTransfer / ShiftTransfer / TransferApproval models
#

class ClassTransferSerializer(serializers.ModelSerializer):
    """Read serializer for class/section transfers."""

    student_name = serializers.CharField(source='student.name', read_only=True)
    student_id = serializers.CharField(source='student.student_id', read_only=True)
    from_classroom_display = serializers.SerializerMethodField()
    to_classroom_display = serializers.SerializerMethodField()
    initiated_by_teacher_name = serializers.CharField(
        source='initiated_by_teacher.full_name',
        read_only=True,
    )
    coordinator_name = serializers.CharField(
        source='coordinator.full_name',
        read_only=True,
    )
    principal_name = serializers.CharField(
        source='principal.get_full_name',
        read_only=True,
    )

    class Meta:
        model = ClassTransfer
        fields = [
            'id',
            'student',
            'student_name',
            'student_id',
            'from_classroom',
            'from_classroom_display',
            'to_classroom',
            'to_classroom_display',
            'from_section',
            'to_section',
            'from_grade_name',
            'to_grade_name',
            'initiated_by_teacher',
            'initiated_by_teacher_name',
            'coordinator',
            'coordinator_name',
            'principal',
            'principal_name',
            'status',
            'reason',
            'requested_date',
            'decline_reason',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'from_section',
            'to_section',
            'from_grade_name',
            'to_grade_name',
            'created_at',
            'updated_at',
        ]

    def get_from_classroom_display(self, obj):
        if obj.from_classroom:
            return str(obj.from_classroom)
        return None

    def get_to_classroom_display(self, obj):
        if obj.to_classroom:
            return str(obj.to_classroom)
        return None


class ClassTransferCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating class/section transfers.
    Teacher usually provides student + target classroom + reason + requested_date.
    """

    class Meta:
        model = ClassTransfer
        fields = ['student', 'to_classroom', 'reason', 'requested_date']

    def validate_reason(self, value):
        """Validate reason field: minimum 20, maximum 500 characters."""
        if not value or not value.strip():
            raise serializers.ValidationError("Reason for transfer is required.")
        if len(value.strip()) < 20:
            raise serializers.ValidationError("Reason for transfer must be at least 20 characters long.")
        if len(value) > 500:
            raise serializers.ValidationError("Reason for transfer cannot exceed 500 characters.")
        return value.strip()

    def validate(self, data):
        student = data.get('student')
        to_classroom = data.get('to_classroom')

        if not student:
            raise serializers.ValidationError("Student is required for class transfer.")
        if not to_classroom:
            raise serializers.ValidationError("Destination classroom is required for class transfer.")

        from_classroom = student.classroom
        if not from_classroom:
            raise serializers.ValidationError("Student is not currently assigned to any classroom.")

        # Ensure same campus and shift
        if from_classroom.campus != to_classroom.campus:
            raise serializers.ValidationError("Class transfer must remain within the same campus.")
        if from_classroom.shift != to_classroom.shift:
            raise serializers.ValidationError("Class transfer must remain within the same shift.")

        return data


class ShiftTransferSerializer(serializers.ModelSerializer):
    """Read serializer for shift transfers."""

    student_name = serializers.CharField(source='student.name', read_only=True)
    student_id = serializers.CharField(source='student.student_id', read_only=True)
    campus_name = serializers.CharField(source='campus.campus_name', read_only=True)
    from_classroom_display = serializers.SerializerMethodField()
    to_classroom_display = serializers.SerializerMethodField()
    requesting_teacher_name = serializers.CharField(
        source='requesting_teacher.full_name',
        read_only=True,
    )
    from_shift_coordinator_name = serializers.CharField(
        source='from_shift_coordinator.full_name',
        read_only=True,
    )
    to_shift_coordinator_name = serializers.CharField(
        source='to_shift_coordinator.full_name',
        read_only=True,
    )
    principal_name = serializers.CharField(
        source='principal.get_full_name',
        read_only=True,
    )

    class Meta:
        model = ShiftTransfer
        fields = [
            'id',
            'student',
            'student_name',
            'student_id',
            'campus',
            'campus_name',
            'from_shift',
            'to_shift',
            'from_classroom',
            'from_classroom_display',
            'to_classroom',
            'to_classroom_display',
            'requesting_teacher',
            'requesting_teacher_name',
            'from_shift_coordinator',
            'from_shift_coordinator_name',
            'to_shift_coordinator',
            'to_shift_coordinator_name',
            'principal',
            'principal_name',
            'transfer_request',
            'status',
            'reason',
            'requested_date',
            'decline_reason',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_from_classroom_display(self, obj):
        if obj.from_classroom:
            return str(obj.from_classroom)
        return None

    def get_to_classroom_display(self, obj):
        if obj.to_classroom:
            return str(obj.to_classroom)
        return None


class ShiftTransferCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a shift transfer request.
    Teacher typically supplies student, target shift, target classroom, reason, requested_date.
    """

    class Meta:
        model = ShiftTransfer
        fields = ['student', 'to_shift', 'to_classroom', 'reason', 'requested_date']

    def validate_reason(self, value):
        """Validate reason field: minimum 20, maximum 500 characters."""
        if not value or not value.strip():
            raise serializers.ValidationError("Reason for transfer is required.")
        if len(value.strip()) < 20:
            raise serializers.ValidationError("Reason for transfer must be at least 20 characters long.")
        if len(value) > 500:
            raise serializers.ValidationError("Reason for transfer cannot exceed 500 characters.")
        return value.strip()

    def validate(self, data):
        student = data.get('student')
        to_shift = data.get('to_shift')
        to_classroom = data.get('to_classroom')

        if not student:
            raise serializers.ValidationError("Student is required for shift transfer.")

        if not to_shift:
            raise serializers.ValidationError("Destination shift is required for shift transfer.")

        from_classroom = student.classroom
        if not from_classroom:
            raise serializers.ValidationError("Student is not currently assigned to any classroom.")

        # Destination classroom is optional for pure shift change (same grade/section),
        # but when provided we validate campus/shift alignment.
        if to_classroom:
            if from_classroom.campus != to_classroom.campus:
                raise serializers.ValidationError("Shift transfer must remain within the same campus.")

        # Ensure from_shift != to_shift to avoid no-op transfers
        # Student.shift is stored as 'morning'/'afternoon'
        current_shift = student.shift
        if current_shift and current_shift == to_shift:
            raise serializers.ValidationError("Destination shift must be different from current shift.")

        return data


class TransferApprovalStepSerializer(serializers.ModelSerializer):
    """Serializer for the generic TransferApproval model."""

    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)

    class Meta:
        model = TransferApproval
        fields = [
            'id',
            'transfer_type',
            'transfer_id',
            'role',
            'approved_by',
            'approved_by_name',
            'status',
            'comment',
            'step_order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']