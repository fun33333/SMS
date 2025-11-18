from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db.models import Q
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
from coordinator.models import Coordinator
from notifications.services import create_notification
from .services.alerts import process_consecutive_absence_alerts
from .services.holiday_utils import (
    collect_shifts_from_levels,
    normalize_shift_value,  
    resolve_allowed_shifts,
    validate_grades_for_levels,
    validate_levels_for_shift,
)


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
        
        # Check if date is a holiday (support multiple levels and grade-specific)
        from .models import Holiday
        level = classroom.grade.level if classroom.grade else None
        grade = classroom.grade if classroom.grade else None
        
        if level:
            # Check for holidays matching this level and date
            holidays = Holiday.objects.filter(
                date=date
            ).filter(
                Q(levels=level) | Q(level=level)  # Support both old and new fields
            ).distinct()
            
            # Check if any holiday applies to this classroom
            for holiday in holidays:
                # If holiday has specific grades, check if this classroom's grade is included
                if holiday.grades.exists():
                    if grade and grade in holiday.grades.all():
                        return Response({
                            'error': f'This date is a holiday: {holiday.reason}. Attendance marking is disabled.',
                            'is_holiday': True,
                            'holiday_reason': holiday.reason
                        }, status=status.HTTP_400_BAD_REQUEST)
                else:
                    # No specific grades - applies to all grades in the level
                    return Response({
                        'error': f'This date is a holiday: {holiday.reason}. Attendance marking is disabled.',
                        'is_holiday': True,
                        'holiday_reason': holiday.reason
                    }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get teacher from request user
        try:
            # Find teacher by employee code (username) since there's no direct relationship
            from teachers.models import Teacher
            teacher = Teacher.objects.get(employee_code=request.user.username)
        except Teacher.DoesNotExist:
            teacher = None
        
        with transaction.atomic():
            # Create or get attendance record
            # marked_by must be a User instance, not Teacher
            if teacher and hasattr(teacher, 'user') and teacher.user is not None:
                marked_by_user = teacher.user
            else:
                marked_by_user = request.user
            attendance, created = Attendance.objects.get_or_create(
                classroom=classroom,
                date=date,
                defaults={
                    'marked_by': marked_by_user,
                    'status': 'under_review',
                    'submitted_at': timezone.now(),
                    'submitted_by': request.user
                }
            )
            
            # If attendance already exists, update status to under_review
            if not created:
                attendance.status = 'under_review'
                attendance.submitted_at = timezone.now()
                attendance.submitted_by = request.user
                attendance.marked_by = marked_by_user
            
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
            
            # Save attendance with updated status
            attendance.save()
            
            # Add edit history after saving
            attendance.add_edit_history(request.user, 'marked', 'Attendance marked and submitted for review')

            # Trigger consecutive absence alerts for class teacher
            try:
                alerts = process_consecutive_absence_alerts(attendance)
                if alerts:
                    print(f"[INFO] Consecutive absence alerts generated: {[alert.student_name for alert in alerts]}")
            except Exception as alert_error:
                print(f"[WARN] Failed to process consecutive absence alerts: {alert_error}")

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
        
        # Check if date is a holiday (support multiple levels and grade-specific)
        from .models import Holiday
        level = classroom.grade.level if classroom.grade else None
        grade = classroom.grade if classroom.grade else None
        
        if level:
            # Check for holidays matching this level and date
            holidays = Holiday.objects.filter(
                date=date_obj
            ).filter(
                Q(levels=level) | Q(level=level)  # Support both old and new fields
            ).distinct()
            
            # Check if any holiday applies to this classroom
            for holiday in holidays:
                is_holiday = False
                # If holiday has specific grades, check if this classroom's grade is included
                if holiday.grades.exists():
                    if grade and grade in holiday.grades.all():
                        is_holiday = True
                else:
                    # No specific grades - applies to all grades in the level
                    is_holiday = True
                
                if is_holiday:
                    try:
                        is_teacher = request.user.is_teacher()
                    except Exception:
                        is_teacher = False
                    if is_teacher and not request.user.is_superuser:
                        return Response({
                            'error': f'This date is a holiday: {holiday.reason}. Attendance marking is disabled.',
                            'is_holiday': True,
                            'holiday_reason': holiday.reason
                        }, status=status.HTTP_400_BAD_REQUEST)
        
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
        
        # Get all students in this class (non-deleted students)
        # Removed is_active filter to ensure all students appear consistently
        all_students = Student.objects.filter(classroom=classroom, is_deleted=False)
        all_student_ids = list(all_students.values_list('id', flat=True))
        
        with transaction.atomic():
            # Get teacher from request user
            teacher = None
            try:
                teacher = Teacher.objects.get(employee_code=request.user.username)
            except Teacher.DoesNotExist:
                pass
            
            # Create or get attendance record
            # marked_by must be a User instance, not Teacher
            if teacher and hasattr(teacher, 'user') and teacher.user is not None:
                marked_by_user = teacher.user
            else:
                marked_by_user = request.user
            attendance, created = Attendance.objects.get_or_create(
                classroom=classroom,
                date=date_obj,
                defaults={
                    'marked_by': marked_by_user,
                    'status': 'under_review',
                    'submitted_at': timezone.now(),
                    'submitted_by': request.user
                }
            )
            
            # If attendance already exists, update status to under_review
            if not created:
                attendance.status = 'under_review'
                attendance.submitted_at = timezone.now()
                attendance.submitted_by = request.user
                attendance.marked_by = marked_by_user
            
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
            
            # Save attendance with updated status
            attendance.save()
            
            # Add edit history after saving
            attendance.add_edit_history(request.user, 'marked', 'Attendance marked and submitted for review')
            
            # Trigger consecutive absence alerts for class teacher
            try:
                alerts = process_consecutive_absence_alerts(attendance)
                if alerts:
                    print(f"[INFO] Consecutive absence alerts generated: {[alert.student_name for alert in alerts]}")
            except Exception as alert_error:
                print(f"[WARN] Failed to process consecutive absence alerts: {alert_error}")

            # Send notification to coordinator
            try:
                # Teacher already retrieved above
                
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
            serializer = AttendanceSerializer(attendance, context={'request': request})
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
        serializer = AttendanceSerializer(attendance_records, many=True, context={'request': request})
        return Response(serializer.data)
    else:
        # Get all attendance records for the class
        attendance_records = Attendance.objects.filter(
            classroom=classroom
        ).prefetch_related('student_attendances__student').order_by('-date')
        serializer = AttendanceSerializer(attendance_records, many=True, context={'request': request})
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
    
    # Filter students: only non-deleted students should appear in attendance
    # Removed is_active filter to match student list view - all non-deleted students should be visible
    students = Student.objects.filter(classroom=classroom, is_deleted=False).order_by('name')
    
    student_data = []
    for student in students:
        student_data.append({
            'id': student.id,
            'name': student.name,
            'father_name': student.father_name,
            'father_cnic': student.father_cnic,
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
                    # Teachers can edit under_review attendance within 7 days
                    if attendance.status == 'under_review':
                        days_diff = (timezone.now().date() - attendance.date).days
                        if days_diff <= 7:
                            can_edit = True
                            edit_reason = "Teacher edit within 7 days"
                        else:
                            return Response({
                                'error': f'Cannot edit attendance older than 7 days. This attendance is {days_diff} days old.'
                            }, status=status.HTTP_403_FORBIDDEN)
                    elif attendance.status == 'approved':
                        return Response({
                            'error': 'Cannot edit approved attendance. Please contact your coordinator if changes are needed.'
                        }, status=status.HTTP_403_FORBIDDEN)
                    else:
                        # For draft or submitted (legacy), allow edit but convert to under_review
                        days_diff = (timezone.now().date() - attendance.date).days
                        if days_diff <= 7:
                            can_edit = True
                            edit_reason = "Teacher edit within 7 days"
                        else:
                            return Response({
                                'error': f'Cannot edit attendance older than 7 days. This attendance is {days_diff} days old.'
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
            
            # Update status and marked_by if it's a teacher
            teacher = None
            if user.is_teacher():
                # Keep status as under_review if not approved
                if attendance.status != 'approved':
                    attendance.status = 'under_review'
                    attendance.submitted_at = timezone.now()
                    attendance.submitted_by = user
                
                # Get teacher for notification
                # marked_by must be a User instance, not Teacher
                try:
                    teacher = Teacher.objects.get(employee_code=user.username)
                    # Use teacher.user if available, otherwise use user
                    if hasattr(teacher, 'user') and teacher.user is not None:
                        attendance.marked_by = teacher.user
                    else:
                        attendance.marked_by = user
                except Teacher.DoesNotExist:
                    print(f"[WARN] Teacher not found for user {user.username}")
                    attendance.marked_by = user
                    pass
                
                # Save only specific fields to avoid updating created_at
                attendance.save(update_fields=['marked_by', 'status', 'submitted_at', 'submitted_by', 'updated_at'])
            
        # Trigger consecutive absence alerts for class teacher
        try:
            alerts = process_consecutive_absence_alerts(attendance)
            if alerts:
                print(f"[INFO] Consecutive absence alerts generated: {[alert.student_name for alert in alerts]}")
        except Exception as alert_error:
            print(f"[WARN] Failed to process consecutive absence alerts: {alert_error}")

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
        serializer = AttendanceSerializer(attendance, context={'request': request})
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
            
            # Use serializer to get display_status
            serializer = AttendanceSerializer(attendance, context={'request': request})
            serializer_data = serializer.data
            
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
                'status': attendance.status,
                'display_status': serializer_data.get('display_status', attendance.status),
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
            coordinator = Coordinator.get_for_user(user)
            if not coordinator:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

            managed_level_ids = set()
            if hasattr(coordinator, "assigned_levels") and coordinator.assigned_levels.exists():
                managed_level_ids.update(coordinator.assigned_levels.values_list('id', flat=True))
            if coordinator.level_id:
                managed_level_ids.add(coordinator.level_id)

            if not managed_level_ids:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

            if level_id not in managed_level_ids:
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
                try:
                    # Safely get attendance percentages, handling None values
                    percentages = []
                    for att in attendances:
                        try:
                            pct = att.attendance_percentage
                            if pct is not None and not (isinstance(pct, float) and (pct != pct)):  # Check for NaN
                                percentages.append(pct)
                        except (ZeroDivisionError, TypeError, AttributeError):
                            continue
                    
                    if percentages:
                        total_percentage = sum(percentages)
                        avg_percentage = total_percentage / len(percentages)
                except (ZeroDivisionError, TypeError):
                    avg_percentage = 0
            
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
        try:
            total_attendance = total_present + total_absent
            if total_attendance > 0:
                overall_percentage = round((total_present / total_attendance) * 100, 2)
        except (ZeroDivisionError, TypeError):
            overall_percentage = 0
        
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
            
            # Send notification to teacher
            try:
                teacher_user = None
                teacher = None
                
                # Get teacher from marked_by or from classroom
                if attendance.marked_by:
                    teacher_user = attendance.marked_by
                    # Try to find teacher profile
                    try:
                        teacher = Teacher.objects.get(user=teacher_user)
                    except Teacher.DoesNotExist:
                        # Try by employee_code
                        try:
                            teacher = Teacher.objects.get(employee_code=teacher_user.username)
                        except Teacher.DoesNotExist:
                            pass
                elif attendance.classroom and attendance.classroom.class_teacher:
                    teacher = attendance.classroom.class_teacher
                    if teacher and teacher.user:
                        teacher_user = teacher.user
                
                if teacher_user:
                    coordinator_name = coordinator.full_name if coordinator else request.user.get_full_name() or request.user.username
                    classroom_name = str(attendance.classroom)
                    verb = "Your attendance has been approved"
                    target_text = f"by {coordinator_name} for {classroom_name} on {attendance.date.strftime('%B %d, %Y')}."
                    
                    create_notification(
                        recipient=teacher_user,
                        actor=request.user,
                        verb=verb,
                        target_text=target_text,
                        data={
                            'attendance_id': attendance.id,
                            'classroom_id': attendance.classroom.id,
                            'classroom_name': classroom_name,
                            'date': str(attendance.date),
                            'coordinator_name': coordinator_name,
                            'action': 'approved'
                        }
                    )
                    print(f"[OK] Sent approval notification to teacher {teacher.full_name if teacher else teacher_user.get_full_name()} (user: {teacher_user.email})")
                else:
                    print(f"[WARN] No teacher user found for attendance {attendance.id} (marked_by: {attendance.marked_by}, classroom: {attendance.classroom})")
            except Exception as notif_error:
                print(f"[WARN] Failed to send approval notification: {notif_error}")
                import traceback
                print(f"[WARN] Traceback: {traceback.format_exc()}")
                # Don't fail the approval if notification fails
        
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
    """Coordinator creates holiday for their level(s) with optional grade selection"""
    try:
        date_str = request.data.get('date')
        reason = request.data.get('reason')
        # Support both old single level_id and new level_ids array
        level_id = request.data.get('level_id')  # Backward compatibility
        level_ids = request.data.get('level_ids', [])  # New: multiple levels
        grade_ids = request.data.get('grade_ids', [])  # New: optional grades
        shift_value = request.data.get('shift')
        allowed_shifts = resolve_allowed_shifts(shift_value)

        if not all([date_str, reason]):
            return Response({'error': 'Date and reason required'}, status=status.HTTP_400_BAD_REQUEST)

        from coordinator.models import Coordinator
        from classes.models import Level, Grade
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

        # Determine which levels to use
        target_levels = []

        # Handle backward compatibility: if level_id provided, convert to level_ids
        if level_id and not level_ids:
            level_ids = [level_id]

        if level_ids:
            # Coordinator selected specific level(s)
            for lid in level_ids:
                target_level = get_object_or_404(Level, id=lid)
                # Verify coordinator has access to this level
                allowed = False
                if coordinator.shift == 'both':
                    if coordinator.assigned_levels.exists():
                        if target_level in coordinator.assigned_levels.all():
                            allowed = True
                    elif coordinator.level == target_level:
                        allowed = True
                else:
                    if coordinator.level == target_level:
                        allowed = True

                if not allowed and not request.user.is_superuser:
                    return Response({'error': f'Access denied to level {target_level.name}'}, status=status.HTTP_403_FORBIDDEN)

                target_levels.append(target_level)
        else:
            # Use coordinator's default level
            if coordinator.shift == 'both' and coordinator.assigned_levels.exists():
                return Response({'error': 'level_ids is required for coordinators with multiple levels'}, status=status.HTTP_400_BAD_REQUEST)
            if coordinator.level:
                target_levels = [coordinator.level]
            else:
                return Response({'error': 'No level assigned to coordinator'}, status=status.HTTP_400_BAD_REQUEST)

        if not target_levels:
            return Response({'error': 'At least one level must be selected'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_levels_for_shift(target_levels, allowed_shifts)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()

        from .models import Holiday, AuditLog
        from classes.models import ClassRoom
        from django.utils import timezone

        # Validate grades if provided
        target_grades = []
        if grade_ids:
            for gid in grade_ids:
                grade = get_object_or_404(Grade, id=gid)
                # Verify grade belongs to one of the selected levels
                if grade.level not in target_levels:
                    return Response({'error': f'Grade {grade.name} does not belong to selected levels'}, status=status.HTTP_400_BAD_REQUEST)
                target_grades.append(grade)
        try:
            validate_grades_for_levels(target_grades, target_levels)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Check if date is in the past and archive existing attendance
        if date_obj < timezone.now().date():
            # Determine which classrooms to archive
            if target_grades:
                # Archive only classrooms in selected grades
                classrooms = ClassRoom.objects.filter(grade__in=target_grades)
            else:
                # Archive all classrooms in selected levels
                classrooms = ClassRoom.objects.filter(grade__level__in=target_levels)

            for classroom in classrooms:
                try:
                    existing_attendance = Attendance.objects.get(
                        classroom=classroom,
                        date=date_obj,
                        is_deleted=False
                    )

                    # Archive the attendance data
                    student_attendance_list = []
                    for sa in existing_attendance.student_attendances.all():
                        student_attendance_list.append({
                            'id': sa.id,
                            'student_id': sa.student_id,
                            'status': sa.status,
                            'remarks': sa.remarks or '',
                            'created_at': sa.created_at.isoformat() if sa.created_at else None,
                            'updated_at': sa.updated_at.isoformat() if sa.updated_at else None,
                        })

                    archived_data = {
                        'student_attendance': student_attendance_list,
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
                    pass

        # Create holiday (use first level for backward compatibility in level field)
        holiday = Holiday.objects.create(
            date=date_obj,
            reason=reason,
            level=target_levels[0] if target_levels else None,
            created_by=request.user
        )

        # Assign relationships
        holiday.levels.set(target_levels)
        if target_grades:
            holiday.grades.set(target_grades)
        holiday.shifts = sorted(collect_shifts_from_levels(target_levels))
        holiday.save()

        AuditLog.objects.create(
            feature='attendance',
            action='create',
            entity_type='Holiday',
            entity_id=holiday.id,
            user=request.user,
            ip_address=request.META.get('REMOTE_ADDR'),
            reason=reason
        )

        # Notifications are handled centrally via signals
        return Response({'message': 'Holiday created', 'holiday_id': holiday.id})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_holidays(request):
    """Get holidays for user's level(s) with optional grade filtering"""
    try:
        level_id = request.query_params.get('level_id')
        level_ids = request.query_params.getlist('level_ids')  # Support multiple level_ids
        grade_id = request.query_params.get('grade_id')
        grade_ids = request.query_params.getlist('grade_ids')  # Support multiple grade_ids
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        shift_param = request.query_params.get('shift')
        allowed_shifts = resolve_allowed_shifts(shift_param)
        
        from .models import Holiday
        from classes.models import Level
        
        # Build query - support both old (level) and new (levels) fields
        holidays = Holiday.objects.all()
        
        # Filter by level(s)
        if level_ids:
            # New: filter by multiple levels using levels M2M
            holidays = holidays.filter(
                Q(levels__id__in=level_ids) | Q(level_id__in=level_ids)
            ).distinct()
        elif level_id:
            # Backward compatibility: single level
            holidays = holidays.filter(
                Q(levels__id=level_id) | Q(level_id=level_id)
            ).distinct()
        
        if allowed_shifts:
            holidays = holidays.filter(
                Q(levels__shift__in=allowed_shifts) |
                Q(level__shift__in=allowed_shifts) |
                Q(shifts__contains=sorted(allowed_shifts))
            ).distinct()

        # Filter by grade(s) if provided
        if grade_ids:
            holidays = holidays.filter(grades__id__in=grade_ids).distinct()
        elif grade_id:
            holidays = holidays.filter(grades__id=grade_id).distinct()
        
        if start_date:
            holidays = holidays.filter(date__gte=start_date)
        if end_date:
            holidays = holidays.filter(date__lte=end_date)
        
        # Serialize holidays with levels and grades
        data = []
        for h in holidays:
            # Get all levels (from levels M2M or fallback to level field)
            holiday_levels = list(h.levels.all())
            if not holiday_levels and h.level:
                holiday_levels = [h.level]
            
            # Get all grades
            holiday_grades = list(h.grades.all())

            holiday_shifts = h.shifts or sorted(collect_shifts_from_levels(holiday_levels))
            
            holiday_data = {
                'id': h.id,
                'date': h.date.strftime('%Y-%m-%d'),
                'reason': h.reason,
                'level_id': holiday_levels[0].id if holiday_levels else None,  # Backward compatibility
                'level_name': str(holiday_levels[0]) if holiday_levels else None,
                'level_ids': [l.id for l in holiday_levels],
                'level_names': [str(l) for l in holiday_levels],
                'grade_ids': [g.id for g in holiday_grades],
                'grade_names': [g.name for g in holiday_grades],
                'shifts': holiday_shifts,
                'created_by': h.created_by.get_full_name() if h.created_by else None
            }
            data.append(holiday_data)
        
        return Response(data)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_holiday(request, holiday_id):
    """Update existing holiday"""
    try:
        from .models import Holiday, AuditLog
        from coordinator.models import Coordinator
        from classes.models import ClassRoom
        from django.utils import timezone
        
        holiday = get_object_or_404(Holiday, id=holiday_id)
        
        # Verify coordinator has access to this holiday's level(s)
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get holiday levels (from levels M2M or fallback to level field)
        holiday_levels = list(holiday.levels.all())
        if not holiday_levels and holiday.level:
            holiday_levels = [holiday.level]
        
        # Check if coordinator manages any of the holiday's levels
        allowed = False
        if coordinator.shift == 'both':
            if coordinator.assigned_levels.exists():
                if any(level in coordinator.assigned_levels.all() for level in holiday_levels):
                    allowed = True
            elif coordinator.level in holiday_levels:
                allowed = True
        else:
            if coordinator.level in holiday_levels:
                allowed = True
        
        if not allowed and not request.user.is_superuser:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Check if holiday can be edited (must be at least 12 hours before holiday date)
        holiday_date = holiday.date
        # Create datetime at start of holiday date (midnight)
        holiday_datetime = timezone.make_aware(datetime.combine(holiday_date, datetime.min.time()))
        # Calculate 12 hours before holiday date
        twelve_hours_before = holiday_datetime - timedelta(hours=12)
        
        if timezone.now() >= twelve_hours_before:
            return Response({
                'error': f'Cannot edit holiday within 12 hours of the holiday date. Holiday is on {holiday_date.strftime("%B %d, %Y")}.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        date_str = request.data.get('date')
        reason = request.data.get('reason')
        # Support both old single level_id and new level_ids array
        level_id = request.data.get('level_id')  # Backward compatibility
        level_ids = request.data.get('level_ids', [])  # New: multiple levels
        grade_ids = request.data.get('grade_ids', [])  # New: optional grades
        shift_value = request.data.get('shift')
        allowed_shifts = resolve_allowed_shifts(shift_value)
        
        if not all([date_str, reason]):
            return Response({'error': 'Date and reason required'}, status=status.HTTP_400_BAD_REQUEST)
        
        from classes.models import Level, Grade
        
        # Handle backward compatibility: if level_id provided, convert to level_ids
        if level_id and not level_ids:
            level_ids = [level_id]
        
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        old_date = holiday.date
        old_levels = list(holiday.levels.all())
        if not old_levels and holiday.level:
            old_levels = [holiday.level]
        old_grades = list(holiday.grades.all())
        
        # Determine new levels
        new_levels = []
        if level_ids:
            for lid in level_ids:
                level = get_object_or_404(Level, id=lid)
                # Verify coordinator has access
                allowed = False
                if coordinator.shift == 'both':
                    if coordinator.assigned_levels.exists():
                        if level in coordinator.assigned_levels.all():
                            allowed = True
                    elif coordinator.level == level:
                        allowed = True
                else:
                    if coordinator.level == level:
                        allowed = True
                
                if not allowed and not request.user.is_superuser:
                    return Response({'error': f'Access denied to level {level.name}'}, status=status.HTTP_403_FORBIDDEN)
                
                new_levels.append(level)
        else:
            # Keep existing levels
            new_levels = old_levels

        try:
            validate_levels_for_shift(new_levels, allowed_shifts)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate grades if provided
        new_grades = []
        if grade_ids:
            for gid in grade_ids:
                grade = get_object_or_404(Grade, id=gid)
                # Verify grade belongs to one of the selected levels
                if grade.level not in new_levels:
                    return Response({'error': f'Grade {grade.name} does not belong to selected levels'}, status=status.HTTP_400_BAD_REQUEST)
                new_grades.append(grade)
        try:
            validate_grades_for_levels(new_grades, new_levels)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        
        # If date or levels/grades changed, handle existing attendance
        levels_changed = set([l.id for l in old_levels]) != set([l.id for l in new_levels])
        grades_changed = set([g.id for g in old_grades]) != set([g.id for g in new_grades])
        
        if date_obj != old_date or levels_changed or grades_changed:
            # Archive attendance for old date/levels/grades if in past
            if old_date < timezone.now().date():
                # Determine which classrooms to restore
                if old_grades:
                    # Restore only classrooms in old grades
                    classrooms = ClassRoom.objects.filter(grade__in=old_grades)
                else:
                    # Restore all classrooms in old levels
                    classrooms = ClassRoom.objects.filter(grade__level__in=old_levels)
                
                for classroom in classrooms:
                    try:
                        existing_attendance = Attendance.objects.get(
                            classroom=classroom,
                            date=old_date,
                            is_deleted=False,
                            replaced_by_holiday=True
                        )
                        # Restore archived attendance if it exists
                        if existing_attendance.archived_data:
                            existing_attendance.replaced_by_holiday = False
                            existing_attendance.save()
                    except Attendance.DoesNotExist:
                        pass
            
            # Archive attendance for new date/levels/grades if in past
            if date_obj < timezone.now().date():
                # Determine which classrooms to archive
                if new_grades:
                    # Archive only classrooms in new grades
                    classrooms = ClassRoom.objects.filter(grade__in=new_grades)
                else:
                    # Archive all classrooms in new levels
                    classrooms = ClassRoom.objects.filter(grade__level__in=new_levels)
                
                for classroom in classrooms:
                    try:
                        existing_attendance = Attendance.objects.get(
                            classroom=classroom,
                            date=date_obj,
                            is_deleted=False
                        )
                        # Archive the attendance data
                        student_attendance_list = []
                        for sa in existing_attendance.student_attendances.all():
                            student_attendance_list.append({
                                'id': sa.id,
                                'student_id': sa.student_id,
                                'status': sa.status,
                                'remarks': sa.remarks or '',
                                'created_at': sa.created_at.isoformat() if sa.created_at else None,
                                'updated_at': sa.updated_at.isoformat() if sa.updated_at else None,
                            })
                        
                        archived_data = {
                            'student_attendance': student_attendance_list,
                            'marked_by': existing_attendance.marked_by.get_full_name() if existing_attendance.marked_by else None,
                            'marked_at': existing_attendance.marked_at.isoformat(),
                            'status': existing_attendance.status,
                            'total_students': existing_attendance.total_students,
                            'present_count': existing_attendance.present_count,
                            'absent_count': existing_attendance.absent_count,
                            'late_count': existing_attendance.late_count,
                            'leave_count': existing_attendance.leave_count
                        }
                        existing_attendance.replaced_by_holiday = True
                        existing_attendance.replaced_at = timezone.now()
                        existing_attendance.archived_data = archived_data
                        existing_attendance.save()
                    except Attendance.DoesNotExist:
                        pass
        
        # Update holiday
        holiday.date = date_obj
        holiday.reason = reason
        # Update level for backward compatibility (use first level)
        holiday.level = new_levels[0] if new_levels else None
        holiday.save()
        
        # Update levels M2M
        holiday.levels.set(new_levels)
        
        # Update grades M2M
        holiday.grades.set(new_grades)

        # Store resolved shifts
        holiday.shifts = sorted(collect_shifts_from_levels(new_levels))
        
        holiday.save()
        
        AuditLog.objects.create(
            feature='attendance',
            action='update',
            entity_type='Holiday',
            entity_id=holiday.id,
            user=request.user,
            ip_address=request.META.get('REMOTE_ADDR'),
            reason=reason
        )
        
        return Response({'message': 'Holiday updated successfully', 'holiday_id': holiday.id})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_holiday(request, holiday_id):
    """Delete holiday and optionally restore archived attendance"""
    try:
        from .models import Holiday, AuditLog
        from coordinator.models import Coordinator
        from classes.models import ClassRoom
        from django.utils import timezone

        holiday = get_object_or_404(Holiday, id=holiday_id)

        # Verify coordinator has access
        coordinator = Coordinator.get_for_user(request.user)
        if not coordinator:
            return Response({'error': 'Coordinator profile not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check if coordinator manages this holiday
        holiday_levels = list(holiday.levels.all())
        if not holiday_levels and holiday.level:
            holiday_levels = [holiday.level]

        allowed = False
        if coordinator.shift == 'both':
            if coordinator.assigned_levels.exists():
                if any(level in coordinator.assigned_levels.all() for level in holiday_levels):
                    allowed = True
            elif holiday.level and coordinator.level == holiday.level:
                allowed = True
        else:
            if holiday.level and coordinator.level == holiday.level:
                allowed = True

        if not allowed and not request.user.is_superuser:
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

        # Check if holiday can be deleted (must be at least 12 hours before holiday date)
        holiday_date = holiday.date
        holiday_datetime = timezone.make_aware(datetime.combine(holiday_date, datetime.min.time()))
        twelve_hours_before = holiday_datetime - timedelta(hours=12)
        if timezone.now() >= twelve_hours_before:
            return Response({'error': 'Cannot delete holiday within 12 hours of the holiday date.'}, status=status.HTTP_403_FORBIDDEN)

        restore_attendance = request.data.get('restore_attendance', False)

        # Restore archived attendance if requested
        if restore_attendance:
            classrooms = ClassRoom.objects.filter(grade__level__in=holiday_levels)
            for classroom in classrooms:
                try:
                    attendance = Attendance.objects.get(
                        classroom=classroom,
                        date=holiday_date,
                        is_deleted=False,
                        replaced_by_holiday=True
                    )
                    attendance.replaced_by_holiday = False
                    attendance.replaced_at = None
                    attendance.save()
                except Attendance.DoesNotExist:
                    continue

        holiday.delete()

        AuditLog.objects.create(
            feature='attendance',
            action='delete',
            entity_type='Holiday',
            entity_id=holiday_id,
            user=request.user,
            ip_address=request.META.get('REMOTE_ADDR'),
            reason=f'Deleted holiday: {holiday.reason}'
        )

        # Notifications handled via signals
        return Response({'message': 'Holiday deleted successfully'})
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
        serializer = AttendanceSerializer(attendances, many=True, context={'request': request})
        
        return Response(serializer.data, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
