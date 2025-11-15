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
  const [employeeCode, setEmployeeCode] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);

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
    if (!employeeCode.trim()) {
      setError('Please enter your employee code');
      return;
    }

    // Validate employee code format
    const employeeCodeOk = /^[A-Z0-9-]+$/.test(employeeCode.trim());
    if (!employeeCodeOk) {
      setError('Please enter a valid employee code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await sendForgotPasswordOTP(employeeCode.trim());
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
      const response = await verifyForgotPasswordOTP(employeeCode.trim(), otpCode.trim());
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
      await sendForgotPasswordOTP(employeeCode.trim());
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
    setStep('employee-code');
    setEmployeeCode('');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setSessionToken('');
    setError('');
    setSuccess('');
    setTimeLeft(0);
    setCanResend(false);
    onClose();
  };

  const renderStepContent = () => {
    switch (step) {
      case 'employee-code':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Reset Your Password</h3>
              <p className="text-sm text-gray-600">
                Enter your employee code to receive a verification code
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="employee-code" className="block text-sm font-medium text-gray-700 mb-2">
                  Employee Code
                </label>
                <input
                  id="employee-code"
                  type="text"
                  value={employeeCode}
                  onChange={(e) => {
                    const formatted = formatEmployeeCode(e.target.value);
                    setEmployeeCode(formatted);
                  }}
                  placeholder="C01-M-25-T-0068"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <button
                onClick={handleSendOTP}
                disabled={loading || !employeeCode.trim()}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Verification Code'}
              </button>
            </div>
          </div>
        );

      case 'otp-verify':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Mail className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Enter Verification Code</h3>
              <p className="text-sm text-gray-600">
                We've sent a 6-digit code to your registered email
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="otp-code" className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg tracking-widest"
                  disabled={loading}
                />
              </div>

              {timeLeft > 0 && (
                <div className="text-center text-sm text-gray-600">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Code expires in {formatTime(timeLeft)}
                </div>
              )}

              <button
                onClick={handleVerifyOTP}
                disabled={loading || !otpCode.trim() || otpCode.trim().length !== 6}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>

              {canResend && (
                <button
                  onClick={handleResendOTP}
                  disabled={loading}
                  className="w-full text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Resend Code
                </button>
              )}
            </div>
          </div>
        );

      case 'password-reset':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Set New Password</h3>
              <p className="text-sm text-gray-600">
                Create a strong password for your account
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
                <PasswordStrengthIndicator password={newPassword} />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <button
                onClick={handleResetPassword}
                disabled={loading || !newPassword.trim() || !confirmPassword.trim()}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Password Reset Successful!</h3>
              <p className="text-sm text-gray-600">
                Your password has been reset successfully. You can now login with your new password.
              </p>
            </div>

            <button
              onClick={onSuccess}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Forgot Password</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 rounded-md p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-start">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          {renderStepContent()}
        </div>
      </div>
    </div>
  );
};
