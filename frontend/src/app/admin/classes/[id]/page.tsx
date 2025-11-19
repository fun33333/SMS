"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calender"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { 
  ArrowLeft, 
  Users, 
  User, 
  GraduationCap, 
  Building2, 
  Calendar as CalendarIcon,
  Mail,
  Phone,
  Layers,
  Eye,
  TrendingUp, 
  Activity,
  BarChart3,
  PieChart as PieChartIcon
} from "lucide-react"
import { getApiBaseUrl } from "@/lib/api"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
  Cell
} from 'recharts'

interface ClassroomDetail {
  id: number
  code: string
  grade: number  // Grade ID
  grade_name?: string
  grade_code?: string
  section: string
  shift: string
  capacity: number
  class_teacher?: number  // Teacher ID
  class_teacher_name?: string
  class_teacher_code?: string
  level_name?: string
  level_code?: string
  campus_name?: string
  student_count?: number
  students?: Array<{
    id: number
    full_name: string
    student_code?: string
    gr_no?: string
    gender?: string
    dob?: string
  }>
}

interface AttendanceSummary {
  total_students: number
  present_count: number
  absent_count: number
  leave_count: number
  attendance_percentage: number
  total_days?: number
  records_count?: number
  today_present?: number
  today_absent?: number
}

