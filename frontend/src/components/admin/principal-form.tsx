"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { ArrowLeft, ArrowRight, Eye } from "lucide-react"
import { PersonalInfoStep } from "./principal-form/personal-info-step"
import { ProfessionalInfoStep } from "./principal-form/professional-info-step"
import { WorkAssignmentStep } from "./principal-form/work-assignment-step"
import { useToast } from "@/hooks/use-toast"
import { createPrincipal, getAllCampuses, getAllPrincipals, checkEmailExists } from "@/lib/api"
import { useRouter } from "next/navigation"
import { toast as sonnerToast } from "sonner"

const steps = [
  { id: 1, title: "Personal" },
  { id: 2, title: "Professional" },
  { id: 3, title: "Work Assignment" },
]

export function PrincipalForm() {
  const { toast } = useToast()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [showPreview, setShowPreview] = useState(false)
  const [campuses, setCampuses] = useState<any[]>([])
  const [formData, setFormData] = useState<any>({
    // Personal Information
    full_name: '',
    dob: '',
    gender: '',
    contact_number: '',
    email: '',
    cnic: '',
    permanent_address: '',
    
    // Professional Information
    education_level: '',
    institution_name: '',
    year_of_passing: new Date().getFullYear(),
    total_experience_years: 0,
    
    // Work Assignment
    campus: '',
    shift: 'morning',
    joining_date: '',
    is_currently_active: true,
  })
  
  const [invalidFields, setInvalidFields] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    // Fetch campuses on mount
    getAllCampuses().then((data) => {
      setCampuses(Array.isArray(data) ? data : [])
    })
  }, [])

  const totalSteps = steps.length

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ 
      ...prev, 
      [field]: value
    }))
    if (invalidFields.includes(field)) {
      setInvalidFields((prev) => prev.filter((f) => f !== field))
    }
  }

  const validateCurrentStep = () => {
    const requiredFields: { [step: number]: string[] } = {
      1: ['full_name', 'dob', 'gender', 'contact_number', 'email', 'cnic', 'permanent_address'],
      2: ['education_level', 'institution_name', 'year_of_passing', 'total_experience_years'],
      3: ['campus', 'shift', 'joining_date'],
    }

    const required = requiredFields[currentStep] || []
    const invalid: string[] = []

    for (const field of required) {
      const value = formData[field]
      
      if (value == null || (typeof value === 'string' && value.trim() === '') || value === '') {
        invalid.push(field)
      }
    }

    setInvalidFields(invalid)
    return invalid.length === 0
  }

  const checkDuplicateEmail = async (email: string) => {
    // Global check across all users
    return await checkEmailExists(email)
  }

  const handleNext = async () => {
    if (!validateCurrentStep()) {
      toast({
        title: "Please fill required fields",
        description: invalidFields.join(", "),
        variant: "destructive"
      })
      return
    }

    // Check for duplicate email on step 1
    if (currentStep === 1 && formData.email) {
      const isDuplicate = await checkDuplicateEmail(formData.email)
      if (isDuplicate) {
        toast({
          title: "Email already exists",
          description: "Please use a different email address",
          variant: "destructive"
        })
        setInvalidFields([...invalidFields, 'email'])
        return
      }
    }

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    } else {
      handlePreview()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setShowPreview(false)
    }
  }

  const handlePreview = () => {
    setShowPreview(true)
  }

  const handleSubmit = async () => {
    if (!validateCurrentStep()) {
      return
    }

    setIsSubmitting(true)
    try {
      // Prepare data for API
      const submitData = {
        ...formData,
        campus: parseInt(formData.campus),
        year_of_passing: parseInt(formData.year_of_passing),
        total_experience_years: parseInt(formData.total_experience_years),
      }

      const response: any = await createPrincipal(submitData)
      
      // Show success toast
      sonnerToast.success("✅ Principal Added Successfully!", {
        description: (
          <div className="space-y-1">
            <p className="font-semibold">Principal: {response.full_name || formData.full_name}</p>
            <p>Employee Code: {response.employee_code || 'N/A'}</p>
          </div>
        ),
        duration: 5000,
      })
      
      // Redirect after short delay
      setTimeout(() => {
        router.push('/admin/principals/list')
      }, 1000)
    } catch (error: any) {
      let errorMessage = 'Failed to create principal'
      
      // Handle validation errors (shift field takes priority)
      if (error?.data?.shift) {
        errorMessage = error.data.shift
      } else if (error?.data?.campus) {
        errorMessage = error.data.campus
      } else if (error?.data?.non_field_errors) {
        errorMessage = error.data.non_field_errors[0]
      } else if (error?.message) {
        errorMessage = error.message
      }
      
      sonnerToast.error('Failed to create principal', {
        description: errorMessage,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <PersonalInfoStep formData={formData} invalidFields={invalidFields} onInputChange={handleInputChange} />
      case 2:
        return <ProfessionalInfoStep formData={formData} invalidFields={invalidFields} onInputChange={handleInputChange} />
      case 3:
        return <WorkAssignmentStep formData={formData} invalidFields={invalidFields} onInputChange={handleInputChange} campuses={campuses} />
      default:
        return null
    }
  }

  const renderPreview = () => {
    return (
      <Card className="border-2 border-[#E7ECEF] shadow-lg">
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-[#274C77]">Review Principal Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><strong>Full Name:</strong> {formData.full_name}</div>
              <div><strong>DOB:</strong> {formData.dob}</div>
              <div><strong>Gender:</strong> {formData.gender}</div>
              <div><strong>Contact:</strong> {formData.contact_number}</div>
              <div><strong>Email:</strong> {formData.email}</div>
              <div><strong>CNIC:</strong> {formData.cnic}</div>
              <div><strong>Address:</strong> {formData.permanent_address}</div>
              <div><strong>Education:</strong> {formData.education_level}</div>
              <div><strong>Institution:</strong> {formData.institution_name}</div>
              <div><strong>Year:</strong> {formData.year_of_passing}</div>
              <div><strong>Experience:</strong> {formData.total_experience_years} years</div>
              <div><strong>Campus:</strong> {campuses.find(c => c.id === parseInt(formData.campus))?.campus_name || formData.campus}</div>
              <div><strong>Shift:</strong> {formData.shift}</div>
              <div><strong>Joining Date:</strong> {formData.joining_date}</div>
              <div><strong>Status:</strong> {formData.is_currently_active ? 'Active' : 'Inactive'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#274C77]">Add Principal</h1>
          <p className="text-gray-600 mt-1">Create a new principal account</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Progress Bar */}
      <ProgressBar 
        steps={steps} 
        currentStep={currentStep}
      />

      {/* Form Content */}
      {showPreview ? renderPreview() : renderStep()}

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentStep === 1 && !showPreview}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>

        <div className="flex gap-2">
          {showPreview ? (
            <>
              <Button
                variant="outline"
                onClick={() => setShowPreview(false)}
                disabled={isSubmitting}
              >
                Edit
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-[#6096BA] hover:bg-[#274C77]"
              >
                {isSubmitting ? 'Creating...' : 'Create Principal'}
              </Button>
            </>
          ) : (
            <Button
              onClick={handleNext}
              disabled={isSubmitting}
              className="bg-[#6096BA] hover:bg-[#274C77]"
            >
              {currentStep === totalSteps ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

