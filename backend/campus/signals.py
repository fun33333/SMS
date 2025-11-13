from django.db.models.signals import post_save
from django.db.models import Q
from django.dispatch import receiver
from .models import Campus


@receiver(post_save, sender=Campus)
def reassign_related_records_on_campus_restore(sender, instance, created, **kwargs):
    """
    When a campus is saved, automatically reassign all related records 
    that have null campus and match this campus_code.
    
    This allows restoring deleted campuses - when same campus_code is added again,
    all orphaned records (students, levels, transfers) get reassigned automatically.
    """
    if not instance.campus_code:
        return
    
    campus_code = instance.campus_code
    reassigned_count = 0
    
    # 🔹 Reassign Students with matching campus_code in student_id/student_code
    # Student IDs format: C06-A-25-00804 (campus_code-shift-year-number)
    from students.models import Student
    
    # Match students whose ID or code starts with this campus_code
    # Student IDs format: C06-A-25-00804 (campus_code-shift-year-number)
    students_to_reassign = Student.objects.filter(
        campus__isnull=True
    ).filter(
        # Match by student_id OR student_code
        Q(student_id__startswith=f"{campus_code}-") | 
        Q(student_code__startswith=f"{campus_code}-")
    )
    students_count = students_to_reassign.count()
    if students_count > 0:
        students_to_reassign.update(campus=instance)
        reassigned_count += students_count
        print(f"[OK] Reassigned {students_count} students to campus {campus_code}")
    
    # 🔹 Reassign Levels with matching campus_code in code
    # Level codes format: C06-L1-M (campus_code-level-shift)
    from classes.models import Level
    
    levels_to_reassign = Level.objects.filter(
        campus__isnull=True,
        code__startswith=f"{campus_code}-"
    )
    levels_count = levels_to_reassign.count()
    if levels_count > 0:
        levels_to_reassign.update(campus=instance)
        reassigned_count += levels_count
        print(f"[OK] Reassigned {levels_count} levels to campus {campus_code}")
    
    # 🔹 Reassign Grades (through their Level)
    from classes.models import Grade
    
    grades_to_fix = Grade.objects.filter(
        level__campus__isnull=True,
        level__code__startswith=f"{campus_code}-"
    )
    
    # Update the levels first
    for grade in grades_to_fix:
        if grade.level and not grade.level.campus:
            grade.level.campus = instance
            grade.level.save()
            reassigned_count += 1
    
    # 🔹 Reassign Teachers with matching campus_code in employee_code
    # Teacher codes format: C06-T-25-001 (campus_code-T-year-number)
    from teachers.models import Teacher
    
    teachers_to_reassign = Teacher.objects.filter(
        current_campus__isnull=True,
        employee_code__startswith=f"{campus_code}-"
    )
    teachers_count = teachers_to_reassign.count()
    if teachers_count > 0:
        teachers_to_reassign.update(current_campus=instance)
        reassigned_count += teachers_count
        print(f"[OK] Reassigned {teachers_count} teachers to campus {campus_code}")
    
    # 🔹 Reassign Transfer Requests (if from_campus or to_campus matches)
    from transfers.models import TransferRequest
    
    transfers_from = TransferRequest.objects.filter(
        from_campus__isnull=True
    )
    # Match based on student/teacher codes in transfer
    for transfer in transfers_from:
        if transfer.student and transfer.student.student_id and transfer.student.student_id.startswith(f"{campus_code}-"):
            transfer.from_campus = instance
            transfer.save()
            reassigned_count += 1
        elif transfer.teacher and transfer.teacher.employee_code and transfer.teacher.employee_code.startswith(f"{campus_code}-"):
            transfer.from_campus = instance
            transfer.save()
            reassigned_count += 1
    
    transfers_to = TransferRequest.objects.filter(
        to_campus__isnull=True
    )
    for transfer in transfers_to:
        # For to_campus, we check if student is being transferred TO this campus
        # This is a bit tricky - might need better logic based on your use case
        pass  # Can add logic here if needed
    
    if reassigned_count > 0:
        print(f"[OK] Total reassigned {reassigned_count} records to campus {campus_code}")
