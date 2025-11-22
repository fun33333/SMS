"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Loader2, CheckCircle } from "lucide-react"
import { getApiBaseUrl } from "@/lib/api"

interface PersonalInfoStepProps {
  formData: any
  invalidFields: string[]
  onInputChange: (field: string, value: any) => void
  fieldErrors: Record<string, string>
  setFieldErrors: (errors: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void
  isValidating: Record<string, boolean>
  setIsValidating: (validating: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
}

export function PersonalInfoStep({ formData, invalidFields, onInputChange, fieldErrors, setFieldErrors, isValidating, setIsValidating }: PersonalInfoStepProps) {
  const validationTimeouts = useRef<Record<string, NodeJS.Timeout>>({})

  // CNIC validation function
  const validateCNIC = (cnic: string): { isValid: boolean; message: string } => {
    const cleanCNIC = cnic.replace(/\D/g, '')
    
    if (cleanCNIC.length !== 13) {
      return { isValid: false, message: 'CNIC must be exactly 13 digits. You can enter it as 42101-3947805-1 or 4210139478051' }
    }
    
    const cnicPattern = /^[0-9]{13}$/
    if (!cnicPattern.test(cleanCNIC)) {
      return { isValid: false, message: 'CNIC must contain only numbers' }
    }
    
    return { isValid: true, message: '' }
  }

  // Contact number validation
  const validateContactNumber = (contact: string): { isValid: boolean; message: string } => {
    const cleanContact = contact.replace(/\D/g, '')
    
    if (cleanContact.length < 10 || cleanContact.length > 15) {
      return { isValid: false, message: 'Contact number must be between 10-15 digits' }
    }
    
    return { isValid: true, message: '' }
  }

  // Email validation
  const validateEmail = (email: string): { isValid: boolean; message: string } => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email)) {
      return { isValid: false, message: 'Please enter a valid email address (e.g., teacher@school.com)' }
    }
    return { isValid: true, message: '' }
  }

  // Check uniqueness functions
  const checkEmailUniqueness = async (email: string): Promise<{ isUnique: boolean; message: string }> => {
    try {
      const base = getApiBaseUrl()
      const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
      const response = await fetch(`${cleanBase}/api/teachers/check-email/?email=${encodeURIComponent(email)}`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      
      console.log('📧 Email check response status:', response.status)
      
      if (!response.ok) {
        return { isUnique: false, message: 'Unable to verify email. Please try again.' }
      }
      
      const data = await response.json()
      console.log('📧 Email check response data:', data)
      
      if (data.exists) {
        return { isUnique: false, message: 'This email is already registered. Please use a different email address.' }
      }
      
      return { isUnique: true, message: '' }
    } catch (error) {
      console.error('📧 Email check error:', error)
      return { isUnique: false, message: 'Unable to verify email. Please check your connection.' }
    }
  }

  const checkCNICUniqueness = async (cnic: string): Promise<{ isUnique: boolean; message: string }> => {
    try {
      const base = getApiBaseUrl()
      const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
      const cleanCNIC = cnic.replace(/\D/g, '')
      const response = await fetch(`${cleanBase}/api/teachers/check-cnic/?cnic=${cleanCNIC}`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      
      console.log('🆔 CNIC check response status:', response.status)
      
      if (!response.ok) {
        return { isUnique: false, message: 'Unable to verify CNIC. Please try again.' }
      }
      
      const data = await response.json()
      console.log('🆔 CNIC check response data:', data)
      
      if (data.exists) {
        return { isUnique: false, message: 'This CNIC is already registered. Please check your CNIC number.' }
      }
      
      return { isUnique: true, message: '' }
    } catch (error) {
      console.error('🆔 CNIC check error:', error)
      return { isUnique: false, message: 'Unable to verify CNIC. Please check your connection.' }
    }
  }

  // Real-time validation function
  const validateField = async (field: string, value: string) => {
    console.log(`🔍 Validating field: ${field} with value: ${value}`)
    setIsValidating((prev: Record<string, boolean>) => ({ ...prev, [field]: true }))
    
    let error = ''
    
    switch (field) {
      case 'cnic':
        const cnicValidation = validateCNIC(value)
        console.log(`🔍 CNIC format validation:`, cnicValidation)
        if (!cnicValidation.isValid) {
          error = cnicValidation.message
        } else {
          const uniquenessCheck = await checkCNICUniqueness(value)
          console.log(`🔍 CNIC uniqueness check:`, uniquenessCheck)
          if (!uniquenessCheck.isUnique) {
            error = uniquenessCheck.message
          }
        }
        break
        
      case 'email':
        const emailValidation = validateEmail(value)
        if (!emailValidation.isValid) {
          error = emailValidation.message
        } else {
          const uniquenessCheck = await checkEmailUniqueness(value)
          if (!uniquenessCheck.isUnique) {
            error = uniquenessCheck.message
          }
        }
        break
        
      case 'contact_number':
        const contactValidation = validateContactNumber(value)
        if (!contactValidation.isValid) {
          error = contactValidation.message
        }
        break
    }
    
    console.log(`🔍 Setting error for ${field}:`, error)
    setFieldErrors((prev: Record<string, string>) => {
      const newErrors = { ...prev, [field]: error }
      console.log(`🔍 Updated field errors:`, newErrors)
      return newErrors
    })
    setIsValidating((prev: Record<string, boolean>) => ({ ...prev, [field]: false }))
    
    // Return validation result for parent component
    return { isValid: !error, error }
  }

  // Debounced validation handler
  const handleInputChangeWithValidation = (field: string, value: any) => {
    onInputChange(field, value)
    
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors((prev: Record<string, string>) => ({ ...prev, [field]: '' }))
    }
    
    // Clear existing timeout
    if (validationTimeouts.current[field]) {
      clearTimeout(validationTimeouts.current[field])
    }
    
    // Set new timeout for validation
    if (field === 'cnic' || field === 'email' || field === 'contact_number') {
      validationTimeouts.current[field] = setTimeout(() => {
        validateField(field, value)
      }, 500)
    }
  }

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(validationTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout)
      })
    }
  }, [])

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="full_name">Full Name *</Label>
            <Input
              id="full_name"
              value={formData.full_name || ""}
              onChange={(e) => onInputChange("full_name", e.target.value)}
              className={invalidFields.includes("full_name") ? "border-red-500" : ""}
              placeholder="Enter full name"
            />
            {invalidFields.includes("full_name") && <p className="text-sm text-red-600 mt-1">Full name is required</p>}
          </div>

          <div>
            <Label htmlFor="dob">Date of Birth *</Label>
            <Input
              id="dob"
              type="date"
              value={formData.dob || ""}
              onChange={(e) => onInputChange("dob", e.target.value)}
              className={invalidFields.includes("dob") ? "border-red-500" : ""}
              max={new Date().toISOString().split('T')[0]}
            />
            {invalidFields.includes("dob") && <p className="text-sm text-red-600 mt-1">Date of birth is required</p>}
          </div>

          <div>
            <Label htmlFor="gender">Gender *</Label>
            <Select value={formData.gender || ""} onValueChange={(v) => onInputChange("gender", v)}>
              <SelectTrigger className={`border-2 focus:border-primary ${invalidFields.includes("gender") ? "border-red-500" : ""}`}>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {invalidFields.includes("gender") && <p className="text-sm text-red-600 mt-1">Gender is required</p>}
          </div>

          <div>
            <Label htmlFor="contact_number">Contact Number *</Label>
            <Input
              id="contact_number"
              value={formData.contact_number || ""}
              onChange={(e) => handleInputChangeWithValidation("contact_number", e.target.value.replace(/[^0-9]/g, ""))}
              className={`${invalidFields.includes("contact_number") ? "border-red-500" : ""} ${fieldErrors.contact_number ? "border-red-500" : ""}`}
              placeholder="e.g., 03001234567"
            />
            {invalidFields.includes("contact_number") && <p className="text-sm text-red-600 mt-1">Contact number is required</p>}
            {fieldErrors.contact_number && (
              <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-4 w-4" />
                {fieldErrors.contact_number}
              </p>
            )}
            {isValidating.contact_number && (
              <p className="text-sm text-blue-500 flex items-center gap-1 mt-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating contact number...
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="cnic">CNIC *</Label>
            <Input
              id="cnic"
              value={formData.cnic || ""}
              onChange={(e) => handleInputChangeWithValidation("cnic", e.target.value)}
              placeholder="42101-3947805-1 or 4210139478051"
              className={`${invalidFields.includes("cnic") ? "border-red-500" : ""} ${fieldErrors.cnic ? "border-red-500" : ""}`}
            />
            {invalidFields.includes("cnic") && <p className="text-sm text-red-600 mt-1">CNIC is required</p>}
            {fieldErrors.cnic && (
              <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-4 w-4" />
                {fieldErrors.cnic}
              </p>
            )}
            {isValidating.cnic && (
              <p className="text-sm text-blue-500 flex items-center gap-1 mt-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking CNIC availability...
              </p>
            )}
            {!fieldErrors.cnic && formData.cnic && !isValidating.cnic && (
              <p className="text-sm text-green-500 flex items-center gap-1 mt-1">
                <CheckCircle className="h-4 w-4" />
                CNIC format is valid
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="marital_status">Marital Status</Label>
            <Select value={formData.marital_status || ""} onValueChange={(v) => onInputChange("marital_status", v)}>
              <SelectTrigger className="border-2 focus:border-primary">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married">Married</SelectItem>
                <SelectItem value="divorced">Divorced</SelectItem>
                <SelectItem value="widowed">Widowed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email || ""}
              onChange={(e) => handleInputChangeWithValidation("email", e.target.value)}
              className={`${invalidFields.includes("email") ? "border-red-500" : ""} ${fieldErrors.email ? "border-red-500" : ""}`}
              placeholder="teacher@school.com"
            />
            {invalidFields.includes("email") && <p className="text-sm text-red-600 mt-1">Email is required</p>}
            {fieldErrors.email && (
              <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-4 w-4" />
                {fieldErrors.email}
              </p>
            )}
            {isValidating.email && (
              <p className="text-sm text-blue-500 flex items-center gap-1 mt-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking email availability...
              </p>
            )}
            {!fieldErrors.email && formData.email && !isValidating.email && (
              <p className="text-sm text-green-500 flex items-center gap-1 mt-1">
                <CheckCircle className="h-4 w-4" />
                Email is available
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="current_address">Current Address *</Label>
            <Textarea
              id="current_address"
              value={formData.current_address || ""}
              onChange={(e) => onInputChange("current_address", e.target.value)}
              className={invalidFields.includes("current_address") ? "border-red-500" : ""}
              placeholder="Enter current address"
            />
            {invalidFields.includes("current_address") && <p className="text-sm text-red-600 mt-1">Current address is required</p>}
          </div>

          

          <div className="md:col-span-2">
            <Label htmlFor="permanent_address">Permanent Address (Optional)</Label>
            <Textarea
              id="permanent_address"
              value={formData.permanent_address || ""}
              onChange={(e) => onInputChange("permanent_address", e.target.value)}
              placeholder="Enter permanent address (optional)"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
