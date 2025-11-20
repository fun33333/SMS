"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { apiGet, getAllStudents, getFilteredTeachers, getAllCoordinators } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { MapPin, Phone, Mail, Users, Building, BookOpen, Wifi, GraduationCap, UserCheck, BarChart3, Activity, Target } from "lucide-react"
import { StudentRadialChart } from "@/components/charts/radial-chart"

function CampusProfileContent() {
  const params = useSearchParams()
  const id = params?.get("id") || params?.get("pk") || ""

  const [campus, setCampus] = useState<any | null>(null)
  const [realStudentData, setRealStudentData] = useState<any | null>(null)
  const [realTeachersCount, setRealTeachersCount] = useState<number | null>(null)
  const [realCoordinatorsCount, setRealCoordinatorsCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  // Function to calculate real student statistics using real DB data
  const calculateRealStudentStats = (students: any[], campusId: string | number) => {
    console.log('Calculating stats for campus ID:', campusId)
    console.log('Total students fetched:', students.length)
    
    const campusIdStr = String(campusId)

    // Try different ways to match campus ID and include only active / non-deleted students
    const campusStudents = students.filter(student => {
      let studentCampusId: any = null

      if (typeof student.campus === 'object' && student.campus) {
        studentCampusId = student.campus.id || student.campus.pk || student.campus.campus_id
      } else if (student.campus !== undefined && student.campus !== null) {
        studentCampusId = student.campus
      }

      const matchesCampus =
        studentCampusId !== null &&
        studentCampusId !== undefined &&
        String(studentCampusId) === campusIdStr

      // Prefer is_active / is_deleted flags from backend instead of non-existent current_state
      const isActive =
        (student.is_active === undefined || student.is_active === true) &&
        student.is_deleted !== true
      
      return matchesCampus && isActive
    })

    console.log('Campus students found:', campusStudents.length)

    const total = campusStudents.length

    // Gender totals (independent of shift)
    const male = campusStudents.filter(s => String(s.gender || '').toLowerCase() === 'male').length
    const female = campusStudents.filter(s => String(s.gender || '').toLowerCase() === 'female').length

    // Derive effective shift for each student using both student.shift and classroom.shift (and legacy values)
    const getEffectiveShift = (s: any): 'morning' | 'afternoon' | null => {
      const rawShift =
        s.shift ||
        s?.classroom_data?.shift ||
        s?.classroom?.shift ||
        null

      if (!rawShift) return null

      const v = String(rawShift).toLowerCase()
      if (v === 'm' || v === 'morning') return 'morning'
      if (v === 'a' || v === 'e' || v === 'evening' || v === 'afternoon') return 'afternoon'
      return null
    }

    const morning = campusStudents.filter(s => getEffectiveShift(s) === 'morning').length
    const afternoon = campusStudents.filter(s => getEffectiveShift(s) === 'afternoon').length

    console.log('Calculated stats:', { total, male, female, morning, afternoon })

    return {
      total,
      male,
      female,
      morning,
      afternoon
    }
  }

  useEffect(() => {
    if (!id) return
    let mounted = true
    setLoading(true)
    
    // Fetch campus data
    apiGet<any>(`/api/campus/${id}/`)
      .then((data) => {
        if (mounted) {
          setCampus(data)
        }
      })
      .catch((err) => {
        console.error(err)
        if (mounted) {
          setError(err.message || "Failed to load campus")
        }
      })
    
    // Fetch real data from database
    Promise.all([
      // Fetch real student data (all campuses) and then filter by campus + active flag
      getAllStudents(true)
        .then((students) => {
          console.log('Fetched students data:', students)
          if (mounted) {
            const studentsArray = Array.isArray(students) ? students : (students?.results || [])
            const realStats = calculateRealStudentStats(studentsArray, id)
            console.log('Setting real student data:', realStats)
            setRealStudentData(realStats)
          }
          return students
        })
        .catch((err) => {
          console.warn('Failed to fetch real student data:', err)
          if (mounted) {
            // Set to empty stats on error so chart knows we attempted to fetch real data
            setRealStudentData({ total: 0, male: 0, female: 0, morning: 0, afternoon: 0 })
          }
          return []
        }),
      
      // Fetch real teachers data filtered by campus
      getFilteredTeachers({ current_campus: parseInt(id), is_currently_active: true })
        .then((response) => {
          console.log('Fetched teachers data:', response)
          if (mounted) {
            const teachers = Array.isArray(response) ? response : (response?.results || [])
            const count = Array.isArray(response) ? response.length : (response?.count || 0)
            console.log('Setting real teachers count:', count)
            setRealTeachersCount(count)
          }
          return response
        })
        .catch((err) => {
          console.warn('Failed to fetch real teachers data:', err)
          if (mounted) setRealTeachersCount(null)
          return null
        }),
      
      // Fetch real coordinators data and filter by campus
      getAllCoordinators()
        .then((coordinators: any) => {
          console.log('Fetched coordinators data:', coordinators)
          if (mounted) {
            // Filter coordinators by campus
            const coordinatorsList = Array.isArray(coordinators) ? coordinators : ((coordinators as any)?.results || [])
            const campusCoordinators = coordinatorsList.filter((coord: any) => {
              let coordCampusId = null
              if (typeof coord.campus === 'object' && coord.campus) {
                coordCampusId = coord.campus.id || coord.campus.pk || coord.campus.campus_id
              } else if (coord.campus) {
                coordCampusId = coord.campus
              }
              return coordCampusId == id || coordCampusId === id
            })
            console.log('Setting real coordinators count:', campusCoordinators.length)
            setRealCoordinatorsCount(campusCoordinators.length)
          }
          return coordinators
        })
        .catch((err) => {
          console.warn('Failed to fetch real coordinators data:', err)
          if (mounted) setRealCoordinatorsCount(null)
          return []
        })
    ])
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })
    
    return () => {
      mounted = false
    }
  }, [id])

  useEffect(() => {
    if (campus?.campus_name || campus?.name) {
      document.title = `${campus.campus_name || campus.name} | Campus Profile`
    }
  }, [campus])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const uStr = window.localStorage.getItem('sis_user')
        if (uStr) {
          const u = JSON.parse(uStr)
          const role = String(u?.role || '').toLowerCase()
          setCanEdit(role.includes('princ') || role.includes('admin'))
        }
      } catch {}
    }
  }, [])

  if (!id) {
    return <div className="p-6">No campus selected</div>
  }

  if (error) return (
    <div className="p-6 text-center">
      <div className="text-red-600 mb-4">Error: {error}</div>
      <Button onClick={() => window.location.reload()}>Try Again</Button>
    </div>
  )

  const renderValue = (v: any) => {
    if (v === null || v === undefined || String(v).trim() === "") return '—'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    if (Array.isArray(v)) return v.join(', ')
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  // const formatDate = (dateStr: string) => {
  //   if (!dateStr) return '—'
  //   try {
  //     return new Date(dateStr).toLocaleDateString('en-US', {
  //       year: 'numeric',
  //       month: 'long',
  //       day: 'numeric'
  //     })
  //   } catch {
  //     return dateStr
  //   }
  // }

  // Helper function to get full image URL
  const getImageUrl = (imagePath: string | null | undefined) => {
    if (!imagePath) return null
    // If already a full URL, return as is
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath
    }
    // Otherwise, construct full URL from API base
    const apiBase = typeof window !== 'undefined' 
      ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000')
      : 'http://127.0.0.1:8000'
    return `${apiBase}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`
  }

  const campusImageUrl = getImageUrl(campus?.campus_photo)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="overflow-hidden shadow-2xl border-0 bg-white">
            <div className="relative">
              {/* Campus Image Background/Header */}
              {campusImageUrl && (
                <div className="relative h-48 sm:h-64 lg:h-80 w-full overflow-hidden">
                  <img 
                    src={campusImageUrl} 
                    alt={campus?.campus_name || 'Campus'} 
                    className="w-full h-full object-cover"
                  />
                  {/* Gradient overlay for better text readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-900/60 to-transparent"></div>
                </div>
              )}
              
              {/* Decorative Elements (only show if no image) */}
              {!campusImageUrl && (
                <>
                  <div className="absolute top-0 right-0 w-16 h-16 sm:w-32 sm:h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8 sm:-translate-y-16 sm:translate-x-16"></div>
                  <div className="absolute bottom-0 left-0 w-12 h-12 sm:w-24 sm:h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6 sm:translate-y-12 sm:-translate-x-12"></div>
                </>
              )}
              
              {/* Content */}
              <div className={`relative ${campusImageUrl ? 'p-4 sm:p-6 lg:p-8' : 'p-4 sm:p-6 lg:p-8'}`}>
                <div className={`flex flex-col ${campusImageUrl ? 'lg:flex-row' : 'lg:flex-row'} lg:items-start lg:justify-between gap-6`}>
                  {/* Left Side - Main Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-3 sm:gap-4 mb-4">
                      {/* Campus Image Thumbnail */}
                      {campusImageUrl ? (
                        <div className="relative flex-shrink-0">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-xl overflow-hidden border-4 border-white shadow-lg">
                            <img 
                              src={campusImageUrl} 
                              alt={campus?.campus_name || 'Campus'} 
                              className="w-full h-full object-cover"
                            />
                      </div>
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 sm:w-7 sm:h-7 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full animate-pulse"></div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 sm:p-3 bg-primary rounded-xl backdrop-blur-sm flex-shrink-0">
                          <Building className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-1 text-slate-800">
                          {campus?.campus_name || campus?.name || 'Unknown Campus'}
                        </h1>
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-sm sm:text-base lg:text-lg text-slate-600">
                          <MapPin className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                          <span>{campus?.campus_type ? campus.campus_type.charAt(0).toUpperCase() + campus.campus_type.slice(1) : 'Campus'}</span>
                          <span>•</span>
                          <span>{campus?.city || 'Unknown City'}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mt-6 sm:mt-8">
                      <div className="bg-primary/15 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/20">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="p-2 rounded-lg">
                            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <div>
                            <div className="text-2xl sm:text-3xl font-bold">
                              {realStudentData?.total !== undefined ? realStudentData.total : (campus?.total_students || 0)}
                            </div>
                            <div className="text-xs sm:text-sm opacity-80 font-medium">Students</div>
                            {realStudentData?.total !== undefined && (
                              <div className="text-xs opacity-60">Real Count</div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-primary/15 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/20">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="p-2 bg-green-500/30 rounded-lg">
                            <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <div>
                            <div className="text-2xl sm:text-3xl font-bold">
                              {realTeachersCount !== null ? realTeachersCount : (campus?.total_teachers || 0)}
                            </div>
                            <div className="text-xs sm:text-sm opacity-80 font-medium">Teachers</div>
                            {realTeachersCount !== null && (
                              <div className="text-xs opacity-60">Real Count</div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-primary/15 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/20">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="p-2 bg-purple-500/30 rounded-lg">
                            <Building className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <div>
                            <div className="text-2xl sm:text-3xl font-bold">{campus?.total_classrooms || 0}</div>
                            <div className="text-xs sm:text-sm opacity-80 font-medium">Classrooms</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                      </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <Tabs defaultValue="analytics" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6 h-auto">
              <TabsTrigger value="analytics" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 sm:py-2.5">
                <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Analytics</span>
                <span className="sm:hidden">Stats</span>
              </TabsTrigger>
              <TabsTrigger value="details" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 sm:py-2.5">
                <Building className="w-3 h-3 sm:w-4 sm:h-4" />
                Details
              </TabsTrigger>
            </TabsList>


            {/* Details Tab */}
            <TabsContent value="details" className="space-y-4 sm:space-y-8">

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
            {/* Basic Information */}
                <Card className="shadow-sm border border-slate-200 bg-white/90 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-[#274c77]/10 flex items-center justify-center text-[#274c77]">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold text-slate-900">
                          Basic Information
                        </CardTitle>
                        <p className="text-xs text-slate-500">
                          Identity & governance details of this campus
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Campus ID
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                          {renderValue(campus?.campus_id)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Campus Code
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                          {renderValue(campus?.campus_code)}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Campus Name
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm sm:text-base font-semibold text-slate-900">
                          {renderValue(campus?.campus_name)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Campus Type
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <Badge className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 text-xs font-semibold">
                            {renderValue(campus?.campus_type)}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Established Year
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800">
                          {renderValue(campus?.established_year)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Governing Body
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                          {renderValue(campus?.governing_body)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Accreditation
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                          {renderValue(campus?.accreditation)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Instruction Language
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                          {renderValue(campus?.instruction_language)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Registration Number
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                          {renderValue(campus?.registration_number)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Status
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <Badge
                            className={`px-3 py-0.5 rounded-full text-xs font-semibold border ${
                              campus?.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {renderValue(campus?.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Staff Information */}
                <Card className="shadow-sm border border-slate-200 bg-white/90 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-3 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-emerald-50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                        <GraduationCap className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold text-slate-900">
                          Staff Information
                        </CardTitle>
                        <p className="text-xs text-slate-500">
                          Teaching & non‑teaching staff overview
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="text-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total Teachers
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {realTeachersCount !== null ? realTeachersCount : renderValue(campus?.total_teachers)}
                        </p>
                        {realTeachersCount !== null && (
                          <p className="mt-1 text-[11px] text-emerald-600 font-medium">Real</p>
                        )}
                      </div>
                      <div className="text-center rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Non‑Teaching Staff
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.total_non_teaching_staff)}
                        </p>
                      </div>
                      <div className="text-center rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total Maids
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.total_maids)}
                        </p>
                      </div>
                      <div className="text-center rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Coordinators
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {realCoordinatorsCount !== null ? realCoordinatorsCount : renderValue(campus?.total_coordinators)}
                        </p>
                        {realCoordinatorsCount !== null && (
                          <p className="mt-1 text-[11px] text-emerald-600 font-medium">Real</p>
                        )}
                      </div>
                      <div className="text-center rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Guards
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.total_guards)}
                        </p>
                      </div>
                      <div className="text-center rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Other Staff
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.other_staff)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="text-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Male Teachers
                        </p>
                        <p className="mt-1 text-sm sm:text-base font-bold text-slate-900">
                          {renderValue(campus?.male_teachers)}
                        </p>
                      </div>
                      <div className="text-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Female Teachers
                        </p>
                        <p className="mt-1 text-sm sm:text-base font-bold text-slate-900">
                          {renderValue(campus?.female_teachers)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>


                {/* Location & Contact Information */}
                <Card className="shadow-sm border border-slate-200 bg-white/90 rounded-2xl overflow-hidden lg:col-span-2">
                  <CardHeader className="pb-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-[#274c77]/10 flex items-center justify-center text-[#274c77]">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold text-slate-900">
                          Location & Contact
                        </CardTitle>
                        <p className="text-xs text-slate-500">
                          Address and key contact channels
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                        Full Address
                      </p>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-800">
                        {renderValue(campus?.address_full)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          City
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-sky-600" />
                          <span className="text-sm font-medium text-slate-900">
                            {renderValue(campus?.city)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          District
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                          <Building className="w-4 h-4 text-slate-500" />
                          <span className="text-sm font-medium text-slate-900">
                            {renderValue(campus?.district)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Postal Code
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                          <Mail className="w-4 h-4 text-sky-600" />
                          <span className="text-sm font-medium text-slate-900">
                            {renderValue(campus?.postal_code)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Primary Phone
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                          <Phone className="w-4 h-4 text-sky-600" />
                          <span className="text-sm font-medium text-slate-900">
                            {renderValue(campus?.primary_phone)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Secondary Phone
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-500" />
                          <span className="text-sm font-medium text-slate-900">
                            {renderValue(campus?.secondary_phone)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Official Email
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                          <Mail className="w-4 h-4 text-[#274c77]" />
                          <span className="text-sm font-medium text-slate-900">
                            {renderValue(campus?.official_email)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Administration */}
                <Card className="shadow-sm border border-slate-200 bg-white/90 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-[#274c77]/10 flex items-center justify-center text-[#274c77]">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold text-slate-900">
                          Administration
                        </CardTitle>
                        <p className="text-xs text-slate-500">
                          Campus leadership and key contacts
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Campus Head Name
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900">
                          {renderValue(campus?.campus_head_name)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Campus Head Phone
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                          {renderValue(campus?.campus_head_phone)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Campus Head Email
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                          {renderValue(campus?.campus_head_email)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Total Staff Members
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 text-center">
                          {renderValue(campus?.total_staff_members)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

            {/* Academic Information */}
                <Card className="shadow-sm border border-slate-200 bg-white/90 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-[#274c77]/10 flex items-center justify-center text-[#274c77]">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold text-slate-900">
                          Academic Information
                        </CardTitle>
                        <p className="text-xs text-slate-500">
                          Academic calendar, shifts & grades
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Academic Year Start
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                          {renderValue(campus?.academic_year_start_month)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Academic Year End
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                          {renderValue(campus?.academic_year_end_month)}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Shift Available
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <Badge className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 text-xs font-semibold">
                            {renderValue(campus?.shift_available)}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Grades Available
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                          {renderValue(campus?.grades_available)}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                          Grades Offered
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                          {renderValue(campus?.grades_offered)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Student Demographics - Large Card */}
                <Card className="shadow-sm border border-slate-200 bg-white/90 rounded-2xl overflow-hidden lg:col-span-2">
                  <CardHeader className="pb-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-[#274c77]/10 flex items-center justify-center text-[#274c77]">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold text-slate-900">
                          Student Demographics
                        </CardTitle>
                        <p className="text-xs text-slate-500">
                          Real enrollment, gender & shift overview
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total Students
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">
                          {realStudentData?.total !== undefined ? realStudentData.total : renderValue(campus?.total_students)}
                        </p>
                        {realStudentData?.total !== undefined && (
                          <p className="mt-1 text-[11px] text-sky-600 font-medium">Real Database Count</p>
                        )}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total Teachers
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">
                          {realTeachersCount !== null ? realTeachersCount : renderValue(campus?.total_teachers)}
                        </p>
                        {realTeachersCount !== null && (
                          <p className="mt-1 text-[11px] text-sky-600 font-medium">Real Count</p>
                        )}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Coordinators
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">
                          {realCoordinatorsCount !== null ? realCoordinatorsCount : renderValue(campus?.total_coordinators)}
                        </p>
                        {realCoordinatorsCount !== null && (
                          <p className="mt-1 text-[11px] text-sky-600 font-medium">Real Count</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Male Students
                        </p>
                        <p className="mt-1 text-sm sm:text-base font-bold text-slate-900">
                          {realStudentData?.male !== undefined ? realStudentData.male : renderValue(campus?.male_students)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Female Students
                        </p>
                        <p className="mt-1 text-sm sm:text-base font-bold text-slate-900">
                          {realStudentData?.female !== undefined ? realStudentData.female : renderValue(campus?.female_students)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Morning Shift
                        </p>
                        <p className="mt-1 text-sm sm:text-base font-bold text-slate-900">
                          {realStudentData?.morning !== undefined ? realStudentData.morning : renderValue(campus?.morning_students)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Afternoon Shift
                        </p>
                        <p className="mt-1 text-sm sm:text-base font-bold text-slate-900">
                          {realStudentData?.afternoon !== undefined ? realStudentData.afternoon : renderValue(campus?.afternoon_students)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Student Capacity
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {renderValue(campus?.student_capacity)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Avg Class Size
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {renderValue(campus?.avg_class_size)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                
                {/* Infrastructure - Large Card */}
                <Card className="shadow-sm border border-slate-200 bg-white/90 rounded-2xl overflow-hidden lg:col-span-2">
                  <CardHeader className="pb-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-[#274c77]/10 flex items-center justify-center text-[#274c77]">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold text-slate-900">
                          Infrastructure & Facilities
                        </CardTitle>
                        <p className="text-xs text-slate-500">
                          Rooms, labs, washrooms and key facilities
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total Rooms
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.total_rooms)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Classrooms
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.total_classrooms)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Offices
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.total_offices)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Computer Labs
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.num_computer_labs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Science Labs
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.num_science_labs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Biology Labs
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.num_biology_labs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Chemistry Labs
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.num_chemistry_labs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Physics Labs
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {renderValue(campus?.num_physics_labs)}
                        </p>
                      </div>
                    </div>

                    {/* Washrooms Section */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Washrooms
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Total Washrooms
                          </p>
                          <p className="mt-1 text-lg font-bold text-slate-900">
                            {renderValue(campus?.total_washrooms)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Male Teachers
                          </p>
                          <p className="mt-1 text-lg font-bold text-slate-900">
                            {renderValue(campus?.male_teachers_washrooms)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Female Teachers
                          </p>
                          <p className="mt-1 text-lg font-bold text-slate-900">
                            {renderValue(campus?.female_teachers_washrooms)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Male Students
                          </p>
                          <p className="mt-1 text-lg font-bold text-slate-900">
                            {renderValue(campus?.male_student_washrooms)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center md:col-start-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Female Students
                          </p>
                          <p className="mt-1 text-lg font-bold text-slate-900">
                            {renderValue(campus?.female_student_washrooms)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Facilities */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Facilities
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className={`px-3 py-2.5 rounded-lg border text-center ${campus?.library_available ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Library
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {campus?.library_available ? 'Available' : 'No'}
                          </p>
                        </div>
                        <div className={`px-3 py-2.5 rounded-lg border text-center ${campus?.power_backup ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Power Backup
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {campus?.power_backup ? 'Available' : 'No'}
                          </p>
                        </div>
                        <div className={`px-3 py-2.5 rounded-lg border text-center ${campus?.internet_available ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Internet
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {campus?.internet_available ? 'Available' : 'No'}
                          </p>
                        </div>
                        <div className={`px-3 py-2.5 rounded-lg border text-center ${campus?.teacher_transport ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Teacher Transport
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {campus?.teacher_transport ? 'Available' : 'No'}
                          </p>
                        </div>
                        <div className={`px-3 py-2.5 rounded-lg border text-center ${campus?.canteen_facility ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Canteen
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {campus?.canteen_facility ? 'Available' : 'No'}
                          </p>
                        </div>
                        <div className={`px-3 py-2.5 rounded-lg border text-center ${campus?.meal_program ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Meal Program
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {campus?.meal_program ? 'Available' : 'No'}
                          </p>
                        </div>
                      </div>
                      {campus?.sports_available && (
                        <div className="mt-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-slate-500">
                            Sports Available
                          </p>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                            {renderValue(campus?.sports_available)}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="space-y-4 sm:space-y-6">
              {/* Key Metrics Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <Card className="text-white border-0" style={{backgroundColor: '#274c77'}}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm font-medium" style={{color: '#a3cef1'}}>Total Students</p>
                        <p className="text-2xl sm:text-3xl font-bold">
                          {realStudentData?.total !== undefined ? realStudentData.total : renderValue(campus?.total_students)}
                        </p>
                        <p className="text-xs" style={{color: '#a3cef1'}}>
                          {realStudentData?.total !== undefined ? 'Real Database Count' : 'Campus Record'}
                        </p>
                      </div>
                      <Users className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" style={{color: '#a3cef1'}} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="text-white border-0" style={{backgroundColor: '#6096ba'}}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center justify-between">
              <div>
                        <p className="text-xs sm:text-sm font-medium" style={{color: '#e7ecef'}}>Total Staff</p>
                        <p className="text-2xl sm:text-3xl font-bold">
                          {(realTeachersCount !== null || realCoordinatorsCount !== null) 
                            ? ((realTeachersCount || 0) + (realCoordinatorsCount || 0) + (campus?.total_non_teaching_staff || 0))
                            : renderValue(campus?.total_staff_members)}
                        </p>
                        <p className="text-xs" style={{color: '#e7ecef'}}>
                          {(realTeachersCount !== null || realCoordinatorsCount !== null) 
                            ? 'Real Count (Teachers + Coordinators + Staff)' 
                            : 'Campus Record'}
                        </p>
                      </div>
                      <GraduationCap className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" style={{color: '#e7ecef'}} />
              </div>
                  </CardContent>
                </Card>

                <Card className="text-white border-0" style={{backgroundColor: '#8b8c89'}}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center justify-between">
              <div>
                        <p className="text-xs sm:text-sm font-medium" style={{color: '#a3cef1'}}>Total Rooms</p>
                        <p className="text-2xl sm:text-3xl font-bold">{renderValue(campus?.total_rooms)}</p>
                        <p className="text-xs" style={{color: '#a3cef1'}}>Capacity: {renderValue(campus?.student_capacity)}</p>
                      </div>
                      <Building className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" style={{color: '#a3cef1'}} />
              </div>
                  </CardContent>
                </Card>

                <Card className="text-white border-0" style={{backgroundColor: '#a3cef1'}}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm font-medium" style={{color: '#274c77'}}>Avg Class Size</p>
                        <p className="text-2xl sm:text-3xl font-bold" style={{color: '#274c77'}}>{renderValue(campus?.avg_class_size)}</p>
                        <p className="text-xs" style={{color: '#274c77'}}>Optimal range: 25-30</p>
            </div>
                      <Target className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" style={{color: '#274c77'}} />
          </div>
              </CardContent>
            </Card>
          </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Student Demographics Chart */}
            <div>
              <StudentRadialChart 
                data={{
                  // Use real data if available (even if 0), otherwise fallback to campus record
                  male_students: realStudentData !== null ? (realStudentData.male || 0) : (campus?.male_students || (campus?.total_students ? Math.floor(campus.total_students * 0.6) : 0)),
                  female_students: realStudentData !== null ? (realStudentData.female || 0) : (campus?.female_students || (campus?.total_students ? Math.floor(campus.total_students * 0.4) : 0)),
                  morning_students: realStudentData !== null ? (realStudentData.morning || 0) : (campus?.morning_students || (campus?.total_students ? Math.floor(campus.total_students * 0.7) : 0)),
                  afternoon_students: realStudentData !== null ? (realStudentData.afternoon || 0) : (campus?.afternoon_students || (campus?.total_students ? Math.floor(campus.total_students * 0.3) : 0)),
                  total_students: realStudentData !== null ? (realStudentData.total || 0) : (campus?.total_students || 0)
                }}
              />
              
            </div>

                {/* Staff Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Staff Distribution
                </CardTitle>
              </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-lg">
                          <div className="text-xl sm:text-2xl font-bold text-blue-600">
                            {realTeachersCount !== null ? realTeachersCount : renderValue(campus?.total_teachers)}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">Teachers</div>
                          {realTeachersCount !== null ? (
                            <div className="text-xs text-gray-500 mt-1">Real Count</div>
                          ) : (
                          <div className="text-xs text-gray-500 mt-1">
                            {campus?.male_teachers}M, {campus?.female_teachers}F
                          </div>
                          )}
                        </div>
                        <div className="text-center p-3 sm:p-4 bg-green-50 rounded-lg">
                          <div className="text-xl sm:text-2xl font-bold text-green-600">{renderValue(campus?.total_maids)}</div>
                          <div className="text-xs sm:text-sm text-gray-600">Maids</div>
                </div>
                        <div className="text-center p-3 sm:p-4 bg-purple-50 rounded-lg">
                          <div className="text-xl sm:text-2xl font-bold text-purple-600">
                            {realCoordinatorsCount !== null ? realCoordinatorsCount : renderValue(campus?.total_coordinators)}
                </div>
                          <div className="text-xs sm:text-sm text-gray-600">Coordinators</div>
                          {realCoordinatorsCount !== null && (
                            <div className="text-xs text-gray-500 mt-1">Real Count</div>
                          )}
                </div>
                        <div className="text-center p-3 sm:p-4 bg-red-50 rounded-lg">
                          <div className="text-xl sm:text-2xl font-bold text-red-600">{renderValue(campus?.total_guards)}</div>
                          <div className="text-xs sm:text-sm text-gray-600">Guards</div>
                </div>
                </div>
                </div>
              </CardContent>
            </Card>

                {/* Infrastructure Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5" />
                      Infrastructure Overview
                </CardTitle>
              </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="text-center p-3 sm:p-4 border rounded-lg">
                          <div className="text-2xl sm:text-3xl font-bold text-indigo-600">{renderValue(campus?.total_classrooms)}</div>
                          <div className="text-xs sm:text-sm text-gray-600">Classrooms</div>
                </div>
                        <div className="text-center p-3 sm:p-4 border rounded-lg">
                          <div className="text-2xl sm:text-3xl font-bold text-green-600">{renderValue(campus?.total_offices)}</div>
                          <div className="text-xs sm:text-sm text-gray-600">Offices</div>
                </div>
                        <div className="text-center p-3 sm:p-4 border rounded-lg">
                          <div className="text-2xl sm:text-3xl font-bold text-purple-600">{renderValue(campus?.num_computer_labs)}</div>
                          <div className="text-xs sm:text-sm text-gray-600">Computer Labs</div>
                </div>
                        <div className="text-center p-3 sm:p-4 border rounded-lg">
                          <div className="text-2xl sm:text-3xl font-bold text-orange-600">{renderValue(campus?.num_science_labs)}</div>
                          <div className="text-xs sm:text-sm text-gray-600">Science Labs</div>
                </div>
                </div>
                </div>
              </CardContent>
            </Card>

                {/* Facilities Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                      <Wifi className="w-5 h-5" />
                      Facilities Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className={`p-3 sm:p-4 rounded-lg border-2 ${campus?.library_available ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium">Library</span>
                          <div className={`w-3 h-3 rounded-full ${campus?.library_available ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                      </div>
                      <div className={`p-3 sm:p-4 rounded-lg border-2 ${campus?.power_backup ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium">Power Backup</span>
                          <div className={`w-3 h-3 rounded-full ${campus?.power_backup ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                      </div>
                      <div className={`p-3 sm:p-4 rounded-lg border-2 ${campus?.internet_available ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium">Internet</span>
                          <div className={`w-3 h-3 rounded-full ${campus?.internet_available ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                      </div>
                      {campus?.sports_available && (
                        <div className={`p-3 sm:p-4 rounded-lg border-2 border-green-200 bg-green-50`}>
                  <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-medium">Sports Available</span>
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        </div>
                          <p className="text-xs text-gray-600 mt-1">{renderValue(campus?.sports_available)}</p>
                  </div>
                      )}
                      <div className={`p-3 sm:p-4 rounded-lg border-2 ${campus?.canteen_facility ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium">Canteen</span>
                          <div className={`w-3 h-3 rounded-full ${campus?.canteen_facility ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                  </div>
                      <div className={`p-3 sm:p-4 rounded-lg border-2 ${campus?.meal_program ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-medium">Meal Program</span>
                          <div className={`w-3 h-3 rounded-full ${campus?.meal_program ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

              {/* Performance Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                    <div className="text-center">
                      <div className="text-3xl sm:text-4xl font-bold text-blue-600 mb-2">
                        {(realStudentData?.total !== undefined ? realStudentData.total : campus?.total_students) && campus?.student_capacity ? 
                          Math.round(((realStudentData?.total !== undefined ? realStudentData.total : campus?.total_students) / campus.student_capacity) * 100) : 0}%
                      </div>
                      <div className="text-sm text-gray-600">Capacity Utilization</div>
                      {realStudentData?.total !== undefined && (
                        <div className="text-xs text-gray-500 mt-1">Using Real Student Count</div>
                      )}
                      <Progress 
                        value={(realStudentData?.total !== undefined ? realStudentData.total : campus?.total_students) && campus?.student_capacity ? 
                          ((realStudentData?.total !== undefined ? realStudentData.total : campus?.total_students) / campus.student_capacity) * 100 : 0} 
                        className="mt-2" 
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-3xl sm:text-4xl font-bold text-green-600 mb-2">
                        {(realTeachersCount || campus?.total_teachers) && (realStudentData?.total !== undefined ? realStudentData.total : campus?.total_students) ? 
                          Math.round((realStudentData?.total !== undefined ? realStudentData.total : campus?.total_students) / (realTeachersCount || campus?.total_teachers || 1)) : 0}
                      </div>
                      <div className="text-sm text-gray-600">Student-Teacher Ratio</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {realTeachersCount !== null ? 'Using Real Count' : ''} Ideal: 15-20
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl sm:text-4xl font-bold text-purple-600 mb-2">
                        {campus?.total_classrooms && (realStudentData?.total !== undefined ? realStudentData.total : campus?.total_students) ? 
                          Math.round((realStudentData?.total !== undefined ? realStudentData.total : campus?.total_students) / campus.total_classrooms) : 0}
                      </div>
                      <div className="text-sm text-gray-600">Students per Classroom</div>
                      <div className="text-xs text-gray-500 mt-1">Current avg: {renderValue(campus?.avg_class_size)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
            </div>
          </div>
    </div>
  )
}

export default function AdminCampusProfilePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <CampusProfileContent />
    </Suspense>
  )
}