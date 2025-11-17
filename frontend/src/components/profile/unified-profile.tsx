"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  GraduationCap, 
  Building2, 
  Shield, 
  Clock,
  CheckCircle,
  ArrowLeft,
  Users,
  BookOpen,
  Award,
  Briefcase
} from "lucide-react"
import { getCurrentUserProfile } from "@/lib/api"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useRouter } from "next/navigation"

interface ProfileData {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: string
  campus?: {
    id: number
    campus_name: string
    campus_code: string
  }
  // Teacher specific
  teacher_id?: number
  full_name?: string
  dob?: string
  gender?: string
  contact_number?: string
  cnic?: string
  permanent_address?: string
  education_level?: string
  institution_name?: string
  year_of_passing?: number
  total_experience_years?: number
  profile_image?: string
  employee_code?: string
  joining_date?: string
  is_class_teacher?: boolean
  is_currently_active?: boolean
  assigned_classroom?: {
    id: number
    name: string
    grade: string
    section: string
    shift: string
  }
  assigned_classrooms?: Array<{
    id: number
    name: string
    grade: string
    section: string
    shift: string
  }>
  current_campus?: {
    id: number
    campus_name: string
    campus_code: string
  }
  created_at?: string
  updated_at?: string
  // Coordinator specific
  coordinator_id?: number
  can_assign_class_teachers?: boolean
  level?: {
    id: number
    name: string
    code: string
  }
  // Principal specific
  principal_id?: number
  shift?: string
  // Student specific
  student_id?: number
  name?: string
  father_name?: string
  father_cnic?: string
  father_contact?: string
  father_occupation?: string
  mother_name?: string
  mother_cnic?: string
  mother_contact?: string
  mother_occupation?: string
  guardian_name?: string
  guardian_contact?: string
  guardian_relation?: string
  photo?: string
  student_id_number?: string
  admission_date?: string
  current_state?: string
  classroom?: {
    id: number
    name: string
    grade: string
    section: string
    shift: string
  }
  // Admin specific
  role_display?: string
  is_verified?: boolean
  is_active?: boolean
  last_login?: string
}

const ProfileSection = ({ title, children, icon: Icon }: { title: string, children: React.ReactNode, icon?: any }) => (
  <Card className="mb-4 sm:mb-5 md:mb-6 shadow-lg hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
    <CardHeader className="pb-3 sm:pb-4 md:pb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-4 sm:px-5 md:px-6">
      <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg md:text-xl font-bold text-gray-800">
        {Icon && (
          <div className="p-1.5 sm:p-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg shadow-sm flex-shrink-0">
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
          </div>
        )}
        <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent truncate">
          {title}
        </span>
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-4 sm:pt-5 md:pt-8 px-4 sm:px-5 md:px-6">
      {children}
    </CardContent>
  </Card>
)

