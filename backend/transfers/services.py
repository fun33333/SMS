from datetime import datetime
from django.db import transaction
from django.contrib.auth.models import User

from .models import IDHistory, TransferRequest, ClassTransfer, ShiftTransfer, TransferApproval, GradeSkipTransfer


def emit_transfer_event(event_type: str, payload: dict) -> None:
    """
    Lightweight event emitter for transfer-related domain events.
    Right now this just logs to stdout; in future it can publish to Redis/Kafka.
    """
    try:
        # Keep payload small in logs
        trimmed = {k: payload.get(k) for k in list(payload.keys())[:10]}
        print(f"[TRANSFER_EVENT] {event_type}: {trimmed}")
    except Exception:
        # Never break business logic because of logging issues
        pass


class IDUpdateService:
    """Service class for handling ID updates during transfers."""

    @staticmethod
    def parse_id(id_string):
        """Parse ID string and return components."""
        parts = id_string.split('-')
        if len(parts) >= 3:
            return {
                'campus_code': parts[0],
                'shift': parts[1],
                'year': parts[2],
                'suffix': parts[-1] if len(parts) > 3 else '',
                'role': parts[3] if len(parts) > 4 else None,
            }
        return None

    @staticmethod
    def generate_new_id(old_id, new_campus_code, new_shift, new_year=None, new_role=None):
        """Generate new ID based on old ID and new parameters."""
        parsed = IDUpdateService.parse_id(old_id)
        if not parsed:
            return None

        # Use current year if not provided
        if new_year is None:
            new_year = str(datetime.now().year)[-2:]

        # Preserve immutable suffix
        immutable_suffix = parsed['suffix']

        # For teachers, include role
        if new_role:
            return f"{new_campus_code}-{new_shift}-{new_year}-{new_role}-{immutable_suffix}"
        return f"{new_campus_code}-{new_shift}-{new_year}-{immutable_suffix}"

    @staticmethod
    @transaction.atomic
    def update_student_id(student, new_campus, new_shift, transfer_request, changed_by, reason):
        """Update student ID and create history record."""
        old_id = student.student_id
        parsed = IDUpdateService.parse_id(old_id)

        if not parsed:
            raise ValueError(f"Invalid student ID format: {old_id}")

        # Generate new ID
        new_id = IDUpdateService.generate_new_id(
            old_id,
            new_campus.campus_code,
            new_shift,
            str(datetime.now().year)[-2:],
        )

        if not new_id:
            raise ValueError("Failed to generate new student ID")

        # Create history record
        history = IDHistory.objects.create(
            entity_type='student',
            student=student,
            old_id=old_id,
            old_campus_code=parsed['campus_code'],
            old_shift=parsed['shift'],
            old_year=parsed['year'],
            new_id=new_id,
            new_campus_code=new_campus.campus_code,
            new_shift=new_shift,
            new_year=str(datetime.now().year)[-2:],
            immutable_suffix=parsed['suffix'],
            transfer_request=transfer_request,
            changed_by=changed_by,
            change_reason=reason,
        )

        # Update student
        student.student_id = new_id
        student.campus = new_campus
        # Student.shift is stored as 'morning' / 'afternoon', while new_shift is 'M' / 'A'
        student.shift = 'morning' if new_shift == 'M' else 'afternoon'
        student.save()

        return {
            'new_id': new_id,
            'history': history,
        }

    @staticmethod
    @transaction.atomic
    def update_teacher_id(teacher, new_campus, new_shift, new_role, transfer_request, changed_by, reason):
        """Update teacher ID and create history record."""
        old_id = teacher.employee_code
        parsed = IDUpdateService.parse_id(old_id)

        if not parsed:
            raise ValueError(f"Invalid teacher ID format: {old_id}")

        # Generate new ID
        new_id = IDUpdateService.generate_new_id(
            old_id,
            new_campus.campus_code,
            new_shift,
            str(datetime.now().year)[-2:],
            new_role,
        )

        if not new_id:
            raise ValueError("Failed to generate new teacher ID")

        # Create history record
        history = IDHistory.objects.create(
            entity_type='teacher',
            teacher=teacher,
            old_id=old_id,
            old_campus_code=parsed['campus_code'],
            old_shift=parsed['shift'],
            old_year=parsed['year'],
            new_id=new_id,
            new_campus_code=new_campus.campus_code,
            new_shift=new_shift,
            new_year=str(datetime.now().year)[-2:],
            immutable_suffix=parsed['suffix'],
            transfer_request=transfer_request,
            changed_by=changed_by,
            change_reason=reason,
        )

        # Update teacher
        teacher.employee_code = new_id
        teacher.current_campus = new_campus
        teacher.shift = 'morning' if new_shift == 'M' else 'afternoon'
        teacher.role = new_role
        teacher.save()

        return {
            'new_id': new_id,
            'history': history,
        }

    @staticmethod
    def preview_id_change(old_id, new_campus_code, new_shift, new_role=None):
        """Preview what the new ID would look like without making changes."""
        parsed = IDUpdateService.parse_id(old_id)
        if not parsed:
            return None

        new_id = IDUpdateService.generate_new_id(
            old_id,
            new_campus_code,
            new_shift,
            str(datetime.now().year)[-2:],
            new_role,
        )

        return {
            'old_id': old_id,
            'new_id': new_id,
            'changes': {
                'campus_code': f"{parsed['campus_code']} → {new_campus_code}",
                'shift': f"{parsed['shift']} → {new_shift}",
                'year': f"{parsed['year']} → {str(datetime.now().year)[-2:]}",
                'role': f"{parsed.get('role', 'N/A')} → {new_role}" if new_role else None,
                'suffix': f"{parsed['suffix']} (preserved)",
            },
        }


