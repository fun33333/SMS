from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from .models import User, PasswordChangeOTP
from .serializers import UserSerializer, UserRegistrationSerializer, UserLoginSerializer
from .permissions import IsSuperAdmin, IsPrincipal, IsCoordinator, IsTeacher
from .validators import validate_password_strength
from services.email_notification_service import EmailNotificationService
from notifications.services import create_notification
import secrets

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_email_exists(request):
    """Return whether a user exists with the given email (case-insensitive)."""
    email = request.query_params.get('email')
    if not email:
        return Response({'error': 'email query param is required'}, status=status.HTTP_400_BAD_REQUEST)
    exists = User.objects.filter(email__iexact=email).exists()
    return Response({'exists': exists})

class UserRegistrationView(generics.CreateAPIView):
    """
    User registration endpoint
    Only SuperAdmin and Principal can create users
    """
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [IsAuthenticated, (IsSuperAdmin | IsPrincipal)]

    def perform_create(self, serializer):
        # Set password securely
        user = serializer.save()
        user.set_password(serializer.validated_data['password'])
        user.save()
        return user

class UserLoginView(generics.GenericAPIView):
    """
    User login endpoint
    """
    serializer_class = UserLoginSerializer
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        email_or_code = serializer.validated_data['email']
        password = serializer.validated_data['password']
        
        # Try to authenticate with email first, then with username (employee code)
        user = None
        
        # First try with email as username
        user = authenticate(request, username=email_or_code, password=password)
        
        # If that fails, try to find user by email and authenticate with their username
        if not user:
            try:
                user_obj = User.objects.get(email=email_or_code)
                user = authenticate(request, username=user_obj.username, password=password)
            except User.DoesNotExist:
                pass
        
        if user and user.is_active:
            # Check if user needs to change password
            if not user.has_changed_default_password:
                return Response({
                    'requires_password_change': True,
                    'user_email': user.email,
                    'message': 'Password change required. Please verify your email to proceed.'
                }, status=status.HTTP_200_OK)
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            
            # Update last login IP
            user.last_login_ip = self.get_client_ip(request)
            user.save()
            
            # Get complete user profile
            user_profile = self.get_complete_user_profile(user)
            
            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': user_profile,
                'requires_password_change': False
            }, status=status.HTTP_200_OK)
        
        return Response({
            'error': 'Invalid credentials'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    def get_complete_user_profile(self, user):
        """Get complete user profile based on role"""
        profile_data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': user.role,
            'is_active': user.is_active,
            'first_name': user.first_name,
            'last_name': user.last_name,
        }
        
        if user.role == 'principal':
            try:
                from principals.models import Principal
                principal = Principal.objects.get(employee_code=user.username)
                profile_data.update({
                    'principal_id': principal.id,
                    'campus_id': principal.campus.id if principal.campus else None,
                    'campus_name': principal.campus.campus_name if principal.campus else None,
                    'campus_code': principal.campus.campus_code if principal.campus else None,
                    'full_name': principal.full_name,
                    'contact_number': principal.contact_number,
                    'employee_code': principal.employee_code,
                    'shift': principal.shift,
                })
            except Principal.DoesNotExist:
                pass
                
        elif user.role == 'coordinator':
            try:
                from coordinator.models import Coordinator
                coordinator = Coordinator.get_for_user(user)
                if coordinator:
                    profile_data.update({
                        'coordinator_id': coordinator.id,
                        'campus_id': coordinator.campus.id if coordinator.campus else None,
                        'campus_name': coordinator.campus.campus_name if coordinator.campus else None,
                        'campus_code': coordinator.campus.campus_code if coordinator.campus else None,
                        'level_id': coordinator.level.id if coordinator.level else None,
                        'level_name': coordinator.level.name if coordinator.level else None,
                        'full_name': coordinator.full_name,
                        'contact_number': coordinator.contact_number,
                        'employee_code': coordinator.employee_code,
                    })
            except Exception:
                # Swallow errors and return base profile_data
                pass
                
        elif user.role == 'teacher':
            try:
                from teachers.models import Teacher
                teacher = Teacher.objects.get(employee_code=user.username)
                profile_data.update({
                    'teacher_id': teacher.id,
                    'campus_id': teacher.current_campus.id if teacher.current_campus else None,
                    'campus_name': teacher.current_campus.campus_name if teacher.current_campus else None,
                    'full_name': teacher.full_name,
                    'contact_number': teacher.contact_number,
                    'employee_code': teacher.employee_code,
                    'assigned_classroom_id': teacher.assigned_classroom.id if teacher.assigned_classroom else None,
                    'assigned_classroom_name': f"{teacher.assigned_classroom.grade.name}-{teacher.assigned_classroom.section}" if teacher.assigned_classroom else None,
                    'is_class_teacher': teacher.is_class_teacher,
                })
            except Teacher.DoesNotExist:
                pass
        
        return profile_data
    
    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    User profile management
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

class UserListView(generics.ListAPIView):
    """
    List users based on role permissions
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role_param = self.request.query_params.get('role')
        
        if user.is_superadmin() or user.is_principal():
            qs = User.objects.all()
            if role_param:
                return qs.filter(role=role_param)
            return qs
        elif user.is_coordinator():
            qs = User.objects.filter(campus=user.campus, role__in=['teacher', 'coordinator'])
            if role_param in ['teacher', 'coordinator']:
                return qs.filter(role=role_param)
            return qs
        else:
            return User.objects.filter(id=user.id)

# @api_view(['POST'])
# @permission_classes([AllowAny])
# def refresh_token_view(request):
#     """
#     Refresh JWT token
#     """
#     refresh_token = request.data.get('refresh')
#     
#     if not refresh_token:
#         return Response({'error': 'Refresh token required'}, status=status.HTTP_400_BAD_REQUEST)
#     
#     try:
#         refresh = RefreshToken(refresh_token)
#         access_token = refresh.access_token
#         
#         return Response({
#             'access': str(access_token)
#         }, status=status.HTTP_200_OK)
#     
#     except Exception as e:
#         return Response({'error': 'Invalid refresh token'}, status=status.HTTP_401_UNAUTHORIZED)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_profile(request):
    """
    Get current user's profile with complete role-specific data
    """
    user = request.user
    
    # Base user data
    user_data = {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'role': user.role,
        'campus': {
            'id': user.campus.id,
            'campus_name': user.campus.campus_name,
            'campus_code': user.campus.campus_code,
        } if user.campus else None,
    }
    
    # Add role-specific data with complete profile information
    if user.role == 'teacher':
        try:
            from teachers.models import Teacher
            teacher = Teacher.objects.get(employee_code=user.username)
            # Build assigned_classrooms list (supports multi-class assignment)
            assigned_list = []
            try:
                for cr in teacher.assigned_classrooms.all().select_related('grade', 'grade__level'):
                    assigned_list.append({
                        'id': cr.id,
                        'name': str(cr),
                        'grade': cr.grade.name if cr.grade else None,
                        'section': cr.section,
                        'shift': cr.shift,
                        'code': cr.code,
                        'grade_id': cr.grade.id if cr.grade else None,
                        'level_id': cr.grade.level.id if cr.grade and cr.grade.level else None,
                        'level_name': cr.grade.level.name if cr.grade and cr.grade.level else None,
                    })
            except Exception:
                assigned_list = []

            user_data.update({
                'teacher_id': teacher.id,
                'full_name': teacher.full_name,
                'dob': teacher.dob,
                'gender': teacher.gender,
                'contact_number': teacher.contact_number,
                'email': teacher.email,
                'cnic': teacher.cnic,
                'permanent_address': teacher.permanent_address,
                'education_level': teacher.education_level,
                'institution_name': teacher.institution_name,
                'year_of_passing': teacher.year_of_passing,
                'total_experience_years': teacher.total_experience_years,
                'profile_image': None,  # Teacher model doesn't have profile_image field
                'employee_code': teacher.employee_code,
                'joining_date': teacher.joining_date,
                'is_class_teacher': teacher.is_class_teacher,
                'is_currently_active': teacher.is_currently_active,
                # Prefer legacy single assignment if present; otherwise default to first in list for compatibility
                'assigned_classroom': ({
                    'id': teacher.assigned_classroom.id,
                    'name': str(teacher.assigned_classroom),
                    'grade': teacher.assigned_classroom.grade.name if teacher.assigned_classroom.grade else None,
                    'section': teacher.assigned_classroom.section,
                    'shift': teacher.assigned_classroom.shift,
                    'grade_id': teacher.assigned_classroom.grade.id if teacher.assigned_classroom.grade else None,
                    'level_id': teacher.assigned_classroom.grade.level.id if teacher.assigned_classroom.grade and teacher.assigned_classroom.grade.level else None,
                    'level_name': teacher.assigned_classroom.grade.level.name if teacher.assigned_classroom.grade and teacher.assigned_classroom.grade.level else None,
                } if teacher.assigned_classroom else (
                    assigned_list[0] if assigned_list else None
                )),
                'assigned_classrooms': assigned_list,
                'current_campus': {
                    'id': teacher.current_campus.id,
                    'campus_name': teacher.current_campus.campus_name,
                    'campus_code': teacher.current_campus.campus_code,
                } if teacher.current_campus else None,
                'created_at': teacher.date_created,
                'updated_at': teacher.date_updated,
            })
        except Teacher.DoesNotExist:
            pass
    elif user.role == 'coordinator':
        try:
            from coordinator.models import Coordinator
            coordinator = Coordinator.get_for_user(user)
            if coordinator:
                user_data.update({
                    'coordinator_id': coordinator.id,
                    'full_name': coordinator.full_name,
                    'dob': coordinator.dob,
                    'gender': coordinator.gender,
                    'contact_number': coordinator.contact_number,
                    'email': coordinator.email,
                    'cnic': coordinator.cnic,
                    'permanent_address': coordinator.permanent_address,
                    'education_level': coordinator.education_level,
                    'institution_name': coordinator.institution_name,
                    'year_of_passing': coordinator.year_of_passing,
                    'total_experience_years': coordinator.total_experience_years,
                    'employee_code': coordinator.employee_code,
                    'joining_date': coordinator.joining_date,
                    'is_currently_active': coordinator.is_currently_active,
                    'can_assign_class_teachers': coordinator.can_assign_class_teachers,
                    'level': {
                        'id': coordinator.level.id,
                        'name': coordinator.level.name,
                        'code': coordinator.level.code,
                    } if coordinator.level else None,
                    'campus': {
                        'id': coordinator.campus.id,
                        'campus_name': coordinator.campus.campus_name,
                        'campus_code': coordinator.campus.campus_code,
                    } if coordinator.campus else None,
                    'created_at': coordinator.created_at,
                    'updated_at': coordinator.updated_at,
                })
        except Exception:
            pass
    elif user.role == 'principal':
        try:
            from principals.models import Principal
            principal = Principal.objects.get(employee_code=user.username)
            user_data.update({
                'principal_id': principal.id,
                'full_name': principal.full_name,
                'dob': principal.dob,
                'gender': principal.gender,
                'contact_number': principal.contact_number,
                'email': principal.email,
                'cnic': principal.cnic,
                'permanent_address': principal.permanent_address,
                'education_level': principal.education_level,
                'institution_name': principal.institution_name,
                'year_of_passing': principal.year_of_passing,
                'total_experience_years': principal.total_experience_years,
                'employee_code': principal.employee_code,
                'joining_date': principal.joining_date,
                'is_currently_active': principal.is_currently_active,
                'shift': principal.shift,
                'campus': {
                    'id': principal.campus.id,
                    'campus_name': principal.campus.campus_name,
                    'campus_code': principal.campus.campus_code,
                } if principal.campus else None,
                'created_at': principal.created_at,
                'updated_at': principal.updated_at,
            })
        except Principal.DoesNotExist:
            pass
    elif user.role == 'student':
        try:
            from students.models import Student
            student = Student.objects.get(email=user.email)
            user_data.update({
                'student_id': student.id,
                'name': student.name,
                'dob': student.dob,
                'gender': student.gender,
                'contact_number': student.contact_number,
                'email': student.email,
                'cnic': student.cnic,
                'permanent_address': student.permanent_address,
                'father_name': student.father_name,
                'father_cnic': student.father_cnic,
                'father_contact': student.father_contact,
                'father_occupation': student.father_occupation,
                'mother_name': student.mother_name,
                'mother_cnic': student.mother_cnic,
                'mother_contact': student.mother_contact,
                'mother_occupation': student.mother_occupation,
                'guardian_name': student.guardian_name,
                'guardian_contact': student.guardian_contact,
                'guardian_relation': student.guardian_relation,
                'photo': student.photo.url if student.photo else None,
                'classroom': {
                    'id': student.classroom.id,
                    'name': str(student.classroom),
                    'grade': student.classroom.grade.name if student.classroom.grade else None,
                    'section': student.classroom.section,
                    'shift': student.classroom.shift,
                } if student.classroom else None,
                'campus': {
                    'id': student.campus.id,
                    'campus_name': student.campus.campus_name,
                    'campus_code': student.campus.campus_code,
                } if student.campus else None,
                'created_at': student.created_at,
                'updated_at': student.updated_at,
            })
        except Student.DoesNotExist:
            pass
    
    return Response(user_data)

# @api_view(['POST'])
# @permission_classes([IsAuthenticated])
# def logout_view(request):
#     """
#     Logout user (blacklist refresh token)
#     """
#     try:
#         refresh_token = request.data.get('refresh')
#         if refresh_token:
#             token = RefreshToken(refresh_token)
#             token.blacklist()
#         
#         return Response({'message': 'Successfully logged out'}, status=status.HTTP_200_OK)
#     
#     except Exception as e:
#         return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)


# Password Change OTP Endpoints

@api_view(['POST'])
@permission_classes([AllowAny])
def check_password_change_required(request):
    """
    Check if user needs to change password
    """
    try:
        email = request.data.get('email')
        if not email:
            return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(email=email)
            requires_change = not user.has_changed_default_password
            return Response({
                'requires_change': requires_change,
                'user_email': user.email
            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def send_password_change_otp(request):
    """
    Send OTP for password change verification
    """
    try:
        email = request.data.get('email')
        if not email:
            return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(email=email)
            
            # Check if user needs password change
            if user.has_changed_default_password:
                return Response({
                    'error': 'User has already changed password'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Create new OTP (invalidate any existing ones)
            PasswordChangeOTP.objects.filter(user=user, is_used=False).update(is_used=True)
            otp_obj = PasswordChangeOTP.objects.create(user=user)
            
            # Send OTP email
            success, message = EmailNotificationService.send_password_change_otp_email(
                user, otp_obj.otp_code
            )
            
            if success:
                return Response({
                    'message': 'OTP sent successfully',
                    'expires_in': 300  # 5 minutes
                }, status=status.HTTP_200_OK)
            else:
                return Response({'error': message}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_password_change_otp(request):
    """
    Verify OTP code for password change
    """
    try:
        email = request.data.get('email')
        otp_code = request.data.get('otp_code')
        
        if not email or not otp_code:
            return Response({
                'error': 'Email and OTP code are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(email=email)
            
            # Find valid OTP
            otp_obj = PasswordChangeOTP.objects.filter(
                user=user,
                otp_code=otp_code,
                is_used=False
            ).first()
            
            if not otp_obj:
                return Response({
                    'valid': False,
                    'message': 'Invalid OTP code'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            if otp_obj.is_expired():
                otp_obj.is_used = True
                otp_obj.save()
                return Response({
                    'valid': False,
                    'message': 'OTP has expired. Please request a new one.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Verify OTP
            if otp_obj.verify_otp(otp_code):
                return Response({
                    'valid': True,
                    'message': 'OTP verified successfully',
                    'session_token': otp_obj.session_token
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'valid': False,
                    'message': 'Invalid OTP code'
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def change_password_with_otp(request):
    """
    Change password using OTP session token
    """
    try:
        session_token = request.data.get('session_token')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')
        
        if not all([session_token, new_password, confirm_password]):
            return Response({
                'error': 'Session token, new password, and confirm password are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if new_password != confirm_password:
            return Response({
                'error': 'Passwords do not match'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Find OTP by session token
        try:
            otp_obj = PasswordChangeOTP.objects.get(
                session_token=session_token,
                is_used=True  # OTP should be used (verified)
            )
        except PasswordChangeOTP.DoesNotExist:
            return Response({
                'error': 'Invalid session token'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if session is still valid (not expired)
        if otp_obj.is_expired():
            return Response({
                'error': 'Session expired. Please request a new OTP.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user = otp_obj.user
        
        # Validate password strength
        try:
            validate_password_strength(new_password, user)
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update password
        user.set_password(new_password)
        user.has_changed_default_password = True
        user.save()
        
        # Invalidate all existing OTPs for this user
        PasswordChangeOTP.objects.filter(user=user).update(is_used=True)
        
        # Send notification to user about password change
        try:
            create_notification(
                recipient=user,
                actor=user,
                verb='password_changed',
                target_text='Your password has been changed successfully',
                data={'type': 'password_change', 'message': 'Your password was changed successfully. Please login with your new password.'}
            )
        except Exception as e:
            print(f"Error creating password change notification: {str(e)}")
        
        # If user is a teacher, notify their coordinators
        if user.is_teacher():
            try:
                # Get teacher profile using OneToOne relationship
                teacher = getattr(user, 'teacher_profile', None)
                
                if teacher and teacher.is_currently_active:
                    # Get all coordinators assigned to this teacher
                    coordinators = teacher.assigned_coordinators.filter(is_currently_active=True)
                    
                    # Get teacher name
                    teacher_name = teacher.full_name or user.get_full_name() or user.username
                    
                    for coordinator in coordinators:
                        # Find coordinator's user account
                        coordinator_user = None
                        try:
                            coordinator_user = User.objects.get(email=coordinator.email)
                        except User.DoesNotExist:
                            try:
                                coordinator_user = User.objects.get(username=coordinator.employee_code)
                            except User.DoesNotExist:
                                pass
                        
                        if coordinator_user:
                            create_notification(
                                recipient=coordinator_user,
                                actor=user,
                                verb='teacher_password_changed',
                                target_text=f'{teacher_name} has changed their password',
                                data={
                                    'type': 'teacher_password_change',
                                    'teacher_name': teacher_name,
                                    'teacher_id': teacher.id,
                                    'message': f'{teacher_name} has changed their password'
                                }
                            )
            except Exception as e:
                print(f"Error notifying coordinators about teacher password change: {str(e)}")
        
        return Response({
            'message': 'Password changed successfully. Please login again.'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Forgot Password OTP Endpoints

@api_view(['POST'])
@permission_classes([AllowAny])
def send_forgot_password_otp(request):
    """
    Send OTP for forgot password - uses email only
    """
    try:
        email = request.data.get('email')
        
        if not email:
            return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Find user by email
            user = User.objects.get(email__iexact=email.strip())
            
            # Create new OTP (invalidate any existing ones)
            PasswordChangeOTP.objects.filter(user=user, is_used=False).update(is_used=True)
            otp_obj = PasswordChangeOTP.objects.create(user=user)
            
            # Send OTP email
            success, message = EmailNotificationService.send_password_change_otp_email(
                user, otp_obj.otp_code
            )
            
            if success:
                return Response({
                    'message': 'OTP sent successfully to your registered email',
                    'expires_in': 300  # 5 minutes
                }, status=status.HTTP_200_OK)
            else:
                return Response({'error': message}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except User.DoesNotExist:
            return Response({
                'error': 'Email not found. Please verify your email address.'
            }, status=status.HTTP_404_NOT_FOUND)
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_forgot_password_otp(request):
    """
    Verify OTP for forgot password - uses email
    """
    try:
        email = request.data.get('email')
        otp_code = request.data.get('otp_code')
        
        if not email or not otp_code:
            return Response({
                'error': 'Email and OTP code are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Find user by email
            user = User.objects.get(email__iexact=email.strip())
            
            # Find valid OTP
            otp_obj = PasswordChangeOTP.objects.filter(
                user=user,
                otp_code=otp_code,
                is_used=False
            ).first()
            
            if not otp_obj:
                return Response({
                    'valid': False,
                    'message': 'Invalid OTP code'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            if otp_obj.is_expired():
                otp_obj.is_used = True
                otp_obj.save()
                return Response({
                    'valid': False,
                    'message': 'OTP has expired. Please request a new one.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Verify OTP
            if otp_obj.verify_otp(otp_code):
                return Response({
                    'valid': True,
                    'message': 'OTP verified successfully',
                    'session_token': otp_obj.session_token
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'valid': False,
                    'message': 'Invalid OTP code'
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except User.DoesNotExist:
            return Response({'error': 'Email not found'}, status=status.HTTP_404_NOT_FOUND)
            
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password_with_otp(request):
    """
    Reset password using verified OTP session
    """
    try:
        session_token = request.data.get('session_token')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')
        
        if not all([session_token, new_password, confirm_password]):
            return Response({
                'error': 'Session token, new password, and confirm password are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if new_password != confirm_password:
            return Response({
                'error': 'Passwords do not match'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Find OTP by session token
        try:
            otp_obj = PasswordChangeOTP.objects.get(
                session_token=session_token,
                is_used=True  # OTP should be used (verified)
            )
        except PasswordChangeOTP.DoesNotExist:
            return Response({
                'error': 'Invalid session token'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if session is still valid (not expired)
        if otp_obj.is_expired():
            return Response({
                'error': 'Session expired. Please request a new OTP.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user = otp_obj.user
        
        # Validate password strength
        try:
            validate_password_strength(new_password, user)
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update password
        user.set_password(new_password)
        user.has_changed_default_password = True
        user.save()
        
        # Invalidate all existing OTPs for this user
        PasswordChangeOTP.objects.filter(user=user).update(is_used=True)
        
        # Send notification to user about password reset
        try:
            create_notification(
                recipient=user,
                actor=user,
                verb='password_reset',
                target_text='Your password has been reset successfully',
                data={'type': 'password_reset', 'message': 'Your password was reset successfully. Please login with your new password.'}
            )
        except Exception as e:
            print(f"Error creating password reset notification: {str(e)}")
        
        # If user is a teacher, notify their coordinators
        if user.is_teacher():
            try:
                # Get teacher profile using OneToOne relationship
                teacher = getattr(user, 'teacher_profile', None)
                
                if teacher and teacher.is_currently_active:
                    # Get all coordinators assigned to this teacher
                    coordinators = teacher.assigned_coordinators.filter(is_currently_active=True)
                    
                    # Get teacher name
                    teacher_name = teacher.full_name or user.get_full_name() or user.username
                    
                    for coordinator in coordinators:
                        # Find coordinator's user account
                        coordinator_user = None
                        try:
                            coordinator_user = User.objects.get(email=coordinator.email)
                        except User.DoesNotExist:
                            try:
                                coordinator_user = User.objects.get(username=coordinator.employee_code)
                            except User.DoesNotExist:
                                pass
                        
                        if coordinator_user:
                            create_notification(
                                recipient=coordinator_user,
                                actor=user,
                                verb='teacher_password_changed',
                                target_text=f'{teacher_name} has changed their password',
                                data={
                                    'type': 'teacher_password_change',
                                    'teacher_name': teacher_name,
                                    'teacher_id': teacher.id,
                                    'message': f'{teacher_name} has changed their password'
                                }
                            )
            except Exception as e:
                print(f"Error notifying coordinators about teacher password change: {str(e)}")
        
        return Response({
            'message': 'Password reset successfully. Please login with your new password.'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