const InfoField = ({ label, value, icon: Icon }: { label: string, value: any, icon?: any }) => {
  if (!value || value === '') return null
  
  return (
    <div className="group flex items-start gap-2 sm:gap-3 md:gap-4 py-2.5 sm:py-3 md:py-4 border-b border-gray-100 last:border-b-0 hover:bg-blue-50/50 transition-colors duration-200 rounded-lg px-2 sm:px-3 -mx-2 sm:-mx-3">
      {Icon && (
        <div className="p-1.5 sm:p-2 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg group-hover:from-blue-200 group-hover:to-indigo-200 transition-all duration-200 flex-shrink-0">
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-xs md:text-sm text-gray-500 font-semibold mb-1 sm:mb-2 uppercase tracking-wide">{label}</p>
        <p className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 break-words group-hover:text-blue-900 transition-colors duration-200">{value}</p>
      </div>
    </div>
  )
}

const getRoleIcon = (role: string) => {
  switch (role) {
    case 'teacher': return <GraduationCap className="w-4 h-4" />
    case 'coordinator': return <Users className="w-4 h-4" />
    case 'principal': return <Shield className="w-4 h-4" />
    case 'student': return <BookOpen className="w-4 h-4" />
    case 'admin': return <Shield className="w-4 h-4" />
    default: return <User className="w-4 h-4" />
  }
}

const getRoleColor = (role: string) => {
  switch (role) {
    case 'teacher': return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-500 shadow-lg'
    case 'coordinator': return 'bg-gradient-to-r from-green-500 to-green-600 text-white border-green-500 shadow-lg'
    case 'principal': return 'bg-gradient-to-r from-purple-500 to-purple-600 text-white border-purple-500 shadow-lg'
    case 'student': return 'bg-gradient-to-r from-orange-500 to-orange-600 text-white border-orange-500 shadow-lg'
    case 'admin': return 'bg-gradient-to-r from-red-500 to-red-600 text-white border-red-500 shadow-lg'
    default: return 'bg-gradient-to-r from-gray-500 to-gray-600 text-white border-gray-500 shadow-lg'
  }
}

const formatDate = (dateString: string) => {
  if (!dateString) return 'Not available'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const getInitials = (name: string) => {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'
}

export default function UnifiedProfile() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await getCurrentUserProfile()
        if (data) {
          setProfile(data as ProfileData)
        } else {
          setError('Failed to load profile data')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  if (loading) {
    return <LoadingSpinner message="Loading profile..." />
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="text-red-500 mb-4">
              <User className="w-12 h-12 mx-auto" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Profile Not Found</h2>
            <p className="text-gray-600 mb-4">{error || 'Unable to load profile data'}</p>
            <Button onClick={() => router.back()} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const displayName = profile.full_name || profile.name || `${profile.first_name} ${profile.last_name}`.trim() || profile.username
  const profileImage = profile.profile_image || profile.photo || null
  const role = profile.role

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 overflow-x-hidden">
      <div className="container mx-auto px-3 sm:px-4 md:px-5 lg:px-6 py-3 sm:py-4 md:py-6 lg:py-8 w-full">
        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <Button 
            onClick={() => router.back()} 
            variant="outline" 
            className="mb-3 sm:mb-4 md:mb-6 text-xs sm:text-sm px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 hover:bg-white hover:shadow-md transition-all duration-200 border-blue-200 text-blue-700 hover:text-blue-800 w-full sm:w-auto"
          >
            <ArrowLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-2" />
            <span className="hidden sm:inline">Back</span>
            <span className="sm:hidden">Go Back</span>
          </Button>
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-1 sm:mb-2 break-words">
              My Profile
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-gray-600 font-medium">View and manage your profile information</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
          {/* Left Column - Profile Header & Basic Info */}
          <div className="lg:col-span-1 space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-6">
            {/* Profile Header Card */}
            <Card className="shadow-xl hover:shadow-2xl transition-all duration-300 border-0 overflow-hidden bg-gradient-to-br from-white to-blue-50 hover:md:scale-105 transform">
              <CardContent className="p-4 sm:p-5 md:p-6 lg:p-8 relative">
                {/* Decorative Background */}
                <div className="absolute top-0 right-0 w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full -translate-y-12 translate-x-12 opacity-50 animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-gradient-to-tr from-indigo-100 to-pink-100 rounded-full translate-y-8 -translate-x-8 opacity-50 animate-bounce"></div>
                <div className="absolute top-1/2 left-1/2 w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-30 animate-ping hidden md:block"></div>
                
                <div className="text-center relative z-10">
                  {/* Profile Image */}
                  <div className="relative mb-3 sm:mb-4 md:mb-5 lg:mb-6">
                    {profileImage ? (
                      <img 
                        src={profileImage} 
                        alt={displayName}
                        className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full mx-auto object-cover border-4 border-white shadow-2xl ring-4 ring-blue-100"
                      />
                    ) : (
                      <div 
                        className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full mx-auto flex items-center justify-center text-base sm:text-lg md:text-xl font-bold text-white border-4 border-white shadow-2xl ring-4 ring-blue-100"
                        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                      >
                        {getInitials(displayName)}
                      </div>
                    )}
                    <div className="absolute -bottom-2 -right-2 w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-gradient-to-r from-green-400 to-green-500 rounded-full flex items-center justify-center border-3 sm:border-4 border-white shadow-lg flex-shrink-0">
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-white" />
                    </div>
                  </div>

                  {/* Name and Role */}
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-2 sm:mb-3 md:mb-4 line-clamp-2">{displayName}</h2>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4 md:mb-6">
                    <div className="p-2 bg-blue-100 rounded-full flex-shrink-0">
                      {getRoleIcon(role)}
                    </div>
                    <Badge className={`${getRoleColor(role)} border-2 text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2 font-semibold shadow-sm truncate`}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Badge>
                  </div>

                  {/* Status */}
                  {profile.is_currently_active !== undefined && (
                    <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full shadow-sm">
                      <div className={`w-2 h-2 rounded-full ${profile.is_currently_active ? 'bg-green-400' : 'bg-gray-400'} animate-pulse`}></div>
                      <Badge 
                        variant={profile.is_currently_active ? "default" : "secondary"}
                        className={`${profile.is_currently_active 
                          ? 'bg-gradient-to-r from-green-500 to-green-600 text-white border-green-500' 
                          : 'bg-gradient-to-r from-gray-500 to-gray-600 text-white border-gray-500'
                        } text-xs sm:text-sm px-2 sm:px-3 py-1 font-semibold`}
                      >
                        {profile.is_currently_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <ProfileSection title="Contact Information" icon={Phone}>
              <div className="space-y-0">
                <InfoField 
                  label="Email" 
                  value={profile.email} 
                  icon={Mail} 
                />
                <InfoField 
                  label="Phone" 
                  value={profile.contact_number} 
                  icon={Phone} 
                />
                <InfoField 
                  label="Address" 
                  value={profile.permanent_address} 
                  icon={MapPin} 
                />
                <InfoField 
                  label="CNIC" 
                  value={profile.cnic} 
                  icon={Shield} 
                />
              </div>
            </ProfileSection>
          </div>

          {/* Right Column - Detailed Information */}
          <div className="md:col-span-1 lg:col-span-2 space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-6">
            {/* Personal Information */}
            <ProfileSection title="Personal Information" icon={User}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                <InfoField 
                  label="Date of Birth" 
                  value={profile.dob ? formatDate(profile.dob) : 'Not provided'} 
                  icon={Calendar} 
                />
                <InfoField 
                  label="Gender" 
                  value={profile.gender} 
                />
                <InfoField 
                  label="Employee Code" 
                  value={profile.employee_code || profile.student_id_number} 
                  icon={Award} 
                />
                <InfoField 
                  label="Joining Date" 
                  value={profile.joining_date ? formatDate(profile.joining_date) : profile.admission_date ? formatDate(profile.admission_date) : 'Not provided'} 
                  icon={Calendar} 
                />
              </div>
            </ProfileSection>

            {/* Professional Information */}
            <ProfileSection title="Professional Information" icon={Briefcase}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                <InfoField 
                  label="Education Level" 
                  value={profile.education_level} 
                  icon={GraduationCap} 
                />
                <InfoField 
                  label="Institution" 
                  value={profile.institution_name} 
                  icon={Building2} 
                />
                <InfoField 
                  label="Year of Passing" 
                  value={profile.year_of_passing} 
                />
                <InfoField 
                  label="Experience" 
                  value={profile.total_experience_years ? `${profile.total_experience_years} years` : 'Not provided'} 
                  icon={Clock} 
                />
              </div>
            </ProfileSection>

            {/* Role-specific Information */}
            {role === 'teacher' && (
              <ProfileSection title="Teaching Information" icon={GraduationCap}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  <InfoField 
                    label="Class Teacher" 
                    value={
                      profile.is_class_teacher || 
                      (profile.assigned_classrooms && profile.assigned_classrooms.length > 0) ||
                      profile.assigned_classroom
                        ? 'Yes' 
                        : 'No'
                    } 
                  />
                  <InfoField 
                    label="Assigned Classroom" 
                    value={
                      (() => {
                        // Check assigned_classrooms array first (multiple classrooms)
                        if (profile.assigned_classrooms && Array.isArray(profile.assigned_classrooms) && profile.assigned_classrooms.length > 0) {
                          return profile.assigned_classrooms
                            .map((c: any) => {
                              const grade = typeof c.grade === 'string' ? c.grade : c.grade?.name || ''
                              const section = c.section || ''
                              const shift = c.shift || ''
                              return `${grade} - ${section}${shift ? ` (${shift})` : ''}`
                            })
                            .join(', ')
                        }
                        // Fallback to assigned_classroom (single classroom)
                        if (profile.assigned_classroom) {
                          const grade = profile.assigned_classroom.grade || ''
                          const section = profile.assigned_classroom.section || ''
                          const shift = profile.assigned_classroom.shift || ''
                          return `${grade} - ${section}${shift ? ` (${shift})` : ''}`
                        }
                        return 'Not assigned'
                      })()
                    } 
                  />
                  <InfoField 
                    label="Current Campus" 
                    value={profile.current_campus?.campus_name} 
                    icon={Building2} 
                  />
                </div>
              </ProfileSection>
            )}

            {role === 'coordinator' && (
              <ProfileSection title="Coordination Information" icon={Users}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  <InfoField 
                    label="Assigned Level" 
                    value={profile.level ? `${profile.level.name} (${profile.level.code})` : 'Not assigned'} 
                  />
                  <InfoField 
                    label="Campus" 
                    value={profile.campus?.campus_name} 
                    icon={Building2} 
                  />
                  <InfoField 
                    label="Can Assign Teachers" 
                    value={profile.can_assign_class_teachers ? 'Yes' : 'No'} 
                  />
                </div>
              </ProfileSection>
            )}

            {role === 'principal' && (
              <ProfileSection title="Principal Information" icon={Shield}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  <InfoField 
                    label="Campus" 
                    value={profile.campus?.campus_name} 
                    icon={Building2} 
                  />
                  <InfoField 
                    label="Shift" 
                    value={profile.shift} 
                  />
                </div>
              </ProfileSection>
            )}

            {role === 'student' && (
              <ProfileSection title="Student Information" icon={BookOpen}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  <InfoField 
                    label="Student ID" 
                    value={profile.student_id_number} 
                  />
                  <InfoField 
                    label="Current State" 
                    value={profile.current_state} 
                  />
                  <InfoField 
                    label="Classroom" 
                    value={profile.classroom ? `${profile.classroom.grade} - ${profile.classroom.section} (${profile.classroom.shift})` : 'Not assigned'} 
                  />
                  <InfoField 
                    label="Campus" 
                    value={profile.campus?.campus_name} 
                    icon={Building2} 
                  />
                </div>
              </ProfileSection>
            )}

            {role === 'admin' && (
              <ProfileSection title="Admin Information" icon={Shield}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  <InfoField 
                    label="Username" 
                    value={profile.username} 
                  />
                  <InfoField 
                    label="User ID" 
                    value={profile.id?.toString()} 
                  />
                  <InfoField 
                    label="Role" 
                    value={profile.role_display || 'Super Admin'} 
                  />
                  <InfoField 
                    label="Verified" 
                    value={profile.is_verified ? 'Yes' : 'No'} 
                  />
                </div>
              </ProfileSection>
            )}

            {/* Family Information (for students) */}
            {role === 'student' && (
              <ProfileSection title="Family Information" icon={Users}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  <InfoField 
                    label="Father's Name" 
                    value={profile.father_name} 
                  />
                  <InfoField 
                    label="Father's CNIC" 
                    value={profile.father_cnic} 
                  />
                  <InfoField 
                    label="Father's Contact" 
                    value={profile.father_contact} 
                  />
                  <InfoField 
                    label="Father's Occupation" 
                    value={profile.father_occupation} 
                  />
                  <InfoField 
                    label="Mother's Name" 
                    value={profile.mother_name} 
                  />
                  <InfoField 
                    label="Mother's CNIC" 
                    value={profile.mother_cnic} 
                  />
                  <InfoField 
                    label="Mother's Contact" 
                    value={profile.mother_contact} 
                  />
                  <InfoField 
                    label="Mother's Occupation" 
                    value={profile.mother_occupation} 
                  />
                  <InfoField 
                    label="Guardian's Name" 
                    value={profile.guardian_name} 
                  />
                  <InfoField 
                    label="Guardian's Contact" 
                    value={profile.guardian_contact} 
                  />
                  <InfoField 
                    label="Guardian's Relation" 
                    value={profile.guardian_relation} 
                  />
                </div>
              </ProfileSection>
            )}

            {/* System Information */}
            <ProfileSection title="System Information" icon={Clock}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                <InfoField 
                  label="Created" 
                  value={profile.created_at ? formatDate(profile.created_at) : 'Not available'} 
                  icon={Calendar} 
                />
                <InfoField 
                  label="Last Updated" 
                  value={profile.updated_at ? formatDate(profile.updated_at) : 'Not available'} 
                  icon={Clock} 
                />
              </div>
            </ProfileSection>
          </div>
        </div>

        {/* Floating Action Button */}
        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50">
          <Button 
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:scale-110 transform flex items-center justify-center"
            size="lg"
          >
            <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </Button>
        </div>

        {/* Background Decorative Elements - Hidden on small screens */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none hidden md:block">
          <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 bg-gradient-to-r from-blue-200 to-purple-200 rounded-full opacity-10 animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 bg-gradient-to-r from-indigo-200 to-pink-200 rounded-full opacity-10 animate-bounce"></div>
          <div className="absolute top-1/2 right-1/3 w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 bg-gradient-to-r from-yellow-200 to-orange-200 rounded-full opacity-10 animate-ping"></div>
        </div>
      </div>
    </div>
  )
}
