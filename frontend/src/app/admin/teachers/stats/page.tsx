"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Users, Building2, GraduationCap, TrendingUp } from "lucide-react"
import { useState, useEffect } from "react"
import { getCurrentUserProfile, getClassroomStudents, getTeacherTodayAttendance, getTeacherWeeklyAttendance, getTeacherMonthlyTrend, getAttendanceHistory } from "@/lib/api"
import { getCurrentUserRole } from "@/lib/permissions"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from "recharts"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { BarChart2, UserCheck, Users as UsersIcon, Award, CalendarCheck, BookOpen, UserPlus, FileText, PieChart as PieChartIcon, TrendingUp as TrendingUpIcon, Activity, Clock, Star, History as HistoryIcon } from "lucide-react"

interface TopStudent {
  name: string;
  marks: number;
}

interface RecentActivity {
  text: string;
  color: string;
}

interface ClassInfo {
  name: string;
  section: string;
  totalStudents: number;
  boys: number;
  girls: number;
  attendanceToday: { present: number; absent: number; leave: number };
  topStudents: TopStudent[];
  recentActivity: RecentActivity[];
  attendanceData: Array<{ day: string; present: number; absent: number }>;
  gradeDistribution: Array<{ grade: string; count: number }>;
  monthlyTrend: Array<{ month: string; students: number }>;
}

type AtRiskReason =
  | { type: 'low_attendance'; attendanceRate: number }
  | { type: 'consecutive_absence'; streakLength: number; startedOn?: string; lastAbsentOn?: string };

interface AtRiskStudent {
  id: number | string;
  name: string;
  code?: string;
  reasons: AtRiskReason[];
}

