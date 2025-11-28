"use client";

import React, { useState, useEffect } from 'react';
import { X, Mail, Shield, CheckCircle, AlertCircle, Clock, User } from 'lucide-react';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import { sendForgotPasswordOTP, verifyForgotPasswordOTP, resetPasswordWithOTP } from '@/lib/api';

interface ForgotPasswordModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'employee-code' | 'otp-verify' | 'password-reset' | 'success';

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<Step>('employee-code');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Countdown timer for OTP
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'otp-verify' && timeLeft > 0) {
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
  }, [step, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  const handleSendOTP = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await sendForgotPasswordOTP(email.trim());
      setStep('otp-verify');
      setTimeLeft(300); // 5 minutes
      setCanResend(false);
      setSuccess('OTP sent successfully to your registered email');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim()) {
      setError('Please enter the OTP code');
      return;
    }

    if (otpCode.trim().length !== 6) {
      setError('Please enter a valid 6-digit OTP code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await verifyForgotPasswordOTP(email.trim(), otpCode.trim());
      if (response.valid) {
        setSessionToken(response.session_token);
        setStep('password-reset');
        setSuccess('OTP verified successfully');
      } else {
        setError(response.message || 'Invalid OTP code');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) {
      setError('Please enter a new password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await resetPasswordWithOTP(sessionToken, newPassword, confirmPassword);
      setStep('success');
      setSuccess('Password reset successfully! You can now login with your new password.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    setError('');

    try {
      await sendForgotPasswordOTP(email.trim());
      setTimeLeft(300); // 5 minutes
      setCanResend(false);
      setSuccess('OTP resent successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setStep('employee-code');
      setEmail('');
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
      setSessionToken('');
      setError('');
      setSuccess('');
      setTimeLeft(0);
      setCanResend(false);
      onClose();
    }, 300);
  };

  const renderStepContent = () => {
    switch (step) {
      case 'employee-code':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-500">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-[#6096ba] to-[#a3cef1] rounded-2xl flex items-center justify-center mb-4 shadow-lg transform hover:scale-110 transition-transform duration-300">
                <User className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-[#274c77] mb-2">Reset Your Password</h3>
              <p className="text-sm text-gray-600">
                Enter your email to receive a verification code
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-[#274c77] mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full px-4 py-3 pl-12 border-2 border-[#a3cef1] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6096ba] focus:border-transparent shadow-sm hover:shadow-md transition-all duration-200 text-[#274c77] font-medium placeholder:text-gray-400"
                    disabled={loading}
                  />
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#6096ba] w-5 h-5" />
                </div>
              </div>

              <button
                onClick={handleSendOTP}
                disabled={loading || !email.trim()}
                className="w-full bg-gradient-to-r from-[#6096ba] to-[#a3cef1] text-white py-3 px-4 rounded-xl font-semibold hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#6096ba] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Sending...
                  </div>
                ) : 'Send Verification Code'}
              </button>
            </div>
          </div>
        );

      case 'otp-verify':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-500">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-[#6096ba] to-[#a3cef1] rounded-2xl flex items-center justify-center mb-4 shadow-lg transform hover:scale-110 transition-transform duration-300">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-[#274c77] mb-2">Enter Verification Code</h3>
              <p className="text-sm text-gray-600">
                We've sent a 6-digit code to your registered email
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="otp-code" className="block text-sm font-semibold text-[#274c77] mb-2">
                  Verification Code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-4 py-3 border-2 border-[#a3cef1] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6096ba] focus:border-transparent shadow-sm hover:shadow-md transition-all duration-200 text-center text-2xl tracking-[0.5em] font-bold text-[#274c77] placeholder:text-gray-400 placeholder:tracking-normal placeholder:text-base"
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
                className="w-full bg-gradient-to-r from-[#6096ba] to-[#a3cef1] text-white py-3 px-4 rounded-xl font-semibold hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#6096ba] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
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
            </div>
          </div>
        );

      case 'password-reset':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-500">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg transform hover:scale-110 transition-transform duration-300">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-[#274c77] mb-2">Set New Password</h3>
              <p className="text-sm text-gray-600">
                Create a strong password for your account
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-semibold text-[#274c77] mb-2">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-4 py-3 border-2 border-[#a3cef1] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6096ba] focus:border-transparent shadow-sm hover:shadow-md transition-all duration-200 text-[#274c77] font-medium placeholder:text-gray-400"
                  disabled={loading}
                />
                <PasswordStrengthIndicator password={newPassword} />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-[#274c77] mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 border-2 border-[#a3cef1] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6096ba] focus:border-transparent shadow-sm hover:shadow-md transition-all duration-200 text-[#274c77] font-medium placeholder:text-gray-400"
                  disabled={loading}
                />
              </div>

              <button
                onClick={handleResetPassword}
                disabled={loading || !newPassword.trim() || !confirmPassword.trim()}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 px-4 rounded-xl font-semibold hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Resetting...
                  </div>
                ) : 'Reset Password'}
              </button>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-500">
            <div className="text-center">
              <div className="mx-auto w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg animate-bounce">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-[#274c77] mb-3">Password Reset Successful!</h3>
              <p className="text-sm text-gray-600">
                Your password has been reset successfully. You can now login with your new password.
              </p>
            </div>

            <button
              onClick={onSuccess}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 px-4 rounded-xl font-semibold hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transform hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            >
              Continue to Login
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className={`fixed inset-0 bg-black flex items-center justify-center z-50 p-4 transition-all duration-300 ${
        isVisible && !isClosing ? 'bg-opacity-50' : 'bg-opacity-0'
      }`}
      style={{ backdropFilter: isVisible && !isClosing ? 'blur(4px)' : 'blur(0px)' }}
    >
      <div 
        className={`bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto transform transition-all duration-300 ${
          isVisible && !isClosing 
            ? 'scale-100 opacity-100 translate-y-0' 
            : 'scale-95 opacity-0 translate-y-4'
        }`}
      >
        <div className="p-6 sm:p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-[#274c77] to-[#6096ba] bg-clip-text text-transparent">
              Forgot Password
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#6096ba] rounded-lg p-1.5 hover:bg-gray-100 transition-all duration-200 hover:rotate-90 transform cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl flex items-start shadow-sm animate-in slide-in-from-top duration-300">
              <AlertCircle className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 font-medium">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl flex items-start shadow-sm animate-in slide-in-from-top duration-300">
              <CheckCircle className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium">{success}</p>
            </div>
          )}

          <div className="transition-all duration-300">
            {renderStepContent()}
          </div>
        </div>
      </div>
    </div>
  );
};
