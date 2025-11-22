from rest_framework import serializers
from .models import Teacher
from classes.models import ClassRoom
from campus.serializers import CampusSerializer
from coordinator.serializers import CoordinatorSerializer
from classes.serializers import ClassRoomSerializer


class TeacherSerializer(serializers.ModelSerializer):
    # Nested serializers for related objects
    campus_data = CampusSerializer(source='current_campus', read_only=True)
    coordinators_data = CoordinatorSerializer(source='assigned_coordinators', many=True, read_only=True)
    classroom_data = ClassRoomSerializer(source='assigned_classroom', read_only=True)
    
    campus_name = serializers.SerializerMethodField()
    coordinator_names = serializers.SerializerMethodField()
    classroom_name = serializers.SerializerMethodField()
    experience_display = serializers.SerializerMethodField()
    assigned_classrooms_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Teacher
        fields = "__all__"
        extra_fields = [
            'campus_data',
            'coordinators_data',
            'classroom_data',
            'campus_name',
            'coordinator_names',
            'classroom_name',
            'experience_display',
            'assigned_classrooms_display',
        ]
    
    def _sync_classroom_assignments(self, teacher: Teacher, classroom_ids: list[int]):
        """Ensure ClassRoom.class_teacher matches provided assigned_classrooms."""
        # Normalize ids
        ids = [int(x) for x in classroom_ids if str(x).isdigit()]
        # Update M2M set first
        teacher.assigned_classrooms.set(ids)
        
        # Mark listed classrooms with this teacher
        for cid in ids:
            try:
                cr = ClassRoom.objects.get(pk=cid)
                if cr.class_teacher_id != teacher.id:
                    cr.class_teacher = teacher
                    cr.save(update_fields=['class_teacher'])
            except ClassRoom.DoesNotExist:
                continue
        
        # Clear teacher from classrooms no longer in list
        ClassRoom.objects.filter(class_teacher=teacher).exclude(pk__in=ids).update(class_teacher=None)
    
    def create(self, validated_data):
        # Pop M2M if provided via request data
        request = self.context.get('request')
        classroom_ids = []
        if request is not None:
            classroom_ids = request.data.get('assigned_classrooms') or []
            if isinstance(classroom_ids, str):
                # could be comma separated
                classroom_ids = [s for s in classroom_ids.split(',') if s]
        teacher = super().create(validated_data)
        if classroom_ids:
            self._sync_classroom_assignments(teacher, classroom_ids)
        return teacher
    
    def update(self, instance, validated_data):
        request = self.context.get('request')
        classroom_ids = None
        if request is not None:
            classroom_ids = request.data.get('assigned_classrooms')
            if isinstance(classroom_ids, str):
                classroom_ids = [s for s in classroom_ids.split(',') if s]
        teacher = super().update(instance, validated_data)
        if classroom_ids is not None:
            self._sync_classroom_assignments(teacher, classroom_ids)
        return teacher
    
    def get_campus_name(self, obj):
        """Get campus name for display"""
        return obj.current_campus.campus_name if obj.current_campus else None
    
    def get_coordinator_names(self, obj):
        """Get coordinator names for display"""
        return [coord.full_name for coord in obj.assigned_coordinators.all()]
    
    def get_classroom_name(self, obj):
        """Get classroom name for display"""
        if obj.assigned_classroom:
            return f"{obj.assigned_classroom.grade.name} - {obj.assigned_classroom.section}"
        return None

    def get_assigned_classrooms_display(self, obj):
        """
        Unified display of all assigned classrooms:
        - Prefer the ManyToMany `assigned_classrooms` (for both shifts)
        - Fallback to legacy `assigned_classroom`
        """
        try:
            # Prefer M2M list
            m2m_qs = getattr(obj, 'assigned_classrooms', None)
            if m2m_qs is not None and m2m_qs.exists():
                labels = []
                for c in m2m_qs.all():
                    try:
                        grade_name = getattr(getattr(c, 'grade', None), 'name', None) or getattr(c, 'grade_name', None) or 'Grade'
                        section = getattr(c, 'section', '') or ''
                        shift = getattr(c, 'shift', '') or ''
                        label = f"{grade_name} - {section}"
                        if shift:
                            label = f"{label} ({shift})"
                        labels.append(label)
                    except Exception:
                        labels.append(str(c))
                return ", ".join(labels) if labels else "-"

            # Fallback: single legacy assignment
            c = getattr(obj, 'assigned_classroom', None)
            if c:
                try:
                    grade_name = getattr(getattr(c, 'grade', None), 'name', None) or getattr(c, 'grade_name', None) or 'Grade'
                    section = getattr(c, 'section', '') or ''
                    shift = getattr(c, 'shift', '') or ''
                    label = f"{grade_name} - {section}"
                    if shift:
                        label = f"{label} ({shift})"
                    return label
                except Exception:
                    return str(c)

            return "-"
        except Exception:
            return "-"
    
    def get_experience_display(self, obj):
        """Get formatted experience display"""
        if obj.total_experience_years:
            return f"{obj.total_experience_years} years"
        return "Not specified"
