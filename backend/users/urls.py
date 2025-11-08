from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    UserRegistrationView,
    UserLoginView,
    UserProfileView,
    UserListView,
    check_email_exists,
    # refresh_token_view,
    # logout_view,
    current_user_profile,
    check_password_change_required,
    send_password_change_otp,
    verify_password_change_otp,
    change_password_with_otp,
    send_forgot_password_otp,
    verify_forgot_password_otp,
    reset_password_with_otp
)

urlpatterns = [
    # Authentication endpoints
    path('auth/login/', UserLoginView.as_view(), name='user_login'),
    path('auth/register/', UserRegistrationView.as_view(), name='user_register'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # path('auth/logout/', logout_view, name='user_logout'),
    
    # User management endpoints
    path('profile/', UserProfileView.as_view(), name='user_profile'),
    path('current-user/', current_user_profile, name='current_user_profile'),
    path('users/', UserListView.as_view(), name='user_list'),
    path('users/check-email/', check_email_exists, name='check_email_exists'),
    
    # Password change OTP endpoints
    path('check-password-change-required/', check_password_change_required, name='check_password_change_required'),
    path('send-password-change-otp/', send_password_change_otp, name='send_password_change_otp'),
    path('verify-password-change-otp/', verify_password_change_otp, name='verify_password_change_otp'),
    path('change-password-with-otp/', change_password_with_otp, name='change_password_with_otp'),
    
    # Forgot password OTP endpoints
    path('send-forgot-password-otp/', send_forgot_password_otp, name='send_forgot_password_otp'),
    path('verify-forgot-password-otp/', verify_forgot_password_otp, name='verify_forgot_password_otp'),
    path('reset-password-with-otp/', reset_password_with_otp, name='reset_password_with_otp'),
]