@transaction.atomic
def apply_class_transfer(class_transfer: ClassTransfer, changed_by: User):
    """
    Apply a class transfer by moving the student to the new classroom.
    Does not touch IDs.
    """
    student = class_transfer.student
    from_classroom = class_transfer.from_classroom or student.classroom
    to_classroom = class_transfer.to_classroom

    if not to_classroom:
        raise ValueError("Destination classroom is required to apply class transfer.")

    # Cache labels for audit
    if from_classroom:
        class_transfer.from_section = from_classroom.section
        class_transfer.from_grade_name = from_classroom.grade.name
    if to_classroom:
        class_transfer.to_section = to_classroom.section
        class_transfer.to_grade_name = to_classroom.grade.name

    # Move student
    student.classroom = to_classroom
    # Keep campus/grade/section fields aligned where possible
    if to_classroom.grade and to_classroom.grade.level and to_classroom.grade.level.campus:
        student.campus = to_classroom.grade.level.campus
    student.current_grade = to_classroom.grade.name
    student.section = to_classroom.section
    # Mark actor and skip generic student profile notifications
    student._actor = changed_by
    student._skip_notifications = True
    student.save()

    class_transfer.save()

    # Send notification to destination class teacher
    try:
        from notifications.services import create_notification
        from django.contrib.auth import get_user_model
        UserModel = get_user_model()
        
        # Get coordinator name (from changed_by or class_transfer coordinator)
        coordinator_name = "Coordinator"
        if hasattr(changed_by, 'coordinator'):
            coordinator_name = changed_by.coordinator.full_name if changed_by.coordinator else "Coordinator"
        elif class_transfer.coordinator:
            coordinator_name = class_transfer.coordinator.full_name
        
        # Get class teacher user
        if to_classroom.class_teacher:
            class_teacher = to_classroom.class_teacher
            teacher_user = getattr(class_teacher, 'user', None)
            if not teacher_user and class_teacher.employee_code:
                teacher_user = UserModel.objects.filter(username=class_teacher.employee_code).first()
            if not teacher_user and class_teacher.email:
                teacher_user = UserModel.objects.filter(email__iexact=class_teacher.email).first()
            
            if teacher_user:
                verb = f"{coordinator_name} has assigned new student {student.name} in your class by transfer request"
                target_text = f"{to_classroom.grade.name} - {to_classroom.section} ({to_classroom.shift})"
                create_notification(
                    recipient=teacher_user,
                    actor=changed_by,
                    verb=verb,
                    target_text=target_text,
                    data={
                        "type": "class_transfer.student_assigned",
                        "class_transfer_id": class_transfer.id,
                        "student_id": student.id,
                        "classroom_id": to_classroom.id,
                    },
                )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send notification to class teacher for class transfer {class_transfer.id}: {str(e)}")

    emit_transfer_event(
        'class_transfer.applied',
        {
            'student_id': student.id,
            'class_transfer_id': class_transfer.id,
            'from_classroom_id': from_classroom.id if from_classroom else None,
            'to_classroom_id': to_classroom.id,
            'changed_by_id': changed_by.id if changed_by else None,
        },
    )