export default function TeacherClassDashboard() {
  const [classInfo, setClassInfo] = useState<ClassInfo>({
    name: "Loading...",
    section: "",
    totalStudents: 0,
    boys: 0,
    girls: 0,
    attendanceToday: { present: 0, absent: 0, leave: 0 },
    topStudents: [],
    recentActivity: [],
    attendanceData: [],
    gradeDistribution: [],
    monthlyTrend: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [absenteesToday, setAbsenteesToday] = useState<Array<{ id: number; name: string; code?: string; gender?: string }>>([])
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([])
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([])

  const formatAlertDate = (value?: string) => {
    if (!value) return ""
    const dateObj = new Date(value)
    if (isNaN(dateObj.getTime())) return value
    return dateObj.toLocaleDateString?.() || value
  }

  useEffect(() => {
    const role = getCurrentUserRole()
    if (role === 'teacher') {
      document.title = "My Class Statistics | IAK SMS";
    } else {
      document.title = "Class Statistics | IAK SMS";
    }
  }, []);

  useEffect(() => {
    async function fetchClassData() {
      try {
        setLoading(true)
        setError("")
        
        const role = getCurrentUserRole()
        if (role === 'teacher') {
          // Get teacher's classroom data
          const teacherProfile = await getCurrentUserProfile() as any
          if (teacherProfile?.assigned_classroom?.id) {
            const classroomId = teacherProfile.assigned_classroom.id
            
            // Fetch all data in parallel for better performance
            const [classroomData, todayAttendance, weeklyAttendance, monthlyTrend, last30DaysHistory] = await Promise.all([
              getClassroomStudents(classroomId, teacherProfile.teacher_id) as any,
              getTeacherTodayAttendance(classroomId),
              getTeacherWeeklyAttendance(classroomId),
              getTeacherMonthlyTrend(classroomId),
              (async () => {
                const end = new Date()
                const start = new Date()
                start.setDate(end.getDate() - 30)
                const s = start.toISOString().split('T')[0]
                const e = end.toISOString().split('T')[0]
                return await getAttendanceHistory(classroomId, s, e)
              })(),
            ])
            
            // Handle different response formats
            let students = []
            if (Array.isArray(classroomData)) {
              // Direct array response from get_class_students API
              students = classroomData
            } else if (classroomData && Array.isArray(classroomData.students)) {
              // Object with students property
              students = classroomData.students
            } else {
              students = []
            }
            
            // Calculate statistics
            const boys = students.filter((s: any) => s.gender === 'male').length
            const girls = students.filter((s: any) => s.gender === 'female').length
            
            // Process today's attendance
            let attendanceToday = { present: 0, absent: 0, leave: 0 }
            if (todayAttendance && typeof todayAttendance === 'object') {
              attendanceToday = {
                present: (todayAttendance as any).present_count || 0,
                absent: (todayAttendance as any).absent_count || 0,
                leave: (todayAttendance as any).leave_count || 0
              }
              try {
                const studentAttendance = (todayAttendance as any).student_attendance || []
                const abs = studentAttendance
                  .filter((r: any) => r.status === 'absent')
                  .map((r: any) => ({ id: r.student_id, name: r.student_name, code: r.student_code, gender: r.student_gender }))
                setAbsenteesToday(abs)
              } catch {}
            }
            
            // Process weekly attendance data
            let attendanceData = []
            
            if (weeklyAttendance && Array.isArray(weeklyAttendance) && weeklyAttendance.length > 0) {
              // Group by day of week
              const dayMap: { [key: string]: { present: number; absent: number } } = {}
              
              weeklyAttendance.forEach((record: any) => {
                const date = new Date(record.date)
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
                
                if (!dayMap[dayName]) {
                  dayMap[dayName] = { present: 0, absent: 0 }
                }
                dayMap[dayName].present += record.present_count || 0
                dayMap[dayName].absent += record.absent_count || 0
              })
              
              // Ensure we have data for all weekdays including Saturday
              const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              attendanceData = weekdays.map(day => ({
                day,
                present: dayMap[day]?.present || 0,
                absent: dayMap[day]?.absent || 0
              }))
            } else {
              // Use today's attendance data for all days if no weekly data
              const todayPresent = attendanceToday.present
              const todayAbsent = attendanceToday.absent
              
              attendanceData = [
                { day: 'Mon', present: todayPresent, absent: todayAbsent },
                { day: 'Tue', present: todayPresent, absent: todayAbsent },
                { day: 'Wed', present: todayPresent, absent: todayAbsent },
                { day: 'Thu', present: todayPresent, absent: todayAbsent },
                { day: 'Fri', present: todayPresent, absent: todayAbsent },
                { day: 'Sat', present: todayPresent, absent: todayAbsent },
              ]
            }
            
            // Process monthly trend data
            let monthlyTrendData = []
            if (monthlyTrend && Array.isArray(monthlyTrend)) {
              // Group by month
              const monthMap: { [key: string]: number } = {}
              
              monthlyTrend.forEach((record: any) => {
                const date = new Date(record.date)
                const monthName = date.toLocaleDateString('en-US', { month: 'short' })
                
                if (!monthMap[monthName]) {
                  monthMap[monthName] = 0
                }
                monthMap[monthName] += record.present_count || 0
              })
              
              monthlyTrendData = Object.entries(monthMap).map(([month, count]) => ({
                month,
                students: count
              }))
            } else {
              // Fallback to mock data
              monthlyTrendData = [
                { month: 'Jan', students: Math.floor(students.length * 0.8) },
                { month: 'Feb', students: Math.floor(students.length * 0.85) },
                { month: 'Mar', students: Math.floor(students.length * 0.9) },
                { month: 'Apr', students: Math.floor(students.length * 0.95) },
                { month: 'May', students: students.length },
              ]
            }
            
            // Mock grade distribution (since we don't have grades API yet)
            const gradeDistribution = [
              { grade: 'A+', count: Math.floor(students.length * 0.15) },
              { grade: 'A', count: Math.floor(students.length * 0.25) },
              { grade: 'B+', count: Math.floor(students.length * 0.30) },
              { grade: 'B', count: Math.floor(students.length * 0.20) },
              { grade: 'C', count: Math.floor(students.length * 0.10) },
            ]
            
            // Compute at-risk students combining low attendance and consecutive absence alerts
            try {
              const buildStudentKey = (record: any) => {
                const base =
                  record.student_id ??
                  record.student_code ??
                  record.student_gr_no ??
                  record.student_name ??
                  Math.random().toString(36).slice(2)
                return String(base)
              }

              const deriveIdValue = (record: any): number | string => {
                if (record.student_id !== undefined && record.student_id !== null) return record.student_id
                if (record.student_code) return record.student_code
                if (record.student_gr_no) return record.student_gr_no
                return record.student_name || "unknown"
              }

              const perStudent: Record<string, { name: string; code?: string; present: number; total: number; history: Array<{ date?: string; status: string }>; idValue: number | string }> = {}
              if (Array.isArray(last30DaysHistory)) {
                last30DaysHistory.forEach((sheet: any) => {
                  const arr = sheet.student_attendance || []
                  const sheetDateRaw = sheet?.date ?? sheet?.attendance_date ?? sheet?.created_at
                  let sheetDate: string | undefined
                  if (typeof sheetDateRaw === 'string') {
                    sheetDate = sheetDateRaw
                  } else if (sheetDateRaw) {
                    try {
                      sheetDate = new Date(sheetDateRaw).toISOString().split('T')[0]
                    } catch {
                      sheetDate = undefined
                    }
                  }

                  arr.forEach((r: any) => {
                    const key = buildStudentKey(r)
                    const studentCode = r.student_code || r.student_id || r.student_gr_no
                    if (!perStudent[key]) {
                      perStudent[key] = {
                        name: r.student_name || String(key),
                        code: studentCode,
                        present: 0,
                        total: 0,
                        history: [],
                        idValue: deriveIdValue(r),
                      }
                    } else if (!perStudent[key].code && studentCode) {
                      perStudent[key].code = studentCode
                    }
                    perStudent[key].total += 1
                    if (r.status === 'present') perStudent[key].present += 1
                    perStudent[key].history.push({ date: sheetDate, status: r.status })
                  })
                })
              }

              const lowAttendanceList = Object.entries(perStudent)
                .map(([key, v]) => ({
                  key,
                  idValue: v.idValue ?? key,
                  name: v.name,
                  code: v.code,
                  attendanceRate: v.total ? Math.round((v.present / v.total) * 100) : 0,
                }))
                .filter(x => x.attendanceRate < 80)

              const riskMap = new Map<string, AtRiskStudent>()

              const ensureRiskEntry = (key: string, idValue: number | string, name: string, code?: string) => {
                if (!riskMap.has(key)) {
                  riskMap.set(key, { id: idValue, name, code, reasons: [] })
                }
                const entry = riskMap.get(key)!
                if (code && !entry.code) entry.code = code
                return entry
              }

              lowAttendanceList.forEach((student) => {
                const entry = ensureRiskEntry(String(student.key), student.idValue, student.name, student.code)
                entry.reasons.push({ type: 'low_attendance', attendanceRate: student.attendanceRate })
              })

              const consecutiveAbsenceList = Object.entries(perStudent)
                .map(([key, info]) => {
                  const sortedHistory = [...info.history].filter((record) => record.status && record.date).sort((a, b) => {
                    if (!a.date || !b.date) return 0
                    return new Date(b.date).getTime() - new Date(a.date).getTime()
                  })
                  let streak = 0
                  let lastAbsentOn: string | undefined
                  let streakStart: string | undefined
                  let previousDate: Date | undefined

                  for (const record of sortedHistory) {
                    if (!record.date) break
                    const current = new Date(record.date)
                    if (isNaN(current.getTime())) break

                    if (record.status === 'absent') {
                      if (!previousDate) {
                        streak = 1
                        lastAbsentOn = record.date
                        streakStart = record.date
                        previousDate = current
                        continue
                      }

                      const diffDays = Math.round((previousDate.getTime() - current.getTime()) / 86400000)
                      if (diffDays !== 1) {
                        break
                      }
                      streak += 1
                      previousDate = current
                      streakStart = record.date || streakStart
                    } else if (record.status === 'leave') {
                      streak = 0
                      break
                    } else {
                      break
                    }
                  }

                  return {
                    key,
                    idValue: info.idValue ?? key,
                    name: info.name,
                    code: info.code,
                    streakLength: streak,
                    startedOn: streak >= 1 ? streakStart : undefined,
                    lastAbsentOn: streak >= 1 ? lastAbsentOn : undefined,
                  }
                })
                .filter((item) => item.streakLength >= 3)

              consecutiveAbsenceList.forEach((student) => {
                const entry = ensureRiskEntry(String(student.key), student.idValue, student.name, student.code)
                entry.reasons.push({
                  type: 'consecutive_absence',
                  streakLength: student.streakLength,
                  startedOn: student.startedOn,
                  lastAbsentOn: student.lastAbsentOn,
                })
              })


              const getMaxStreak = (student: AtRiskStudent) =>
                student.reasons.reduce((max, reason) => {
                  if (reason.type === 'consecutive_absence') {
                    return Math.max(max, reason.streakLength)
                  }
                  return max
                }, 0)

              const getAttendanceRate = (student: AtRiskStudent) => {
                const attendanceReason = student.reasons.find((reason) => reason.type === 'low_attendance') as
                  | { type: 'low_attendance'; attendanceRate: number }
                  | undefined
                return attendanceReason ? attendanceReason.attendanceRate : 101
              }

              const riskList = Array.from(riskMap.values())
                .sort((a, b) => {
                  const streakDiff = getMaxStreak(b) - getMaxStreak(a)
                  if (streakDiff !== 0) return streakDiff
                  return getAttendanceRate(a) - getAttendanceRate(b)
                })
                .slice(0, 8)

              setAtRisk(riskList)
            } catch {}

            // Recent submissions (last 6 records)
            try {
              const recent = Array.isArray(last30DaysHistory) ? last30DaysHistory.slice(0, 6) : []
              setRecentSubmissions(recent)
            } catch {}

            const finalClassInfo = {
              name: teacherProfile.assigned_classroom.name || "Unknown Class",
              section: teacherProfile.assigned_classroom.section || "",
              totalStudents: students.length,
              boys: boys,
              girls: girls,
              attendanceToday,
              topStudents: students.slice(0, 3).map((s: any, i: number) => ({
                name: s.name,
                marks: 95 - (i * 2) // Mock marks for now
              })),
              recentActivity: [
                { text: `Class ${teacherProfile.assigned_classroom.name} loaded`, color: "bg-green-500" },
                { text: `${students.length} students in class`, color: "bg-blue-500" },
                { text: `Today's attendance: ${attendanceToday.present}/${students.length}`, color: "bg-purple-500" },
              ],
              attendanceData,
              gradeDistribution,
              monthlyTrend: monthlyTrendData,
            }
            
            setClassInfo(finalClassInfo)
          } else {
            setError("No classroom assigned to you. Please contact administrator.")
          }
        } else {
          // For non-teachers, show placeholder data
          setClassInfo({
            name: "All Classes",
            section: "Overview",
            totalStudents: 0,
            boys: 0,
            girls: 0,
            attendanceToday: { present: 0, absent: 0, leave: 0 },
            topStudents: [],
    recentActivity: [
              { text: "Class statistics overview", color: "bg-blue-500" },
            ],
            attendanceData: [],
            gradeDistribution: [],
            monthlyTrend: [],
          })
        }
      } catch (err: any) {
        console.error('Error fetching class data:', err)
        setError("Failed to load class data. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    fetchClassData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-extrabold text-[#274c77] mb-2 tracking-wide">Class Dashboard</h2>
          <p className="text-gray-600 text-lg">Loading your class data...</p>
        </div>
        <LoadingSpinner message="Loading class statistics..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-extrabold text-[#274c77] mb-2 tracking-wide">Class Dashboard</h2>
          <p className="text-red-600 text-lg">{error}</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Unable to load class data</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-[#6096ba] text-white rounded-lg hover:bg-[#274c77] transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-[#274c77] mb-2 tracking-wide">Class Dashboard</h2>
        <p className="text-gray-600 text-lg">Welcome! Here is an overview of your class <span className="font-bold text-[#6096ba]">{classInfo.name}</span></p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 bg-gradient-to-br from-[#e7ecef] to-[#a3cef1]/30 hover:scale-105">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Students</CardTitle>
            <div className="p-2 rounded-full bg-[#6096ba]/10">
            <UsersIcon className="h-5 w-5 text-[#6096ba]" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#274c77] mb-1">{classInfo.totalStudents}</div>
            <p className="text-xs text-gray-500">Active students</p>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 bg-gradient-to-br from-blue-50 to-blue-100/50 hover:scale-105">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Boys</CardTitle>
            <div className="p-2 rounded-full bg-blue-100">
              <UserCheck className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700 mb-1">{classInfo.boys}</div>
            <p className="text-xs text-blue-600">
              {classInfo.totalStudents > 0 ? Math.round((classInfo.boys / classInfo.totalStudents) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 bg-gradient-to-br from-pink-50 to-pink-100/50 hover:scale-105">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Girls</CardTitle>
            <div className="p-2 rounded-full bg-pink-100">
              <UserCheck className="h-5 w-5 text-pink-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-pink-700 mb-1">{classInfo.girls}</div>
            <p className="text-xs text-pink-600">
              {classInfo.totalStudents > 0 ? Math.round((classInfo.girls / classInfo.totalStudents) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 bg-gradient-to-br from-green-50 to-green-100/50 hover:scale-105">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Attendance Today</CardTitle>
            <div className="p-2 rounded-full bg-green-100">
              <CalendarCheck className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 text-lg font-bold mb-1">
              <span className="text-green-600">P: {classInfo.attendanceToday.present}</span>
              <span className="text-red-500">A: {classInfo.attendanceToday.absent}</span>
            </div>
            <p className="text-xs text-green-600">
              {classInfo.totalStudents > 0 ? Math.round((classInfo.attendanceToday.present / classInfo.totalStudents) * 100) : 0}% present
            </p>
          </CardContent>
        </Card>
      </div>
      {/* Absentees Today and At-Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-2 bg-white">
          <CardHeader>
            <CardTitle className="text-[#274c77] flex items-center gap-2">
              <Users className="h-5 w-5 text-[#ef4444]" />
              Absentees Today
            </CardTitle>
            <CardDescription>Students absent today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-60 overflow-y-auto pr-1">
              {absenteesToday.length === 0 ? (
                <div className="text-sm text-gray-500">No absentees today. 🎉</div>
              ) : (
                <div className="space-y-2">
                  {absenteesToday.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg border border-gray-200">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        <p className="text-xs text-gray-500 truncate">{s.code}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">Absent</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 bg-white">
          <CardHeader>
            <CardTitle className="text-[#274c77] flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#f59e0b]" />
              At-Risk (30 days)
            </CardTitle>
            <CardDescription>Attendance rate below 80%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-60 overflow-y-auto pr-1">
              {atRisk.length === 0 ? (
                <div className="text-sm text-gray-500">No at-risk students in last 30 days.</div>
              ) : (
                <div className="space-y-2">
                  {atRisk.map((student) => (
                    <div key={student.id} className="flex items-start justify-between gap-3 p-2 rounded-lg border border-gray-200">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{student.name}</p>
                        {student.code && <p className="text-xs text-gray-500 truncate">{student.code}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {student.reasons.map((reason, idx) => {
                          if (reason.type === 'low_attendance') {
                            return (
                              <span
                                key={`low-${student.id}-${idx}`}
                                className="text-xs px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200"
                              >
                                {reason.attendanceRate}% / 30d
                              </span>
                            )
                          }
                          const streakText = `${reason.streakLength} day streak`
                          const lastAbsentText = reason.lastAbsentOn ? ` • Last: ${formatAlertDate(reason.lastAbsentOn)}` : ""
                          return (
                            <span
                              key={`streak-${student.id}-${idx}`}
                              className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-right"
                            >
                              {streakText}
                              {lastAbsentText}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 bg-white">
        <CardHeader>
          <CardTitle className="text-[#274c77] flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-[#6096ba]" />
            Recent Attendance
          </CardTitle>
          <CardDescription>Latest attendance sheets and status</CardDescription>
        </CardHeader>
        <CardContent>
          {Array.isArray(recentSubmissions) && recentSubmissions.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto pr-1">
              {recentSubmissions.map((r, idx) => {
                const dateObj = new Date(r.date)
                const dateStr = isNaN(dateObj.getTime()) ? String(r.date) : dateObj.toISOString().split('T')[0]
                return (
                <Link key={idx} href={`/admin/teachers/attendance?date=${encodeURIComponent(dateStr)}`} className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{dateObj.toLocaleDateString?.() || String(r.date)}</p>
                    <span className={`shrink-0 text-xs px-2 py-1 rounded-full border ${r.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : r.status === 'submitted' ? 'bg-blue-50 text-blue-700 border-blue-200' : r.status === 'under_review' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>{r.display_status || (r.status || 'draft').replace('_',' ')}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-600 grid grid-cols-2 gap-2">
                    <span className="truncate">Present: {r.present_count || 0}</span>
                    <span className="truncate">Absent: {r.absent_count || 0}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[#274c77]">
                    Attendance: {(() => {
                      const p = Number(r.present_count || 0)
                      const a = Number(r.absent_count || 0)
                      const l = Number(r.leave_count || 0)
                      const total = Number(r.total_students || 0) || (p + a + l)
                      if (!total) return 0
                      return Math.round((p / total) * 100)
                    })()}%
                  </div>
                </Link>
              )})}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No recent sheets found.</div>
          )}
        </CardContent>
      </Card>
      </div>


      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* Attendance Chart - New UI */}
        <Card className="border-2 bg-gradient-to-br from-[#e7ecef] to-[#a3cef1]/20">
          <CardHeader>
            <CardTitle className="text-[#274c77] flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-[#6096ba]" />
              Weekly Attendance Overview
            </CardTitle>
            <CardDescription>Daily attendance pattern for this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={classInfo.attendanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#a3cef1" opacity={0.3} />
                  <XAxis 
                    dataKey="day" 
                    stroke="#274c77" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#274c77" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 40]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '2px solid #6096ba',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }} 
                    labelStyle={{ color: '#274c77', fontWeight: 'bold' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="present" 
                    stroke="#6096ba" 
                    strokeWidth={4}
                    dot={{ fill: '#6096ba', strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, stroke: '#6096ba', strokeWidth: 2 }}
                    name="Present Students"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="absent" 
                    stroke="#ef4444" 
                    strokeWidth={4}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, stroke: '#ef4444', strokeWidth: 2 }}
                    name="Absent Students"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#6096ba]"></div>
                <span className="text-sm text-gray-600">Present</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
                <span className="text-sm text-gray-600">Absent</span>
              </div>
              </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
