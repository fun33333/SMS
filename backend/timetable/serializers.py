from rest_framework import serializers
from .models import Subject, ClassTimeTable, TeacherTimeTable, ShiftTiming

class ShiftTimingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftTiming
        fields = [
            'id', 'campus', 'shift', 'name',
            'start_time', 'end_time', 'is_break', 'order'
        ]

class SubjectSerializer(serializers.ModelSerializer):
    campus_name = serializers.CharField(source='campus.campus_name', read_only=True)
    
    class Meta:
        model = Subject
        fields = [
            'id', 'name', 'code', 'description',
            'campus', 'campus_name',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['code', 'created_at', 'updated_at']


class ClassTimeTableSerializer(serializers.ModelSerializer):
    # Read-only display fields
    classroom_display = serializers.CharField(source='classroom.__str__', read_only=True)
    grade = serializers.CharField(source='classroom.grade.name', read_only=True)
    section = serializers.CharField(source='classroom.section', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    teacher_code = serializers.CharField(source='teacher.employee_code', read_only=True)
    time_slot = serializers.CharField(read_only=True)
    day_display = serializers.CharField(source='get_day_display', read_only=True)
    
    class Meta:
        model = ClassTimeTable
        fields = [
            'id', 'classroom', 'classroom_display', 'grade', 'section',
            'subject', 'subject_name',
            'teacher', 'teacher_name', 'teacher_code',
            'day', 'day_display', 'start_time', 'end_time', 'time_slot',
            'is_break', 'notes',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']


class TeacherTimeTableSerializer(serializers.ModelSerializer):
    # Read-only display fields
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    teacher_code = serializers.CharField(source='teacher.employee_code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    classroom_display = serializers.CharField(source='classroom.__str__', read_only=True)
    grade = serializers.CharField(source='classroom.grade.name', read_only=True)
    section = serializers.CharField(source='classroom.section', read_only=True)
    time_slot = serializers.CharField(read_only=True)
    day_display = serializers.CharField(source='get_day_display', read_only=True)
    
    class Meta:
        model = TeacherTimeTable
        fields = [
            'id', 'teacher', 'teacher_name', 'teacher_code',
            'subject', 'subject_name',
            'classroom', 'classroom_display', 'grade', 'section',
            'day', 'day_display', 'start_time', 'end_time', 'time_slot',
            'is_break', 'notes',
            'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']


# Create serializers for simplified creation
class ClassTimeTableCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassTimeTable
        fields = [
            'classroom', 'subject', 'teacher',
            'day', 'start_time', 'end_time',
            'is_break', 'notes'
        ]
    
    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class TeacherTimeTableCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherTimeTable
        fields = [
            'teacher', 'subject', 'classroom',
            'day', 'start_time', 'end_time',
            'is_break', 'notes'
        ]
    
    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user:
            validated_data['created_by'] = request.user
        return super().create(validated_data)