export default function ClassroomDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null)
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: (() => {
      const date = new Date()
      date.setDate(date.getDate() - 7)
      return date
    })(),
    to: new Date()
  })

  useEffect(() => {
    document.title = "Classroom Details | IAK SMS"
  }, [])

  useEffect(() => {
    async function loadClassroom() {
      try {
        setLoading(true)
        const baseUrl = getApiBaseUrl()
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
        
        const response = await fetch(`${cleanBaseUrl}/api/classrooms/${params.id}/`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (!response.ok) {
          setError("Classroom not found")
          return
        }

        const data = await response.json()
        console.log('Classroom API response:', data)
        
        // Fetch students for this classroom
        let students = []
        try {
          const studentsResponse = await fetch(`${cleanBaseUrl}/api/students/?classroom=${params.id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
              'Content-Type': 'application/json'
            }
          })
          if (studentsResponse.ok) {
            const studentsData = await studentsResponse.json()
            students = Array.isArray(studentsData) ? studentsData : (studentsData.results || [])
          }
        } catch (err) {
          console.error('Error fetching students:', err)
        }
        
        // Transform API response to match our interface
        const transformedData: ClassroomDetail = {
          ...data,
          student_count: students.length,
          students: students.map((s: any) => ({
            id: s.id,
            full_name: s.full_name || s.name,
            student_code: s.student_code || s.student_id || '—',
            gr_no: s.gr_no,
            gender: s.gender,
            dob: s.dob
          }))
        }
        
        setClassroom(transformedData)
        
        // Fetch attendance summary with default date range (last 7 days)
        if (dateRange.from && dateRange.to) {
          const days = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24))
          loadAttendanceSummary(params.id as string, days, dateRange.from, dateRange.to)
        }
      } catch (error) {
        console.error('Error loading classroom:', error)
        setError("Failed to load classroom details")
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      loadClassroom()
    }
  }, [params.id])

  // Reload attendance when date range changes
  useEffect(() => {
    if (params.id && classroom && dateRange.from && dateRange.to) {
      const days = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24))
      loadAttendanceSummary(params.id as string, days, dateRange.from, dateRange.to)
    }
  }, [dateRange, params.id, classroom])
  
  // Helper function to check if a date is a weekend
  function isWeekend(date: Date): boolean {
    const day = date.getDay()
    return day === 0 || day === 6 // Sunday = 0, Saturday = 6
  }

  // Helper function to get weekdays count between two dates
  function getWeekdaysCount(startDate: Date, endDate: Date): number {
    let count = 0
    const current = new Date(startDate)
    while (current <= endDate) {
      if (!isWeekend(current)) {
        count++
      }
      current.setDate(current.getDate() + 1)
    }
    return count
  }

  async function loadAttendanceSummary(classroomId: string, days: number = 7, startDate?: Date, endDate?: Date) {
    setLoadingAttendance(true)
    try {
      const baseUrl = getApiBaseUrl()
      const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
      
      // Use provided dates or calculate from days
      let today: Date
      let start: Date
      
      if (startDate && endDate) {
        start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        today = new Date(endDate)
        today.setHours(23, 59, 59, 999)
      } else {
        // Fallback to days calculation
        today = new Date()
        today.setHours(23, 59, 59, 999)
        start = new Date(today)
        start.setDate(start.getDate() - days)
        start.setHours(0, 0, 0, 0)
        
        // Adjust start date to skip weekends if needed
        while (isWeekend(start) && start < today) {
          start.setDate(start.getDate() + 1)
        }
      }
      
      const startDateStr = start.toISOString().split('T')[0]
      const endDateStr = today.toISOString().split('T')[0]
      
      const url = `${cleanBaseUrl}/api/attendance/class/${classroomId}/summary/?start_date=${startDateStr}&end_date=${endDateStr}`
      console.log('Fetching attendance summary from:', url, 'from', startDateStr, 'to', endDateStr)
      
      // Store dates for later use in aggregation
      const dateRangeObj = { startDate: start, today }
      
      // Fetch attendance summary
      const summaryResponse = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log('Attendance summary response status:', summaryResponse.status)
      
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json()
        console.log('Attendance summary data:', summaryData)
        
        // Handle different response structures
        if (summaryData) {
          // Backend returns an array of attendance records per date (ordered by date desc)
          // Filter out weekends and aggregate data
          let data
          if (Array.isArray(summaryData)) {
            if (summaryData.length > 0) {
              // Filter out weekend records
              const weekdayRecords = summaryData.filter(record => {
                if (record.date) {
                  const recordDate = new Date(record.date)
                  return !isWeekend(recordDate)
                }
                return true // Include if date not available
              })
              
              if (weekdayRecords.length > 0) {
                // Get total students from latest record
                const latestRecord = weekdayRecords[0]
                const totalStudents = latestRecord.total_students || (classroom?.student_count || 0)
                
                // Calculate TOTAL counts across all days in the range (not average)
                const totalPresent = weekdayRecords.reduce((sum, r) => sum + (r.present_count || 0), 0)
                const totalAbsent = weekdayRecords.reduce((sum, r) => sum + (r.absent_count || 0), 0)
                // Check both late_count and leave_count from backend
                const totalLeave = weekdayRecords.reduce((sum, r) => sum + (r.leave_count || r.late_count || 0), 0)
                
                // Calculate average attendance percentage (excluding weekends)
                const avgPercentage = weekdayRecords.length > 0
                  ? weekdayRecords.reduce((sum, r) => sum + (r.attendance_percentage || 0), 0) / weekdayRecords.length
                  : 0
                
                // Calculate expected weekdays in the range
                const expectedWeekdays = getWeekdaysCount(dateRangeObj.startDate, dateRangeObj.today)
                
                // Use total counts across all days for display
                data = {
                  total_students: totalStudents,
                  present_count: totalPresent, // Total present across all days
                  absent_count: totalAbsent, // Total absent across all days
                  leave_count: totalLeave, // Total leave across all days
                  attendance_percentage: avgPercentage,
                  total_days: expectedWeekdays,
                  records_count: weekdayRecords.length
                }
              } else {
                // No weekday records
                data = {
                  total_students: classroom?.student_count || 0,
                  present_count: 0,
                  absent_count: 0,
                  leave_count: 0,
                  attendance_percentage: 0,
                  total_days: getWeekdaysCount(dateRangeObj.startDate, dateRangeObj.today),
                  records_count: 0
                }
              }
            } else {
              // No attendance records
              const expectedWeekdays = getWeekdaysCount(dateRangeObj.startDate, dateRangeObj.today)
              data = {
                total_students: classroom?.student_count || 0,
                present_count: 0,
                absent_count: 0,
                leave_count: 0,
                attendance_percentage: 0,
                total_days: expectedWeekdays,
                records_count: 0
              }
            }
          } else {
            // Single object response
            data = summaryData.summary || summaryData.data || summaryData
          }
          
          // Ensure we have the required fields with defaults
          const totalStudents = data.total_students || (classroom?.student_count || 0)
          const presentCount = data.present_count || data.present || 0
          const absentCount = data.absent_count || data.absent || 0
          // Check both leave_count and late_count from backend response
          const leaveCount = data.leave_count || data.late_count || data.leave || 0
          const percentage = data.attendance_percentage || data.percentage || (totalStudents > 0 ? ((presentCount / totalStudents) * 100) : 0)
          
          setAttendanceSummary({
            total_students: totalStudents,
            present_count: presentCount,
            absent_count: absentCount,
            leave_count: leaveCount,
            attendance_percentage: percentage
          })
        }
      } else {
        const errorText = await summaryResponse.text()
        console.error('Failed to fetch attendance summary:', summaryResponse.status, errorText)
        
        // Set default values if API fails
        if (classroom && classroom.student_count) {
          setAttendanceSummary({
            total_students: classroom.student_count,
            present_count: 0,
            absent_count: 0,
            leave_count: 0,
            attendance_percentage: 0
          })
        }
      }
    } catch (err) {
      console.error('Error loading attendance summary:', err)
      
      // Set default values on error
      if (classroom && classroom.student_count) {
        setAttendanceSummary({
          total_students: classroom.student_count,
          present_count: 0,
          absent_count: 0,
          leave_count: 0,
          attendance_percentage: 0
        })
      }
    } finally {
      setLoadingAttendance(false)
    }
  }
  
  // Calculate statistics
  const stats = useMemo(() => {
    if (!classroom) return null
    
    const students = classroom.students || []
    const totalStudents = students.length
    const maleCount = students.filter(s => s.gender === 'male' || s.gender === 'Male').length
    const femaleCount = students.filter(s => s.gender === 'female' || s.gender === 'Female').length
    const occupancyRate = classroom.capacity > 0 ? ((totalStudents / classroom.capacity) * 100).toFixed(1) : '0'
    
    return {
      totalStudents,
      maleCount,
      femaleCount,
      occupancyRate,
      availableSeats: classroom.capacity - totalStudents
    }
  }, [classroom])
  
  // Gender distribution chart data
  const genderChartData = useMemo(() => {
    if (!stats) return []
    return [
      { name: 'Male', value: stats.maleCount, color: '#6096ba' },
      { name: 'Female', value: stats.femaleCount, color: '#f472b6' }
    ].filter(item => item.value > 0)
  }, [stats])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e7ecef] p-2 sm:p-3 md:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-48 sm:h-64">
            <LoadingSpinner message="Loading classroom details..." />
          </div>
        </div>
      </div>
    )
  }

  if (error || !classroom) {
    return (
      <div className="min-h-screen bg-[#e7ecef] p-2 sm:p-3 md:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-48 sm:h-64">
            <div className="text-center px-3 sm:px-4">
              <Layers className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-red-500 mx-auto mb-3 sm:mb-4" />
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 mb-2">Classroom Not Found</h2>
              <p className="text-xs sm:text-sm md:text-base text-gray-600 mb-3 sm:mb-4 px-2">{error || "The requested classroom could not be found."}</p>
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

  return (
    <div className="min-h-screen bg-[#e7ecef] p-1.5 sm:p-3 md:p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-2.5 sm:space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 md:gap-4">
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="bg-white/90 hover:bg-white text-[#274c77] border-white/50 shadow-md hover:shadow-lg transition-all h-9 sm:h-10 md:h-11 px-4 sm:px-5 flex-shrink-0 font-medium"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
            <span className="text-xs sm:text-sm md:text-base">Back</span>
          </Button>
        </div>

        {/* Classroom Header Card */}
        <Card className="bg-white shadow-xl border-2 border-[#a3cef1] overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-[#274c77] to-[#6096ba] text-white rounded-t-lg p-3 sm:p-4 md:p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 md:space-x-4">
              <div className="w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-white rounded-full flex items-center justify-center shadow-lg flex-shrink-0 mx-auto sm:mx-0">
                <Layers className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 text-[#6096ba]" />
              </div>
              <div className="flex-1 min-w-0 w-full text-center sm:text-left">
                <CardTitle className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold mb-1.5 sm:mb-2 break-words px-1">
                  {classroom.grade_name ? `${classroom.grade_name} - ${classroom.section}` : `Grade - ${classroom.section}`}
                </CardTitle>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                  <Badge className="bg-white/20 text-white border-white/30 text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1">
                    <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1 inline flex-shrink-0" />
                    <span className="font-mono">{classroom.code}</span>
                  </Badge>
                  <Badge className="bg-white/20 text-white border-white/30 text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1">
                    <CalendarIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1 inline flex-shrink-0" />
                    <span>{getShiftDisplay(classroom.shift)}</span>
                  </Badge>
                   {classroom.level_name && (
                     <Badge className="bg-white/20 text-white border-white/30 text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1">
                       <GraduationCap className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1 inline flex-shrink-0" />
                       <span className="truncate max-w-[80px] sm:max-w-[120px] md:max-w-none">{classroom.level_name}</span>
                     </Badge>
                   )}
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-2 md:gap-4 mt-2 sm:mt-3 text-blue-100">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs md:text-sm">
                    <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                    <span>{classroom.student_count || 0} Students</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs md:text-sm">
                    <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                    <span>Capacity: {classroom.capacity}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
            <CardContent className="p-2.5 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-blue-600 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 truncate">Total Students</span>
              </div>
              <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-blue-900">{classroom.student_count || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200">
            <CardContent className="p-2.5 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 truncate">Attendance %</span>
              </div>
              <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-green-900">
                {attendanceSummary?.attendance_percentage != null 
                  ? `${attendanceSummary.attendance_percentage.toFixed(1)}%` 
                  : '—'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200">
            <CardContent className="p-2.5 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-purple-600 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 truncate">Occupancy</span>
              </div>
              <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-purple-900">
                {stats ? `${stats.occupancyRate}%` : '—'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-pink-50 to-purple-100 border border-pink-200">
            <CardContent className="p-2.5 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-pink-600 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 truncate">Gender</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-1">
                  <p className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Male</p>
                  <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-blue-600">
                    {stats ? stats.maleCount : '—'}
                  </p>
                </div>
                <div className="w-px h-8 sm:h-10 bg-gray-300"></div>
                <div className="flex-1">
                  <p className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Female</p>
                  <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-pink-600">
                    {stats ? stats.femaleCount : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Information with Tabs */}
        <Card className="bg-white shadow-lg border-2 border-[#a3cef1] overflow-hidden">
          <CardHeader className="bg-[#f8fbff] border-b-2 border-[#a3cef1] p-2.5 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-[#274c77]">Classroom Information</CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6">
            <Tabs defaultValue="overview" className="w-full">
              <div className="overflow-x-auto -mx-2 sm:-mx-3 md:-mx-4 lg:-mx-6 px-2 sm:px-3 md:px-4 lg:px-6 pb-2 mb-2 sm:mb-3 md:mb-4 scrollbar-hide">
                <TabsList className="inline-flex w-full min-w-max h-auto bg-gray-100/50 p-0.5 sm:p-1 rounded-lg grid grid-cols-3 sm:inline-flex sm:w-full sm:min-w-max">
                  <TabsTrigger 
                    value="overview" 
                    className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                    title="Overview"
                  >
                    <Activity className="w-4 h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                    <span className="hidden sm:inline text-[10px] sm:text-xs">Overview</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="students" 
                    className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                    title="Students"
                  >
                    <Users className="w-4 h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                    <span className="hidden sm:inline text-[10px] sm:text-xs">Students</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="attendance" 
                    className="flex flex-col items-center justify-center text-[9px] sm:text-xs md:text-sm px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 whitespace-nowrap min-w-0 sm:min-w-auto flex-1 sm:flex-none"
                    title="Attendance"
                  >
                    <TrendingUp className="w-4 h-4 flex-shrink-0 mb-0.5 sm:mb-0 sm:mr-0 sm:md:mr-1.5" />
                    <span className="hidden sm:inline text-[10px] sm:text-xs">Attendance</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-3 sm:space-y-4 md:space-y-6 mt-2 sm:mt-3 md:mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                  {/* Class Teacher Info */}
                  {classroom.class_teacher_name && (
                    <Card className="bg-white shadow-md border border-gray-200">
                      <CardHeader className="bg-[#f8fbff] border-b border-gray-200 p-3 sm:p-4">
                        <CardTitle className="text-sm sm:text-base md:text-lg font-bold text-[#274c77] flex items-center gap-2">
                          <User className="w-4 h-4 sm:w-5 sm:h-5" />
                          Class Teacher
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                        <div>
                          <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Name</p>
                          <p className="text-sm sm:text-base font-semibold text-gray-800">{classroom.class_teacher_name}</p>
                        </div>
                        {classroom.class_teacher_code && (
                          <div>
                            <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Employee Code</p>
                            <p className="text-sm sm:text-base font-mono text-gray-800">{classroom.class_teacher_code}</p>
                          </div>
                        )}
                        {classroom.class_teacher && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/teachers/profile?id=${classroom.class_teacher}`)}
                            className="w-full mt-2 text-xs sm:text-sm"
                          >
                            <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                            View Teacher Profile
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Gender Distribution Chart */}
                  {genderChartData.length > 0 && (
                    <Card className="bg-white shadow-md border border-gray-200">
                      <CardHeader className="bg-[#f8fbff] border-b border-gray-200 p-3 sm:p-4">
                        <CardTitle className="text-sm sm:text-base md:text-lg font-bold text-[#274c77] flex items-center gap-2">
                          <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                          Gender Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 sm:p-4">
                        <div className="w-full" style={{ minHeight: '200px' }}>
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={genderChartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={(entry: any) => `${entry.name}: ${entry.value}`}
                                outerRadius={70}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {genderChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          {genderChartData.map((item, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                              <span className="text-xs sm:text-sm text-gray-600">{item.name}: {item.value}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

              
              </TabsContent>

              {/* Students Tab */}
              <TabsContent value="students" className="space-y-3 sm:space-y-4 md:space-y-6 mt-2 sm:mt-3 md:mt-4">
                {classroom.students && classroom.students.length > 0 ? (
                  <>
                    {/* Students List */}
                    <Card className="bg-white shadow-md border border-gray-200">
                      <CardHeader className="bg-[#f8fbff] border-b border-gray-200 p-3 sm:p-4">
                        <CardTitle className="text-sm sm:text-base md:text-lg font-bold text-[#274c77] flex items-center gap-2">
                          <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                          All Students ({classroom.students.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 sm:p-4">
                        <div className="overflow-x-auto">
                          <div className="max-h-[500px] sm:max-h-[600px] overflow-y-auto border border-gray-200 rounded-lg hide-scrollbar">
                            <Table>
                              <TableHeader className="sticky top-0 z-10 bg-[#274c77]">
                                <TableRow className="bg-[#274c77] text-white hover:bg-[#274c77] hover:text-white">
                                  <TableHead className="text-white font-semibold text-xs sm:text-sm hover:text-white bg-[#274c77] sticky top-0">GR No</TableHead>
                                  <TableHead className="text-white font-semibold text-xs sm:text-sm hover:text-white bg-[#274c77] sticky top-0">Student Code</TableHead>
                                  <TableHead className="text-white font-semibold text-xs sm:text-sm hover:text-white bg-[#274c77] sticky top-0">Name</TableHead>
                                  <TableHead className="text-white font-semibold text-xs sm:text-sm hover:text-white bg-[#274c77] sticky top-0">Gender</TableHead>
                                  <TableHead className="text-white font-semibold text-xs sm:text-sm hover:text-white bg-[#274c77] sticky top-0">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {classroom.students.map((student) => (
                                  <TableRow key={student.id}>
                                    <TableCell className="text-xs sm:text-sm">{student.gr_no || '—'}</TableCell>
                                    <TableCell className="text-xs sm:text-sm font-mono">{student.student_code || '—'}</TableCell>
                                    <TableCell className="text-xs sm:text-sm font-medium">{student.full_name}</TableCell>
                                    <TableCell className="text-xs sm:text-sm capitalize">{student.gender || '—'}</TableCell>
                                    <TableCell>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => router.push(`/admin/students/profile?id=${student.id}`)}
                                        className="h-7 sm:h-8 text-[10px] sm:text-xs px-2 sm:px-3"
                                      >
                                        <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                                        View
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <Users className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-gray-400" />
                    </div>
                    <p className="text-sm sm:text-base md:text-lg font-semibold text-gray-700 mb-2">No Students Found</p>
                    <p className="text-xs sm:text-sm text-gray-500 text-center max-w-md px-4">
                      This classroom doesn't have any students assigned yet.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Attendance Tab */}
              <TabsContent value="attendance" className="space-y-3 sm:space-y-4 md:space-y-6 mt-2 sm:mt-3 md:mt-4">
                {/* Date Range Selector - Simple */}
                <Card className="bg-white shadow-md border border-gray-200">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-[#274c77]" />
                        <Label className="text-sm sm:text-base font-semibold text-[#274c77]">Date Range</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "w-full sm:w-[250px] justify-start text-left font-normal text-xs sm:text-sm",
                                !dateRange.from && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              {dateRange.from && dateRange.to ? (
                                <>
                                  {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
                                </>
                              ) : (
                                <span>Select range</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                              mode="range"
                              defaultMonth={dateRange.from}
                              selected={dateRange}
                              onSelect={(range) => {
                                if (range?.from && range?.to) {
                                  setDateRange({ from: range.from, to: range.to })
                                } else if (range?.from) {
                                  setDateRange({ from: range.from, to: undefined })
                                }
                              }}
                              numberOfMonths={1}
                              disabled={(date) => date > new Date()}
                            />
                          </PopoverContent>
                        </Popover>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const today = new Date()
                            const sevenDaysAgo = new Date()
                            sevenDaysAgo.setDate(today.getDate() - 7)
                            setDateRange({ from: sevenDaysAgo, to: today })
                          }}
                          className="text-xs sm:text-sm whitespace-nowrap"
                        >
                          Last 7 Days
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {loadingAttendance ? (
                  <div className="flex items-center justify-center py-8 sm:py-12">
                    <LoadingSpinner message="Loading attendance data..." />
                  </div>
                ) : (attendanceSummary || classroom) ? (
                  <>
                    {/* Attendance Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                      <Card className="border border-blue-200 bg-blue-50">
                        <CardContent className="p-2 sm:p-2.5 md:p-3 lg:p-4">
                          <p className="text-[10px] sm:text-xs text-gray-600 mb-1">Total Students</p>
                          <p className="text-lg sm:text-xl md:text-2xl font-bold text-blue-900">
                            {attendanceSummary?.total_students ?? classroom?.student_count ?? 0}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="border border-green-200 bg-green-50">
                        <CardContent className="p-2 sm:p-2.5 md:p-3 lg:p-4">
                          <p className="text-[10px] sm:text-xs text-gray-600 mb-1">Present</p>
                          <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-900">
                            {attendanceSummary?.present_count ?? 0}
                          </p>
                          {attendanceSummary && attendanceSummary.total_students > 0 && attendanceSummary.records_count && attendanceSummary.records_count > 0 && (
                            <p className="text-[10px] sm:text-xs text-green-700 mt-0.5">
                              {((attendanceSummary.present_count / (attendanceSummary.total_students * attendanceSummary.records_count)) * 100).toFixed(1)}% avg
                            </p>
                          )}
                        </CardContent>
                      </Card>
                      <Card className="border border-red-200 bg-red-50">
                        <CardContent className="p-2 sm:p-2.5 md:p-3 lg:p-4">
                          <p className="text-[10px] sm:text-xs text-gray-600 mb-1">Absent</p>
                          <p className="text-lg sm:text-xl md:text-2xl font-bold text-red-900">
                            {attendanceSummary?.absent_count ?? 0}
                          </p>
                          {attendanceSummary && attendanceSummary.total_students > 0 && attendanceSummary.records_count && attendanceSummary.records_count > 0 && (
                            <p className="text-[10px] sm:text-xs text-red-700 mt-0.5">
                              {((attendanceSummary.absent_count / (attendanceSummary.total_students * attendanceSummary.records_count)) * 100).toFixed(1)}% avg
                            </p>
                          )}
                        </CardContent>
                      </Card>
                      <Card className="border border-purple-200 bg-purple-50">
                        <CardContent className="p-2 sm:p-2.5 md:p-3 lg:p-4">
                          <p className="text-[10px] sm:text-xs text-gray-600 mb-1">Attendance %</p>
                          <p className="text-lg sm:text-xl md:text-2xl font-bold text-purple-900">
                            {attendanceSummary?.attendance_percentage != null
                              ? `${attendanceSummary.attendance_percentage.toFixed(1)}%`
                              : '—'}
                          </p>
                          {attendanceSummary && attendanceSummary.leave_count > 0 && (
                            <p className="text-[10px] sm:text-xs text-purple-700 mt-0.5">
                              Leave: {attendanceSummary.leave_count}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Attendance Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                      {/* Pie Chart - Attendance Distribution */}
                      <Card className="bg-white shadow-md border border-gray-200">
                        <CardHeader className="bg-[#f8fbff] border-b border-gray-200 p-3 sm:p-4">
                          <CardTitle className="text-sm sm:text-base md:text-lg font-bold text-[#274c77] flex items-center gap-2">
                            <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                            Attendance Distribution
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-4">
                          <div className="w-full" style={{ minHeight: '250px' }}>
                            <ResponsiveContainer width="100%" height={250}>
                              <PieChart>
                                <Pie
                                  data={[
                                    { name: 'Present', value: attendanceSummary?.present_count ?? 0, color: '#10b981' },
                                    { name: 'Absent', value: attendanceSummary?.absent_count ?? 0, color: '#ef4444' },
                                    { name: 'Leave', value: attendanceSummary?.leave_count ?? 0, color: '#f59e0b' }
                                  ].filter(item => item.value > 0)}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  label={(entry: any) => {
                                    const total = (attendanceSummary?.present_count ?? 0) + 
                                                 (attendanceSummary?.absent_count ?? 0) + 
                                                 (attendanceSummary?.leave_count ?? 0)
                                    if (total === 0) return ''
                                    const percent = ((entry.value / total) * 100).toFixed(1)
                                    return `${entry.name}: ${percent}%`
                                  }}
                                  outerRadius={80}
                                  innerRadius={40}
                                  fill="#8884d8"
                                  dataKey="value"
                                  paddingAngle={2}
                                >
                                  {[
                                    { name: 'Present', value: attendanceSummary?.present_count ?? 0, color: '#10b981' },
                                    { name: 'Absent', value: attendanceSummary?.absent_count ?? 0, color: '#ef4444' },
                                    { name: 'Leave', value: attendanceSummary?.leave_count ?? 0, color: '#f59e0b' }
                                  ].filter(item => item.value > 0).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: any) => [value, 'Count']}
                                  contentStyle={{ 
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    padding: '8px'
                                  }}
                                />
                                <Legend 
                                  verticalAlign="bottom" 
                                  height={36}
                                  formatter={(value) => value}
                                  iconType="circle"
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Legend */}
                          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-200">
                            {[
                              { name: 'Present', value: attendanceSummary?.present_count ?? 0, color: '#10b981' },
                              { name: 'Absent', value: attendanceSummary?.absent_count ?? 0, color: '#ef4444' },
                              { name: 'Leave', value: attendanceSummary?.leave_count ?? 0, color: '#f59e0b' }
                            ].map((item, index) => (
                              <div key={index} className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                                  <span className="text-xs sm:text-sm font-medium text-gray-700">{item.name}</span>
                                </div>
                                <span className="text-xs sm:text-sm font-bold text-gray-900">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Bar Chart - Attendance Comparison */}
                      <Card className="bg-white shadow-md border border-gray-200">
                        <CardHeader className="bg-[#f8fbff] border-b border-gray-200 p-3 sm:p-4">
                          <CardTitle className="text-sm sm:text-base md:text-lg font-bold text-[#274c77] flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
                            Attendance Comparison
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-4">
                          <div className="w-full" style={{ minHeight: '250px' }}>
                            <ResponsiveContainer width="100%" height={250}>
                              <BarChart 
                                data={[
                                  { name: 'Present', value: attendanceSummary?.present_count ?? 0, color: '#10b981' },
                                  { name: 'Absent', value: attendanceSummary?.absent_count ?? 0, color: '#ef4444' },
                                  { name: 'Leave', value: attendanceSummary?.leave_count ?? 0, color: '#f59e0b' }
                                ]}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis 
                                  dataKey="name" 
                                  tick={{ fontSize: 12, fill: '#6b7280' }}
                                  axisLine={{ stroke: '#e5e7eb' }}
                                />
                                <YAxis 
                                  tick={{ fontSize: 12, fill: '#6b7280' }}
                                  axisLine={{ stroke: '#e5e7eb' }}
                                />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    padding: '8px 12px',
                                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                                  }}
                                  formatter={(value: any) => [value, 'Students']}
                                  labelStyle={{ fontWeight: 'bold', color: '#374151' }}
                                />
                                <Bar 
                                  dataKey="value" 
                                  radius={[8, 8, 0, 0]}
                                >
                                  {[
                                    { name: 'Present', value: attendanceSummary?.present_count ?? 0, color: '#10b981' },
                                    { name: 'Absent', value: attendanceSummary?.absent_count ?? 0, color: '#ef4444' },
                                    { name: 'Leave', value: attendanceSummary?.leave_count ?? 0, color: '#f59e0b' }
                                  ].map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                    <Activity className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mb-4" />
                    <p className="text-sm sm:text-base text-gray-600">No attendance data available</p>
                  </div>
                )}
              </TabsContent>

            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