@transaction.atomic
def link_and_apply_shift_transfer(
    shift_transfer: ShiftTransfer,
    transfer_request: TransferRequest,
    changed_by: User,
    reason: str,
):
    """
    Link a ShiftTransfer to a TransferRequest and apply the resulting ID + campus/shift changes.
    This function is called after all approvals are complete.
    Immediately moves student to new shift and classroom.
    """
    student = shift_transfer.student
    campus = shift_transfer.campus

    # Convert 'morning'/'afternoon' to ID shift codes 'M'/'A'
    target_shift_code = 'M' if shift_transfer.to_shift == 'morning' else 'A'

    # Update student ID (this also updates shift and campus)
    result = IDUpdateService.update_student_id(
        student=student,
        new_campus=campus,
        new_shift=target_shift_code,
        transfer_request=transfer_request,
        changed_by=changed_by,
        reason=reason,
    )
    
    # Note: IDUpdateService.update_student_id already updates:
    # - student.student_id (new ID with new shift code)
    # - student.campus (new campus)
    # - student.shift ('morning'/'afternoon' format)
    
    # Move student to new classroom if destination classroom is chosen
    if shift_transfer.to_classroom:
        student.classroom = shift_transfer.to_classroom
        student.current_grade = shift_transfer.to_classroom.grade.name
        student.section = shift_transfer.to_classroom.section
        # Update campus from classroom if different
        if shift_transfer.to_classroom.campus:
            student.campus = shift_transfer.to_classroom.campus
    
    # Mark actor and skip generic student profile notifications
    student._actor = changed_by
    student._skip_notifications = True
    
    # Save all changes at once
    student.save()

    # Link transfer request to shift transfer
    shift_transfer.transfer_request = transfer_request
    shift_transfer.save()

    emit_transfer_event(
        'shift_transfer.applied',
        {
            'student_id': student.id,
            'shift_transfer_id': shift_transfer.id,
            'transfer_request_id': transfer_request.id,
            'new_id': result.get('new_id'),
            'old_classroom_id': shift_transfer.from_classroom.id if shift_transfer.from_classroom else None,
            'new_classroom_id': shift_transfer.to_classroom.id if shift_transfer.to_classroom else None,
            'changed_by_id': changed_by.id if changed_by else None,
        },
    )


