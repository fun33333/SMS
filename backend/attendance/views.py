from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from datetime import date, timedelta, datetime

User = get_user_model()

from .models import Attendance, StudentAttendance, Weekend
from .serializers import (
    AttendanceSerializer, 
    StudentAttendanceSerializer, 
    AttendanceMarkingSerializer,
    AttendanceSummarySerializer
)
from students.models import Student
from classes.models import ClassRoom
from teachers.models import Teacher
from notifications.services import create_notification


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_attendance(request):
    """
    Mark attendance for a class on a specific date
    """
    try:
        serializer = AttendanceMarkingSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        classroom_id = data['classroom_id']
        date = data['date']
        student_attendance_data = data['student_attendance']
        
        classroom = get_object_or_404(ClassRoom, id=classroom_id)
        
        # Get teacher from request user
        try:
            # Find teacher by employee code (username) since there's no direct relationship
            from teachers.models import Teacher
            teacher = Teacher.objects.get(employee_code=request.user.username)
        except Teacher.DoesNotExist:
            teacher = None
        
        with transaction.atomic():
            # Create or get attendance record
            attendance, created = Attendance.objects.get_or_create(
                classroom=classroom,
                date=date,
                defaults={'marked_by': teacher}
            )
            
            # Clear existing student attendance records
            attendance.student_attendances.all().delete()
            
            # Create new student attendance records
            for student_data in student_attendance_data:
                StudentAttendance.objects.create(
                    attendance=attendance,
                    student_id=student_data['student_id'],
                    status=student_data['status'],
                    remarks=student_data.get('remarks', '')
                )
            
            # Update attendance summary
            attendance.update_counts()
            
            # Send notification to coordinator
            try:
                # Get coordinator for this classroom's level
                coordinator = None
                coordinator_user = None
                
                if classroom.grade and classroom.grade.level:
                    from coordinator.models import Coordinator
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    
                    # Find coordinator for this level (considering shift)
                    coordinators = Coordinator.objects.filter(
                        is_currently_active=True
                    )
                    
                    # Check if coordinator manages this level
                    for coord in coordinators:
                        if coord.shift == 'both':
                            if coord.assigned_levels.exists():
                                if classroom.grade.level in coord.assigned_levels.all():
                                    coordinator = coord
                                    break
                            elif coord.level == classroom.grade.level:
                                coordinator = coord
                                break
                        else:
                            if coord.level == classroom.grade.level:
                                coordinator = coord
                                break
                    
                    # If no coordinator found, try to get from teacher's assigned coordinators
                    if not coordinator and teacher:
                        assigned_coords = teacher.assigned_coordinators.filter(is_currently_active=True).first()
                        if assigned_coords:
                            coordinator = assigned_coords
                    
                    # Get user for coordinator (by email or employee_code)
                    if coordinator:
                        try:
                            # Try by employee_code first
                            if coordinator.employee_code:
                                coordinator_user = User.objects.filter(username=coordinator.employee_code).first()
                            # Fallback to email
                            if not coordinator_user and coordinator.email:
                                coordinator_user = User.objects.filter(email=coordinator.email).first()
                        except Exception as user_error:
                            print(f"[WARN] Error finding user for coordinator {coordinator.full_name}: {user_error}")
                    
                    if coordinator and coordinator_user:
                        teacher_name = teacher.full_name if teacher else request.user.get_full_name() or request.user.username
                        classroom_name = str(classroom)
                        verb = f"Class teacher {teacher_name} has marked attendance"
                        target_text = f"for {classroom_name}. Please review the attendance."
                        
                        create_notification(
                            recipient=coordinator_user,
                            actor=request.user,
                            verb=verb,
                            target_text=target_text,
                            data={
                                'attendance_id': attendance.id,
                                'classroom_id': classroom.id,
                                'classroom_name': classroom_name,
                                'date': str(attendance.date),
                                'teacher_name': teacher_name
                            }
                        )
                        print(f"[OK] Sent attendance notification to coordinator {coordinator.full_name} (user: {coordinator_user.email})")
                    elif coordinator:
                        print(f"[WARN] Coordinator {coordinator.full_name} found but no user account exists (email: {coordinator.email}, employee_code: {coordinator.employee_code})")
                    else:
                        print(f"[WARN] No coordinator found for classroom {classroom_name} (level: {classroom.grade.level.name if classroom.grade and classroom.grade.level else 'N/A'})")
            except Exception as notif_error:
                print(f"[WARN] Failed to send attendance notification: {notif_error}")
                import traceback
                print(f"[WARN] Traceback: {traceback.format_exc()}")
                # Don't fail the attendance marking if notification fails
            
        return Response({
            'message': 'Attendance marked successfully',
            'attendance_id': attendance.id,
            'total_students': attendance.total_students,
            'present_count': attendance.present_count,
            'absent_count': attendance.absent_count,
            'late_count': attendance.late_count
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_bulk_attendance(request):
    """
    Mark attendance for entire class with simple present/absent status
    """
    try:
        classroom_id = request.data.get('classroom_id')
        date_str = request.data.get('date')
        student_attendance_data = request.data.get('student_attendance', [])
        
        if not classroom_id or not date_str:
            return Response({
                'error': 'classroom_id and date are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Convert date string to date object
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({
                'error': 'Invalid date format. Use YYYY-MM-DD.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        classroom = get_object_or_404(ClassRoom, id=classroom_id)
        
        # Check if it's a Sunday and auto-create weekend entry, and block teacher marking
        if date_obj.weekday() == 6:  # Sunday is 6 in Python's weekday()
            level = classroom.grade.level
            Weekend.objects.get_or_create(
                date=date_obj,
                level=level,
                defaults={'created_by': request.user}
            )
            # Teachers should not be able to mark Sunday attendance
            try:
                is_teacher = request.user.is_teacher()
            except Exception:
                is_teacher = False
            if is_teacher and not request.user.is_superuser:
                return Response({
                    'error': 'Weekend (Sunday): attendance marking is disabled',
                    'is_weekend': True
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get all students in this class
        all_students = Student.objects.filter(classroom=classroom)
        all_student_ids = list(all_students.values_list('id', flat=True))
        
        with transaction.atomic():
            # Create or get attendance record
            attendance, created = Attendance.objects.get_or_create(
                classroom=classroom,
                date=date_obj,
                defaults={'marked_by': request.user}
            )
            
            # Clear existing student attendance records
            attendance.student_attendances.all().delete()
            
            # Create student attendance records
            for student_data in student_attendance_data:
                student_id = student_data.get('student_id')
                attendance_status = student_data.get('status', 'present')
                remarks = student_data.get('remarks', '')
                
                if not student_id:
                    continue
                
                # Verify student belongs to this classroom
                try:
                    student = Student.objects.get(id=student_id, classroom=classroom)
                    StudentAttendance.objects.create(
                        attendance=attendance,
                        student=student,
                        status=attendance_status,
                        remarks=remarks,
                        created_by=request.user,
                        updated_by=request.user
                    )
                except Student.DoesNotExist:
                    continue
            
            # Update attendance summary
            attendance.update_counts()
            
            # Send notification to coordinator
            try:
                # Get teacher from request user
                teacher = None
                try:
                    teacher = Teacher.objects.get(employee_code=request.user.username)
                except Teacher.DoesNotExist:
                    pass
                
                # Get coordinator for this classroom's level
                coordinator = None
                coordinator_user = None
                
                if classroom.grade and classroom.grade.level:
                    from coordinator.models import Coordinator
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    
                    # Find coordinator for this level (considering shift)
                    coordinators = Coordinator.objects.filter(
                        is_currently_active=True
                    )
                    
                    # Check if coordinator manages this level
                    for coord in coordinators:
                        if coord.shift == 'both':
                            if coord.assigned_levels.exists():
                                if classroom.grade.level in coord.assigned_levels.all():
                                    coordinator = coord
                                    break
                            elif coord.level == classroom.grade.level:
                                coordinator = coord
                                break
                        else:
                            if coord.level == classroom.grade.level:
                                coordinator = coord
                                break
                    
                    # If no coordinator found, try to get from teacher's assigned coordinators
                    if not coordinator and teacher:
                        assigned_coords = teacher.assigned_coordinators.filter(is_currently_active=True).first()
                        if assigned_coords:
                            coordinator = assigned_coords
                    
                    # Get user for coordinator (by email or employee_code)
                    if coordinator:
                        try:
                            # Try by employee_code first
                            if coordinator.employee_code:
                                coordinator_user = User.objects.filter(username=coordinator.employee_code).first()
                            # Fallback to email
                            if not coordinator_user and coordinator.email:
                                coordinator_user = User.objects.filter(email=coordinator.email).first()
                        except Exception as user_error:
                            print(f"[WARN] Error finding user for coordinator {coordinator.full_name}: {user_error}")
                    
                    if coordinator and coordinator_user:
                        teacher_name = teacher.full_name if teacher else request.user.get_full_name() or request.user.username
                        classroom_name = str(classroom)
                        verb = f"Class teacher {teacher_name} has marked attendance"
                        target_text = f"for {classroom_name}. Please review the attendance."
                        
                        create_notification(
                            recipient=coordinator_user,
                            actor=request.user,
                            verb=verb,
                            target_text=target_text,
                            data={
                                'attendance_id': attendance.id,
                                'classroom_id': classroom.id,
                                'classroom_name': classroom_name,
                                'date': str(attendance.date),
                                'teacher_name': teacher_name
                            }
                        )
                        print(f"[OK] Sent attendance notification to coordinator {coordinator.full_name} (user: {coordinator_user.email})")
                    elif coordinator:
                        print(f"[WARN] Coordinator {coordinator.full_name} found but no user account exists (email: {coordinator.email}, employee_code: {coordinator.employee_code})")
                    else:
                        print(f"[WARN] No coordinator found for classroom {classroom_name} (level: {classroom.grade.level.name if classroom.grade and classroom.grade.level else 'N/A'})")
            except Exception as notif_error:
                print(f"[WARN] Failed to send attendance notification: {notif_error}")
                import traceback
                print(f"[WARN] Traceback: {traceback.format_exc()}")
                # Don't fail the attendance marking if notification fails
            
        return Response({
            'message': 'Bulk attendance marked successfully',
            'attendance_id': attendance.id,
            'total_students': attendance.total_students,
            'present_count': attendance.present_count,
            'absent_count': attendance.absent_count,
            'leave_count': attendance.leave_count,
            'attendance_percentage': round((attendance.present_count / attendance.total_students) * 100, 2) if attendance.total_students > 0 else 0
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_class_attendance(request, classroom_id):
    """
    Get attendance records for a specific class
    """
    classroom = get_object_or_404(ClassRoom, id=classroom_id)
    date_param = request.GET.get('date')
    start_date = request.GET.get('start_date')
    end_date = request.GET.get('end_date')
    
    if date_param:
        # Get attendance for specific date
        attendance = Attendance.objects.filter(
            classroom=classroom,
            date=date_param
        ).prefetch_related('student_attendances__student').first()
        if attendance:
            serializer = AttendanceSerializer(attendance)
            return Response(serializer.data)
        else:
            return Response({'message': 'No attendance found for this date'})
    elif start_date or end_date:
        # Get attendance for date range
        attendance_records = Attendance.objects.filter(
            classroom=classroom
        ).prefetch_related('student_attendances__student')
        
        if start_date:
            attendance_records = attendance_records.filter(date__gte=start_date)
        if end_date:
            attendance_records = attendance_records.filter(date__lte=end_date)
            
        attendance_records = attendance_records.order_by('-date')
        serializer = AttendanceSerializer(attendance_records, many=True)
        return Response(serializer.data)
    else:
        # Get all attendance records for the class
        attendance_records = Attendance.objects.filter(
            classroom=classroom
        ).prefetch_related('student_attendances__student').order_by('-date')
        serializer = AttendanceSerializer(attendance_records, many=True)
        return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_student_attendance(request, student_id):
    """
    Get attendance history for a specific student
    """
    student = get_object_or_404(Student, id=student_id)
    start_date = request.GET.get('start_date')
    end_date = request.GET.get('end_date')
    
    attendance_records = StudentAttendance.objects.filter(
        student=student
    ).select_related('attendance')
    
    if start_date:
        attendance_records = attendance_records.filter(
            attendance__date__gte=start_date
        )
    if end_date:
        attendance_records = attendance_records.filter(
            attendance__date__lte=end_date
        )
    
    serializer = StudentAttendanceSerializer(attendance_records, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_class_students(request, classroom_id):
    """
    Get all students in a specific classroom
    """
    classroom = get_object_or_404(ClassRoom, id=classroom_id)
    
    # Check permissions - teacher can only see their assigned classes (supports multiple)
    user = request.user
    if user.is_teacher():
        try:
            # Find teacher by employee code (username)
            from teachers.models import Teacher
            teacher = Teacher.objects.get(employee_code=user.username)
            # allow if legacy single matches OR included in M2M assigned_classrooms OR classroom.class_teacher is this teacher
            allowed = False
            if teacher.assigned_classroom == classroom:
                allowed = True
            elif teacher.assigned_classrooms.filter(id=classroom.id).exists():
                allowed = True
            elif getattr(classroom, 'class_teacher_id', None) == teacher.id:
                allowed = True
            if not allowed:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        except Teacher.DoesNotExist:
            return Response({'error': 'Teacher profile not found'}, status=status.HTTP_404_NOT_FOUND)
    
    students = Student.objects.filter(classroom=classroom, is_deleted=False).order_by('name')
    
    student_data = []
    for student in students:
        student_data.append({
            'id': student.id,
            'name': student.name,
            'student_code': student.student_code,
            'photo': student.photo.url if student.photo else None,
            'gr_no': student.gr_no,
            'gender': student.gender,
            'student_id': student.student_id
        })
    
    return Response(student_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_attendance_summary(request, classroom_id):
    """
    Get attendance summary for a classroom
    """
    classroom = get_object_or_404(ClassRoom, id=classroom_id)
    start_date = request.GET.get('start_date')
    end_date = request.GET.get('end_date')
    
    if not start_date:
        start_date = (timezone.now().date() - timedelta(days=30))
    if not end_date:
        end_date = timezone.now().date()
    
    attendance_records = Attendance.objects.filter(
        classroom=classroom,
        date__range=[start_date, end_date]
    ).order_by('-date')
    
    summary_data = []
    for attendance in attendance_records:
        attendance_percentage = 0
        if attendance.total_students > 0:
            attendance_percentage = (attendance.present_count / attendance.total_students) * 100
        
        summary_data.append({
            'classroom_id': classroom.id,
            'classroom_name': str(classroom),
            'date': attendance.date,
            'total_students': attendance.total_students,
            'present_count': attendance.present_count,
            'absent_count': attendance.absent_count,
            'late_count': attendance.late_count,
            'attendance_percentage': round(attendance_percentage, 2)
        })
    
    return Response(summary_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_teacher_classes(request):
    """
    Get all classes assigned to the current teacher
    """
    try:
        user = request.user
        
        # Find teacher by employee code (username) since there's no direct relationship
        from teachers.models import Teacher
        try:
            teacher = Teacher.objects.get(employee_code=user.username)
        except Teacher.DoesNotExist:
            return Response({'error': 'Teacher profile not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not teacher:
            return Response({'error': 'Teacher profile not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get classes where teacher is class teacher
        classrooms = ClassRoom.objects.filter(class_teacher=teacher)
        
        class_data = []
        for classroom in classrooms:
            class_data.append({
                'id': classroom.id,
                'name': str(classroom),
                'code': classroom.code,
                'grade': classroom.grade.name,
                'section': classroom.section,
                'shift': classroom.shift,
                'campus': classroom.grade.level.campus.campus_name if classroom.grade.level.campus else None
            })
        
        return Response(class_data)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def edit_attendance(request, attendance_id):
    """
    Edit existing attendance record
    Teachers can edit within 7 days, Coordinators can edit anytime for their level
    """
    try:
        attendance = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
        user = request.user
        
        # Check if user can edit this attendance
        can_edit = False
        edit_reason = None
        
        # SuperAdmin can edit anything
        if user.is_superuser:
            can_edit = True
            edit_reason = "SuperAdmin edit"
        
        # Check teacher permissions (7-day limit)
        elif user.is_teacher():
            try:
                # Find teacher by employee code (username) since there's no direct relationship
                from teachers.models import Teacher
                teacher = Teacher.objects.get(employee_code=user.username)
                is_allowed = False
                if teacher and teacher.assigned_classroom == attendance.classroom:
                    is_allowed = True
                elif teacher and teacher.assigned_classrooms.filter(id=attendance.classroom_id).exists():
                    is_allowed = True
                elif teacher and getattr(attendance.classroom, 'class_teacher_id', None) == teacher.id:
                    is_allowed = True

                if is_allowed:
                    # Teachers can only edit draft attendance within 7 days
                    if attendance.status == 'draft':
                        days_diff = (timezone.now().date() - attendance.date).days
                        if days_diff <= 7:
                            can_edit = True
                            edit_reason = "Teacher edit within 7 days"
                        else:
                            return Response({
                                'error': f'Cannot edit attendance older than 7 days. This attendance is {days_diff} days old.'
                            }, status=status.HTTP_403_FORBIDDEN)
                    elif attendance.status in ['submitted', 'under_review']:
                        return Response({
                            'error': 'Cannot edit attendance that has been submitted for review. Please contact your coordinator if changes are needed.'
                        }, status=status.HTTP_403_FORBIDDEN)
                    elif attendance.status == 'approved':
                        return Response({
                            'error': 'Cannot edit approved attendance. Please contact your coordinator if changes are needed.'
                        }, status=status.HTTP_403_FORBIDDEN)
                    else:
                        return Response({
                            'error': 'Cannot edit this attendance. Please contact your coordinator if changes are needed.'
                        }, status=status.HTTP_403_FORBIDDEN)
            except Teacher.DoesNotExist:
                pass
        
        # Check coordinator permissions (unlimited time for their level)
        elif user.is_coordinator():
            # Coordinator can edit attendance for their managed levels (no 7-day limit)
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if not coordinator or not coordinator.is_currently_active:
                return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

            # Support coordinators with multiple assigned levels and 'both' shifts
            allowed = False
            if coordinator.shift == 'both':
                if hasattr(coordinator, 'assigned_levels') and coordinator.assigned_levels.exists():
                    if attendance.classroom.grade.level in coordinator.assigned_levels.all():
                        allowed = True
                elif coordinator.level:
                    if attendance.classroom.grade.level == coordinator.level:
                        allowed = True
            else:
                if coordinator.level and attendance.classroom.grade.level == coordinator.level:
                    allowed = True

            if allowed:
                can_edit = True
                edit_reason = "Coordinator edit"
        
        # Check principal permissions
        elif user.is_principal():
            try:
                # Find principal by email since there's no direct relationship
                from principals.models import Principal
                principal = Principal.objects.get(email=user.email)
                if (principal and principal.is_currently_active and 
                    principal.campus == attendance.classroom.campus):
                    can_edit = True
                    edit_reason = "Principal edit"
            except Principal.DoesNotExist:
                pass
        
        if not can_edit:
            return Response({
                'error': 'You do not have permission to edit this attendance'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get new attendance data
        data = request.data
        student_attendance_data = data.get('student_attendance', [])
        
        if not student_attendance_data:
            return Response({
                'error': 'Student attendance data is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        with transaction.atomic():
            # Clear existing student attendance records
            attendance.student_attendances.all().delete()
            
            # Create new student attendance records
            for student_data in student_attendance_data:
                student_id = student_data.get('student_id')
                attendance_status = student_data.get('status', 'present')
                remarks = student_data.get('remarks', '')
                
                if not student_id:
                    continue
                
                try:
                    student = Student.objects.get(id=student_id, classroom=attendance.classroom)
                    StudentAttendance.objects.create(
                        student=student,
                        attendance=attendance,
                        status=attendance_status,
                        remarks=remarks,
                        created_by=user,
                        updated_by=user
                    )
                except Student.DoesNotExist:
                    continue
            
            # Update attendance counts
            attendance.update_counts()
            
            # Add edit history
            attendance.add_edit_history(
                user=user,
                action='edited',
                reason=edit_reason,
                changes={
                    'edited_at': timezone.now().isoformat(),
                    'student_count': len(student_attendance_data)
                }
            )
            
            # Update marked_by if it's a teacher
            teacher = None
            if user.is_teacher():
                attendance.marked_by = user
                # Save only specific fields to avoid updating created_at
                attendance.save(update_fields=['marked_by', 'updated_at'])
                # Get teacher for notification
                try:
                    teacher = Teacher.objects.get(employee_code=user.username)
                except Teacher.DoesNotExist:
                    print(f"[WARN] Teacher not found for user {user.username}")
                    pass
            
            # Send notification to coordinator when teacher updates attendance
            # (Don't send if coordinator is editing their own attendance)
            if user.is_teacher():
                print(f"[DEBUG] Teacher updating attendance - user: {user.username}, is_teacher: {user.is_teacher()}, teacher: {teacher}")
                try:
                    # Get coordinator for this classroom's level
                    coordinator = None
                    coordinator_user = None
                    classroom = attendance.classroom
                    
                    print(f"[DEBUG] Classroom: {classroom}, Grade: {classroom.grade if classroom.grade else 'None'}, Level: {classroom.grade.level if classroom.grade and classroom.grade.level else 'None'}")
                    
                    if classroom.grade and classroom.grade.level:
                        from coordinator.models import Coordinator
                        from django.contrib.auth import get_user_model
                        User = get_user_model()
                        
                        # Find coordinator for this level (considering shift)
                        coordinators = Coordinator.objects.filter(
                            is_currently_active=True
                        )
                        
                        print(f"[DEBUG] Found {coordinators.count()} active coordinators")
                        
                        # Check if coordinator manages this level
                        for coord in coordinators:
                            print(f"[DEBUG] Checking coordinator {coord.full_name} - shift: {coord.shift}, level: {coord.level}, assigned_levels: {list(coord.assigned_levels.all()) if coord.assigned_levels.exists() else 'None'}")
                            if coord.shift == 'both':
                                if coord.assigned_levels.exists():
                                    if classroom.grade.level in coord.assigned_levels.all():
                                        coordinator = coord
                                        break
                                elif coord.level == classroom.grade.level:
                                    coordinator = coord
                                    break
                            else:
                                if coord.level == classroom.grade.level:
                                    coordinator = coord
                                    break
                        
                        # If no coordinator found, try to get from teacher's assigned coordinators
                        if not coordinator and teacher:
                            print(f"[DEBUG] No coordinator found by level, trying teacher's assigned coordinators")
                            assigned_coords = teacher.assigned_coordinators.filter(is_currently_active=True).first()
                            if assigned_coords:
                                coordinator = assigned_coords
                                print(f"[DEBUG] Found coordinator from teacher's assigned coordinators: {coordinator.full_name}")
                        
                        # Get user for coordinator (by email or employee_code)
                        if coordinator:
                            try:
                                # Try by employee_code first
                                if coordinator.employee_code:
                                    coordinator_user = User.objects.filter(username=coordinator.employee_code).first()
                                # Fallback to email
                                if not coordinator_user and coordinator.email:
                                    coordinator_user = User.objects.filter(email=coordinator.email).first()
                            except Exception as user_error:
                                print(f"[WARN] Error finding user for coordinator {coordinator.full_name}: {user_error}")
                        
                        if coordinator and coordinator_user:
                            teacher_name = teacher.full_name if teacher else user.get_full_name() or user.username
                            classroom_name = str(classroom)
                            verb = f"Class teacher {teacher_name} has updated attendance"
                            target_text = f"for {classroom_name}. Please review the attendance."
                            
                            create_notification(
                                recipient=coordinator_user,
                                actor=user,
                                verb=verb,
                                target_text=target_text,
                                data={
                                    'attendance_id': attendance.id,
                                    'classroom_id': classroom.id,
                                    'classroom_name': classroom_name,
                                    'date': str(attendance.date),
                                    'teacher_name': teacher_name,
                                    'action': 'updated'
                                }
                            )
                            print(f"[OK] Sent attendance update notification to coordinator {coordinator.full_name} (user: {coordinator_user.email})")
                        elif coordinator:
                            print(f"[WARN] Coordinator {coordinator.full_name} found but no user account exists (email: {coordinator.email}, employee_code: {coordinator.employee_code})")
                        else:
                            print(f"[WARN] No coordinator found for classroom {classroom_name} (level: {classroom.grade.level.name if classroom.grade and classroom.grade.level else 'N/A'})")
                except Exception as notif_error:
                    print(f"[WARN] Failed to send attendance update notification: {notif_error}")
                    import traceback
                    print(f"[WARN] Traceback: {traceback.format_exc()}")
                    # Don't fail the attendance update if notification fails
        
        # Return updated attendance data
        serializer = AttendanceSerializer(attendance)
        return Response({
            'message': 'Attendance updated successfully',
            'attendance': serializer.data
        })
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_attendance_for_date(request, classroom_id, date):
    """
    Get attendance for a specific date
    """
    try:
        classroom = get_object_or_404(ClassRoom, id=classroom_id)
        user = request.user
        
        # Check permissions (support multi-class teachers)
        if user.is_teacher():
            try:
                # Find teacher by employee code (username) since there's no direct relationship
                from teachers.models import Teacher
                teacher = Teacher.objects.get(employee_code=user.username)
                allowed = False
                if teacher.assigned_classroom == classroom:
                    allowed = True
                elif teacher.assigned_classrooms.filter(id=classroom.id).exists():
                    allowed = True
                elif getattr(classroom, 'class_teacher_id', None) == teacher.id:
                    allowed = True
                if not allowed:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            except Teacher.DoesNotExist:
                return Response({'error': 'Teacher profile not found'}, status=status.HTTP_404_NOT_FOUND)
        elif user.is_coordinator():
            # Coordinator can access attendance for classrooms in their managed levels
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if not coordinator:
                return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

            # Check if classroom is in coordinator's managed levels
            allowed = False
            # Build managed levels: if 'both' shift and assigned_levels provided, use them.
            # Fallback to single 'level' if assigned_levels empty (some coordinators may still use level field).
            if coordinator.shift == 'both':
                if coordinator.assigned_levels.exists():
                    if classroom.grade.level in coordinator.assigned_levels.all():
                        allowed = True
                elif coordinator.level:
                    # fallback: coordinator.level used even when shift is 'both'
                    if classroom.grade.level == coordinator.level:
                        allowed = True
            else:
                if coordinator.level and classroom.grade.level == coordinator.level:
                    allowed = True

            if not allowed:
                return Response({'error': 'Access denied - Classroom not in your managed levels'}, status=status.HTTP_403_FORBIDDEN)
        
        # Auto-create weekend entry for Sundays (no attendance records should be created)
        try:
            from datetime import datetime as _dt
            date_obj = _dt.strptime(date, '%Y-%m-%d').date()
            if date_obj.weekday() == 6:  # Sunday
                Weekend.objects.get_or_create(
                    date=date_obj,
                    level=classroom.grade.level,
                    defaults={'created_by': request.user}
                )
        except Exception:
            pass

        # Get attendance for the date
        try:
            attendance = Attendance.objects.get(
                classroom=classroom,
                date=date,
                is_deleted=False
            )
            
            # Get student attendance records
            student_attendances = attendance.student_attendances.all()
            
            attendance_data = {
                'id': attendance.id,
                'date': attendance.date.isoformat(),
                'classroom': {
                    'id': classroom.id,
                    'name': str(classroom),
                    'code': classroom.code
                },
                'total_students': attendance.total_students,
                'present_count': attendance.present_count,
                'absent_count': attendance.absent_count,
                'late_count': attendance.late_count,
                'leave_count': attendance.leave_count,
                'attendance_percentage': attendance.attendance_percentage,
                'is_editable': attendance.is_editable,
                'marked_at': attendance.marked_at.isoformat(),
                'marked_by': attendance.marked_by.get_full_name() if attendance.marked_by else None,
                'student_attendance': [
                    {
                        'student_id': sa.student.id,
                        'student_name': sa.student.name,
                        'student_code': sa.student.student_code or sa.student.student_id or sa.student.gr_no or f"ID-{sa.student.id}",
                        'student_gender': sa.student.gender,
                        'status': sa.status,
                        'remarks': sa.remarks or ''
                    }
                    for sa in student_attendances
                ],
                'edit_history': attendance.update_history
            }
            
            return Response(attendance_data)
            
        except Attendance.DoesNotExist:
            # Also tell client if the date is a weekend
            from datetime import datetime as _dt
            is_weekend = False
            try:
                _d = _dt.strptime(date, '%Y-%m-%d').date()
                is_weekend = (_d.weekday() == 6)
            except Exception:
                pass
            return Response({
                'message': 'No attendance found for this date',
                'date': date,
                'classroom_id': classroom_id,
                'is_weekend': is_weekend
            })
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_coordinator_classes(request):
    """
    Get all classes in coordinator's assigned level
    """
    try:
        user = request.user
        
        if not user.is_coordinator():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Find coordinator by user (robust lookup)
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(user)
        if not coordinator or not coordinator.is_currently_active:
            return Response({'error': 'Coordinator profile not found or inactive'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get all classes in coordinator's level(s)
        managed_levels = []
        if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
            managed_levels = list(coordinator.assigned_levels.all())
        elif coordinator.level:
            managed_levels = [coordinator.level]
        else:
            return Response({'error': 'No level assigned to coordinator'}, status=status.HTTP_404_NOT_FOUND)
        
        classrooms = ClassRoom.objects.filter(
            grade__level__in=managed_levels
        ).select_related('grade', 'class_teacher', 'grade__level__campus')
        
        
        class_data = []
        for classroom in classrooms:
            # Include level information so frontend can build a level selection dropdown
            level_info = None
            try:
                lvl = classroom.grade.level
                level_info = {'id': lvl.id, 'name': lvl.name}
            except Exception:
                level_info = None

            class_data.append({
                'id': classroom.id,
                'name': str(classroom),  # This uses the __str__ method
                'code': classroom.code,
                'grade': classroom.grade.name,
                'section': classroom.section,
                'shift': classroom.shift,
                'level': level_info,
                'campus': classroom.grade.level.campus.campus_name if classroom.grade.level.campus else None,
                'class_teacher': {
                    'id': classroom.class_teacher.id if classroom.class_teacher else None,
                    'name': classroom.class_teacher.full_name if classroom.class_teacher else None,
                    'employee_code': classroom.class_teacher.employee_code if classroom.class_teacher else None
                } if classroom.class_teacher else None,
                'student_count': classroom.students.count()
            })
        
        return Response(class_data)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_level_attendance_summary(request, level_id):
    """
    Get attendance summary for all classes in a level
    """
    try:
        user = request.user
        
        # Check permissions
        if user.is_coordinator():
            # Find coordinator via robust lookup
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if not coordinator or not coordinator.level or coordinator.level.id != level_id:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        elif user.is_principal():
            try:
                # Find principal by email since there's no direct relationship
                from principals.models import Principal
                principal = Principal.objects.get(email=user.email)
                if not principal or not principal.is_currently_active:
                    return Response({'error': 'Principal profile not found'}, status=status.HTTP_404_NOT_FOUND)
            except Principal.DoesNotExist:
                return Response({'error': 'Principal profile not found'}, status=status.HTTP_404_NOT_FOUND)
        elif not user.is_superuser:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Get date range
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        
        if not start_date:
            start_date = (timezone.now() - timedelta(days=30)).date()
        else:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            
        if not end_date:
            end_date = timezone.now().date()
        else:
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Get all classes in the level
        classrooms = ClassRoom.objects.filter(
            grade__level_id=level_id
        ).select_related('grade', 'grade__level__campus')
        
        summary_data = []
        total_students = 0
        total_present = 0
        total_absent = 0
        total_late = 0
        total_leave = 0
        
        for classroom in classrooms:
            # Get attendance records for this classroom in date range
            attendances = Attendance.objects.filter(
                classroom=classroom,
                date__range=[start_date, end_date]
            )
            
            classroom_total_students = classroom.students.count()
            classroom_present = sum(att.present_count for att in attendances)
            classroom_absent = sum(att.absent_count for att in attendances)
            classroom_late = sum(att.late_count for att in attendances)
            classroom_leave = sum(att.leave_count for att in attendances)
            classroom_records = attendances.count()
            
            avg_percentage = 0
            if classroom_records > 0:
                avg_percentage = sum(att.attendance_percentage for att in attendances) / classroom_records
            
            summary_data.append({
                'classroom': {
                    'id': classroom.id,
                    'name': str(classroom),
                    'code': classroom.code,
                    'grade': classroom.grade.name,
                    'section': classroom.section,
                    'shift': classroom.shift,
                    'campus': classroom.grade.level.campus.campus_name if classroom.grade.level.campus else None
                },
                'student_count': classroom_total_students,
                'records_count': classroom_records,
                'total_present': classroom_present,
                'total_absent': classroom_absent,
                'total_late': classroom_late,
                'total_leave': classroom_leave,
                'average_percentage': round(avg_percentage, 2),
                'last_attendance': attendances.order_by('-date').first().date.isoformat() if attendances.exists() else None
            })
            
            total_students += classroom_total_students
            total_present += classroom_present
            total_absent += classroom_absent
            total_late += classroom_late
            total_leave += classroom_leave
        
        # Calculate overall statistics
        overall_percentage = 0
        if total_students > 0:
            overall_percentage = round((total_present / (total_present + total_absent)) * 100, 2)
        
        return Response({
            'level_id': level_id,
            'date_range': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'total_classrooms': len(summary_data),
                'total_students': total_students,
                'total_present': total_present,
                'total_absent': total_absent,
                'total_late': total_late,
                'total_leave': total_leave,
                'overall_percentage': overall_percentage
            },
            'classrooms': summary_data
        })
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_attendance(request, attendance_id):
    """Teacher submits draft attendance for review"""
    try:
        attendance = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
        
        # Verify teacher can submit
        if attendance.status != 'draft':
            return Response({'error': 'Can only submit draft attendance'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify user is teacher of this class
        teacher = Teacher.objects.get(employee_code=request.user.username)
        if teacher.assigned_classroom != attendance.classroom:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        with transaction.atomic():
            attendance.status = 'submitted'
            attendance.submitted_at = timezone.now()
            attendance.submitted_by = request.user
            attendance.add_edit_history(request.user, 'submitted', 'Submitted for coordinator review')
            attendance.save()
            
            # Create audit log
            from .models import AuditLog
            AuditLog.objects.create(
                feature='attendance',
                action='submit',
                entity_type='Attendance',
                entity_id=attendance.id,
                user=request.user,
                ip_address=request.META.get('REMOTE_ADDR'),
                changes={'status': 'submitted'},
                reason='Submitted for coordinator review'
            )
        
        return Response({'message': 'Attendance submitted successfully'})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def review_attendance(request, attendance_id):
    """Coordinator moves attendance to under_review"""
    try:
        attendance = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
        
        if attendance.status != 'submitted':
            return Response({'error': 'Can only review submitted attendance'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify coordinator has access
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator or not coordinator.is_currently_active:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

        # Support coordinators with multiple assigned levels and 'both' shifts
        allowed = False
        if coordinator.shift == 'both':
            if hasattr(coordinator, 'assigned_levels') and coordinator.assigned_levels.exists():
                if attendance.classroom.grade.level in coordinator.assigned_levels.all():
                    allowed = True
            elif coordinator.level:
                if attendance.classroom.grade.level == coordinator.level:
                    allowed = True
        else:
            if coordinator.level and attendance.classroom.grade.level == coordinator.level:
                allowed = True

        if not allowed:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        with transaction.atomic():
            attendance.status = 'under_review'
            attendance.reviewed_at = timezone.now()
            attendance.reviewed_by = request.user
            attendance.add_edit_history(request.user, 'review', 'Under coordinator review')
            attendance.save()
            
            from .models import AuditLog
            AuditLog.objects.create(
                feature='attendance',
                action='review',
                entity_type='Attendance',
                entity_id=attendance.id,
                user=request.user,
                ip_address=request.META.get('REMOTE_ADDR'),
                changes={'status': 'under_review'}
            )
        
        return Response({'message': 'Attendance moved to under review'})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def finalize_attendance(request, attendance_id):
    """Coordinator finalizes attendance (locks it)"""
    try:
        attendance = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
        
        if attendance.status not in ['draft', 'submitted', 'under_review']:
            return Response({'error': 'Can only finalize draft, submitted, or under_review attendance'}, status=status.HTTP_400_BAD_REQUEST)
        
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator or not coordinator.is_currently_active:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

        # Support coordinators with multiple assigned levels and 'both' shifts
        allowed = False
        if coordinator.shift == 'both':
            if hasattr(coordinator, 'assigned_levels') and coordinator.assigned_levels.exists():
                if attendance.classroom.grade.level in coordinator.assigned_levels.all():
                    allowed = True
            elif coordinator.level:
                if attendance.classroom.grade.level == coordinator.level:
                    allowed = True
        else:
            if coordinator.level and attendance.classroom.grade.level == coordinator.level:
                allowed = True

        if not allowed:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        with transaction.atomic():
            attendance.status = 'approved'
            attendance.is_final = True
            attendance.finalized_at = timezone.now()
            attendance.finalized_by = request.user
            attendance.add_edit_history(request.user, 'finalize', 'Finalized by coordinator')
            attendance.save()

            from .models import AuditLog
            AuditLog.objects.create(
                feature='attendance',
                action='finalize',
                entity_type='Attendance',
                entity_id=attendance.id,
                user=request.user,
                ip_address=request.META.get('REMOTE_ADDR'),
                changes={'status': 'approved'}
            )
        
        return Response({'message': 'Attendance finalized successfully'})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def coordinator_approve_attendance(request, attendance_id):
    """Coordinator directly approves attendance (bypasses review step)"""
    try:
        attendance = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
        
        # Check if attendance can be approved (draft, submitted, or under_review)
        if attendance.status not in ['draft', 'submitted', 'under_review']:
            return Response({'error': 'Can only approve draft, submitted or under review attendance'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify coordinator has access
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check membership (support assigned_levels for 'both' shifts)
        allowed = False
        if coordinator.shift == 'both':
            if coordinator.assigned_levels.exists():
                if attendance.classroom.grade.level in coordinator.assigned_levels.all():
                    allowed = True
            elif coordinator.level:
                if coordinator.level == attendance.classroom.grade.level:
                    allowed = True
        else:
            if coordinator.level == attendance.classroom.grade.level:
                allowed = True

        if not allowed:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        with transaction.atomic():
            # Move directly to approved status
            attendance.status = 'approved'
            attendance.is_final = True
            attendance.finalized_at = timezone.now()
            attendance.finalized_by = request.user
            attendance.add_edit_history(request.user, 'coordinator_approve', 'Directly approved by coordinator')
            attendance.save()

            from .models import AuditLog
            AuditLog.objects.create(
                feature='attendance',
                action='coordinator_approve',
                entity_type='Attendance',
                entity_id=attendance.id,
                user=request.user,
                ip_address=request.META.get('REMOTE_ADDR'),
                changes={'status': 'approved'}
            )
        
        return Response({'message': 'Attendance approved successfully by coordinator'})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reopen_attendance(request, attendance_id):
    """Coordinator reopens finalized attendance with reason"""
    try:
        attendance = get_object_or_404(Attendance, id=attendance_id, is_deleted=False)
        reason = request.data.get('reason')
        
        if not reason:
            return Response({'error': 'Reason is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if attendance.status != 'approved':
            return Response({'error': 'Can only reopen approved attendance'}, status=status.HTTP_400_BAD_REQUEST)
        
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check membership (support assigned_levels for 'both' shifts)
        allowed = False
        if coordinator.shift == 'both':
            if coordinator.assigned_levels.exists():
                if attendance.classroom.grade.level in coordinator.assigned_levels.all():
                    allowed = True
            elif coordinator.level:
                if coordinator.level == attendance.classroom.grade.level:
                    allowed = True
        else:
            if coordinator.level == attendance.classroom.grade.level:
                allowed = True

        if not allowed:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        with transaction.atomic():
            attendance.status = 'under_review'
            attendance.is_final = False
            attendance.reopened_at = timezone.now()
            attendance.reopened_by = request.user
            attendance.reopen_reason = reason
            attendance.add_edit_history(request.user, 'reopen', reason)
            attendance.save()
            
            from .models import AuditLog
            AuditLog.objects.create(
                feature='attendance',
                action='reopen',
                entity_type='Attendance',
                entity_id=attendance.id,
                user=request.user,
                ip_address=request.META.get('REMOTE_ADDR'),
                changes={'status': 'under_review'},
                reason=reason
            )
        
        return Response({'message': 'Attendance reopened successfully'})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def grant_backfill_permission(request):
    """Coordinator grants permission to mark attendance for missed date"""
    try:
        classroom_id = request.data.get('classroom_id')
        date_str = request.data.get('date')
        teacher_id = request.data.get('teacher_id')
        reason = request.data.get('reason')
        deadline_str = request.data.get('deadline')
        
        if not all([classroom_id, date_str, teacher_id, reason, deadline_str]):
            return Response({'error': 'All fields required'}, status=status.HTTP_400_BAD_REQUEST)
        
        classroom = get_object_or_404(ClassRoom, id=classroom_id)
        teacher = get_object_or_404(User, id=teacher_id)
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        deadline = datetime.strptime(deadline_str, '%Y-%m-%dT%H:%M:%S')
        
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check membership for backfill permission
        allowed = False
        if coordinator.shift == 'both':
            if coordinator.assigned_levels.exists() and classroom.grade.level in coordinator.assigned_levels.all():
                allowed = True
            elif coordinator.level and coordinator.level == classroom.grade.level:
                allowed = True
        else:
            if coordinator.level and coordinator.level == classroom.grade.level:
                allowed = True

        if not allowed:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        from .models import AttendanceBackfillPermission, AuditLog
        permission = AttendanceBackfillPermission.objects.create(
            classroom=classroom,
            date=date_obj,
            granted_to=teacher,
            granted_by=request.user,
            reason=reason,
            deadline=deadline
        )
        
        AuditLog.objects.create(
            feature='attendance',
            action='approve',
            entity_type='AttendanceBackfillPermission',
            entity_id=permission.id,
            user=request.user,
            ip_address=request.META.get('REMOTE_ADDR'),
            reason=reason
        )
        
        return Response({'message': 'Backfill permission granted', 'permission_id': permission.id})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_backfill_permissions(request):
    """Get active backfill permissions for current user"""
    try:
        from .models import AttendanceBackfillPermission
        permissions = AttendanceBackfillPermission.objects.filter(
            granted_to=request.user,
            is_used=False
        ).select_related('classroom', 'granted_by')
        
        data = [{
            'id': p.id,
            'classroom_id': p.classroom.id,
            'classroom_name': str(p.classroom),
            'date': p.date,
            'reason': p.reason,
            'deadline': p.deadline,
            'is_expired': p.is_expired,
            'granted_by': p.granted_by.get_full_name() if p.granted_by else None
        } for p in permissions]
        
        return Response(data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_holiday(request):
    """Coordinator creates holiday for their level"""
    try:
        date_str = request.data.get('date')
        reason = request.data.get('reason')
        
        if not all([date_str, reason]):
            return Response({'error': 'Date and reason required'}, status=status.HTTP_400_BAD_REQUEST)
        
        from coordinator.models import Coordinator
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        from .models import Holiday, AuditLog
        from classes.models import ClassRoom
        from django.utils import timezone
        
        # Check if date is in the past and archive existing attendance
        if date_obj < timezone.now().date():
            # Find all classrooms in this level
            classrooms = ClassRoom.objects.filter(grade__level=coordinator.level)
            
            for classroom in classrooms:
                # Find existing attendance for this date
                try:
                    existing_attendance = Attendance.objects.get(
                        classroom=classroom,
                        date=date_obj,
                        is_deleted=False
                    )
                    
                    # Archive the attendance data
                    archived_data = {
                        'student_attendance': list(existing_attendance.student_attendances.values()),
                        'marked_by': existing_attendance.marked_by.get_full_name() if existing_attendance.marked_by else None,
                        'marked_at': existing_attendance.marked_at.isoformat(),
                        'status': existing_attendance.status,
                        'total_students': existing_attendance.total_students,
                        'present_count': existing_attendance.present_count,
                        'absent_count': existing_attendance.absent_count,
                        'late_count': existing_attendance.late_count,
                        'leave_count': existing_attendance.leave_count
                    }
                    
                    # Mark as replaced by holiday
                    existing_attendance.replaced_by_holiday = True
                    existing_attendance.replaced_at = timezone.now()
                    existing_attendance.archived_data = archived_data
                    existing_attendance.save()
                    
                except Attendance.DoesNotExist:
                    # No existing attendance, continue
                    pass
        
        holiday, created = Holiday.objects.get_or_create(
            date=date_obj,
            level=coordinator.level,
            defaults={'reason': reason, 'created_by': request.user}
        )
        
        if not created:
            holiday.reason = reason
            holiday.save()
        
        AuditLog.objects.create(
            feature='attendance',
            action='create' if created else 'update',
            entity_type='Holiday',
            entity_id=holiday.id,
            user=request.user,
            ip_address=request.META.get('REMOTE_ADDR'),
            reason=reason
        )
        
        return Response({'message': 'Holiday created', 'holiday_id': holiday.id})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_holidays(request):
    """Get holidays for user's level"""
    try:
        level_id = request.query_params.get('level_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        from .models import Holiday
        holidays = Holiday.objects.filter(level_id=level_id)
        
        if start_date:
            holidays = holidays.filter(date__gte=start_date)
        if end_date:
            holidays = holidays.filter(date__lte=end_date)
        
        data = [{
            'id': h.id,
            'date': h.date,
            'reason': h.reason,
            'created_by': h.created_by.get_full_name() if h.created_by else None
        } for h in holidays]
        
        return Response(data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_realtime_attendance_metrics(request):
    """Get real-time attendance metrics for dashboards"""
    try:
        user = request.user
        today = timezone.now().date()
        
        metrics = {
            'today': today.isoformat(),
            'classrooms': []
        }
        
        # Get classrooms based on role
        if user.is_teacher():
            teacher = Teacher.objects.get(employee_code=user.username)
            classrooms = [teacher.assigned_classroom] if teacher.assigned_classroom else []
        elif user.is_coordinator():
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if coordinator:
                if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
                    classrooms = ClassRoom.objects.filter(grade__level__in=coordinator.assigned_levels.all())
                elif coordinator.level:
                    classrooms = ClassRoom.objects.filter(grade__level=coordinator.level)
                else:
                    classrooms = []
            else:
                classrooms = []
        elif user.is_principal():
            from principals.models import Principal
            principal = Principal.objects.get(email=user.email)
            classrooms = ClassRoom.objects.filter(grade__level__campus=principal.campus)
        else:
            classrooms = []
        
        for classroom in classrooms:
            attendance = Attendance.objects.filter(
                classroom=classroom,
                date=today
            ).first()
            
            status_color = 'gray'
            if attendance:
                if attendance.status == 'draft':
                    status_color = 'yellow'
                elif attendance.status == 'submitted':
                    status_color = 'blue'
                elif attendance.status == 'under_review':
                    status_color = 'orange'
                elif attendance.status == 'approved':
                    status_color = 'green'
            
            metrics['classrooms'].append({
                'id': classroom.id,
                'name': str(classroom),
                'status': attendance.status if attendance else 'not_marked',
                'status_color': status_color,
                'total_students': attendance.total_students if attendance else classroom.students.count(),
                'present_count': attendance.present_count if attendance else 0,
                'absent_count': attendance.absent_count if attendance else 0,
                'percentage': attendance.attendance_percentage if attendance else 0
            })
        
        return Response(metrics)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_attendance_list(request):
    """
    Get list of attendance records for dashboard
    """
    try:
        # Get attendance records from last 30 days
        thirty_days_ago = timezone.now().date() - timedelta(days=30)
        
        attendances = Attendance.objects.filter(
            date__gte=thirty_days_ago,
            is_deleted=False
        ).select_related('classroom').order_by('-date')
        
        # Serialize the data
        serializer = AttendanceSerializer(attendances, many=True)
        
        return Response(serializer.data, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
