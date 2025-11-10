from rest_framework import permissions
from django.contrib.auth import get_user_model
from .models import Attendance

User = get_user_model()


class CanMarkAttendance(permissions.BasePermission):
    """
    Permission class for marking attendance
    - Teachers can mark for their assigned classroom only
    - Coordinators can mark for classrooms in their level
    - Principals can mark for classrooms in their campus
    - SuperAdmins can mark for any classroom
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin can mark any attendance
        if request.user.is_superuser:
            return True
        
        # Check if user has teacher profile
        if request.user.is_teacher():
            try:
                from teachers.models import Teacher
                teacher = Teacher.objects.get(email=request.user.email)
                if teacher and teacher.assigned_classroom:
                    return True
            except:
                pass
        
        # Check if user has coordinator profile
        if request.user.is_coordinator():
            try:
                from coordinator.models import Coordinator
                coordinator = Coordinator.get_for_user(request.user)
                if coordinator and coordinator.is_currently_active:
                    return True
            except:
                pass
        
        # Check if user has principal profile
        if request.user.is_principal():
            try:
                from principals.models import Principal
                principal = Principal.objects.get(email=request.user.email)
                if principal and principal.is_currently_active:
                    return True
            except:
                pass
        
        return False
    
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin can mark any attendance
        if request.user.is_superuser:
            return True
        
        # Check teacher permissions
        if request.user.is_teacher():
            try:
                from teachers.models import Teacher
                teacher = Teacher.objects.get(email=request.user.email)
                if teacher and teacher.assigned_classroom == obj.classroom:
                    return True
            except:
                pass
        
        # Check coordinator permissions
        if request.user.is_coordinator():
            try:
                from coordinator.models import Coordinator
                coordinator = Coordinator.get_for_user(request.user)
                if (coordinator and coordinator.is_currently_active and 
                    coordinator.level == obj.classroom.grade.level):
                    return True
            except:
                pass
        
        # Check principal permissions
        if request.user.is_principal():
            try:
                from principals.models import Principal
                principal = Principal.objects.get(email=request.user.email)
                if (principal and principal.is_currently_active and 
                    principal.campus == obj.classroom.campus):
                    return True
            except:
                pass
        
        return False


class CanEditAttendance(permissions.BasePermission):
    """
    Permission class for editing attendance
    - Teachers can edit their own attendance within 7 days
    - Coordinators+ can edit any attendance in their scope
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin can edit any attendance
        if request.user.is_superuser:
            return True
        
        # Check if user has teacher, coordinator, or principal profile
        return (request.user.is_teacher() or 
                request.user.is_coordinator() or 
                request.user.is_principal())
    
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin can edit any attendance
        if request.user.is_superuser:
            return True
        
        # Check if attendance is editable (within 7 days and not final)
        if not obj.is_editable:
            # Only coordinators+ can edit old attendance
            if request.user.is_coordinator() or request.user.is_principal():
                # Check scope permissions
                if request.user.is_coordinator():
                    try:
                        from coordinator.models import Coordinator
                        coordinator = Coordinator.get_for_user(request.user)
                        return (coordinator and coordinator.is_currently_active and 
                               coordinator.level == obj.classroom.grade.level)
                    except:
                        pass
                elif request.user.is_principal():
                    try:
                        from principals.models import Principal
                        principal = Principal.objects.get(email=request.user.email)
                        return (principal and principal.is_currently_active and 
                               principal.campus == obj.classroom.campus)
                    except:
                        pass
            return False
        
        # For recent attendance, check if user can edit
        # Teacher can edit their own classroom's attendance
        if request.user.is_teacher():
            try:
                from teachers.models import Teacher
                teacher = Teacher.objects.get(email=request.user.email)
                if teacher and teacher.assigned_classroom == obj.classroom:
                    return True
            except:
                pass
        
        # Coordinator can edit classrooms in their level
        if request.user.is_coordinator():
            try:
                from coordinator.models import Coordinator
                coordinator = Coordinator.get_for_user(request.user)
                if (coordinator and coordinator.is_currently_active and 
                    coordinator.level == obj.classroom.grade.level):
                    return True
            except:
                pass
        
        # Principal can edit classrooms in their campus
        if request.user.is_principal():
            try:
                from principals.models import Principal
                principal = Principal.objects.get(email=request.user.email)
                if (principal and principal.is_currently_active and 
                    principal.campus == obj.classroom.campus):
                    return True
            except:
                pass
        
        return False


class CanViewAttendance(permissions.BasePermission):
    """
    Permission class for viewing attendance
    - Teachers can view their own classroom's attendance
    - Coordinators can view classrooms in their level
    - Principals can view classrooms in their campus
    - SuperAdmins can view all attendance
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # All authenticated users with profiles can view attendance
        return (request.user.is_teacher() or 
                request.user.is_coordinator() or 
                request.user.is_principal() or 
                request.user.is_superuser)
    
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin can view any attendance
        if request.user.is_superuser:
            return True
        
        # Teacher can view their own classroom's attendance
        if request.user.is_teacher():
            try:
                from teachers.models import Teacher
                teacher = Teacher.objects.get(email=request.user.email)
                if teacher and teacher.assigned_classroom == obj.classroom:
                    return True
            except:
                pass
        
        # Coordinator can view classrooms in their level
        if request.user.is_coordinator():
            try:
                from coordinator.models import Coordinator
                coordinator = Coordinator.get_for_user(request.user)
                if (coordinator and coordinator.is_currently_active and 
                    coordinator.level == obj.classroom.grade.level):
                    return True
            except:
                pass
        
        # Principal can view classrooms in their campus
        if request.user.is_principal():
            try:
                from principals.models import Principal
                principal = Principal.objects.get(email=request.user.email)
                if (principal and principal.is_currently_active and 
                    principal.campus == obj.classroom.campus):
                    return True
            except:
                pass
        
        return False


class CanDeleteAttendance(permissions.BasePermission):
    """
    Permission class for deleting attendance
    - Only Coordinators+ can delete attendance
    - Requires reason for deletion
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin can delete any attendance
        if request.user.is_superuser:
            return True
        
        # Only coordinators and principals can delete
        return (request.user.is_coordinator() or 
                request.user.is_principal())
    
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # SuperAdmin can delete any attendance
        if request.user.is_superuser:
            return True
        
        # Coordinator can delete attendance in their level
        if request.user.is_coordinator():
            try:
                from coordinator.models import Coordinator
                coordinator = Coordinator.get_for_user(request.user)
                if (coordinator and coordinator.is_currently_active and 
                    coordinator.level == obj.classroom.grade.level):
                    return True
            except:
                pass
        
        # Principal can delete attendance in their campus
        if request.user.is_principal():
            try:
                from principals.models import Principal
                principal = Principal.objects.get(email=request.user.email)
                if (principal and principal.is_currently_active and 
                    principal.campus == obj.classroom.campus):
                    return True
            except:
                pass
        
        return False


class CanExportAttendance(permissions.BasePermission):
    """
    Permission class for exporting attendance reports
    - Teachers can export their own classroom's reports
    - Coordinators can export their level's reports
    - Principals can export their campus's reports
    - SuperAdmins can export all reports
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # All authenticated users with profiles can export
        return (request.user.is_teacher() or 
                request.user.is_coordinator() or 
                request.user.is_principal() or 
                request.user.is_superuser)