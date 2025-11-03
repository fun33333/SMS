"use client";

import { useState, useEffect } from "react";
// For navigation after login (if needed)
import { useRouter } from "next/navigation";
import { FaLock, FaEnvelope, FaEye, FaEyeSlash } from "react-icons/fa";
import { 
  GraduationCap, 
  Users, 
  Crown, 
  Shield,
  User,
  
} from "lucide-react";
import { loginWithEmailPassword, ApiError } from "@/lib/api";
import { parseApiError, isAuthError } from "@/lib/error-handling";
import { PasswordChangeModal } from "@/components/auth/PasswordChangeModal";
import { ForgotPasswordModal } from "@/components/auth/ForgotPasswordModal";


type Teacher = {
  id: string;
  name: string;
  username: string;
  password: string;
  class: string;
};

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
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

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

  // Handle employee code input change
  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim().toUpperCase();
    setId(value);
    const role = detectRoleFromCode(value);
    setDetectedRole(role);
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
          <button className="mt-4 px-4 py-2 bg-[#a3cef1] rounded" onClick={() => { setTeacherInfo(null); window.localStorage.removeItem("sis_user"); }}>Logout</button>
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
      <div className="w-full max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-md overflow-hidden min-h-[600px] flex flex-col lg:flex-row border-2 border-gray-200">
          
          {/* Left Side - Login Form */}
          <div className="w-full lg:w-1/2 p-6 sm:p-8 lg:p-12 flex flex-col justify-center relative">
            {/* Logo Section */}
            <div className="flex items-center justify-center mb-8">
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
            <div className="text-center mb-8">
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
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-[#6096ba] hover:text-[#274c77] transition-colors"
                      >
                        {showPassword ? <FaEyeSlash className="text-lg" /> : <FaEye className="text-lg" />}
                      </button>
                    </div>
                  </div>

                  {/* Login Button */}
                  <button
                    type="submit"
                    className="w-full h-12 sm:h-14 bg-[#a3cef1] hover:bg-[#87b9e3] text-black font-semibold rounded-xl shadow-sm hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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
                        className="text-red-400 hover:text-red-600 transition-colors"
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
                      className="text-[#6096ba] hover:text-[#274c77] font-medium text-sm transition-colors"
                      onClick={() => setShowForgotPasswordModal(true)}
                    >
                      Forgot your password?
                    </button>
                  </div>
                </>
            </form>
          </div>

          {/* Right Side - Welcome Section */}
          <div className="w-full lg:w-1/2 bg-gradient-to-br from-[#6096ba] to-[#a3cef1] relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full transform translate-x-48 -translate-y-48"></div>
              <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full transform -translate-x-40 translate-y-40"></div>
              <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white rounded-full transform -translate-x-32 -translate-y-32"></div>
            </div>

            {/* Content */}
            <div className="relative z-10 h-full flex flex-col justify-center items-center text-center p-8 lg:p-12">
              <div className="max-w-md">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl text-white font-bold mb-6 leading-tight">
                  WELCOME BACK
                </h2>
                <p className="text-white text-lg sm:text-xl leading-relaxed mb-8">
                  Access your school management portal to manage classes, students, and academic records all in one place.
                </p>
                
                {/* Features List */}
                <div className="space-y-4 text-left">
                  <div className="flex items-center text-white">
                    <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                    <span>Student Management</span>
                  </div>
                  <div className="flex items-center text-white">
                    <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                    <span>Attendance Tracking</span>
                  </div>
                  <div className="flex items-center text-white">
                    <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                    <span>Academic Records</span>
                  </div>
                  <div className="flex items-center text-white">
                    <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                    <span>Real-time Updates</span>
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

      {/* Forgot Password Modal */}
      {showForgotPasswordModal && (
        <ForgotPasswordModal
          onClose={() => setShowForgotPasswordModal(false)}
          onSuccess={() => {
            setShowForgotPasswordModal(false);
            setError({
              title: "Password Reset Successful",
              message: "Your password has been reset successfully. Please login with your new password.",
              type: "success"
            });
          }}
        />
      )}
    </div>
  );
}