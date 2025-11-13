from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence, TYPE_CHECKING

from django.db.models import QuerySet
from attendance.models import StudentAttendance
from notifications.models import Notification
from notifications.services import create_notification
from teachers.models import Teacher

if TYPE_CHECKING:
    from users.models import User


@dataclass(frozen=True)
class ConsecutiveAbsenceAlert:
    student_id: int
    student_name: str
    streak_length: int
    last_absent_date: str


def _get_class_teacher_user(classroom) -> Optional["User"]:
    """
    Resolve the user account for the classroom's teacher.
    Preference order:
        1. Classroom.class_teacher.user (direct FK)
        2. Any active teacher assigned via M2M (assigned_classrooms)
        3. Legacy assigned_classroom relationship
    """
    teacher: Optional[Teacher] = getattr(classroom, "class_teacher", None)
    if teacher and getattr(teacher, "user", None):
        return teacher.user

    fallback_teacher: Optional[Teacher] = (
        Teacher.objects.filter(assigned_classrooms=classroom, is_currently_active=True)
        .select_related("user")
        .first()
    )
    if fallback_teacher and fallback_teacher.user:
        return fallback_teacher.user

    legacy_teacher: Optional[Teacher] = (
        Teacher.objects.filter(assigned_classroom=classroom, is_currently_active=True)
        .select_related("user")
        .first()
    )
    if legacy_teacher and legacy_teacher.user:
        return legacy_teacher.user

    return None


def _recent_attendance_queryset(student_id: int, classroom_id: int, up_to_date) -> QuerySet[StudentAttendance]:
    return (
        StudentAttendance.objects.filter(
            student_id=student_id,
            attendance__classroom_id=classroom_id,
            attendance__date__lte=up_to_date,
            is_deleted=False,
        )
        .select_related("attendance")
        .order_by("-attendance__date")[:4]
    )


def _calculate_absence_streak(records: Sequence[StudentAttendance]) -> int:
    """Count consecutive 'absent' statuses starting from the most recent record."""
    streak = 0
    for record in records:
        if record.status != "absent":
            break
        streak += 1
    return streak


def _notification_exists(recipient, student_id: int, classroom_id: int, absent_date: str) -> bool:
    return Notification.objects.filter(
        recipient=recipient,
        data__student_id=student_id,
        data__classroom_id=classroom_id,
        data__last_absent_date=absent_date,
    ).exists()


def process_consecutive_absence_alerts(attendance) -> list[ConsecutiveAbsenceAlert]:
    """
    Detect students who have reached a 3-day consecutive absence streak (excluding leaves).
    Sends a notification to the class teacher when a streak hits 3 days.
    Returns a list of alerts that were generated for downstream usage (e.g., logging).
    """
    classroom = attendance.classroom
    teacher_user = _get_class_teacher_user(classroom)
    if not teacher_user:
        return []

    alerts: list[ConsecutiveAbsenceAlert] = []
    current_date_iso = attendance.date.isoformat()

    for student_attendance in attendance.student_attendances.select_related("student"):
        if student_attendance.status != "absent":
            continue

        recent_records = list(
            _recent_attendance_queryset(
                student_attendance.student_id,
                classroom.id,
                attendance.date,
            )
        )
        if not recent_records:
            continue

        streak = _calculate_absence_streak(recent_records)
        if streak != 3:
            continue

        student = student_attendance.student

        if _notification_exists(teacher_user, student.id, classroom.id, current_date_iso):
            continue

        alert = ConsecutiveAbsenceAlert(
            student_id=student.id,
            student_name=student.name,
            streak_length=streak,
            last_absent_date=current_date_iso,
        )
        alerts.append(alert)

        verb = f"{student.name} has missed class for 3 consecutive days"
        target_text = f"Class {classroom} • Please reach out to the student or guardians."
        create_notification(
            recipient=teacher_user,
            actor=None,
            verb=verb,
            target_text=target_text,
            data={
                "student_id": student.id,
                "student_name": student.name,
                "classroom_id": classroom.id,
                "classroom_name": str(classroom),
                "streak_length": streak,
                "last_absent_date": current_date_iso,
            },
        )

    return alerts

