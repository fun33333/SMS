"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Calendar, 
  MapPin, 
  GraduationCap, 
  Briefcase, 
  User,
  Building2,
  Users,
  Clock,
  Shield,
  Award,
  CheckCircle,
  XCircle,
  BookOpen
} from "lucide-react"
import { getApiBaseUrl } from "@/lib/api"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

interface CoordinatorProfile {
  id: number
  full_name: string
  email: string
  contact_number?: string
  dob?: string
  gender?: string
  permanent_address?: string
  campus?: {
    id: number
    campus_name: string
    campus_code?: string
  }
  campus_name?: string
  level?: {
    id: number
    name: string
    code?: string
  }
  level_name?: string
  assigned_levels?: Array<{
    id: number
    name: string
    shift: string
    shift_display?: string
    code?: string
  }>
  assigned_levels_details?: Array<{
    id: number
    name: string
    shift: string
    shift_display?: string
    code?: string
  }>
  shift?: string
  joining_date?: string
  is_currently_active: boolean
  can_assign_class_teachers?: boolean
  education_level?: string
  institution_name?: string
  year_of_passing?: number
  total_experience_years?: number
  employee_code?: string
}

export default function CoordinatorProfilePage() {
  const params = useParams()
  const router = useRouter()
  const [coordinator, setCoordinator] = useState<CoordinatorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = "Coordinator Profile | IAK SMS"
  }, [])

  useEffect(() => {
    async function loadCoordinator() {
      try {
        setLoading(true)
        const baseUrl = getApiBaseUrl()
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
        
        const response = await fetch(`${cleanBaseUrl}/api/coordinators/${params.id}/`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (!response.ok) {
          setError("Coordinator not found")
          return
        }

        const data = await response.json()
        setCoordinator(data)
      } catch (error) {
        console.error('Error loading coordinator:', error)
        setError("Failed to load coordinator profile")
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      loadCoordinator()
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e7ecef] p-2 sm:p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner message="Loading coordinator profile..." />
          </div>
        </div>
      </div>
    )
  }

  if (error || !coordinator) {
    return (
      <div className="min-h-screen bg-[#e7ecef] p-2 sm:p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center px-4">
              <XCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Profile Not Found</h2>
              <p className="text-sm sm:text-base text-gray-600 mb-4">{error || "The requested coordinator profile could not be found."}</p>
              <Button onClick={() => router.back()} className="bg-[#6096ba] hover:bg-[#274c77] text-sm sm:text-base">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const getShiftDisplay = (shift?: string) => {
    if (!shift) return 'Not Assigned'
    const shiftMap: Record<string, string> = {
      'morning': 'Morning',
      'afternoon': 'Afternoon',
      'both': 'Morning + Afternoon',
      'all': 'All Shifts'
    }
    return shiftMap[shift] || shift
  }

  const assignedLevels = coordinator.assigned_levels_details || 
    (coordinator.assigned_levels ? coordinator.assigned_levels : [])
  const hasMultipleLevels = assignedLevels.length > 1
  const primaryLevel = coordinator.level || (assignedLevels.length > 0 ? assignedLevels[0] : null)

  return (
    <div className="min-h-screen bg-[#e7ecef] p-2 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="text-xs sm:text-sm text-[#274c77] border-[#a3cef1] hover:bg-[#f8fbff] w-full sm:w-auto"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Back to List</span>
            <span className="xs:hidden">Back</span>
          </Button>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
            {coordinator.employee_code && (
              <Badge variant="outline" className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5">
                <span className="hidden sm:inline">ID: </span>
                <span className="font-mono">{coordinator.employee_code}</span>
              </Badge>
            )}
            <Badge 
              className={`text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-1.5 ${
                coordinator.is_currently_active 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-red-500 text-white hover:bg-red-600'
              }`}
            >
              {coordinator.is_currently_active ? (
                <>
                  <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 inline" />
                  <span>Active</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 inline" />
                  <span>Inactive</span>
                </>
              )}
            </Badge>
          </div>
        </div>

        {/* Profile Summary Card */}
        <Card className="bg-white shadow-xl border-2 border-[#a3cef1]">
          <CardHeader className="bg-gradient-to-r from-[#274c77] to-[#6096ba] text-white rounded-t-lg p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center shadow-lg flex-shrink-0">
                <User className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-[#6096ba]" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2 break-words">
                  {coordinator.full_name || 'Unknown'}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-3">
                  <Badge className="bg-white/20 text-white border-white/30 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                    <Shield className="w-3 h-3 mr-1 inline" />
                    <span className="hidden xs:inline">Coordinator</span>
                    <span className="xs:hidden">Coord</span>
                  </Badge>
                  {coordinator.campus_name && (
                    <Badge className="bg-white/20 text-white border-white/30 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                      <Building2 className="w-3 h-3 mr-1 inline" />
                      <span className="truncate max-w-[120px] sm:max-w-none">{coordinator.campus_name}</span>
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mt-3 text-blue-100">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <Mail className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="truncate">{coordinator.email}</span>
                  </div>
                  {coordinator.contact_number && (
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                      <Phone className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span>{coordinator.contact_number}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Professional Assignment - Most Important for Principal */}
        <Card className="bg-white shadow-lg border-2 border-[#a3cef1]">
          <CardHeader className="bg-[#f8fbff] border-b-2 border-[#a3cef1] p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl font-bold text-[#274c77] flex items-center gap-2">
              <Briefcase className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Professional Assignment</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Campus */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Campus</span>
                </div>
                <p className="text-base sm:text-lg font-semibold text-gray-900 break-words">
                  {coordinator.campus_name || coordinator.campus?.campus_name || 'Not Assigned'}
                </p>
              </div>

              {/* Shift */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Shift</span>
                </div>
                <p className="text-base sm:text-lg font-semibold text-gray-900">
                  {getShiftDisplay(coordinator.shift)}
                </p>
              </div>

              {/* Joining Date */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Joining Date</span>
                </div>
                <p className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">
                  {coordinator.joining_date 
                    ? new Date(coordinator.joining_date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })
                    : 'Not provided'}
                </p>
              </div>

              {/* Assigned Level(s) */}
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center gap-2 text-gray-600 mb-2 sm:mb-3">
                  <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Assigned Level(s)</span>
                </div>
                {hasMultipleLevels ? (
                  <div className="flex flex-wrap gap-2">
                    {assignedLevels.map((level: any) => (
                      <Badge 
                        key={level.id} 
                        className="bg-[#6096ba] text-white px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
                      >
                        <span className="font-medium">{level.name}</span>
                        <span className="hidden sm:inline ml-1">({getShiftDisplay(level.shift || level.shift_display)})</span>
                        <span className="sm:hidden ml-1 text-xs">({getShiftDisplay(level.shift || level.shift_display).split(' ')[0]})</span>
                      </Badge>
                    ))}
                  </div>
                ) : primaryLevel ? (
                  <p className="text-base sm:text-lg font-semibold text-gray-900">
                    {primaryLevel.name || coordinator.level_name || 'Not Assigned'}
                  </p>
                ) : (
                  <p className="text-base sm:text-lg font-semibold text-gray-500">Not Assigned</p>
                )}
              </div>

              {/* Experience */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Award className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Experience</span>
                </div>
                <p className="text-base sm:text-lg font-semibold text-gray-900">
                  {coordinator.total_experience_years || 0} years
                </p>
              </div>

              {/* Permissions */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Can Assign Teachers</span>
                </div>
                <Badge 
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm ${
                    coordinator.can_assign_class_teachers 
                      ? 'bg-green-100 text-green-800 border-green-300' 
                      : 'bg-red-100 text-red-800 border-red-300'
                  }`}
                >
                  {coordinator.can_assign_class_teachers ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Education Information */}
        <Card className="bg-white shadow-lg border-2 border-[#a3cef1]">
          <CardHeader className="bg-[#f8fbff] border-b-2 border-[#a3cef1] p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl font-bold text-[#274c77] flex items-center gap-2">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Education Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Education Level</span>
                </div>
                <p className="text-sm sm:text-base font-semibold text-gray-900 break-words">
                  {coordinator.education_level || 'Not provided'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Institution</span>
                </div>
                <p className="text-sm sm:text-base font-semibold text-gray-900 break-words">
                  {coordinator.institution_name || 'Not provided'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Year of Passing</span>
                </div>
                <p className="text-sm sm:text-base font-semibold text-gray-900">
                  {coordinator.year_of_passing || 'Not provided'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card className="bg-white shadow-lg border-2 border-[#a3cef1]">
          <CardHeader className="bg-[#f8fbff] border-b-2 border-[#a3cef1] p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl font-bold text-[#274c77] flex items-center gap-2">
              <User className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Personal Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Date of Birth</span>
                </div>
                <p className="text-sm sm:text-base font-semibold text-gray-900">
                  {coordinator.dob 
                    ? new Date(coordinator.dob).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })
                    : 'Not provided'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Gender</span>
                </div>
                <p className="text-sm sm:text-base font-semibold text-gray-900 capitalize">
                  {coordinator.gender || 'Not provided'}
                </p>
              </div>

              {coordinator.contact_number && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                    <span className="text-xs sm:text-sm font-medium">Contact Number</span>
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-gray-900 break-all">
                    {coordinator.contact_number}
                  </p>
                </div>
              )}

              {coordinator.permanent_address && (
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-[#6096ba] flex-shrink-0" />
                    <span className="text-xs sm:text-sm font-medium">Address</span>
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-gray-900 break-words">
                    {coordinator.permanent_address}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
