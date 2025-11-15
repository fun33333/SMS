# views.py
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from users.permissions import IsSuperAdminOrPrincipal, IsTeacherOrAbove
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q
from .models import Student
from .serializers import StudentSerializer
from .filters import StudentFilter

class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAbove]
    
    # Filtering, search, and ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = StudentFilter
    search_fields = ['name', 'student_code', 'gr_no', 'father_name', 'student_id']
    ordering_fields = ['name', 'created_at', 'enrollment_year', 'student_code']
    ordering = ['-created_at']  # Default ordering
    
    def get_queryset(self):
        """Override to handle role-based filtering for list views and stats actions"""
        queryset = Student.objects.select_related('campus', 'classroom').filter(is_deleted=False)
        
        # Apply role-based filtering for list views and stats actions
        if self.action in ['list', 'gender_stats', 'campus_stats', 'grade_distribution', 
                          'enrollment_trend', 'mother_tongue_distribution', 
                          'religion_distribution', 'total']:
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
            
            # Handle shift filtering
            shift_filter = self.request.query_params.get('shift')
            if shift_filter:
                if shift_filter in ['morning', 'afternoon']:
                    # Filter students by shift
                    queryset = queryset.filter(shift=shift_filter)
                elif shift_filter == 'both':
                    # Show students from both shifts (no additional filtering needed)
                    pass
        
        return queryset

    def get_object(self):
        """Override to handle individual student retrieval with proper permissions"""
        # Get the object first
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
    
    def perform_destroy(self, instance):
        """Set actor before deleting student"""
        instance._actor = self.request.user
        super().perform_destroy(instance)

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
    
    @action(detail=False, methods=["get"])
    def enrollment_trend(self, request):
        """Get enrollment trend by year"""
        from django.db.models import Count
        
        user_campus = request.user.campus
        
        # Base queryset
        if request.user.is_principal() and user_campus:
            students_qs = Student.objects.filter(campus=user_campus)
        else:
            students_qs = Student.objects.all()
        
        # Group by enrollment year
        trend_data = students_qs.values('enrollment_year').annotate(
            count=Count('id')
        ).order_by('enrollment_year')
        
        # Format response for Recharts (year as string for X-axis)
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
        queryset = self.get_queryset()
        total = queryset.count()
        return Response({'totalStudents': total})
    
    @action(detail=False, methods=['get'], url_path='gender_stats')
    def gender_stats(self, request):
        """Get gender distribution stats"""
        queryset = self.get_queryset()
        
        stats = queryset.aggregate(
            male=Count('id', filter=Q(gender='male')),
            female=Count('id', filter=Q(gender='female')),
            other=Count('id', filter=Q(gender__isnull=True) | Q(gender='other'))
        )
        
        return Response(stats)
    
    @action(detail=False, methods=['get'], url_path='campus_stats')
    def campus_stats(self, request):
        """Get campus-wise student distribution"""
        queryset = self.get_queryset()
        
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
        """Get grade-wise student distribution"""
        queryset = self.get_queryset()
        
        grade_data = queryset.values('current_grade').annotate(
            count=Count('id')
        ).order_by('current_grade')
        
        data = []
        for item in grade_data:
            grade = item['current_grade'] or 'Unknown Grade'
            data.append({
                'grade': grade,
                'count': item['count']
            })
        
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
        queryset = self.get_queryset()
        
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
        queryset = self.get_queryset()
        
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
        queryset = self.get_queryset()
        
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
        queryset = self.get_queryset()
        
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
        queryset = self.get_queryset()
        
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
