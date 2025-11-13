"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import StudentBehaviourModal from "@/components/behaviour/student-behaviour-modal"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { getStudentById, apiGet, createBehaviourRecord, getStudentBehaviourRecords, getStudentMonthlyBehaviourLatest } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { 
  ArrowLeft, User, GraduationCap, Users, Calendar, MapPin, Award,
  TrendingUp, Star, CheckCircle, AlertCircle, Plus
} from "lucide-react"
import { getCurrentUserRole } from '@/lib/permissions'
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  LabelList,
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  AreaChart,
  Area,
  RadarChart, 
  Radar,
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis
} from 'recharts'
import { LoadingSpinner } from "@/components/ui/loading-spinner"

const themeColors = {
  primary: '#013a63',      //
  secondary: '#3b82f6',    //
  accent: '#60a5fa',       // 
  success: '#10b981',      // 
  warning: '#f59e0b',      // 
  error: '#ef4444',        //
  info: '#adb5bd',         // 
  skyblue: '#61a5c2',      // 
  pink: '#ec4899',         // 
  gray: '#6b7280',         //
  dark: '#1f2937',         //
  light: '#8da9c4'         //
}

// Helper functions for data generation
const generatePerformanceData = (student: any, results: any[]) => {
  if (!results || results.length === 0) {
    return [
      { subject: 'Urdu', grade: 85, total: 100, color: themeColors.primary },
      { subject: 'English', grade: 92, total: 100, color: themeColors.secondary },
      { subject: 'Mathematics', grade: 78, total: 100, color: themeColors.success },
      { subject: 'Science', grade: 88, total: 100, color: themeColors.warning },
      { subject: 'Islamiat', grade: 95, total: 100, color: themeColors.skyblue },
      { subject: 'Computer Science', grade: 90, total: 100, color: themeColors.info },
    ]
  }

  const latestResult = results[0]
  const subjectMarks = latestResult.subject_marks || []
  
  return subjectMarks.map((mark: any) => ({
    subject: mark.subject_name.charAt(0).toUpperCase() + mark.subject_name.slice(1).replace('_', ' '),
    grade: Math.round(mark.obtained_marks || 0),
    total: Math.round(mark.total_marks || 100),
    color: themeColors.primary
  }))
}

const generateAttendanceData = (attendanceRecords: any[]) => {
  if (!attendanceRecords || attendanceRecords.length === 0) {
    return [
      { month: 'Jan', present: 22, absent: 3, total: 25, percentage: 88 },
      { month: 'Feb', present: 20, absent: 2, total: 22, percentage: 91 },
      { month: 'Mar', present: 24, absent: 1, total: 25, percentage: 96 },
      { month: 'Apr', present: 23, absent: 2, total: 25, percentage: 92 },
      { month: 'May', present: 21, absent: 4, total: 25, percentage: 84 },
      { month: 'Jun', present: 24, absent: 1, total: 25, percentage: 96 },
    ]
  }

  const monthlyData: { [key: string]: { present: number, absent: number, total: number } } = {}
  
  attendanceRecords.forEach(record => {
    const month = new Date(record.attendance?.date || record.date).toLocaleDateString('en-US', { month: 'short' })
    if (!monthlyData[month]) {
      monthlyData[month] = { present: 0, absent: 0, total: 0 }
    }
    
    if (record.status === 'present') {
      monthlyData[month].present++
    } else if (record.status === 'absent') {
      monthlyData[month].absent++
    }
    monthlyData[month].total++
  })

  return Object.entries(monthlyData).map(([month, data]) => ({
    month,
    present: data.present,
    absent: data.absent,
    total: data.total,
    percentage: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0
  }))
}



