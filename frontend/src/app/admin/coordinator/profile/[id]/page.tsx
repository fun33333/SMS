"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  MapPin, 
  GraduationCap, 
  Briefcase, 
  User,
  Building2,
  Users,
  Shield,
  CheckCircle,
  XCircle,
  BookOpen,
  Layers,
  Activity,
  TrendingUp,
  FileText,
  Eye,
  BarChart3,
  PieChart as PieChartIcon
} from "lucide-react"
import { getApiBaseUrl, getCoordinatorGeneralStats, getCoordinatorClassrooms, getLevelAttendanceSummary } from "@/lib/api"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { getCurrentUserRole } from "@/lib/permissions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts'

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

interface ClassroomData {
  id: number
  name: string
  code: string
  grade: string
  section: string
  shift: string
  level?: { id: number; name: string } | null
  class_teacher?: { id: number; full_name: string; employee_code?: string } | null
  student_count: number
  capacity: number
}

interface DashboardStats {
  total_teachers: number
  total_students: number
  total_classes: number
  pending_requests: number
}

interface AttendanceSummary {
  summary: {
    total_classrooms: number
    total_students: number
    total_present: number
    total_absent: number
    overall_percentage: number
  }
  classrooms: Array<{
    classroom: {
      id: number
      name: string
      grade?: string
      section?: string
      shift: string
    }
    student_count: number
    average_percentage: number
    total_present?: number
    total_absent?: number
    last_attendance?: string | null
  }>
}

const COLORS = ['#6096ba', '#274c77', '#a3cef1', '#8b9dc3', '#f7b801', '#ff6b6b', '#4ecdc4', '#95e1d3']