def detect_grade_skip_coordinators(student, to_grade, to_shift=None):
    """
    Detect coordinators for grade skip transfer.
    Returns tuple: (from_coordinator, to_coordinator, is_same_coordinator)
    
    Logic:
    - Get student's current grade level and shift
    - Get target grade level and shift
    - Find coordinators for both levels/shifts
    - Compare: if same coordinator → single approval, if different → two-step approval
    """
    from coordinator.models import Coordinator
    
    # Get student's current classroom and grade
    from_classroom = student.classroom
    if not from_classroom or not from_classroom.grade:
        raise ValueError("Student is not assigned to a classroom with a grade.")
    
    from_grade = from_classroom.grade
    from_level = from_grade.level
    from_shift_actual = student.shift  # 'morning' or 'afternoon'
    
    # Get target grade level
    to_level = to_grade.level
    
    # Use provided to_shift or default to current shift
    if not to_shift:
        to_shift = from_shift_actual
    
    # Find coordinator for from_grade (current grade)
    from_coordinator = None
    coordinators_from = Coordinator.objects.filter(
        is_currently_active=True,
        campus=student.campus
    )
    
    for coord in coordinators_from:
        # Check if coordinator manages from_level
        if coord.shift == 'both' and coord.assigned_levels.exists():
            if from_level in coord.assigned_levels.all():
                from_coordinator = coord
                break
        elif coord.shift == 'both' and coord.level == from_level:
            from_coordinator = coord
            break
        elif coord.shift == from_shift_actual and coord.level == from_level:
            from_coordinator = coord
            break
        elif coord.shift == 'both' and coord.level == from_level:
            from_coordinator = coord
            break
    
    # Find coordinator for to_grade (target grade)
    to_coordinator = None
    coordinators_to = Coordinator.objects.filter(
        is_currently_active=True,
        campus=student.campus
    )
    
    for coord in coordinators_to:
        # Check if coordinator manages to_level
        if coord.shift == 'both' and coord.assigned_levels.exists():
            if to_level in coord.assigned_levels.all():
                to_coordinator = coord
                break
        elif coord.shift == 'both' and coord.level == to_level:
            to_coordinator = coord
            break
        elif coord.shift == to_shift and coord.level == to_level:
            to_coordinator = coord
            break
        elif coord.shift == 'both' and coord.level == to_level:
            to_coordinator = coord
            break
    
    # Determine if same coordinator
    is_same_coordinator = (
        from_coordinator is not None and
        to_coordinator is not None and
        from_coordinator.id == to_coordinator.id
    )
    
    return from_coordinator, to_coordinator, is_same_coordinator