function StudentProfileContent() {
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)
  const [student, setStudent] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weeklyAttendance, setWeeklyAttendance] = useState<Array<{ key: string, start: string, end: string, label: string, present: number, absent: number, late: number, excused: number, total: number }>>([])
  const [attendanceRaw, setAttendanceRaw] = useState<any[]>([])
  const [donutRange, setDonutRange] = useState<number>(7)
  const [behaviourOpen, setBehaviourOpen] = useState<boolean>(false)
  const [behaviourRecords, setBehaviourRecords] = useState<any[]>([])
  const [behaviourRange, setBehaviourRange] = useState<'latest' | 7 | 15 | 30>('latest')
  const [behaviourDelta, setBehaviourDelta] = useState<number | null>(null)
  const [monthlyMode, setMonthlyMode] = useState<boolean>(false)
  const [monthlyRecord, setMonthlyRecord] = useState<any | null>(null)
  
  const router = useRouter()
  const params = useSearchParams()
  const studentId = params?.get("id") || ""
  const userRole = getCurrentUserRole()
  
  // Early return for missing studentId
  if (!studentId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Student Not Found</h2>
            <p className="text-gray-600 mb-6">No student ID provided</p>
            <Button onClick={() => router.back()} className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !studentId) return

    const fetchStudentData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const studentData = await getStudentById(studentId)
        if (studentData) {
          setStudent(studentData)
        } else {
          setError('Student not found')
        }
      } catch (err) {
        console.error('Error fetching student:', err)
        setError('Failed to load student data')
      } finally {
      setLoading(false)
    }
    }

    fetchStudentData()
  }, [mounted, studentId])

  // Load behaviour records from API
  useEffect(() => {
    if (!studentId) return
    const load = async () => {
      try {
        const list = await getStudentBehaviourRecords(studentId)
        setBehaviourRecords(Array.isArray(list) ? list : [])
        // Detect if current month has no weekly records
        const now = new Date()
        const curMonth = now.getMonth()
        const hasCurrent = (Array.isArray(list) ? list : []).some((r: any) => {
          const d = new Date(r.week_end || r.weekEnd || r.created_at)
          return d.getMonth() === curMonth && d.getFullYear() === now.getFullYear()
        })
        if (!hasCurrent) {
          setMonthlyMode(true)
          try {
            const m = await getStudentMonthlyBehaviourLatest(studentId)
            setMonthlyRecord(m)
          } catch {
            setMonthlyRecord(null)
          }
        } else {
          setMonthlyMode(false)
          setMonthlyRecord(null)
        }
      } catch (e) {
        setBehaviourRecords([])
      }
    }
    load()
  }, [studentId])

  // Helpers for behaviour metrics → percent
  function scoreToPercent(key: string, score: number, eventsLen: number): number {
    const base: Record<number, number> = { 1: 25, 2: 50, 3: 75, 4: 100 }
    if (key === 'participation') {
      if (eventsLen > 0) return 100
      if (score === 4) return 90
    }
    return base[score] || 0
  }

  function computeLatestMetrics(records: any[]) {
    if (!records || records.length === 0) return null
    // latest by week_start
    const latest = records.reduce((acc, cur) => {
      const d1 = new Date(acc.week_start || acc.weekStart || acc.created_at)
      const d2 = new Date(cur.week_start || cur.weekStart || cur.created_at)
      return d2 > d1 ? cur : acc
    }, records[0])
    const m = latest?.metrics || {}
    const evsLen = Array.isArray(latest?.events) ? latest.events.length : 0
    const items = [
      { label: 'Punctuality', key: 'punctuality', value: scoreToPercent('punctuality', m.punctuality || 0, evsLen) },
      { label: 'Obedience', key: 'obedience', value: scoreToPercent('obedience', m.obedience || 0, evsLen) },
      { label: 'Class Behaviour', key: 'classBehaviour', value: scoreToPercent('classBehaviour', m.classBehaviour || 0, evsLen) },
      { label: 'Event Participation', key: 'participation', value: scoreToPercent('participation', m.participation || 0, evsLen) },
      { label: 'Homework', key: 'homework', value: scoreToPercent('homework', m.homework || 0, evsLen) },
      { label: 'Respect', key: 'respect', value: scoreToPercent('respect', m.respect || 0, evsLen) },
    ]
    return { items }
  }

  function computeWindowMetrics(records: any[], days: number) {
    if (!records || records.length === 0) return null
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - (days - 1))
    const end = today
    const inRange = records.filter(r => {
      const we = new Date(r.week_end || r.weekEnd || r.created_at)
      return we >= start && we <= end
    })
    if (inRange.length === 0) return null
    const sums: Record<string, number> = { punctuality: 0, obedience: 0, classBehaviour: 0, participation: 0, homework: 0, respect: 0 }
    inRange.forEach(r => {
      const m = r.metrics || {}
      const evsLen = Array.isArray(r.events) ? r.events.length : 0
      sums.punctuality += scoreToPercent('punctuality', m.punctuality || 0, evsLen)
      sums.obedience += scoreToPercent('obedience', m.obedience || 0, evsLen)
      sums.classBehaviour += scoreToPercent('classBehaviour', m.classBehaviour || 0, evsLen)
      sums.participation += scoreToPercent('participation', m.participation || 0, evsLen)
      sums.homework += scoreToPercent('homework', m.homework || 0, evsLen)
      sums.respect += scoreToPercent('respect', m.respect || 0, evsLen)
    })
    const count = inRange.length
    const items = [
      { label: 'Punctuality', key: 'punctuality', value: Math.round(sums.punctuality / count) },
      { label: 'Obedience', key: 'obedience', value: Math.round(sums.obedience / count) },
      { label: 'Class Behaviour', key: 'classBehaviour', value: Math.round(sums.classBehaviour / count) },
      { label: 'Event Participation', key: 'participation', value: Math.round(sums.participation / count) },
      { label: 'Homework', key: 'homework', value: Math.round(sums.homework / count) },
      { label: 'Respect', key: 'respect', value: Math.round(sums.respect / count) },
    ]

    // previous window delta (overall)
    const prevEnd = new Date(start)
    prevEnd.setDate(start.getDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevEnd.getDate() - (days - 1))
    const prevRange = records.filter(r => {
      const we = new Date(r.week_end || r.weekEnd || r.created_at)
      return we >= prevStart && we <= prevEnd
    })
    if (prevRange.length > 0) {
      const sumsPrev: Record<string, number> = { punctuality: 0, obedience: 0, classBehaviour: 0, participation: 0, homework: 0, respect: 0 }
      prevRange.forEach(r => {
        const m = r.metrics || {}
        const evsLen = Array.isArray(r.events) ? r.events.length : 0
        sumsPrev.punctuality += scoreToPercent('punctuality', m.punctuality || 0, evsLen)
        sumsPrev.obedience += scoreToPercent('obedience', m.obedience || 0, evsLen)
        sumsPrev.classBehaviour += scoreToPercent('classBehaviour', m.classBehaviour || 0, evsLen)
        sumsPrev.participation += scoreToPercent('participation', m.participation || 0, evsLen)
        sumsPrev.homework += scoreToPercent('homework', m.homework || 0, evsLen)
        sumsPrev.respect += scoreToPercent('respect', m.respect || 0, evsLen)
      })
      const cAvg = items.reduce((s, it) => s + it.value, 0) / items.length
      const pAvg = (sumsPrev.punctuality + sumsPrev.obedience + sumsPrev.classBehaviour + sumsPrev.participation + sumsPrev.homework + sumsPrev.respect) / (prevRange.length * 6)
      setBehaviourDelta(Math.round(cAvg - pAvg))
    } else {
      setBehaviourDelta(null)
    }

    return { items }
  }

  const behaviourComputed = useMemo(() => {
    if (monthlyMode && monthlyRecord && monthlyRecord.metrics) {
      const m = monthlyRecord.metrics
      const items = [
        { label: 'Punctuality', key: 'punctuality', value: Math.round(m.punctuality || 0) },
        { label: 'Obedience', key: 'obedience', value: Math.round(m.obedience || 0) },
        { label: 'Class Behaviour', key: 'classBehaviour', value: Math.round(m.classBehaviour || 0) },
        { label: 'Event Participation', key: 'participation', value: Math.round(m.participation || 0) },
        { label: 'Homework', key: 'homework', value: Math.round(m.homework || 0) },
        { label: 'Respect', key: 'respect', value: Math.round(m.respect || 0) },
      ]
      return { items }
    }
    if (behaviourRange === 'latest') return computeLatestMetrics(behaviourRecords)
    return computeWindowMetrics(behaviourRecords, behaviourRange)
  }, [behaviourRange, behaviourRecords, monthlyMode, monthlyRecord])

  const behaviourImprovements = useMemo((): Array<{ key: string; label: string; value: number; severity: 'critical' | 'warning'; message: string }> => {
    const out: Array<{ key: string; label: string; value: number; severity: 'critical' | 'warning'; message: string }> = []
    if (!behaviourComputed || !behaviourComputed.items) return out
    behaviourComputed.items.forEach((it: any) => {
      if (it.value <= 50) {
        const severity: 'critical' | 'warning' = it.value <= 25 ? 'critical' : 'warning'
        const baseMsg = it.value <= 25
          ? `${it.label} is critically low (${it.value}%). Immediate attention required.`
          : `${it.label} needs improvement (${it.value}%).`;
        const guidance = it.label === 'Punctuality'
          ? 'Ensure on-time arrival and consistency each day.'
          : it.label === 'Class Behaviour'
            ? 'Focus on respectful conduct and active engagement in class.'
            : it.label === 'Event Participation'
              ? 'Consider taking part in co‑curricular events to build confidence.'
              : 'Set clear goals and review progress weekly.'
        out.push({ key: it.key, label: it.label, value: it.value, severity, message: `${baseMsg} ${guidance}` })
      }
    })
    return out
  }, [behaviourComputed])

  const [selectedImprovement, setSelectedImprovement] = useState<string | null>(null)

  const selectedImp = useMemo(() => {
    if (!selectedImprovement) return null
    const list: any[] = (behaviourImprovements as any) as any[]
    return list.find((x: any) => x.key === selectedImprovement) || null
  }, [selectedImprovement, behaviourImprovements])

  // Fetch student attendance (real data) - weekly aggregated
  useEffect(() => {
    const fetchAttendance = async () => {
      if (!student) return
      try {
        const today = new Date()
        const start = new Date(today)
        start.setDate(today.getDate() - 7 * 12) // last 12 weeks
        const startStr = start.toISOString().slice(0, 10)
        const endStr = today.toISOString().slice(0, 10)
        const path = `/api/attendance/student/${student.id}/?start_date=${startStr}&end_date=${endStr}`
        const records: any[] = await apiGet(path)
        setAttendanceRaw(records)
        const getWeekStart = (d: Date) => {
          const date = new Date(d)
          const day = date.getDay() === 0 ? 7 : date.getDay() // Monday=1..Sunday=7
          const diff = date.getDate() - day + 1
          const s = new Date(date.getFullYear(), date.getMonth(), diff)
          s.setHours(0, 0, 0, 0)
          return s
        }
        const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c }

        const map: Record<string, { start: Date, end: Date, present: number, absent: number, late: number, excused: number, total: number }> = {}
        for (const r of records) {
          const rawDateStr: string = (r as any)?.attendance_date || (r as any)?.date || (r as any)?.attendance?.date || (r as any)?.created_at
          const dt = new Date(rawDateStr)
          const ws = getWeekStart(dt)
          const key = ws.toISOString().slice(0, 10)
          if (!map[key]) map[key] = { start: ws, end: addDays(ws, 6), present: 0, absent: 0, late: 0, excused: 0, total: 0 }
          const status = String(r.status || '').toLowerCase()
          if (status === 'present') map[key].present++
          else if (status === 'absent') map[key].absent++
          else if (status === 'late') map[key].late++
          else map[key].excused++
          map[key].total++
        }
        const keys = Object.keys(map).sort()
        const items = keys.map(k => {
          const it = map[k]
          const label = it.start.toLocaleString('en-US', { month: 'short', day: '2-digit' })
          return { key: k, start: it.start.toISOString().slice(0, 10), end: it.end.toISOString().slice(0, 10), label, present: it.present, absent: it.absent, late: it.late, excused: it.excused, total: it.total }
        })
        setWeeklyAttendance(items)
      } catch (e) {
        // fail silently; keep placeholder
      }
    }
    fetchAttendance()
  }, [student])

  // Attendance percentage rule and donut computations placed before any early returns
  const calculateAttendancePct = (present: number, absent: number, late: number, excused: number) => {
    const denom = present + absent
    if (!denom) return 0
    return Math.round((present / denom) * 100)
  }

  const { cwPresent, cwAbsent, cwLate, cwExcused, cwDenom, cwPct, cwSundays, cwStartLabel, cwEndLabel, donutData } = useMemo(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - (donutRange - 1))

    // Build working days (exclude Sundays) and count Sundays
    let sundays = 0
    const workingDays: string[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) sundays++
      else workingDays.push(new Date(d).toISOString().slice(0, 10))
    }

    // Map statuses by day (per selected range) — precedence: present > absent > leave > none
    const dayToStatus: Record<string, 'present' | 'absent' | 'leave' | 'none'> = {}
    attendanceRaw.forEach(r => {
      const rawDateStr: string = (r as any)?.attendance_date || (r as any)?.date || (r as any)?.attendance?.date || (r as any)?.created_at
      const dt = new Date(rawDateStr)
      if (dt < start || dt > end) return
      if (dt.getDay() === 0) return
      const key = dt.toISOString().slice(0, 10)
      const status = String(r.status || '').toLowerCase()
      if (status === 'present' || status === 'late') {
        dayToStatus[key] = 'present'
      } else if (status === 'absent') {
        if (dayToStatus[key] !== 'present') dayToStatus[key] = 'absent'
      } else if (status === 'leave') {
        if (!dayToStatus[key]) dayToStatus[key] = 'leave'
      }
    })

    let p = 0, a = 0, nr = 0, l = 0
    for (const key of workingDays) {
      const st = dayToStatus[key] || 'none'
      if (st === 'present') p++
      else if (st === 'absent') a++
      else if (st === 'leave') l++
      else nr++
    }
    // New rule: denominator is fixed by selected range working days excluding leaves
    const denom = Math.max(workingDays.length - l, 0)
    const pct = denom ? Math.round((p / denom) * 100) : 0
    const startLabel = start.toLocaleString('en-US', { month: 'short', day: '2-digit' })
    const endLabel = end.toLocaleString('en-US', { month: 'short', day: '2-digit' })
    return {
      cwPresent: p,
      cwAbsent: a,
      cwNoRecord: nr,
      cwLate: 0,
      cwExcused: l,
      cwDenom: denom,
      cwPct: pct,
      cwSundays: sundays,
      donutData: [
        { name: 'Present', value: p },
        { name: 'Absent', value: a },
        { name: 'No Record', value: nr },
        { name: 'Sundays', value: sundays }
      ],
      cwStartLabel: startLabel,
      cwEndLabel: endLabel
    }
  }, [attendanceRaw, donutRange])

  const sparkData = useMemo(() => weeklyAttendance.slice(-8).map(w => ({
    label: w.label,
    percent: calculateAttendancePct(w.present, w.absent, w.late, w.excused)
  })), [weeklyAttendance])

  if (!mounted) {
    return <LoadingSpinner />
  }

  if (loading) {
    return <LoadingSpinner />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => router.back()} className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
              </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Student Not Found</h2>
            <p className="text-gray-600 mb-6">The requested student could not be found</p>
            <Button onClick={() => router.back()} className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Generate data for charts
  const performanceData = generatePerformanceData(student, [])
  const attendanceData = weeklyAttendance.length > 0
    ? weeklyAttendance.map(w => ({ ...w, percentage: w.total ? Math.round((w.present / w.total) * 100) : 0 }))
    : generateAttendanceData([])

  // Tooltip for attendance chart
  const AttendanceTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const present = payload.find((p: any) => p.dataKey === 'present')?.value || 0
      const absent = payload.find((p: any) => p.dataKey === 'absent')?.value || 0
      const total = present + absent
      const pct = total ? Math.round((present / total) * 100) : 0
      return (
        <div className="rounded-lg border bg-white/95 shadow p-3 text-sm">
          <div className="font-semibold mb-1">{label}</div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Present: {present}</span>
            <span className="inline-flex items-center gap-1 text-rose-600"><span className="w-2 h-2 rounded-full bg-rose-500"></span>Absent: {absent}</span>
            <span className="text-slate-600 ml-2">{pct}%</span>
          </div>
        </div>
      )
    }
    return null
  }
  // Tooltip for Donut
  const DonutTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0]
      const name = item?.name || ''
      const value = item?.value || 0
      const total = donutData?.reduce((s, d) => s + (d?.value || 0), 0) || 0
      const pct = total ? Math.round((value / total) * 100) : 0
      const color = name === 'Present' ? '#22c55e' : (name === 'Absent' ? '#ef4444' : (name === 'No Record' ? '#cbd5e1' : '#1d4ed8'))
      return (
        <div className="rounded-lg border bg-white/95 shadow p-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-medium text-slate-700">{name === 'Sundays' ? 'Sunday (Holiday)' : name}</span>
            <span className="ml-2 text-slate-600">{value} ({pct}%)</span>
          </div>
        </div>
      )
    }
    return null
  }

  // Calculate metrics
  const overallScore = Math.round(performanceData.reduce((sum: number, item: any) => sum + item.grade, 0) / performanceData.length) || 0
  const attendanceRate = Math.round(attendanceData.reduce((sum: number, item: any) => sum + item.percentage, 0) / attendanceData.length) || 0
  const detailsCompleteness = student ? (() => {
    const classTeacher = (student as any)?.classroom?.class_teacher?.full_name
      || (student as any)?.class_teacher?.full_name
      || (student as any)?.classroom?.class_teacher_name
      || (student as any)?.class_teacher_name
      || ''

    const campusName = (student as any)?.campus_name || (student as any)?.campus?.campus_name || ''

    const values = [
      // Personal
      (student as any)?.name,
      (student as any)?.gender,
      (student as any)?.dob,
      (student as any)?.religion,
      (student as any)?.mother_tongue,
      (student as any)?.place_of_birth,
      (student as any)?.zakat_status,
      // Academic
      (student as any)?.student_id,
      (student as any)?.current_grade,
      (student as any)?.section,
      classTeacher,
      campusName,
      (student as any)?.shift,
      (student as any)?.enrollment_year,
      (student as any)?.gr_no,
      // Contact
      (student as any)?.father_name,
      (student as any)?.father_contact,
      (student as any)?.father_cnic,
      (student as any)?.father_profession,
      (student as any)?.mother_name,
      (student as any)?.mother_contact,
      (student as any)?.mother_status,
      (student as any)?.address,
    ]

    const filled = values.filter(v => v !== null && v !== undefined && String(v).toString().trim() !== '')
    return Math.round((filled.length / values.length) * 100)
  })() : 0

  const getPerformanceStatus = (score: number) => {
    if (score >= 90) return { text: 'Excellent', color: themeColors.success, icon: Star }
    if (score >= 80) return { text: 'Very Good', color: themeColors.info, icon: CheckCircle }
    if (score >= 70) return { text: 'Good', color: themeColors.warning, icon: TrendingUp }
    return { text: 'Needs Improvement', color: themeColors.error, icon: AlertCircle }
  }

  const getBehaviourQuote = (score: number) => {
    if (score >= 90) return 'Outstanding consistency — keep it up!'
    if (score >= 80) return 'Very good progress — aim for excellence.'
    if (score >= 70) return 'Good — small improvements will make it great.'
    return 'Focus this week — you can turn this around.'
  }

  const getBehaviourWord = (score: number) => {
    if (score >= 90) return 'Excellent'
    if (score >= 80) return 'Great'
    if (score >= 70) return 'Good'
    return 'Improve'
  }

  const performanceStatus = getPerformanceStatus(overallScore)
  const behaviourAvg: number = (() => {
    const items = behaviourComputed?.items || []
    if (!items.length) return 0
    return Math.round(items.reduce((s: number, it: any) => s + (it.value || 0), 0) / items.length)
  })()
  const behaviourStatus = getPerformanceStatus(behaviourAvg)
  const profileStatusAvg = Math.round(((cwPct || 0) + (behaviourAvg || 0) + (detailsCompleteness || 0)) / 3)
  const overallCombined = Math.round(((cwPct || 0) + (profileStatusAvg || 0) + (behaviourAvg || 0)) / 3)

  // Student photo and initials
  const studentPhoto: string | undefined = (student as any)?.profile_image || (student as any)?.photo || (student as any)?.image || (student as any)?.student_photo
  const studentInitials = ((student?.name || 'Student') as string)
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')

  // Derived details
  const age = (() => {
    const dobStr = (student as any)?.dob
    if (!dobStr) return '—'
    const dob = new Date(dobStr)
    if (isNaN(dob.getTime())) return '—'
    const diff = Date.now() - dob.getTime()
    const ageDate = new Date(diff)
    return Math.abs(ageDate.getUTCFullYear() - 1970)
  })()



  // Mock subject progress data (0-100)
  const subjectProgressData = [
    { subject: 'Urdu', student: 84, classAvg: 76 },
    { subject: 'English', student: 91, classAvg: 82 },
    { subject: 'Math', student: 78, classAvg: 74 },
    { subject: 'Science', student: 86, classAvg: 79 },
    { subject: 'Islamiat', student: 93, classAvg: 88 },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-6 md:pb-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-2 sm:px-3 md:px-4 py-3 sm:py-4 md:py-6 w-full">
        {/* Header (themed) */}
        <div className="rounded-lg sm:rounded-xl shadow-lg p-3 sm:p-4 md:p-6 mb-4 sm:mb-5 md:mb-6 border" style={{ backgroundColor: themeColors.primary, borderColor: themeColors.primary }}>
          <div className="flex flex-col md:flex-row items-start md:items-center md:space-x-5 gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: themeColors.skyblue }}>
                  <User className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
              <div className="text-white min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold break-words">{student?.name || 'Student Profile'}</h1>
                <p className="text-white/80 text-xs sm:text-sm md:text-base">Student ID: {(student as any)?.student_id || studentId}</p>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                  <span className="inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }}>
                      <GraduationCap className="w-3 h-3 mr-1 flex-shrink-0" />
                      {student?.current_grade || 'N/A'}
                  </span>
                  <span className="inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }}>
                      <Users className="w-3 h-3 mr-1 flex-shrink-0" />
                      Sec {student?.section || 'N/A'}
                  </span>
                  <span className="inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap truncate" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }}>
                      <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                      {student?.campus_name || student?.campus?.campus_name || 'N/A'}
                  </span>
                  </div>
                </div>
              {overallCombined < 70 && (
                <div className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 rounded-md border w-full md:w-auto text-left md:text-right" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }}>
                  Overall score is below 70%. Please focus on This Student. 
                </div>
              )}

                    </div>
        </div>

        {/* KPI Cards Only */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-6 mb-6 md:mb-8">
          <Card className="text-white border-0 shadow-lg" style={{ backgroundColor: themeColors.primary }}>
            <CardContent className="p-2.5 sm:p-3 md:p-6">
              <div className="flex flex-col items-start gap-1 sm:gap-2">
                  <p className="text-blue-100 text-xs md:text-sm font-medium">Overall Score</p>
                  <div className="flex items-center justify-between w-full gap-2">
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold">{overallCombined}%</p>
                    <Award className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-blue-200 flex-shrink-0" />
                  </div>
                </div>
            </CardContent>
          </Card>

          <Card className="text-white border-0 shadow-lg" style={{ backgroundColor: themeColors.info }}>
            <CardContent className="p-2.5 sm:p-3 md:p-6">
              <div className="flex flex-col items-start gap-1 sm:gap-2">
                  <p className="text-xs md:text-sm font-medium">Attendance</p>
                  <div className="flex items-center justify-between w-full gap-2">
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold">{cwPct}%</p>
                    <Calendar className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />
                  </div>
              </div>
            </CardContent>
          </Card>

          <Card className="text-white border-0 shadow-lg" style={{ backgroundColor: themeColors.skyblue }}>
            <CardContent className="p-2.5 sm:p-3 md:p-6">
              <div className="flex flex-col items-start gap-1 sm:gap-2">
                <p className="text-purple-100 text-xs md:text-sm font-medium">Profile Status</p>
                <div className="flex items-center justify-between w-full gap-2">
                  <p className="text-xl sm:text-2xl md:text-3xl font-bold">{profileStatusAvg}%</p>
                  <User className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-purple-200 flex-shrink-0" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="text-white border-0 shadow-lg" style={{ backgroundColor: themeColors.light }}>
            <CardContent className="p-2.5 sm:p-3 md:p-6">
                <div>
                <p className="text-xs md:text-sm font-medium">Performance / Behaviour</p>
                <div className="mt-1 flex items-baseline gap-1 sm:gap-2">
                  <span className="text-xl sm:text-2xl md:text-3xl font-extrabold leading-none">{behaviourAvg}%</span>
                  <span className="text-xs md:text-sm font-semibold">{getBehaviourWord(behaviourAvg)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        



        
        {/* Responsive two-card section: first normal, second double width */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-6 md:mb-8 items-stretch">
          {/* First card - same width/height */}
          <Card className="overflow-hidden bg-white border shadow-sm h-auto md:h-[360px] lg:h-[420px]">
            {studentPhoto ? (
              <img
                src={studentPhoto}
                alt={student?.name || 'Student'}
                className="w-full h-48 md:h-full object-cover block"
              />
            ) : (
              <div className="w-full h-48 md:h-full flex items-center justify-center text-4xl md:text-6xl font-bold text-white" style={{ backgroundColor: '#61a5c2' }}>
                {studentInitials}
                  </div>
            )}
              </Card>

          {/* Second card - double width with Tabs (Personal | Academic | Contact) */}
          <Card className="bg-white border shadow-sm md:col-span-1 lg:col-span-2 h-auto md:h-[360px] lg:h-[420px]">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 sm:pb-3 md:pb-4">
              <CardTitle className="text-lg sm:text-xl md:text-2xl text-[#013a63]">Student Information</CardTitle>
              {userRole === 'teacher' && (
                <Button onClick={() => setBehaviourOpen(true)} className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm text-white transition-all duration-150 ease-in-out transform hover:shadow-lg active:scale-95 active:shadow-md w-full sm:w-auto" style={{ backgroundColor: themeColors.primary }}>
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" /> <span className="hidden sm:inline">Add Behaviour</span><span className="sm:hidden">Add</span>
                </Button>
              )}
                </CardHeader>
            <CardContent className="h-auto md:h-[calc(100%-3.5rem)] flex flex-col min-h-0 overflow-hidden">
              <Tabs defaultValue="personal" className="w-full h-full flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-3 text-xs sm:text-sm">
                  <TabsTrigger value="personal" className="text-xs sm:text-sm">Personal</TabsTrigger>
                  <TabsTrigger value="academic" className="text-xs sm:text-sm">Academic</TabsTrigger>
                  <TabsTrigger value="contact" className="text-xs sm:text-sm">Contact</TabsTrigger>
                </TabsList>

                <TabsContent value="personal" className="flex-1 mt-2 sm:mt-3 md:mt-4 min-h-0 overflow-y-auto pr-0 sm:pr-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4 content-start">
                    <div className="w-full rounded-lg border bg-white divide-y text-sm">
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Full Name</p>
                        <div className="col-span-2 font-medium text-gray-800 text-xs sm:text-sm truncate">{student?.name || '—'}</div>
                  </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Gender</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{student?.gender || '—'}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">DOB</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{student?.dob || '—'}</div>
                  </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Age</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{age}</div>
            </div>

                          </div>
                    <div className="w-full rounded-lg border bg-white divide-y text-sm">
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Religion</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{student?.religion || '—'}</div>
                          </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Mother Tongue</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{student?.mother_tongue || '—'}</div>
                        </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Place of Birth</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm truncate">{(student as any)?.place_of_birth || '—'}</div>
                          </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Zakat Status</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm capitalize">{(student as any)?.zakat_status || '—'}</div>
                        </div>
                      </div>
                  </div>
                </TabsContent>

                <TabsContent value="academic" className="flex-1 mt-2 sm:mt-3 md:mt-4 min-h-0 overflow-y-auto pr-0 sm:pr-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4 content-start">
                    <div className="w-full rounded-lg border bg-white divide-y text-sm">
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Student ID</p>
                        <div className="col-span-2 font-medium text-gray-800 text-xs sm:text-sm truncate">{(student as any)?.student_id || '—'}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Current Grade</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{(student as any)?.current_grade || '—'}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Section</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{student?.section || '—'}</div>
                    </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Class Teacher</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm truncate">{
                          (student as any)?.classroom?.class_teacher?.full_name
                          || (student as any)?.class_teacher?.full_name
                          || (student as any)?.classroom?.class_teacher_name
                          || (student as any)?.class_teacher_name
                          || '—'
                        }</div>
                      </div>
                      </div>
                    <div className="w-full rounded-lg border bg-white divide-y text-sm">
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Campus</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm truncate">{student?.campus_name || student?.campus?.campus_name || '—'}</div>
                    </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Shift</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm capitalize">{(student as any)?.shift || '—'}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Enrollment Year</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{(student as any)?.enrollment_year || '—'}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">GR No</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{student?.gr_no || '—'}</div>
                    </div>
                  </div>
            </div>
          </TabsContent>

                <TabsContent value="contact" className="flex-1 mt-2 sm:mt-3 md:mt-4 min-h-0 overflow-y-auto pr-0 sm:pr-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4 content-start">
                    <div className="w-full rounded-lg border bg-white divide-y text-sm">
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Father Name</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm truncate">{student?.father_name || '—'}</div>
                </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Father Contact</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{student?.father_contact || '—'}</div>
                    </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Father CNIC</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm truncate">{(student as any)?.father_cnic || '—'}</div>
                        </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Father Profession</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm truncate">{(student as any)?.father_profession || '—'}</div>
                      </div>
                        </div>
                    <div className="w-full rounded-lg border bg-white divide-y text-sm">
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Mother Name</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm truncate">{(student as any)?.mother_name || '—'}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Mother Contact</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm">{(student as any)?.mother_contact || '—'}</div>
                    </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Mother Status</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm capitalize">{(student as any)?.mother_status || '—'}</div>
                            </div>
                      <div className="grid grid-cols-3 gap-2 p-2 sm:p-3">
                        <p className="text-xs text-gray-500">Address</p>
                        <div className="col-span-2 text-gray-800 text-xs sm:text-sm truncate">{(student as any)?.address || '—'}</div>
                          </div>
                        </div>
                    </div>
                </TabsContent>
              </Tabs>
                </CardContent>
              </Card>
            </div>        {/* Donut + Subject Progress (same row, equal width) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6 mb-6 md:mb-8 items-stretch">
          <Card className="bg-white border shadow-sm h-auto md:h-[380px] lg:h-[420px] overflow-hidden">
            <CardHeader className="pb-2 sm:pb-3 md:pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                <CardTitle className="text-lg sm:text-xl md:text-2xl text-[#013a63]">Attendance</CardTitle>
                <div className="flex flex-col items-start sm:items-end gap-1 sm:gap-2 w-full sm:w-auto">
                  <Select value={String(donutRange)} onValueChange={(v) => setDonutRange(parseInt(v))}>
                    <SelectTrigger className="h-7 sm:h-8 text-xs sm:text-sm rounded-md border bg-white focus:ring-sky-500 w-full sm:w-[140px]">
                      <SelectValue placeholder="Last 7 days" />
                    </SelectTrigger>
                    <SelectContent className="text-xs sm:text-sm">
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="15">Last 15 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2 sm:gap-1 text-xs mt-1">
                    <span className="inline-flex items-center gap-1 text-green-600 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#22c55e' }}></span><span className="hidden sm:inline">Present:</span> {cwPresent}</span>
                    <span className="inline-flex items-center gap-1 text-rose-600 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#ef4444' }}></span><span className="hidden sm:inline">Absent:</span> {cwAbsent}</span>
                    <span className="inline-flex items-center gap-1 text-slate-600 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#cbd5e1' }}></span>NR: {(donutData?.find(d => d.name === 'No Record')?.value as number) || 0}</span>
                </div>

                  {/* Behaviour Modal (teachers only) */}
                  {userRole === 'teacher' && (
                    <StudentBehaviourModal
                      open={behaviourOpen}
                      onOpenChange={setBehaviourOpen}
                      studentId={studentId}
                      studentCode={(student as any)?.student_id}
                      studentName={student?.name as any}
                      onSubmit={async (payload) => {
                        try {
                          await createBehaviourRecord({
                            student: Number(studentId),
                            week_start: payload.weekStart,
                            week_end: payload.weekEnd,
                            metrics: payload.metrics,
                            notes: payload.notes,
                            events: (payload.events || []).map((e: any) => ({ date: e.date, name: e.name, progress: e.progress, award: e.award }))
                          })
                          const list = await getStudentBehaviourRecords(studentId)
                          setBehaviourRecords(Array.isArray(list) ? list : [])
                          toast({ title: "Behaviour saved", description: "Record stored successfully.", variant: "default" })
                        } catch (e) {
                          toast({ title: "Save failed", description: "Could not save behaviour record.", variant: "destructive" })
                        }
                      }}
                    />
                  )}
                  <div className="text-[10px] text-slate-500 mt-1">Range: {cwStartLabel} – {cwEndLabel}</div>
                          </div>
                          </div>
            </CardHeader>
            <CardContent className="h-auto md:h-[calc(100%-4.5rem)] pb-2 sm:pb-3 md:pb-4">
              <div className="relative h-64 md:h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <defs>
                      <linearGradient id="attBlue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#1d4ed8" />
                      </linearGradient>
                    </defs>
                    <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="50%" outerRadius="70%" startAngle={90} endAngle={-270} stroke="#ffffff" strokeWidth={2}>
                      <Cell fill="#22c55e" />
                      <Cell fill="#ef4444" />
                      <Cell fill="#cbd5e1" />
                      <Cell fill="url(#attBlue)" />
                    </Pie>
                    {/* thin accent ring */}
                    <Pie data={[{ value: 100 }]} dataKey="value" cx="50%" cy="50%" innerRadius="73%" outerRadius="75%" startAngle={90} endAngle={-270} fill="none" stroke="#ef4444" strokeWidth={2} />
                    <Tooltip content={<DonutTooltip />} />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold" style={{ color: themeColors.primary }}>{cwPct}%</div>
                  <div className="text-xs text-slate-600">{cwPresent} / {cwDenom}</div>
                        </div>
                          </div>
              <div className="mt-2 sm:mt-3 md:mt-4 h-20 md:h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Attendance']} />
                    <Area type="monotone" dataKey="percent" stroke="#3b82f6" strokeWidth={2} fill="url(#spark)" dot={false} activeDot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                        </div>

                </CardContent>
              </Card>

          <Card className="bg-white border shadow-sm h-auto md:h-[380px] lg:h-[420px]">
            <CardHeader className="pb-2 sm:pb-3 md:pb-4">
              <CardTitle className="text-lg sm:text-xl md:text-2xl text-[#013a63]">Subject Progress</CardTitle>
                </CardHeader>
            <CardContent className="h-auto md:h-[calc(100%-3.5rem)] pb-2 sm:pb-3 md:pb-4">
              <div className="h-64 md:h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjectProgressData} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="subject" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 10 }} width={30} />
                    <Tooltip cursor={{ fill: 'rgba(2,132,199,0.06)' }} formatter={(value: any, name: string) => [`${value}%`, name === 'student' ? 'Student' : 'Class Avg']} />
                    <defs>
                      <linearGradient id="gradStudent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                      <linearGradient id="gradClass" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#93c5fd" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                    <Bar dataKey="student" name="Student" fill="url(#gradStudent)" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="student" position="top" className="fill-slate-700 text-[9px]" />
                    </Bar>
                    <Bar dataKey="classAvg" name="Class Avg" fill="url(#gradClass)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
                </CardContent>
              </Card>
                      </div>
        {/* Behaviour Snapshot - Student's Behaviour Snapshot*/}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:gap-6 mb-8">
          <Card className="bg-white border shadow-sm h-auto md:h-[380px] lg:h-[420px]">
            <CardHeader className="pb-2 sm:pb-3 md:pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                <CardTitle className="text-lg sm:text-xl md:text-2xl text-[#013a63]">Student's Behaviour Snapshot</CardTitle>
                {selectedImp && (
                  <div className={`text-xs px-2 sm:px-3 py-1.5 sm:py-2 rounded-md border w-full sm:max-w-xs ${selectedImp.severity === 'critical' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    {selectedImp.message}
                    </div>
                )}
                      </div>
            </CardHeader>
            <CardContent className="h-auto md:h-[calc(100%-4.5rem)] pb-2 sm:pb-3 md:pb-4">
              {behaviourComputed && behaviourComputed.items ? (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-10 gap-3 sm:gap-4 md:gap-6 h-full">
                  {/* Left: Detail list (30%) with clickable improvement indicators */}
                  <div className="md:col-span-1 lg:col-span-3 flex flex-col h-full">
                    <div className="w-full rounded-lg border bg-white divide-y overflow-y-auto">
                      {behaviourComputed.items.map((it: any) => {
                        const imp = (behaviourImprovements as any[]).find((x: any) => x.key === it.key)
                        const severityClass = imp ? (imp.severity === 'critical' ? 'text-rose-600' : 'text-amber-600') : 'text-green-600'
                        const showPulse = !!imp
                        return (
                          <button key={it.key} type="button" className="w-full text-left flex items-center justify-between p-2 sm:p-3 hover:bg-slate-50 text-xs sm:text-sm" onClick={() => showPulse ? setSelectedImprovement(it.key) : setSelectedImprovement(null)}>
                            <span className="text-gray-600 flex items-center gap-2 min-w-0">
                              <span className="truncate">{it.label}</span>
                              {showPulse && (
                                <span className="relative inline-flex h-1.5 w-1.5 sm:h-2 sm:w-2 flex-shrink-0">
                                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${imp?.severity === 'critical' ? 'bg-rose-400' : 'bg-amber-400'} opacity-75`}></span>
                                  <span className={`relative inline-flex rounded-full h-full w-full ${imp?.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
                                </span>
                              )}
                            </span>
                            <span className={`text-sm font-semibold ${severityClass} flex-shrink-0`}>{it.value}%</span>
                          </button>
                        )
                      })}
                    </div>
                    {/* Inline message area removed as requested */}
                      </div>

                  {/* Right: Radar chart (70%) */}
                  <div className="md:col-span-2 lg:col-span-7 h-64 md:h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={behaviourComputed.items.map((it: any) => ({ metric: it.label, value: it.value, full: 100 }))}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                        <Radar name="Score" dataKey="value" stroke="#013a63" fill="#60a5fa" fillOpacity={0.7} />
                      </RadarChart>
                    </ResponsiveContainer>
                    </div>
                      </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">No behaviour data yet. Add first record.</div>
              )}
              {/* Removed bottom messages block; now handled inline per-row */}
              </CardContent>
            </Card>
          </div>
      </div>
    </div>
  )
}

export default function StudentProfilePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <StudentProfileContent />
    </Suspense>
  )
}