export default function CoordinatorProfilePage() {
  const params = useParams()
  const router = useRouter()
  const [coordinator, setCoordinator] = useState<CoordinatorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPrincipal, setIsPrincipal] = useState(false)
  
  // Principal view data
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [classrooms, setClassrooms] = useState<ClassroomData[]>([])
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [loadingClassrooms, setLoadingClassrooms] = useState(false)
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  
  // Date range for attendance
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return date.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    document.title = "Coordinator Profile | IAK SMS"
    const userRole = getCurrentUserRole()
    setIsPrincipal(userRole === 'principal')
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
        
        const userRole = getCurrentUserRole()
        if (userRole === 'principal' && data.id) {
          // Wait a bit for state to update, then load principal view data
          setTimeout(() => {
            loadPrincipalViewData(data.id)
          }, 100)
        }
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
  
  async function loadPrincipalViewData(coordinatorId: number) {
    setLoadingStats(true)
    try {
      const stats = await getCoordinatorGeneralStats(coordinatorId) as { stats?: DashboardStats } | null
      if (stats && stats.stats) {
        setDashboardStats(stats.stats)
      }
    } catch (error) {
      console.error('Error loading dashboard stats:', error)
    } finally {
      setLoadingStats(false)
    }
    
    setLoadingClassrooms(true)
    try {
      const classroomsData = await getCoordinatorClassrooms(coordinatorId)
      console.log('Classrooms data received for coordinator', coordinatorId, ':', classroomsData)
      if (Array.isArray(classroomsData)) {
        setClassrooms(classroomsData)
        if (classroomsData.length === 0) {
          // Get coordinator data from state after a short delay
          setTimeout(() => {
            const currentCoordinator = coordinator
            console.log('No classrooms found. Coordinator details:', {
              id: currentCoordinator?.id,
              level: currentCoordinator?.level,
              assigned_levels: currentCoordinator?.assigned_levels_details,
              shift: currentCoordinator?.shift
            })
          }, 200)
        }
      } else {
        console.warn('Classrooms data is not an array:', classroomsData)
        setClassrooms([])
      }
    } catch (error) {
      console.error('Error loading classrooms:', error)
      setClassrooms([])
    } finally {
      setLoadingClassrooms(false)
    }
    
    // Wait for coordinator to be set before loading attendance
    setTimeout(() => {
      loadAttendanceSummary()
    }, 200)
  }
  
  async function loadAttendanceSummary() {
    if (!coordinator) return
    
    setLoadingAttendance(true)
    try {
      const assignedLevels = coordinator.assigned_levels_details || 
        (coordinator.assigned_levels ? coordinator.assigned_levels : [])
      const primaryLevel = coordinator.level || (assignedLevels.length > 0 ? assignedLevels[0] : null)
      
      if (primaryLevel) {
        const levelId = primaryLevel.id || (assignedLevels[0]?.id)
        if (levelId) {
          const summary = await getLevelAttendanceSummary(levelId, startDate, endDate) as AttendanceSummary | null
          if (summary) {
            setAttendanceSummary(summary)
          }
        }
      }
    } catch (error) {
      console.error('Error loading attendance summary:', error)
    } finally {
      setLoadingAttendance(false)
    }
  }
  
  useEffect(() => {
    if (coordinator && isPrincipal) {
      loadAttendanceSummary()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator, startDate, endDate, isPrincipal])
  
  const handleDateRangeChange = () => {
    loadAttendanceSummary()
  }

  // Chart data preparation
  const statsChartData = useMemo(() => {
    if (!dashboardStats) return []
    return [
      { name: 'Students', value: dashboardStats.total_students, color: '#6096ba' },
      { name: 'Teachers', value: dashboardStats.total_teachers, color: '#274c77' },
      { name: 'Classes', value: dashboardStats.total_classes, color: '#a3cef1' },
      { name: 'Requests', value: dashboardStats.pending_requests, color: '#f7b801' }
    ]
  }, [dashboardStats])

  const attendanceChartData = useMemo(() => {
    if (!attendanceSummary || !attendanceSummary.classrooms.length) return []
    return attendanceSummary.classrooms.slice(0, 10).map(item => ({
      name: item.classroom.name || `${item.classroom.grade} - ${item.classroom.section}`,
      attendance: item.average_percentage,
      present: item.total_present || 0,
      absent: item.total_absent || 0
    }))
  }, [attendanceSummary])

  const attendancePieData = useMemo(() => {
    if (!attendanceSummary) return []
    return [
      { name: 'Present', value: attendanceSummary.summary.total_present, color: '#10b981' },
      { name: 'Absent', value: attendanceSummary.summary.total_absent, color: '#ef4444' }
    ]
  }, [attendanceSummary])

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

  const assignedLevels = coordinator?.assigned_levels_details || 
    (coordinator?.assigned_levels ? coordinator.assigned_levels : [])
  const hasMultipleLevels = assignedLevels.length > 1
  const primaryLevel = coordinator?.level || (assignedLevels.length > 0 ? assignedLevels[0] : null)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e7ecef] p-2 sm:p-3 md:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-48 sm:h-64">
            <LoadingSpinner message="Loading coordinator profile..." />
          </div>
        </div>
      </div>
    )
  }

  if (error || !coordinator) {
    return (
      <div className="min-h-screen bg-[#e7ecef] p-2 sm:p-3 md:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-48 sm:h-64">
            <div className="text-center px-3 sm:px-4">
              <XCircle className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-red-500 mx-auto mb-3 sm:mb-4" />
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 mb-2">Profile Not Found</h2>
              <p className="text-xs sm:text-sm md:text-base text-gray-600 mb-3 sm:mb-4 px-2">{error || "The requested coordinator profile could not be found."}</p>
              <Button onClick={() => router.back()} className="bg-[#6096ba] hover:bg-[#274c77] text-xs sm:text-sm h-8 sm:h-9 md:h-10 px-3 sm:px-4">
                <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#e7ecef] p-1.5 sm:p-3 md:p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-2.5 sm:space-y-4 md:space-y-6">
        {/* Header - Redesigned */}
        <Card className="bg-gradient-to-r from-[#274c77] via-[#6096ba] to-[#a3cef1] border-0 shadow-lg overflow-hidden">
          <div className="p-3 sm:p-4 md:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              {/* Left Section - Back Button */}
          <Button
            onClick={() => router.back()}
            variant="outline"
                className="bg-white/90 hover:bg-white text-[#274c77] border-white/50 shadow-md hover:shadow-lg transition-all h-9 sm:h-10 md:h-11 px-4 sm:px-5 flex-shrink-0 font-medium"
          >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
                <span className="text-xs sm:text-sm md:text-base">Back to List</span>
          </Button>

              {/* Center Section - Employee Code */}
            {coordinator.employee_code && (
                <div className="flex-1 flex items-center justify-center sm:justify-start">
                  <div className="bg-white/95 backdrop-blur-sm rounded-lg px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 shadow-md border border-white/50">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-[#274c77] to-[#6096ba] rounded-lg flex items-center justify-center shadow-sm">
                        <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[9px] sm:text-[10px] md:text-xs text-gray-500 font-medium uppercase tracking-wide">Employee ID</p>
                        <p className="text-sm sm:text-base md:text-lg font-bold text-[#274c77] font-mono">{coordinator.employee_code}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Right Section - Status Badge */}
              <div className="flex-shrink-0">
                <div className={`relative overflow-hidden rounded-xl px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 shadow-lg ${
                coordinator.is_currently_active 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600' 
                    : 'bg-gradient-to-r from-red-500 to-rose-600'
                }`}>
                  <div className="flex items-center gap-2">
              {coordinator.is_currently_active ? (
                <>
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-white rounded-full animate-pulse"></div>
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white flex-shrink-0" />
                        <span className="text-xs sm:text-sm md:text-base font-semibold text-white">Active</span>
                </>
              ) : (
                <>
                        <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white flex-shrink-0" />
                        <span className="text-xs sm:text-sm md:text-base font-semibold text-white">Inactive</span>
                </>
              )}
                  </div>
                  {/* Decorative shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shine"></div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Profile Header Card */}
        <Card className="bg-white shadow-xl border-2 border-[#a3cef1] overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-[#274c77] to-[#6096ba] text-white rounded-t-lg p-3 sm:p-4 md:p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 md:space-x-4">
              <div className="w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-white rounded-full flex items-center justify-center shadow-lg flex-shrink-0 mx-auto sm:mx-0">
                <User className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 text-[#6096ba]" />
              </div>
              <div className="flex-1 min-w-0 w-full text-center sm:text-left">
                <CardTitle className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold mb-1.5 sm:mb-2 break-words px-1">
                  {coordinator.full_name || 'Unknown'}
                </CardTitle>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                  <Badge className="bg-white/20 text-white border-white/30 text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1">
                    <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1 inline flex-shrink-0" />
                    <span className="hidden sm:inline">Coordinator</span>
                    <span className="sm:hidden">Coord</span>
                  </Badge>
                  {coordinator.campus_name && (
                    <Badge className="bg-white/20 text-white border-white/30 text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1">
                      <Building2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1 inline flex-shrink-0" />
                      <span className="truncate max-w-[80px] sm:max-w-[120px] md:max-w-none">{coordinator.campus_name}</span>
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-2 md:gap-4 mt-2 sm:mt-3 text-blue-100">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs md:text-sm">
                    <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                    <span className="truncate max-w-[180px] sm:max-w-none break-all">{coordinator.email}</span>
                  </div>
                  {coordinator.contact_number && (
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs md:text-sm">
                      <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                      <span className="break-all">{coordinator.contact_number}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Main Information Card with Tabs */}
        <Card className="bg-white shadow-lg border-2 border-[#a3cef1] overflow-hidden">
          <CardHeader className="bg-[#f8fbff] border-b-2 border-[#a3cef1] p-2.5 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-[#274c77]">Coordinator Information</CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6">
            <Tabs defaultValue={isPrincipal ? "overview" : "personal"} className="w-full">
              {/* Mobile: Icons only with equal width, Desktop: Icons + Text */}
              <div className="overflow-x-auto -mx-2 sm:-mx-3 md:-mx-4 lg:-mx-6 px-2 sm:px-3 md:px-4 lg:px-6 pb-2 mb-2 sm:mb-3 md:mb-4 scrollbar-hide">
                <TabsList className={`inline-flex w-full h-auto bg-gray-100/50 p-0.5 sm:p-1 rounded-lg ${isPrincipal ? 'grid grid-cols-6' : 'grid grid-cols-4'} sm:inline-flex sm:w-full sm:min-w-max`}>
                {isPrincipal && (
                  <TabsTrigger 
                    value="overview" 
                    className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                    title="Overview"
                  >
                    <Activity className="w-4 h-4 sm:w-4 sm:h-4 md:w-4 md:h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                    <span className="hidden sm:inline text-[10px] sm:text-xs">Overview</span>
                  </TabsTrigger>
                )}
                <TabsTrigger 
                  value="personal" 
                  className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                  title="Personal"
                >
                  <User className="w-4 h-4 sm:w-4 sm:h-4 md:w-4 md:h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                  <span className="hidden sm:inline text-[10px] sm:text-xs">Personal</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="professional" 
                  className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                  title="Professional"
                >
                  <Briefcase className="w-4 h-4 sm:w-4 sm:h-4 md:w-4 md:h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                  <span className="hidden sm:inline text-[10px] sm:text-xs">Professional</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="education" 
                  className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                  title="Education"
                >
                  <BookOpen className="w-4 h-4 sm:w-4 sm:h-4 md:w-4 md:h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                  <span className="hidden sm:inline text-[10px] sm:text-xs">Education</span>
                </TabsTrigger>
                {isPrincipal && (
                  <>
                    <TabsTrigger 
                      value="classrooms" 
                      className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                      title="Classrooms"
                    >
                      <Layers className="w-4 h-4 sm:w-4 sm:h-4 md:w-4 md:h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                      <span className="hidden sm:inline text-[10px] sm:text-xs">Classrooms</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="attendance" 
                      className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                      title="Attendance"
                    >
                      <TrendingUp className="w-4 h-4 sm:w-4 sm:h-4 md:w-4 md:h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                      <span className="hidden sm:inline text-[10px] sm:text-xs">Attendance</span>
                    </TabsTrigger>
                  </>
                )}
                </TabsList>
              </div>

              {/* Overview Tab (Principal Only) */}
              {isPrincipal && (
                <TabsContent value="overview" className="space-y-3 sm:space-y-4 md:space-y-6 mt-2 sm:mt-3 md:mt-4">
                  {loadingStats ? (
                    <div className="flex items-center justify-center py-6 sm:py-8 md:py-12">
                      <LoadingSpinner message="Loading statistics..." />
                    </div>
                  ) : dashboardStats ? (
                    <>
                      {/* Statistics Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-2.5 sm:p-3 md:p-4 border border-blue-200">
                          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 mb-1.5 sm:mb-2">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-blue-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 truncate">Students</span>
                          </div>
                          <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-blue-900">{dashboardStats.total_students}</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-2.5 sm:p-3 md:p-4 border border-green-200">
                          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 mb-1.5 sm:mb-2">
                            <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 truncate">Teachers</span>
                          </div>
                          <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-green-900">{dashboardStats.total_teachers}</p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-2.5 sm:p-3 md:p-4 border border-purple-200">
                          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 mb-1.5 sm:mb-2">
                            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-purple-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 truncate">Classes</span>
                          </div>
                          <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-purple-900">{dashboardStats.total_classes}</p>
                        </div>
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-2.5 sm:p-3 md:p-4 border border-orange-200">
                          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 mb-1.5 sm:mb-2">
                            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-orange-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 truncate">Requests</span>
                          </div>
                          <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-orange-900">{dashboardStats.pending_requests}</p>
                </div>
              </div>

                      {/* Charts */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                        {/* Bar Chart */}
                        <Card className="border border-gray-200">
                          <CardHeader className="pb-2 sm:pb-3 p-2 sm:p-3 md:p-6">
                            <CardTitle className="text-xs sm:text-sm md:text-base lg:text-lg flex items-center gap-1.5 sm:gap-2">
                              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                              <span className="truncate">Statistics Overview</span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-2 sm:p-3 md:p-6">
                            <div className="w-full overflow-x-auto" style={{ minHeight: '180px' }}>
                              <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={statsChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip />
                                  <Bar dataKey="value" fill="#6096ba" radius={[6, 6, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Pie Chart */}
                        <Card className="border border-gray-200">
                          <CardHeader className="pb-2 sm:pb-3 p-2 sm:p-3 md:p-6">
                            <CardTitle className="text-xs sm:text-sm md:text-base lg:text-lg flex items-center gap-1.5 sm:gap-2">
                              <PieChartIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
                              Distribution
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-2 sm:p-3 md:p-6">
                            <div className="w-full" style={{ minHeight: '180px' }}>
                              <ResponsiveContainer width="100%" height={180}>
                                <PieChart>
                                  <Pie
                                    data={statsChartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={(entry: any) => `${entry.name}: ${(entry.percent * 100).toFixed(0)}%`}
                                    outerRadius={55}
                                    fill="#8884d8"
                                    dataKey="value"
                                  >
                                    {statsChartData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No statistics available</p>
                  )}
                </TabsContent>
              )}

              {/* Personal Information Tab */}
              <TabsContent value="personal" className="space-y-2.5 sm:space-y-3 md:space-y-4 mt-2 sm:mt-3 md:mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 md:gap-4">
                  <div className="w-full rounded-lg border bg-white divide-y text-sm">
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Full Name</p>
                      <div className="col-span-2 font-medium text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{coordinator.full_name || '—'}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Date of Birth</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">
                        {coordinator.dob 
                          ? new Date(coordinator.dob).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })
                          : '—'}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Gender</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm capitalize break-words">{coordinator.gender || '—'}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Contact</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{coordinator.contact_number || '—'}</div>
                    </div>
                  </div>
                  <div className="w-full rounded-lg border bg-white divide-y text-sm">
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Email</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{coordinator.email || '—'}</div>
                    </div>
                    {coordinator.permanent_address && (
                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                        <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Address</p>
                        <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{coordinator.permanent_address}</div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Professional Information Tab */}
              <TabsContent value="professional" className="space-y-2.5 sm:space-y-3 md:space-y-4 mt-2 sm:mt-3 md:mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 md:gap-4">
                  <div className="w-full rounded-lg border bg-white divide-y text-sm">
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Campus</p>
                      <div className="col-span-2 font-medium text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">
                        {coordinator.campus_name || coordinator.campus?.campus_name || '—'}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Shift</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{getShiftDisplay(coordinator.shift)}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Joining Date</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">
                  {coordinator.joining_date 
                    ? new Date(coordinator.joining_date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })
                          : '—'}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Experience</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{coordinator.total_experience_years || 0} years</div>
              </div>
                </div>
                  <div className="w-full rounded-lg border bg-white divide-y text-sm">
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Assigned Levels</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm">
                {hasMultipleLevels ? (
                          <div className="flex flex-wrap gap-1">
                    {assignedLevels.map((level: any) => (
                              <Badge key={level.id} className="bg-[#6096ba] text-white text-[10px] sm:text-xs">
                                {level.name}
                      </Badge>
                    ))}
                  </div>
                ) : primaryLevel ? (
                          <span className="break-words">{primaryLevel.name || coordinator.level_name || '—'}</span>
                ) : (
                          '—'
                )}
              </div>
                </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Can Assign Teachers</p>
                      <div className="col-span-2">
                <Badge 
                          className={`text-[10px] sm:text-xs ${
                    coordinator.can_assign_class_teachers 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                  }`}
                >
                  {coordinator.can_assign_class_teachers ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
                  </div>
                </div>
              </TabsContent>

              {/* Education Information Tab */}
              <TabsContent value="education" className="space-y-2.5 sm:space-y-3 md:space-y-4 mt-2 sm:mt-3 md:mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 md:gap-4">
                  <div className="w-full rounded-lg border bg-white divide-y text-sm">
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Education Level</p>
                      <div className="col-span-2 font-medium text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{coordinator.education_level || '—'}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Institution</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{coordinator.institution_name || '—'}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2 sm:p-2.5 md:p-3">
                      <p className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">Year of Passing</p>
                      <div className="col-span-2 text-gray-800 text-[11px] sm:text-xs md:text-sm break-words">{coordinator.year_of_passing || '—'}</div>
                    </div>
              </div>
                </div>
              </TabsContent>

              {/* Classrooms Tab (Principal Only) */}
              {isPrincipal && (
                <TabsContent value="classrooms" className="space-y-2.5 sm:space-y-3 md:space-y-4 mt-2 sm:mt-3 md:mt-4">
                  {loadingClassrooms ? (
                    <div className="flex items-center justify-center py-6 sm:py-8 md:py-12">
                      <LoadingSpinner message="Loading classrooms..." />
                    </div>
                  ) : classrooms.length > 0 ? (
                    <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
                      {classrooms.map((classroom) => (
                        <div
                          key={classroom.id}
                          className="bg-gray-50 rounded-lg p-2.5 sm:p-3 md:p-4 border border-gray-200 hover:border-[#6096ba] transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                                <h4 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-gray-900 break-words">{classroom.name}</h4>
                                <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0">{classroom.code}</Badge>
                                <Badge className="bg-[#6096ba] text-white text-[10px] sm:text-xs flex-shrink-0">
                                  {classroom.shift.charAt(0).toUpperCase() + classroom.shift.slice(1)}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                                  <span className="truncate">{classroom.student_count} Students</span>
                                </div>
                                {classroom.class_teacher && (
                                  <div className="flex items-center gap-1">
                                    <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                                    <span className="truncate">{classroom.class_teacher.full_name}</span>
                                  </div>
                                )}
                                {classroom.level && (
                                  <div className="flex items-center gap-1">
                                    <GraduationCap className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                                    <span className="truncate">{classroom.level.name}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/admin/classes/${classroom.id}`)}
                              className="w-full sm:w-auto flex-shrink-0 h-8 sm:h-9 md:h-10 text-[10px] sm:text-xs md:text-sm px-2 sm:px-3"
                            >
                              <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-1 sm:mr-1.5 md:mr-2" />
                              <span>View Details</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <Layers className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-gray-400" />
                      </div>
                      <p className="text-sm sm:text-base md:text-lg font-semibold text-gray-700 mb-2">No Classrooms Assigned</p>
                      <p className="text-xs sm:text-sm text-gray-500 text-center max-w-md px-4">
                        This coordinator doesn't have any classrooms assigned yet. Classrooms will appear here once they are assigned.
                      </p>
                    </div>
                  )}
                </TabsContent>
              )}

              {/* Attendance Tab (Principal Only) */}
              {isPrincipal && (
                <TabsContent value="attendance" className="space-y-3 sm:space-y-4 md:space-y-6 mt-2 sm:mt-3 md:mt-4">
                  {/* Date Range Filter */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 md:gap-4">
                    <div>
                      <Label htmlFor="startDate" className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-700">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1 text-[11px] sm:text-xs md:text-sm h-8 sm:h-9 md:h-10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="endDate" className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-700">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="mt-1 text-[11px] sm:text-xs md:text-sm h-8 sm:h-9 md:h-10"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={handleDateRangeChange}
                        className="w-full bg-[#6096ba] hover:bg-[#274c77] text-[10px] sm:text-xs md:text-sm h-8 sm:h-9 md:h-10"
                      >
                        Apply Filter
                      </Button>
                    </div>
              </div>

                  {loadingAttendance ? (
                    <div className="flex items-center justify-center py-6 sm:py-8 md:py-12">
                      <LoadingSpinner message="Loading attendance data..." />
                </div>
                  ) : attendanceSummary ? (
                    <>
                      {/* Overall Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                        <Card className="border border-blue-200 bg-blue-50">
                          <CardContent className="p-2 sm:p-2.5 md:p-3 lg:p-4">
                            <p className="text-[10px] sm:text-xs text-gray-600 mb-1">Classrooms</p>
                            <p className="text-lg sm:text-xl md:text-2xl font-bold text-blue-900">{attendanceSummary.summary.total_classrooms}</p>
                          </CardContent>
                        </Card>
                        <Card className="border border-green-200 bg-green-50">
                          <CardContent className="p-2 sm:p-2.5 md:p-3 lg:p-4">
                            <p className="text-[10px] sm:text-xs text-gray-600 mb-1">Students</p>
                            <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-900">{attendanceSummary.summary.total_students}</p>
                          </CardContent>
                        </Card>
                        <Card className="border border-indigo-200 bg-indigo-50">
                          <CardContent className="p-2 sm:p-2.5 md:p-3 lg:p-4">
                            <p className="text-[10px] sm:text-xs text-gray-600 mb-1">Present</p>
                            <p className="text-lg sm:text-xl md:text-2xl font-bold text-indigo-900">{attendanceSummary.summary.total_present}</p>
                          </CardContent>
                        </Card>
                        <Card className="border border-purple-200 bg-purple-50">
                          <CardContent className="p-2 sm:p-2.5 md:p-3 lg:p-4">
                            <p className="text-[10px] sm:text-xs text-gray-600 mb-1">Overall %</p>
                            <p className="text-lg sm:text-xl md:text-2xl font-bold text-purple-900">
                              {attendanceSummary.summary.overall_percentage.toFixed(1)}%
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Charts */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                        {/* Attendance Bar Chart */}
                        {attendanceChartData.length > 0 && (
                          <Card className="border border-gray-200">
                            <CardHeader className="pb-2 sm:pb-3 p-2 sm:p-3 md:p-6">
                              <CardTitle className="text-xs sm:text-sm md:text-base lg:text-lg">Classroom Attendance</CardTitle>
                            </CardHeader>
                            <CardContent className="p-2 sm:p-3 md:p-6">
                              <div className="w-full overflow-x-auto scrollbar-hide">
                                <div style={{ minWidth: '280px', minHeight: '220px' }}>
                                  <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={attendanceChartData} margin={{ top: 5, right: 5, left: 0, bottom: 50 }}>
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} tick={{ fontSize: 9 }} />
                                      <YAxis tick={{ fontSize: 10 }} />
                                      <Tooltip />
                                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                                      <Bar dataKey="attendance" fill="#6096ba" name="Attendance %" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                  </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
                        )}

                        {/* Attendance Pie Chart */}
                        {attendancePieData.length > 0 && (
                          <Card className="border border-gray-200">
                            <CardHeader className="pb-2 sm:pb-3 p-2 sm:p-3 md:p-6">
                              <CardTitle className="text-xs sm:text-sm md:text-base lg:text-lg">Present vs Absent</CardTitle>
          </CardHeader>
                            <CardContent className="p-2 sm:p-3 md:p-6">
                              <div className="w-full" style={{ minHeight: '220px' }}>
                                <ResponsiveContainer width="100%" height={220}>
                                  <PieChart>
                                    <Pie
                                      data={attendancePieData}
                                      cx="50%"
                                      cy="50%"
                                      labelLine={false}
                                      label={(entry: any) => `${entry.name}: ${(entry.percent * 100).toFixed(1)}%`}
                                      outerRadius={70}
                                      fill="#8884d8"
                                      dataKey="value"
                                    >
                                      {attendancePieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                    </Pie>
                                    <Tooltip />
                                  </PieChart>
                                </ResponsiveContainer>
                </div>
                            </CardContent>
                          </Card>
                        )}
              </div>

                      {/* Per Classroom Attendance Table */}
                      {attendanceSummary.classrooms.length > 0 && (
                        <Card className="border border-gray-200">
                          <CardHeader className="pb-2 sm:pb-3 p-2 sm:p-3 md:p-6">
                            <CardTitle className="text-xs sm:text-sm md:text-base lg:text-lg">Per Classroom Details</CardTitle>
                          </CardHeader>
                          <CardContent className="p-2 sm:p-3 md:p-6">
                            <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
                              {attendanceSummary.classrooms.map((item, index) => (
                                <div
                                  key={index}
                                  className="bg-gray-50 rounded-lg p-2.5 sm:p-3 md:p-4 border border-gray-200"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="text-[11px] sm:text-xs md:text-sm lg:text-base font-semibold text-gray-900 mb-1.5 sm:mb-2 break-words">
                                        {item.classroom.name || `${item.classroom.grade} - ${item.classroom.section}`}
                                      </h5>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-600">
                                        <div>
                                          <span className="font-medium">Students: </span>
                                          <span>{item.student_count}</span>
                                        </div>
                                        <div>
                                          <span className="font-medium">Present: </span>
                                          <span className="text-green-700">{item.total_present || 0}</span>
                                        </div>
                                        <div>
                                          <span className="font-medium">Absent: </span>
                                          <span className="text-red-700">{item.total_absent || 0}</span>
                                        </div>
                                        <div>
                                          <span className="font-medium">Average: </span>
                                          <span className="text-blue-700 font-semibold">{item.average_percentage.toFixed(1)}%</span>
                                        </div>
                                      </div>
                </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <div className="w-16 sm:w-20 md:w-24 lg:w-32 h-2 sm:h-2.5 md:h-3 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-blue-600 transition-all"
                                          style={{ width: `${Math.min(item.average_percentage, 100)}%` }}
                                        />
              </div>
                  </div>
                </div>
                  </div>
                              ))}
                </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  ) : (
                    <p className="text-center text-gray-500 py-6 sm:py-8 md:py-12 text-xs sm:text-sm md:text-base">No attendance data available</p>
                  )}
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
