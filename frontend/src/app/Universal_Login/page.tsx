"use client";

import { useState, useEffect } from "react";
// For navigation after login (if needed)
import { useRouter } from "next/navigation";
import { FaLock, FaEnvelope, FaEye, FaEyeSlash, FaArrowLeft } from "react-icons/fa";
import { 
  GraduationCap, 
  Users, 
  Crown, 
  Shield,
  User,
  Mail,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { loginWithEmailPassword, ApiError, sendForgotPasswordOTP, verifyForgotPasswordOTP, resetPasswordWithOTP } from "@/lib/api";
import { parseApiError, isAuthError } from "@/lib/error-handling";
import { PasswordChangeModal } from "@/components/auth/PasswordChangeModal";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";


type Teacher = {
  id: string;
  name: string;
  username: string;
  password: string;
  class: string;
};

type ForgotPasswordStep = 'employee-code' | 'otp-verify' | 'password-reset' | 'success';

export default function LoginPage() {
  const [detectedRole, setDetectedRole] = useState<string>("");
  const [animate, setAnimate] = useState(false);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [teacherInfo, setTeacherInfo] = useState<Teacher | null>(null);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  
  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotPasswordStep>('employee-code');
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('sis_access_token');
      if (token) {
        localStorage.clear();
        document.cookie = 'sis_access_token=; path=/; max-age=0';
        document.cookie = 'sis_refresh_token=; path=/; max-age=0';
      }
    }
    
    return () => clearTimeout(timer);
  }, []);

  // OTP Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (forgotStep === 'otp-verify' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [forgotStep, timeLeft]);

  // Function to get role-specific icon
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'Teacher': return <GraduationCap className="h-5 w-5" />;
      case 'Coordinator': return <Users className="h-5 w-5" />;
      case 'Principal': return <Crown className="h-5 w-5" />;
      case 'Super Admin': return <Shield className="h-5 w-5" />;
      default: return <User className="h-5 w-5" />;
    }
  };

  // Function to detect role from employee code
  const detectRoleFromCode = (code: string): string => {
    if (!code) return "";
    
    // Employee code patterns:
    // Teacher: C01-M-25-T-0000
    // Coordinator: C01-M-25-C-0000  
    // Principal: C01-M-25-P-0000
    // Superadmin: S-25-0001 (NEW FORMAT - campus independent)
    
    // Check for super admin format first (S-25-0001)
    if (code.startsWith('S-') && code.split('-').length === 3) {
      return 'Super Admin';
    }
    
    // Check for campus-based format (C01-M-25-X-0000)
    const parts = code.split('-');
    if (parts.length >= 4) {
      const roleCode = parts[3].charAt(0).toUpperCase();
      switch (roleCode) {
        case 'T': return 'Teacher';
        case 'C': return 'Coordinator';
        case 'P': return 'Principal';
        case 'S': return 'Super Admin'; // Legacy format
        default: return '';
      }
    }
    return '';
  };

  // Format employee code with auto dashes
  const formatEmployeeCode = (value: string): string => {
    // Remove all dashes and spaces, convert to uppercase
    let cleaned = value.replace(/[-\s]/g, '').toUpperCase();
    
    // Check if it's Super Admin format (S-XX-XXXX)
    if (cleaned.startsWith('S') && cleaned.length > 1) {
      // Super Admin format: S-XX-XXXX
      if (cleaned.length <= 1) return cleaned;
      if (cleaned.length <= 3) return `${cleaned.slice(0, 1)}-${cleaned.slice(1)}`;
      return `${cleaned.slice(0, 1)}-${cleaned.slice(1, 3)}-${cleaned.slice(3, 7)}`;
    }
    
    // Regular format: C06-M-22-T-0012 (XXX-X-XX-X-XXXX)
    if (cleaned.length === 0) return '';
    if (cleaned.length <= 3) return cleaned; // C06
    if (cleaned.length <= 4) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`; // C06-M
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 4)}-${cleaned.slice(4)}`; // C06-M-22
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6)}`; // C06-M-22-T
    // C06-M-22-T-0012 (max 13 chars with dashes, or 11 chars without)
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 7)}-${cleaned.slice(7, 11)}`;
  };

  // Handle employee code input change
  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const formatted = formatEmployeeCode(inputValue);
    setId(formatted);
    const role = detectRoleFromCode(formatted);
    setDetectedRole(role);
  };

  // Format time for OTP timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Forgot Password Handlers
  const handleSendOTP = async () => {
    if (!forgotEmail.trim()) {
      setError({
        title: "Email Required",
        message: "Please enter your email address",
        type: "error"
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail.trim())) {
      setError({
        title: "Invalid Email",
        message: "Please enter a valid email address",
        type: "error"
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await sendForgotPasswordOTP(forgotEmail.trim());
      setForgotStep('otp-verify');
      setTimeLeft(300);
      setCanResend(false);
      setError({
        title: "Success",
        message: "OTP sent successfully to your email",
        type: "success"
      });
    } catch (err: any) {
      setError({
        title: "Error",
        message: err.message || 'Failed to send OTP. Please try again.',
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim()) {
      setError({
        title: "OTP Required",
        message: "Please enter the OTP code",
        type: "error"
      });
      return;
    }

    if (otpCode.trim().length !== 6) {
      setError({
        title: "Invalid OTP",
        message: "Please enter a valid 6-digit OTP code",
        type: "error"
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await verifyForgotPasswordOTP(forgotEmail.trim(), otpCode.trim());
      if (response.valid) {
        setSessionToken(response.session_token);
        setForgotStep('password-reset');
        setError({
          title: "Success",
          message: "OTP verified successfully",
          type: "success"
        });
      } else {
        setError({
          title: "Invalid OTP",
          message: response.message || 'Invalid OTP code',
          type: "error"
        });
      }
    } catch (err: any) {
      setError({
        title: "Error",
        message: err.message || 'Failed to verify OTP. Please try again.',
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) {
      setError({
        title: "Password Required",
        message: "Please enter a new password",
        type: "error"
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setError({
        title: "Password Mismatch",
        message: "Passwords do not match",
        type: "error"
      });
      return;
    }

    if (newPassword.length < 8) {
      setError({
        title: "Weak Password",
        message: "Password must be at least 8 characters long",
        type: "error"
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await resetPasswordWithOTP(sessionToken, newPassword, confirmPassword);
      setForgotStep('success');
      setError({
        title: "Success",
        message: "Password reset successfully! You can now login with your new password.",
        type: "success"
      });
    } catch (err: any) {
      setError({
        title: "Error",
        message: err.message || 'Failed to reset password. Please try again.',
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    setError(null);

    try {
      await sendForgotPasswordOTP(forgotEmail.trim());
      setTimeLeft(300);
      setCanResend(false);
      setError({
        title: "Success",
        message: "OTP resent successfully",
        type: "success"
      });
    } catch (err: any) {
      setError({
        title: "Error",
        message: err.message || 'Failed to resend OTP. Please try again.',
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setForgotStep('employee-code');
    setForgotEmail('');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setSessionToken('');
    setError(null);
    setTimeLeft(0);
    setCanResend(false);
  };

  // Render Forgot Password Form based on step
  const renderForgotPasswordForm = () => {
    switch (forgotStep) {
      case 'employee-code':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right duration-500">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-[#6096ba] to-[#a3cef1] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-black mb-2">Reset Password</h2>
              <p className="text-[#6096ba] text-sm sm:text-base">
                Enter your email to receive a verification code
              </p>
            </div>

            <div className="space-y-4">
              {/* Error Display */}
              {error && (
                <div className={`border-2 rounded-xl p-4 flex items-start gap-3 ${
                  error.type === 'success' 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  {error.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium text-sm ${
                      error.type === 'success' ? 'text-green-800' : 'text-red-800'
                    }`}>{error.message}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className={`transition-colors cursor-pointer ${
                      error.type === 'success' 
                        ? 'text-green-400 hover:text-green-600' 
                        : 'text-red-400 hover:text-red-600'
                    }`}
                    aria-label="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="forgot-email" className="block text-sm font-semibold text-[#274c77]">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full h-12 sm:h-14 border-2 border-[#a3cef1] rounded-xl pl-12 pr-4 text-[#274c77] text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#6096ba] shadow-sm transition-all duration-200 placeholder:text-[#6096ba]"
                    disabled={loading}
                  />
                  <FaEnvelope className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6096ba] text-lg" />
                </div>
              </div>

              <button
                onClick={handleSendOTP}
                disabled={loading || !forgotEmail.trim()}
                className="w-full h-12 sm:h-14 bg-[#a3cef1] hover:bg-[#87b9e3] text-black font-semibold rounded-xl shadow-sm hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mr-2"></div>
                    Sending...
                  </div>
                ) : 'Send Verification Code'}
              </button>

              {/* Back to Login Button */}
              <div className="text-center pt-2">
                <button
                  onClick={handleBackToLogin}
                  className="flex items-center justify-center gap-2 text-[#6096ba] hover:text-[#274c77] font-semibold transition-colors mx-auto cursor-pointer"
                >
                  <FaArrowLeft className="text-sm" />
                  <span>Back to Login</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'otp-verify':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right duration-500">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-[#6096ba] to-[#a3cef1] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-black mb-2">Enter Code</h2>
              <p className="text-[#6096ba] text-sm sm:text-base">
                We've sent a 6-digit code to your email
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="otp-code" className="block text-sm font-semibold text-[#274c77]">
                  Verification Code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full h-14 border-2 border-[#a3cef1] rounded-xl px-4 text-[#274c77] text-2xl text-center font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[#6096ba] shadow-sm transition-all duration-200 placeholder:text-[#6096ba] placeholder:text-base placeholder:tracking-normal"
                  disabled={loading}
                />
              </div>

              {timeLeft > 0 && (
                <div className="text-center text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg py-2 px-4 flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 text-[#6096ba]" />
                  <span>Code expires in <span className="font-semibold text-[#274c77]">{formatTime(timeLeft)}</span></span>
                </div>
              )}

              <button
                onClick={handleVerifyOTP}
                disabled={loading || !otpCode.trim() || otpCode.trim().length !== 6}
                className="w-full h-12 sm:h-14 bg-[#a3cef1] hover:bg-[#87b9e3] text-black font-semibold rounded-xl shadow-sm hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mr-2"></div>
                    Verifying...
                  </div>
                ) : 'Verify Code'}
              </button>

              {canResend && (
                <button
                  onClick={handleResendOTP}
                  disabled={loading}
                  className="w-full text-[#6096ba] hover:text-[#274c77] text-sm font-semibold hover:bg-blue-50 py-2 rounded-lg transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
                >
                  Resend Code
                </button>
              )}

              {/* Back to Login Button */}
              <div className="text-center pt-2">
                <button
                  onClick={handleBackToLogin}
                  className="flex items-center justify-center gap-2 text-[#6096ba] hover:text-[#274c77] font-semibold transition-colors mx-auto cursor-pointer"
                >
                  <FaArrowLeft className="text-sm" />
                  <span>Back to Login</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'password-reset':
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-right duration-500">
            <div className="text-center mb-4">
              <div className="mx-auto w-14 h-14 bg-gradient-to-br from-[#6096ba] to-[#a3cef1] rounded-2xl flex items-center justify-center mb-3 shadow-lg">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-black mb-1">New Password</h2>
              <p className="text-[#6096ba] text-xs sm:text-sm">
                Create a strong password for your account
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="new-password" className="block text-sm font-semibold text-[#274c77]">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full h-12 sm:h-14 border-2 border-[#a3cef1] rounded-xl pl-12 pr-4 text-[#274c77] text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#6096ba] shadow-sm transition-all duration-200 placeholder:text-[#6096ba]"
                    disabled={loading}
                  />
                  <FaLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6096ba] text-lg" />
                </div>
                <PasswordStrengthIndicator password={newPassword} />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-[#274c77]">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full h-12 sm:h-14 border-2 border-[#a3cef1] rounded-xl pl-12 pr-4 text-[#274c77] text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#6096ba] shadow-sm transition-all duration-200 placeholder:text-[#6096ba]"
                    disabled={loading}
                  />
                  <FaLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6096ba] text-lg" />
                </div>
              </div>

              <button
                onClick={handleResetPassword}
                disabled={loading || !newPassword.trim() || !confirmPassword.trim()}
                className="w-full h-12 bg-gradient-to-r from-[#6096ba] to-[#a3cef1] hover:from-[#4a7ba0] hover:to-[#87b9e3] text-white font-semibold rounded-xl shadow-sm hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Resetting...
                  </div>
                ) : 'Reset Password'}
              </button>

              {/* Back to Login Button */}
              <div className="text-center pt-1">
                <button
                  onClick={handleBackToLogin}
                  className="flex items-center justify-center gap-2 text-[#6096ba] hover:text-[#274c77] font-semibold text-sm transition-colors mx-auto"
                >
                  <FaArrowLeft className="text-xs" />
                  <span>Back to Login</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-right duration-500">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-[#6096ba] to-[#a3cef1] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-black mb-2">Success!</h2>
              <p className="text-[#6096ba] text-xs sm:text-sm mb-6">
                Your password has been reset successfully. You can now login with your new password.
              </p>

              <button
                onClick={handleBackToLogin}
                className="w-full h-12 bg-gradient-to-r from-[#6096ba] to-[#a3cef1] hover:from-[#4a7ba0] hover:to-[#87b9e3] text-white font-semibold rounded-xl shadow-sm hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                Back to Login
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Login handler: all roles use backend email/password
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      const email = id.trim();
      
      // Validate employee code format
      const employeeCodeOk = /^[A-Z0-9-]+$/.test(email);
      if (!employeeCodeOk) {
        setError({
          title: "Invalid Employee Code",
          message: "Please enter a valid employee code",
          type: "error"
        });
        setLoading(false);
        return;
      }
      
      // Validate password
      if (!password.trim()) {
        setError({
          title: "Password Required",
          message: "Please enter your password",
          type: "error"
        });
        setLoading(false);
        return;
      }
      
      const data = await loginWithEmailPassword(email, password);
      
      // Check if password change is required
      if (data?.requires_password_change) {
        setUserEmail(data.user_email);
        setShowPasswordChangeModal(true);
        return;
      }
      
      const userRole = String(data?.user?.role || "").toLowerCase();
      
      // Redirect based on role
      if (userRole.includes("coord")) {
        router.push("/admin/coordinator");
      } else if (userRole.includes("teach")) {
        router.push("/admin/students/student-list");
      } else if (userRole.includes("princ")) {
        router.push("/admin");
      } else {
        router.push("/admin");
      }
    } catch (err: any) {
      console.error('Login error:', err);
      
      // Handle authentication errors specially
      if (isAuthError(err)) {
        setError({
          title: "Authentication Failed",
          message: "Invalid employee code or password. Please check your credentials and try again.",
          type: "error"
        });
      } else {
        // Parse other errors using our error handling utility
        const errorInfo = parseApiError(err);
        setError(errorInfo);
      }
    } finally {
      setLoading(false);
    }
  };

  // If already logged in, show info (for demo)
  if (teacherInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="bg-white border rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold mb-4">Welcome, {teacherInfo.name}!</h2>
          <p className="mb-2">Role: Teacher</p>
          <p className="mb-2">Assigned Class: {teacherInfo.class}</p>
          <button className="mt-4 px-4 py-2 bg-[#a3cef1] rounded cursor-pointer" onClick={() => { setTeacherInfo(null); window.localStorage.removeItem("sis_user"); }}>Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      {/* Password Change Modal */}
      {showPasswordChangeModal && (
        <PasswordChangeModal
          userEmail={userEmail}
          onComplete={() => {
            setShowPasswordChangeModal(false);
            setUserEmail('');
            // Redirect to login page after password change
            window.location.href = '/Universal_Login';
          }}
          onError={(error) => {
            setError({
              title: "Password Change Error",
              message: error,
              type: "error"
            });
          }}
        />
      )}
      
      {/* Main Container - Responsive */}
      <div className={`w-full max-w-5xl mx-auto transition-all duration-700 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="bg-white rounded-xl shadow-md overflow-hidden min-h-[400px] flex flex-col lg:flex-row border-2 border-gray-200">
          
          {/* Left Side - Forms Container with Slide Animation */}
          <div className="w-full lg:w-1/2 p-4 sm:p-6 lg:p-8 flex flex-col justify-center relative overflow-hidden">
            <div className={`transition-all duration-700 ease-in-out ${showForgotPassword ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'}`}>
              {/* Login Form */}
              <div>
            {/* Logo Section */}
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-xl shadow-lg">
                  <img src="/Logo 2 pen.png" alt="Logo" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
                </div>
                <div className="text-left">
                  <h1 className="text-xl sm:text-2xl font-bold text-[#274c77]">School Portal</h1>
                  <p className="text-sm text-[#6096ba]">Management System</p>
                </div>
              </div>
            </div>

            {/* Form Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-black mb-2">
                Login
              </h2>
              <p className="text-[#6096ba] text-sm sm:text-base">
                Sign in to access your dashboard
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
                <>
                  {/* Role Detection Display */}
                  {detectedRole && (
                    <div className="w-full">
                      <div className="w-full h-12 sm:h-14 rounded-xl px-4 sm:px-6 text-sm sm:text-base text-[#274c77] font-semibold shadow-sm border-2 border-[#6096ba] bg-[#a3cef1] flex items-center justify-center gap-3 transition-all duration-300">
                        {getRoleIcon(detectedRole)}
                        <span>{detectedRole}</span>
                      </div>
                    </div>
                  )}

                  {/* Employee Code Input */}
                  <div className="space-y-2">
                    <label htmlFor="login-email" className="block text-sm font-semibold text-[#274c77]">
                      Employee Code
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="login-email"
                        required
                        value={id}
                        onChange={handleIdChange}
                        className="w-full h-12 sm:h-14 border-2 border-[#a3cef1] rounded-xl pl-12 pr-4 text-[#274c77] text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#6096ba] shadow-sm transition-all duration-200 placeholder:text-[#6096ba]"
                        placeholder="C01-M-25-T-0000"
                      />
                      <FaEnvelope className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6096ba] text-lg" />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-2">
                    <label htmlFor="login-password" className="block text-sm font-semibold text-[#274c77]">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        id="login-password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full h-12 sm:h-14 border-2 border-[#a3cef1] rounded-xl pl-12 pr-12 text-[#274c77] text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#6096ba] shadow-sm transition-all duration-200 placeholder:text-[#6096ba]"
                        placeholder="Enter your password"
                      />
                      <FaLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6096ba] text-lg" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-[#6096ba] hover:text-[#274c77] transition-colors cursor-pointer"
                      >
                        {showPassword ? <FaEyeSlash className="text-lg" /> : <FaEye className="text-lg" />}
                      </button>
                    </div>
                  </div>

                  {/* Login Button */}
                  <button
                    type="submit"
                    className="w-full h-12 sm:h-14 bg-[#a3cef1] hover:bg-[#87b9e3] text-black font-semibold rounded-xl shadow-sm hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mr-2"></div>
                        Logging in...
                      </div>
                    ) : (
                      detectedRole ? `Login as ${detectedRole}` : "Login"
                    )}
                  </button>
                  
                  {/* Error Display */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                      <div className="w-5 h-5 bg-red-500 rounded-full flex-shrink-0 mt-0.5"></div>
                      <div className="flex-1">
                        <p className="text-red-800 font-medium text-sm">{error.message}</p>
                      </div>
                      <button
                        onClick={() => setError(null)}
                        className="text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                        aria-label="Dismiss error"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Forgot Password Link */}
                  <div className="text-center">
                    <button
                      type="button"
                      className="text-[#6096ba] hover:text-[#274c77] font-medium text-sm transition-colors cursor-pointer"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setError(null);
                      }}
                    >
                      Forgot your password?
                    </button>
                  </div>
                </>
            </form>
            </div>
            </div>

            {/* Forgot Password Form - Slides in from right */}
            <div className={`absolute inset-0 p-4 sm:p-6 lg:p-8 flex flex-col justify-center transition-all duration-700 ease-in-out ${showForgotPassword ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>
              {renderForgotPasswordForm()}
            </div>
          </div>

          {/* Right Side - Welcome Section */}
          <div className="w-full lg:w-1/2 bg-gradient-to-br from-[#6096ba] to-[#a3cef1] relative overflow-hidden">
            {/* Animated Background Pattern */}
            <div className="absolute inset-0">
              {/* Gradient Overlays */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#6096ba]/30 via-transparent to-[#a3cef1]/30"></div>
              
              {/* Animated Circles */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl transform translate-x-48 -translate-y-48 animate-pulse"></div>
              <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/10 rounded-full blur-3xl transform -translate-x-40 translate-y-40 animate-pulse" style={{animationDelay: '1s'}}></div>
              <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/5 rounded-full blur-2xl transform -translate-x-32 -translate-y-32 animate-pulse" style={{animationDelay: '2s'}}></div>
              
              {/* Grid Pattern */}
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: `linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)`,
                backgroundSize: '50px 50px'
              }}></div>
            </div>

            {/* Content */}
            <div className="relative z-10 h-full flex flex-col justify-center items-center text-center p-6 lg:p-8">
              <div className="max-w-md space-y-4">
                {/* Decorative Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center shadow-2xl border border-white/30 transform hover:scale-110 transition-transform duration-300">
                    <GraduationCap className="w-10 h-10 text-white" />
                  </div>
                </div>

                <div>
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl text-white font-extrabold mb-4 leading-tight drop-shadow-lg">
                    Welcome Back
                  </h2>
                  <p className="text-white/90 text-base sm:text-lg leading-relaxed mb-6 font-medium">
                    Access your school management portal to manage classes, students, and academic records all in one place.
                  </p>
                </div>
                
                {/* Features List */}
                <div className="space-y-3 text-left bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-xl">
                  <div className="flex items-center text-white group hover:translate-x-2 transition-transform duration-300">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mr-4 group-hover:bg-white/30 transition-colors duration-300">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-base">Student Management</span>
                  </div>
                  <div className="flex items-center text-white group hover:translate-x-2 transition-transform duration-300">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mr-4 group-hover:bg-white/30 transition-colors duration-300">
                      <Shield className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-base">Attendance Tracking</span>
                  </div>
                  <div className="flex items-center text-white group hover:translate-x-2 transition-transform duration-300">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mr-4 group-hover:bg-white/30 transition-colors duration-300">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-base">Academic Records</span>
                  </div>
                  <div className="flex items-center text-white group hover:translate-x-2 transition-transform duration-300">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mr-4 group-hover:bg-white/30 transition-colors duration-300">
                      <Crown className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-base">Real-time Updates</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordChangeModal && (
        <PasswordChangeModal
          userEmail={userEmail}
          onComplete={() => {
            setShowPasswordChangeModal(false);
            setUserEmail('');
            // Redirect to login page after password change
            window.location.href = '/Universal_Login';
          }}
          onError={(error) => {
            setError({
              title: "Password Change Error",
              message: error,
              type: "error"
            });
          }}
        />
      )}
    </div>
  );
}