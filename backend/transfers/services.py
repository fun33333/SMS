from datetime import datetime
from django.db import transaction
from django.contrib.auth.models import User

from .models import IDHistory, TransferRequest, ClassTransfer, ShiftTransfer, TransferApproval


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
    student.campus = to_classroom.campus
    student.current_grade = to_classroom.grade.name
    student.section = to_classroom.section
    # Mark actor and skip generic student profile notifications
    student._actor = changed_by
    student._skip_notifications = True
    student.save()

    class_transfer.save()

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

