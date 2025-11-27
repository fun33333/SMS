# views.py
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from users.permissions import IsSuperAdminOrPrincipal, IsTeacherOrAbove
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q
from .models import Student
from .serializers import StudentSerializer
from .filters import StudentFilter

class StudentPagination(PageNumberPagination):
    """Custom pagination for students - default 25 per page"""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100

class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAbove]
    pagination_class = StudentPagination
    
    # Filtering, search, and ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = StudentFilter
    search_fields = ['name', 'student_code', 'gr_no', 'father_name', 'student_id']
    ordering_fields = ['name', 'created_at', 'enrollment_year', 'student_code']
    ordering = ['-created_at']  # Default ordering
    
    def get_queryset(self):
        """Override to handle role-based filtering for list views and stats actions"""
        # Use all() to bypass custom manager's default filter, then apply is_deleted=False explicitly
        # Note: We don't filter by is_active here to match attendance behavior - all non-deleted students should appear
        queryset = Student.objects.all().filter(is_deleted=False).select_related('campus', 'classroom')
        
        # Apply role-based filtering for list views and ALL dashboard stats actions
        if self.action in [
            'list',
            'gender_stats',
            'campus_stats',
            'grade_distribution',
            'enrollment_trend',
            'mother_tongue_distribution',
            'religion_distribution',
            'age_distribution',
            'zakat_status',
            'house_ownership',
            'total',
        ]:
            user = self.request.user
            
            # Superadmin gets ALL students for both list and stats
            if user.is_superadmin():
                return queryset
                
            # Principal: Only show students from their campus
            if hasattr(user, 'campus') and user.campus and user.is_principal():
                queryset = queryset.filter(campus=user.campus)
            elif user.is_teacher():
                # Teacher: Show students from their assigned classrooms (supports both single and multiple assignments)
                # Find teacher by employee code (username)
                from teachers.models import Teacher
                try:
                    teacher_obj = Teacher.objects.get(employee_code=user.username)
                    
                    # Get all assigned classrooms (both legacy single assignment and new multiple assignments)
                    assigned_classrooms = []
                    
                    # Add legacy single classroom assignment
                    if teacher_obj.assigned_classroom:
                        assigned_classrooms.append(teacher_obj.assigned_classroom)
                    
                    # Add multiple classroom assignments
                    assigned_classrooms.extend(teacher_obj.assigned_classrooms.all())
                    
                    # Remove duplicates
                    assigned_classrooms = list(set(assigned_classrooms))
                    
                    if assigned_classrooms:
                        # Filter students by any of the assigned classrooms
                        queryset = queryset.filter(classroom__in=assigned_classrooms)
                    else:
                        # If no classroom assigned, show no students
                        queryset = queryset.none()
                except Teacher.DoesNotExist:
                    # If teacher object doesn't exist, show no students
                    queryset = queryset.none()
            elif user.is_coordinator():
                # Coordinator: Show students from classrooms under their assigned level
                from coordinator.models import Coordinator
                try:
                    coordinator_obj = Coordinator.get_for_user(user)
                    if not coordinator_obj:
                        queryset = queryset.none()
                    else:
                        # Determine which levels this coordinator manages (single level or multiple assigned_levels)
                        managed_levels = []
                        if coordinator_obj.shift == 'both' and coordinator_obj.assigned_levels.exists():
                            managed_levels = list(coordinator_obj.assigned_levels.all())
                        elif coordinator_obj.level:
                            managed_levels = [coordinator_obj.level]

                        # If no managed levels, return empty queryset
                        if not managed_levels:
                            queryset = queryset.none()
                        else:
                            # Get all classrooms under these managed levels and the coordinator's campus
                            from classes.models import ClassRoom
                            coordinator_classrooms = ClassRoom.objects.filter(
                                grade__level__in=managed_levels,
                                grade__level__campus=coordinator_obj.campus
                            ).values_list('id', flat=True)

                            # Filter students from these classrooms
                            queryset = queryset.filter(classroom__in=coordinator_classrooms)
                except Exception:
                    # If coordinator resolution fails, return empty queryset
                    queryset = queryset.none()
            
            # Shift filtering is now handled by StudentFilter class
            # No need for manual shift filtering here
        
        return queryset

    def get_object(self):
        """Override to handle individual student retrieval with proper permissions"""
        # For destroy action, we need to get the object even if it's soft deleted
        # So we use with_deleted() to bypass the manager's default filter
        if self.action == 'destroy':
            # Get object using with_deleted() to allow deleting already soft-deleted items if needed
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            lookup_value = self.kwargs[lookup_url_kwarg]
            filter_kwargs = {self.lookup_field: lookup_value}
            obj = Student.objects.with_deleted().get(**filter_kwargs)
        else:
            # For other actions, use normal queryset (excludes deleted)
            obj = super().get_object()
        
        # Apply role-based access control for individual objects
        user = self.request.user
        
        if user.is_teacher():
            # Teacher: Check if student is in their assigned classrooms
            from teachers.models import Teacher
            try:
                teacher_obj = Teacher.objects.get(employee_code=user.username)
                
                # Get all assigned classrooms (both legacy single assignment and new multiple assignments)
                assigned_classrooms = []
                
                # Add legacy single classroom assignment
                if teacher_obj.assigned_classroom:
                    assigned_classrooms.append(teacher_obj.assigned_classroom)
                
                # Add multiple classroom assignments
                assigned_classrooms.extend(teacher_obj.assigned_classrooms.all())
                
                # Remove duplicates
                assigned_classrooms = list(set(assigned_classrooms))
                
                if assigned_classrooms and obj.classroom not in assigned_classrooms:
                    # Student is not in teacher's assigned classrooms
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You don't have permission to view this student.")
                    
            except Teacher.DoesNotExist:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Teacher profile not found.")
                
        elif user.is_principal() and hasattr(user, 'campus') and user.campus:
            # Principal: Check if student is from their campus
            if obj.campus != user.campus:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You don't have permission to view this student.")
                
        elif user.is_coordinator():
            # Coordinator: Check if student is from their assigned level
            from coordinator.models import Coordinator
            try:
                coordinator_obj = Coordinator.get_for_user(user)
                if not coordinator_obj:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("Coordinator profile not found.")

                # Build managed levels similar to get_queryset
                managed_levels = []
                if coordinator_obj.shift == 'both' and coordinator_obj.assigned_levels.exists():
                    managed_levels = list(coordinator_obj.assigned_levels.all())
                elif coordinator_obj.level:
                    managed_levels = [coordinator_obj.level]

                # If student has a classroom, ensure its grade's level is among managed levels
                if obj.classroom:
                    student_level = obj.classroom.grade.level
                    if not managed_levels or student_level not in managed_levels:
                        from rest_framework.exceptions import PermissionDenied
                        raise PermissionDenied("You don't have permission to view this student.")
            except PermissionDenied:
                raise
            except Exception:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Coordinator profile not found.")
        
        return obj
    
    def perform_create(self, serializer):
        """Set actor before creating student"""
        instance = serializer.save()
        instance._actor = self.request.user
        # Save again to trigger signals with actor
        instance.save()
    
    def perform_update(self, serializer):
        """Set actor before updating student"""
        instance = serializer.save()
        instance._actor = self.request.user
        # Save again to trigger signals with actor
        instance.save()
    
    def destroy(self, request, *args, **kwargs):
        """Override destroy to ensure soft delete is used - NEVER calls default delete"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[DESTROY] destroy() method called for DELETE request")
        
        # Get the instance
        instance = self.get_object()
        student_id = instance.id
        student_name = instance.name
        
        logger.info(f"[DESTROY] Got student instance: ID={student_id}, Name={student_name}, is_deleted={instance.is_deleted}")
        
        # Check if already deleted
        if instance.is_deleted:
            logger.warning(f"[DESTROY] Student {student_id} is already soft deleted")
            from rest_framework.exceptions import NotFound
            raise NotFound("Student is already deleted.")
        
        # IMPORTANT: Call perform_destroy which does soft delete
        # DO NOT call super().destroy() as it would do hard delete
        logger.info(f"[DESTROY] Calling perform_destroy() for soft delete")
        self.perform_destroy(instance)
        
        # Verify the student still exists in database (soft deleted, not hard deleted)
        try:
            from .models import Student
            # Use with_deleted() to check if student exists (even if soft deleted)
            still_exists = Student.objects.with_deleted().filter(pk=student_id).exists()
            if not still_exists:
                logger.error(f"[DESTROY] CRITICAL: Student {student_id} was HARD DELETED! This should not happen!")
                raise Exception(f"CRITICAL ERROR: Student {student_id} was permanently deleted instead of soft deleted!")
            else:
                # Check if it's soft deleted
                student_check = Student.objects.with_deleted().get(pk=student_id)
                if student_check.is_deleted:
                    logger.info(f"[DESTROY] SUCCESS: Student {student_id} is soft deleted (is_deleted=True)")
                else:
                    logger.error(f"[DESTROY] ERROR: Student {student_id} exists but is_deleted is False!")
        except Student.DoesNotExist:
            logger.error(f"[DESTROY] CRITICAL: Student {student_id} does not exist in database - was HARD DELETED!")
            raise Exception(f"CRITICAL ERROR: Student {student_id} was permanently deleted!")
        
        logger.info(f"[DESTROY] destroy() completed successfully")
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    def perform_destroy(self, instance):
        """Soft delete student and create audit log"""
        # IMPORTANT: Do NOT call super().perform_destroy() as it would do hard delete
        # Store student info BEFORE soft delete (in case instance gets modified)
        student_id = instance.id
        student_name = instance.name
        student_campus = instance.campus
        
        # Get user name for audit log
        user = self.request.user
        user_name = user.get_full_name() if hasattr(user, 'get_full_name') else (user.username or 'Unknown')
        user_role = user.get_role_display() if hasattr(user, 'get_role_display') else (user.role or 'User')
        
        # Set actor for potential signal use (though soft_delete uses update() which bypasses signals)
        instance._actor = user
        
        # Log before soft delete
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[SOFT_DELETE] Starting soft delete for student ID: {student_id}, Name: {student_name}")
        logger.info(f"[SOFT_DELETE] Student is_deleted before: {instance.is_deleted}")
        
        # Soft delete the student (instead of hard delete)
        # This uses update() to directly modify database, does NOT call .delete()
        # This ensures no post_delete signal is triggered
        try:
            instance.soft_delete()
            logger.info(f"[SOFT_DELETE] soft_delete() method called successfully")
            
            # Verify soft delete worked
            instance.refresh_from_db()
            logger.info(f"[SOFT_DELETE] Student is_deleted after refresh: {instance.is_deleted}")
            
            if not instance.is_deleted:
                logger.error(f"[SOFT_DELETE] CRITICAL ERROR: Soft delete failed! Student {student_id} is_deleted is still False!")
                raise Exception(f"Soft delete failed for student {student_id} - is_deleted is still False after soft_delete() call")
            
            logger.info(f"[SOFT_DELETE] Soft delete successful for student {student_id}")
        except Exception as e:
            logger.error(f"[SOFT_DELETE] ERROR during soft_delete(): {str(e)}")
            raise
        
        # Create audit log after soft deletion
        try:
            from attendance.models import AuditLog
            AuditLog.objects.create(
                feature='student',
                action='delete',
                entity_type='Student',
                entity_id=student_id,
                user=user,
                ip_address=self.request.META.get('REMOTE_ADDR'),
                changes={'name': student_name, 'student_id': student_id, 'campus_id': student_campus.id if student_campus else None},
                reason=f'Student {student_name} deleted by {user_role} {user_name}'
            )
        except Exception as e:
            # Log error but don't fail the deletion
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create audit log for student deletion: {str(e)}")

    @action(detail=False, methods=["get"])
    def total(self, request):
        # Get user's campus for filtering
        user_campus = request.user.campus
        
        if request.user.is_principal() and user_campus:
            # Principal: Only count students from their campus
            count = Student.objects.filter(campus=user_campus).count()
        else:
            # Super admin: Count all students
            count = Student.objects.count()
            
        return Response({"totalStudents": count})

    @action(detail=False, methods=["get"])
    def gender_stats(self, request):
        # Get user's campus for filtering
        user_campus = request.user.campus
        
        if request.user.is_principal() and user_campus:
            # Principal: Only count students from their campus
            male = Student.objects.filter(campus=user_campus, gender="male").count()
            female = Student.objects.filter(campus=user_campus, gender="female").count()
            other = Student.objects.filter(campus=user_campus, gender="other").count()
        else:
            # Super admin: Count all students
            male = Student.objects.filter(gender="male").count()
            female = Student.objects.filter(gender="female").count()
            other = Student.objects.filter(gender="other").count()
            
        return Response({
            "male": male,
            "female": female,
            "other": other
        })

    @action(detail=False, methods=["get"])
    def campus_stats(self, request):
        from campus.models import Campus
        
        # Get user's campus for filtering
        user_campus = request.user.campus
        
        if request.user.is_principal() and user_campus:
            # Principal: Only show their campus stats
            campuses = Campus.objects.filter(id=user_campus.id)
        else:
            # Super admin: Show all campuses
            campuses = Campus.objects.all()
            
        # Use annotation for better performance and ensure campus_name exists
        from django.db.models import Count
        
        data = []
        for c in campuses:
            # Get count of non-deleted students for this campus
            student_count = Student.objects.filter(
                campus=c,
                is_deleted=False
            ).count()
            
            # Only include campus if it has a name
            if c.campus_name:
                data.append({
                    "campus": c.campus_name,
                    "count": student_count
                })
        
        return Response(data if data else [{"campus": "No data available", "count": 0}])
    
    @action(detail=False, methods=["get"])
    def grade_distribution(self, request):
        """Get grade-wise student distribution"""
        from django.db.models import Count
        from classes.models import Grade
        
        user_campus = request.user.campus
        
        # Base queryset
        if request.user.is_principal() and user_campus:
            students_qs = Student.objects.filter(campus=user_campus)
        else:
            students_qs = Student.objects.all()
        
        # Group by classroom grade and count
        grade_data = students_qs.values('classroom__grade__name').annotate(
            count=Count('id')
        ).order_by('classroom__grade__name')
        
        # Format response for Recharts (name, value format)
        data = [
            {"name": item['classroom__grade__name'] or 'No Grade', "value": item['count']}
            for item in grade_data if item['classroom__grade__name']  # Skip null grades
        ]
        
        return Response(data)
    
    @action(detail=False, methods=["get"], url_path='enrollment_trend')
    def enrollment_trend(self, request):
        """
        Get enrollment trend by year.

        Uses filter_queryset(self.get_queryset()) so that:
        - Role-based scoping from get_queryset is applied (principal, teacher, coordinator, etc.)
        - Query params (campus, enrollment_year, gender, shift, etc.) from StudentFilter
          are respected – this is critical for the superadmin dashboard campus filter.
        """
        from django.db.models import Count

        queryset = self.filter_queryset(self.get_queryset())

        trend_data = queryset.values('enrollment_year').annotate(
            count=Count('id')
        ).order_by('enrollment_year')

        data = [
            {"year": str(item['enrollment_year'] or 2025), "count": item['count']}
            for item in trend_data
        ]

        return Response(data)
    
    @action(detail=False, methods=["get"])
    def mother_tongue_distribution(self, request):
        """Get mother tongue distribution"""
        from django.db.models import Count
        
        user_campus = request.user.campus
        
        # Base queryset
        if request.user.is_principal() and user_campus:
            students_qs = Student.objects.filter(campus=user_campus)
        else:
            students_qs = Student.objects.all()
        
        # Group by mother tongue
        mt_data = students_qs.values('mother_tongue').annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Format response - properly capitalize and handle empty values
        data = []
        for item in mt_data:
            tongue = item['mother_tongue']
            if not tongue or tongue.strip() == '':
                tongue = 'Other'
            else:
                # Capitalize first letter of each word
                tongue = tongue.strip().title()
            
            data.append({"name": tongue, "value": item['count']})
        
        return Response(data)
    
    @action(detail=False, methods=["get"])
    def religion_distribution(self, request):
        """Get religion distribution"""
        from django.db.models import Count
        
        user_campus = request.user.campus
        
        # Base queryset
        if request.user.is_principal() and user_campus:
            students_qs = Student.objects.filter(campus=user_campus)
        else:
            students_qs = Student.objects.all()
        
        # Group by religion
        religion_data = students_qs.values('religion').annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Format response - properly capitalize and handle empty values
        data = []
        for item in religion_data:
            religion = item['religion']
            if not religion or religion.strip() == '':
                religion = 'Other'
            else:
                # Capitalize first letter of each word
                religion = religion.strip().title()
            
            data.append({"name": religion, "value": item['count']})
        
        return Response(data)
    
    @action(detail=False, methods=['get'], url_path='total')
    def total_students(self, request):
        """Get total student count"""
        queryset = self.filter_queryset(self.get_queryset())
        total = queryset.count()
        return Response({'totalStudents': total})
    
    @action(detail=False, methods=['get'], url_path='gender_stats')
    def gender_stats(self, request):
        """Get gender distribution stats"""
        queryset = self.filter_queryset(self.get_queryset())
        
        stats = queryset.aggregate(
            male=Count('id', filter=Q(gender='male')),
            female=Count('id', filter=Q(gender='female')),
            other=Count('id', filter=Q(gender__isnull=True) | Q(gender='other'))
        )
        
        return Response(stats)
    
    @action(detail=False, methods=['get'], url_path='campus_stats')
    def campus_stats(self, request):
        """Get campus-wise student distribution"""
        queryset = self.filter_queryset(self.get_queryset())
        
        campus_data = queryset.values('campus__campus_name').annotate(
            count=Count('id')
        ).order_by('-count')
        
        data = []
        for item in campus_data:
            campus_name = item['campus__campus_name'] or 'Unknown Campus'
            data.append({
                'campus': campus_name,
                'count': item['count']
            })
        
        return Response(data)
    
    @action(detail=False, methods=['get'], url_path='grade_distribution')
    def grade_distribution(self, request):
        """
        Get grade-wise student distribution with NORMALIZED grade labels.

        Problems we solve here:
        - Raw data can contain mixed formats like "Grade 1", "Grade I", "Grade-1",
          "KG-1", "KG-I", "KG1", etc.
        - Dashboard filters should show clean, canonical labels:
          "Nursery", "KG-I", "KG-II", "Grade 1" .. "Grade 10", "Special Class".

        We aggregate counts by a normalized label so that:
        - Filters look clean
        - Selecting "Grade 1" in the frontend still works (StudentFilter.current_grade
          already accepts both roman and numeric variations).
        """
        queryset = self.filter_queryset(self.get_queryset())

        grade_rows = queryset.values('current_grade').annotate(
            count=Count('id')
        ).order_by('current_grade')

        def normalize_grade_label(raw: str) -> str:
            if not raw:
                return "Unknown Grade"

            value = (raw or "").strip()
            lower = value.lower()

            # Direct mappings for pre-primary / special
            if 'nursery' in lower:
                return 'Nursery'
            if 'special' in lower:
                return 'Special Class'

            # Roman ↔ number helpers
            roman_to_num = {
                'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
                'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10',
            }
            num_to_roman = {v: k.upper() for k, v in roman_to_num.items()}

            import re

            # KG grades
            if 'kg' in lower:
                match = re.search(r'kg[-_\s]?([ivx\d]+)', lower)
                if match:
                    token = match.group(1)
                    # token can be roman or number
                    if token in roman_to_num:
                        num = roman_to_num[token]
                    else:
                        num = token
                    # Canonical: KG-I, KG-II
                    if num in num_to_roman:
                        roman = num_to_roman[num]
                        return f"KG-{roman}"
                    return f"KG-{num}"
                return "KG-I"

            # Regular grades
            if 'grade' in lower:
                match = re.search(r'grade[-_\s]*([ivx\d]+)', lower)
                if match:
                    token = match.group(1)
                    if token in roman_to_num:
                        num = roman_to_num[token]
                    else:
                        num = token
                    # Canonical: Grade 1 .. Grade 10
                    return f"Grade {num}"
                # Fallback: just "Grade"
                return "Grade"

            # Fallback: keep original capitalization but trim
            return value

        # Aggregate counts per normalized label
        aggregated: dict[str, int] = {}
        for row in grade_rows:
            raw_grade = row['current_grade']
            count = row['count'] or 0
            label = normalize_grade_label(raw_grade)
            aggregated[label] = aggregated.get(label, 0) + count

        # Build response sorted by label (simple, readable order)
        data = [
            {"grade": label, "count": count}
            for label, count in sorted(aggregated.items(), key=lambda x: x[0])
        ]

        return Response(data)
    
    
    @action(detail=True, methods=['get'], url_path='results')
    def get_student_results(self, request, pk=None):
        """Get all results for a specific student"""
        student = self.get_object()
        from result.models import Result
        
        results = Result.objects.filter(student=student).order_by('-created_at')
        results_data = []
        
        for result in results:
            result_data = {
                'id': result.id,
                'exam_type': result.exam_type,
                'academic_year': result.academic_year,
                'semester': result.semester,
                'status': result.status,
                'total_marks': result.total_marks,
                'obtained_marks': result.obtained_marks,
                'percentage': result.percentage,
                'grade': result.grade,
                'result_status': result.result_status,
                'created_at': result.created_at,
                'subject_marks': []
            }
            
            # Add subject marks
            for subject_mark in result.subject_marks.all():
                result_data['subject_marks'].append({
                    'subject_name': subject_mark.subject_name,
                    'total_marks': subject_mark.total_marks,
                    'obtained_marks': subject_mark.obtained_marks,
                    'has_practical': subject_mark.has_practical,
                    'practical_total': subject_mark.practical_total,
                    'practical_obtained': subject_mark.practical_obtained,
                    'is_pass': subject_mark.is_pass
                })
            
            results_data.append(result_data)
        
        return Response(results_data)
    
    @action(detail=True, methods=['get'], url_path='attendance')
    def get_student_attendance(self, request, pk=None):
        """Get all attendance records for a specific student"""
        student = self.get_object()
        from attendance.models import StudentAttendance
        
        attendance_records = StudentAttendance.objects.filter(
            student=student
        ).select_related('attendance').order_by('-attendance__date')
        
        attendance_data = []
        for record in attendance_records:
            attendance_data.append({
                'id': record.id,
                'status': record.status,
                'remarks': record.remarks,
                'date': record.attendance.date,
                'created_at': record.created_at,
                'attendance': {
                    'id': record.attendance.id,
                    'date': record.attendance.date,
                    'classroom': record.attendance.classroom.name if record.attendance.classroom else None
                }
            })
        
        return Response(attendance_data)
    
    @action(detail=False, methods=['get'], url_path='mother_tongue_distribution')
    def mother_tongue_distribution(self, request):
        """Get mother tongue distribution"""
        queryset = self.filter_queryset(self.get_queryset())
        
        tongue_data = queryset.values('mother_tongue').annotate(
            count=Count('id')
        ).order_by('-count')
        
        data = []
        for item in tongue_data:
            tongue = item['mother_tongue'] or 'Unknown'
            data.append({
                'name': tongue,
                'value': item['count']
            })
        
        return Response(data)
    
    @action(detail=False, methods=['get'], url_path='religion_distribution')
    def religion_distribution(self, request):
        """Get religion distribution"""
        queryset = self.filter_queryset(self.get_queryset())
        
        religion_data = queryset.values('religion').annotate(
            count=Count('id')
        ).order_by('-count')
        
        data = []
        for item in religion_data:
            religion = item['religion'] or 'Unknown'
            data.append({
                'name': religion,
                'value': item['count']
            })
        
        return Response(data)
    
    @action(detail=False, methods=['get'], url_path='age_distribution')
    def age_distribution(self, request):
        """Get age distribution"""
        queryset = self.filter_queryset(self.get_queryset())
        
        # Calculate age from date of birth using a simpler approach
        from django.db.models import Case, When, Value, IntegerField
        from django.db.models.functions import Extract
        
        age_data = queryset.annotate(
            age=Case(
                When(dob__isnull=True, then=Value(0)),
                default=Extract('dob', 'year'),
                output_field=IntegerField()
            )
        ).values('age').annotate(
            count=Count('id')
        ).order_by('age')
        
        data = []
        current_year = 2025  # Current academic year
        for item in age_data:
            birth_year = item['age'] or 0
            if birth_year > 0:  # Only include valid birth years
                age = current_year - birth_year
                if age > 0 and age < 25:  # Reasonable age range for students
                    data.append({
                        'age': age,
                        'count': item['count']
                    })
        
        return Response(data)
    
    @action(detail=False, methods=['get'], url_path='zakat_status')
    def zakat_status(self, request):
        """Get zakat status distribution"""
        queryset = self.filter_queryset(self.get_queryset())
        
        zakat_data = queryset.values('zakat_status').annotate(
            count=Count('id')
        ).order_by('-count')
        
        data = []
        for item in zakat_data:
            status = item['zakat_status'] or 'Unknown'
            data.append({
                'status': status,
                'count': item['count']
            })
        
        return Response(data)
    
    @action(detail=False, methods=['get'], url_path='house_ownership')
    def house_ownership(self, request):
        """Get house ownership distribution"""
        queryset = self.filter_queryset(self.get_queryset())
        
        house_data = queryset.values('house_owned').annotate(
            count=Count('id')
        ).order_by('-count')
        
        data = []
        for item in house_data:
            owned = item['house_owned']
            status = 'Owned' if owned else 'Rented'
            data.append({
                'status': status,
                'count': item['count']
            })
        
        return Response(data)

    @action(detail=True, methods=['post'], url_path='upload-photo')
    def upload_photo(self, request, pk=None):
        """Upload or replace a student's profile photo.

        Expects a multipart/form-data POST with a file field named 'photo'.
        Saves the file to the Student.photo ImageField and returns the photo URL.
        """
        student = self.get_object()
        photo_file = request.FILES.get('photo')
        if not photo_file:
            return Response({'detail': 'No photo file provided.'}, status=400)

        # Assign and save
        try:
            student.photo = photo_file
            student.save()
        except Exception as e:
            return Response({'detail': f'Error saving photo: {str(e)}'}, status=500)

        # Build absolute URL if possible
        try:
            photo_url = request.build_absolute_uri(student.photo.url) if student.photo else ''
        except Exception:
            photo_url = student.photo.url if student.photo else ''

        return Response({'photo_url': photo_url})

    @action(detail=True, methods=['delete'], url_path='delete-photo')
    def delete_photo(self, request, pk=None):
        """Delete a student's profile photo from storage and clear the field."""
        student = self.get_object()
        if not student.photo:
            return Response({'detail': 'No photo found to delete.'}, status=400)

        try:
            # remove file from storage
            student.photo.delete(save=False)
            # clear field and save
            student.photo = None
            student.save()
        except Exception as e:
            return Response({'detail': f'Error deleting photo: {str(e)}'}, status=500)

        return Response({'detail': 'Photo deleted'})