@transaction.atomic
def apply_grade_skip_transfer(grade_skip_transfer, changed_by):
    """
    Apply grade skip transfer: update student grade, classroom, shift (if changed), and ID if needed.
    """
    student = grade_skip_transfer.student
    to_classroom = grade_skip_transfer.to_classroom
    to_shift = grade_skip_transfer.to_shift
    to_grade = grade_skip_transfer.to_grade
    
    # Update student's grade
    if to_grade:
        student.current_grade = to_grade.name
    
    # Update student's classroom
    final_classroom = to_classroom  # Will be updated if auto-assigned
    if to_classroom:
        # Use provided classroom
        student.classroom = to_classroom
        student.section = to_classroom.section
        # Update campus from classroom's grade level if different
        if to_classroom.grade and to_classroom.grade.level and to_classroom.grade.level.campus:
            student.campus = to_classroom.grade.level.campus
    else:
        # If no classroom specified, find an available classroom in target grade
        from classes.models import ClassRoom
        
        # Determine target shift - use provided shift or keep current
        target_shift = to_shift if to_shift else student.shift
        
        # Find available classroom in target grade with matching shift
        available_classrooms = ClassRoom.objects.filter(
            grade=to_grade,
            shift=target_shift,
            grade__level__campus=student.campus,
        ).exclude(
            students__id=student.id  # Exclude if student already in this classroom
        ).order_by('section')
        
        # Find first classroom with available capacity
        target_classroom = None
        for classroom in available_classrooms:
            if classroom.students.count() < classroom.capacity:
                target_classroom = classroom
                break
        
        # If no classroom with capacity found, use first available
        if not target_classroom and available_classrooms.exists():
            target_classroom = available_classrooms.first()
        
        if target_classroom:
            student.classroom = target_classroom
            student.section = target_classroom.section
            if target_classroom.grade.level and target_classroom.grade.level.campus:
                student.campus = target_classroom.grade.level.campus
            # Update final_classroom reference for notification
            final_classroom = target_classroom
        else:
            # If no classroom found, still update grade but log warning
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"No available classroom found for grade skip transfer {grade_skip_transfer.id}. "
                f"Student {student.id} grade updated to {to_grade.name} but classroom not assigned."
            )
    
    # Update shift if changed
    if to_shift and to_shift != student.shift:
        student.shift = to_shift
        
        # If shift or campus changed, update student ID
        old_campus = student.campus
        # Get campus from classroom's grade level or use old campus
        if to_classroom and to_classroom.grade and to_classroom.grade.level and to_classroom.grade.level.campus:
            new_campus = to_classroom.grade.level.campus
        else:
            new_campus = old_campus
        
        # Convert shift to ID format ('M' or 'A')
        shift_code = 'M' if to_shift == 'morning' else 'A'
        
        # Update ID if shift or campus changed
        if to_shift != grade_skip_transfer.from_shift or old_campus != new_campus:
            # Create TransferRequest for ID change if needed
            transfer_request = TransferRequest.objects.create(
                request_type='student',
                from_campus=old_campus,
                from_shift='M' if grade_skip_transfer.from_shift == 'morning' else 'A',
                to_campus=new_campus,
                to_shift=shift_code,
                student=student,
                reason=f"Grade skip transfer: {grade_skip_transfer.reason}",
                requested_date=grade_skip_transfer.requested_date,
                requesting_principal=changed_by,
                receiving_principal=changed_by,
                status='approved',  # Auto-approved since coordinators already approved
            )
            
            # Link to grade skip transfer
            grade_skip_transfer.transfer_request = transfer_request
            grade_skip_transfer.save()
            
            # Update student ID
            IDUpdateService.update_student_id(
                student=student,
                new_campus=new_campus,
                new_shift=shift_code,
                transfer_request=transfer_request,
                changed_by=changed_by,
                reason=f"Grade skip: {grade_skip_transfer.reason}",
            )
    
    # Mark actor and skip generic student profile notifications
    student._actor = changed_by
    student._skip_notifications = True
    student.save()
    
    # Send notification to destination class teacher
    try:
        from notifications.services import create_notification
        from django.contrib.auth import get_user_model
        UserModel = get_user_model()
        
        if final_classroom:
            # Get coordinator name (from changed_by or grade_skip_transfer coordinator)
            coordinator_name = "Coordinator"
            if hasattr(changed_by, 'coordinator'):
                coordinator_name = changed_by.coordinator.full_name if changed_by.coordinator else "Coordinator"
            elif grade_skip_transfer.to_grade_coordinator:
                coordinator_name = grade_skip_transfer.to_grade_coordinator.full_name
            elif grade_skip_transfer.from_grade_coordinator:
                coordinator_name = grade_skip_transfer.from_grade_coordinator.full_name
            
            # Get class teacher user
            if final_classroom.class_teacher:
                class_teacher = final_classroom.class_teacher
                teacher_user = getattr(class_teacher, 'user', None)
                if not teacher_user and class_teacher.employee_code:
                    teacher_user = UserModel.objects.filter(username=class_teacher.employee_code).first()
                if not teacher_user and class_teacher.email:
                    teacher_user = UserModel.objects.filter(email__iexact=class_teacher.email).first()
                
                if teacher_user:
                    verb = f"{coordinator_name} has assigned new student {student.name} in your class by transfer request"
                    target_text = f"{final_classroom.grade.name} - {final_classroom.section} ({final_classroom.shift})"
                    create_notification(
                        recipient=teacher_user,
                        actor=changed_by,
                        verb=verb,
                        target_text=target_text,
                        data={
                            "type": "grade_skip_transfer.student_assigned",
                            "grade_skip_transfer_id": grade_skip_transfer.id,
                            "student_id": student.id,
                            "classroom_id": final_classroom.id,
                        },
                    )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send notification to class teacher for grade skip transfer {grade_skip_transfer.id}: {str(e)}")
    
    emit_transfer_event(
        'grade_skip_transfer.applied',
        {
            'student_id': student.id,
            'grade_skip_transfer_id': grade_skip_transfer.id,
            'from_grade': grade_skip_transfer.from_grade_name,
            'to_grade': grade_skip_transfer.to_grade_name,
            'changed_by_id': changed_by.id if changed_by else None,
        },
    )
    
    return {
        'student': student,
        'transfer_request': grade_skip_transfer.transfer_request,
    }

