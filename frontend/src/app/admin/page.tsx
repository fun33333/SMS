"use client"
import { useState, useMemo, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MultiSelectFilter } from "@/components/dashboard/multi-select-filter"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { GradeDistributionChart } from "@/components/dashboard/grade-distribution-chart"
import { GenderDistributionChart } from "@/components/dashboard/gender-distribution-chart"
import { MotherTongueChart } from "@/components/dashboard/mother-tongue-chart"
import { ReligionChart } from "@/components/dashboard/religion-chart"
import { EnrollmentTrendChart } from "@/components/dashboard/enrollment-trend-chart"
import { AgeDistributionChart } from "@/components/dashboard/age-distribution-chart"
import { WeeklyAttendanceChart } from "@/components/dashboard/weekly-attendance-chart"
import { ZakatStatusChart } from "@/components/dashboard/zakat-status-chart"
import { HouseOwnershipChart } from "@/components/dashboard/house-ownership-chart"
import { UserGreeting } from "@/components/dashboard/user-greeting"
import { Users, GraduationCap, UsersRound, RefreshCcw, EllipsisVertical } from "lucide-react"
import { Skeleton, CardSkeleton } from "@/components/ui/skeleton"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { getGradeDistribution, getGenderDistribution, getEnrollmentTrend, getMotherTongueDistribution, getReligionDistribution, getAgeDistribution, getZakatStatusDistribution, getHouseOwnershipDistribution } from "@/lib/chart-utils"
import type { FilterState, LegacyStudent as DashboardStudent } from "@/types/dashboard"
import { useRouter } from "next/navigation"
import { getDashboardStats, getAllStudents, getAllCampuses, apiGet, getCurrentUserProfile, getFilteredStudents } from "@/lib/api"
import { getCurrentUserRole, getCurrentUser } from "@/lib/permissions"

if (typeof window !== 'undefined') {
  import('html2pdf.js').then(mod => { (window as any).html2pdf = mod.default; });
}

export default function MainDashboardPage() {
  // Get current user role
  const [userRole, setUserRole] = useState<string>("")
  const [isClearing, setIsClearing] = useState<boolean>(false)
  const [customExportOpen, setCustomExportOpen] = useState(false)
  const [selectedSections, setSelectedSections] = useState<Record<string, boolean>>({
    greeting: false,
    kpis: false,
    gender: true,
    religion: true,
    motherTongue: true,
    enrollmentTrend: true,
    gradeDistribution: true,
    weeklyAttendance: true,
    ageDistribution: true,
    zakatStatus: true,
    houseOwnership: true,
  })

  // Section refs for custom export
  const greetingRef = useRef<HTMLDivElement>(null)
  const kpisRef = useRef<HTMLDivElement>(null)
  const genderReligionRef = useRef<HTMLDivElement>(null)
  const motherEnrollmentRef = useRef<HTMLDivElement>(null)
  const gradeDistributionRef = useRef<HTMLDivElement>(null)
  const weeklyAgeRef = useRef<HTMLDivElement>(null)
  const zakatHouseRef = useRef<HTMLDivElement>(null)
  const genderChartRef = useRef<HTMLDivElement>(null)
  const religionChartRef = useRef<HTMLDivElement>(null)
  const motherTongueChartRef = useRef<HTMLDivElement>(null)
  const enrollmentTrendChartRef = useRef<HTMLDivElement>(null)
  const weeklyAttendanceChartRef = useRef<HTMLDivElement>(null)
  const ageDistributionChartRef = useRef<HTMLDivElement>(null)
  const zakatStatusChartRef = useRef<HTMLDivElement>(null)
  const houseOwnershipChartRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Clear dashboard cache on component mount to ensure fresh data
      try {
        const keysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('dashboard_')) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key))
        // Also clear any cached data that might cause the 50 students issue
        const allKeys = Object.keys(localStorage)
        allKeys.forEach(key => {
          if (key.includes('students') || key.includes('campus') || key.includes('dashboard')) {
            localStorage.removeItem(key)
          }
        })
      } catch (error) {
        console.warn('Error clearing localStorage on mount:', error)
      }
      
      const userStr = window.localStorage.getItem("sis_user");
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          const role = user.role?.toLowerCase();
          setUserRole(role || "");
        } catch {
          setUserRole("");
        }
      }
    }
  }, []);
  // Utility to convert students to CSV
  function studentsToCSV(students: DashboardStudent[]) {
    if (!students.length) return '';
    const header = Object.keys(students[0] as any);
    const rows = students.map((s) => header.map((h) => JSON.stringify((s as any)[h] ?? "")).join(","));
    return [header.join(","), ...rows].join("\r\n");
  }

  function studentsToExcel(students: DashboardStudent[]) {
    return studentsToCSV(students); 
  }

  function downloadFile(data: string, filename: string, type: string) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Principal campus filtering and shift filter
  const [userCampus, setUserCampus] = useState<string>("");
  const [, setPrincipalShift] = useState<string>("both");
  
  // Print / Save PDF (two-column with summaries, like Custom Export)
  function handlePrintDashboard() {
    const w = window.open('', '_blank')
    if (!w) return
    const doc = w.document
    const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')) as HTMLElement[]

    type ChartItem = { title: string; element?: HTMLElement | null; data?: any[]; kind?: string, fullWidth?: boolean }

    const normalBlocks: HTMLElement[] = []
    if (greetingRef.current) normalBlocks.push(greetingRef.current)
    if (kpisRef.current) normalBlocks.push(kpisRef.current)

    const chartBlocks: ChartItem[] = []
    chartBlocks.push({ title: 'Gender Distribution', element: genderChartRef.current, data: chartData.genderDistribution })
    chartBlocks.push({ title: 'Religion Distribution', element: religionChartRef.current, data: chartData.religionDistribution })
    chartBlocks.push({ title: 'Mother Tongue', element: motherTongueChartRef.current, data: chartData.motherTongueDistribution })
    chartBlocks.push({ title: 'Enrollment Trend', element: enrollmentTrendChartRef.current, data: (chartData.enrollmentTrend || []).map((t: any) => ({ name: String(t.year), value: t.enrollment })) })
    chartBlocks.push({ title: 'Grade Distribution', element: gradeDistributionRef.current, data: chartData.gradeDistribution, fullWidth: true })
    chartBlocks.push({ title: 'Weekly Attendance', element: weeklyAttendanceChartRef.current, kind: 'weekly' })
    chartBlocks.push({ title: 'Age Distribution', element: ageDistributionChartRef.current, data: chartData.ageDistribution })
    chartBlocks.push({ title: 'Zakat Status', element: zakatStatusChartRef.current, data: chartData.zakatStatus })
    chartBlocks.push({ title: 'House Ownership', element: houseOwnershipChartRef.current, data: chartData.houseOwnership })

    doc.open()
    doc.write('<!doctype html><html><head>')
    doc.write('<meta charset="utf-8" />')
    doc.write('<title>Dashboard Report</title>')
    styleNodes.forEach((n) => doc.write(n.outerHTML))
    doc.write(`<style>
      @page { size: A4; margin: 14mm; }
      html, body { background: #ffffff !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print, button, [role="button"], input, select { display: none !important; }
      .print-container { max-width: 1024px; margin: 0 auto; }
      .print-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding:14px; border-radius:12px; color:#fff; background: linear-gradient(135deg,#274c77,#6096ba); }
      .print-title { font-size: 20px; font-weight: 800; }
      .print-meta { font-size: 12px; opacity: .9; }
      .filters-bar { margin: 8px 0 14px; display:flex; flex-wrap:wrap; gap:6px; }
      .filters-bar .tag { display:inline-block; background:#eef2ff; border:1px solid #c7d2fe; color:#1e3a8a; padding:4px 8px; border-radius:9999px; font-size:12px; font-weight:600; }
      .two-col-grid { display: grid; grid-template-columns: 1fr !important; gap: 16px; }
      .two-col-grid .grid-item { break-inside: avoid; grid-column: 1 / -1; }
      .two-col-grid .span-2 { grid-column: 1 / -1; }
      .chart-summary { margin-top: 8px; }
      .chart-summary .caption { font-weight: 700; color: #274c77; margin-bottom: 6px; }
      .chart-summary table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
      .chart-summary th, .chart-summary td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; font-size: 12px; }
      .chart-summary tr:last-child td { border-bottom: none; }
      .chart-summary th { background: #f8fafc; text-align: left; }
    </style>`)
    doc.write('</head><body>')
    doc.write('<div class="print-container">')
    doc.write('<div class="print-header"><div><div class="print-title">Dashboard Report</div><div class="print-meta">Generated on ' + new Date().toLocaleString() + '</div></div><div class="print-meta">IAK SMS</div></div>')
    {
      const parts: string[] = []
      const push = (label: string, vals: any[]) => {
        if (Array.isArray(vals) && vals.length) parts.push(`<span class=\"tag\">${label}: ${String(vals.join(', '))}</span>`)
      }
      push('Year', (filters.academicYears || []) as unknown as any[])
      push('Campus', (filters.campuses || []) as unknown as any[])
      push('Grade', (filters.grades || []) as unknown as any[])
      push('Gender', (filters.genders || []) as unknown as any[])
      push('Mother Tongue', (filters.motherTongues || []) as unknown as any[])
      push('Religion', (filters.religions || []) as unknown as any[])
      if (String(shiftFilter || 'all') !== 'all') parts.push(`<span class=\"tag\">Shift: ${String(shiftFilter)}</span>`)
      if (parts.length) doc.write('<div class="filters-bar">' + parts.join(' ') + '</div>')
    }
    normalBlocks.forEach((el) => doc.write(el.outerHTML))

    function buildSummaryHTML(item: ChartItem): string {
      if (item.kind === 'weekly') {
        const rows = (weeklyAttendanceData || []).map((d: any) => `<tr><td>${d.day}</td><td style="text-align:center;">${Number(d.present ?? 0)}</td><td style=\"text-align:center;\">${Number(d.absent ?? 0)}</td></tr>`).join('')
        return `<div class="chart-summary"><div class="caption">Weekly Attendance Summary</div><table><thead><tr><th>Day</th><th style=\"text-align:center;\">Present</th><th style=\"text-align:center;\">Absent</th></tr></thead><tbody>${rows || '<tr><td colspan=3 style="text-align:center;">No data</td></tr>'}</tbody></table></div>`
      }
      const data = Array.isArray(item.data) ? item.data : []
      if (data.length === 0) return ''
      const total = data.reduce((acc: number, it: any) => acc + Number(it.value ?? it.count ?? it.present ?? 0), 0)
      const rows = data.map((it: any) => {
        const label = String(it.name ?? it.label ?? it.category ?? it.group ?? it.ageGroup ?? it.status ?? '-')
        const val = Number(it.value ?? it.count ?? it.present ?? 0)
        const pct = total > 0 ? Math.round((val / total) * 100) : 0
        return `<tr><td>${label}</td><td style="text-align:center;">${val}</td><td style="text-align:center;">${pct}%</td></tr>`
      }).join('')
      return `<div class="chart-summary"><div class="caption">${item.title} - Details</div><table><thead><tr><th>Category</th><th style=\"text-align:center;\">Count</th><th style=\"text-align:center;\">%</th></tr></thead><tbody>${rows}</tbody></table></div>`
    }

    if (chartBlocks.length > 0) {
      doc.write('<div class="two-col-grid">')
      chartBlocks.forEach((item) => {
        if (!item.element) return
        const cls = item.fullWidth ? 'grid-item span-2' : 'grid-item'
        doc.write('<div class="' + cls + '">')
        doc.write(item.element.outerHTML)
        doc.write(buildSummaryHTML(item))
        doc.write('</div>')
      })
      doc.write('</div>')
    }

    doc.write('</div>')
    doc.write('<script>setTimeout(function(){window.print();}, 300);</script>')
    doc.write('</body></html>')
    doc.close()
    setTimeout(() => { w?.focus() }, 100)
  }

  // Build custom export HTML from selected refs
  function handleCustomExport() {
    const w = window.open('', '_blank')
    if (!w) return
    const doc = w.document
    const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')) as HTMLElement[]

    const normalBlocks: HTMLElement[] = []
    if (selectedSections.greeting && greetingRef.current) normalBlocks.push(greetingRef.current)
    if (selectedSections.kpis && kpisRef.current) normalBlocks.push(kpisRef.current)

    type ChartItem = { title: string; element?: HTMLElement | null; data?: any[]; kind?: string, fullWidth?: boolean }
    const chartBlocks: ChartItem[] = []
    if (selectedSections.gender) chartBlocks.push({ title: 'Gender Distribution', element: genderChartRef.current, data: chartData.genderDistribution })
    if (selectedSections.religion) chartBlocks.push({ title: 'Religion Distribution', element: religionChartRef.current, data: chartData.religionDistribution })
    if (selectedSections.motherTongue) chartBlocks.push({ title: 'Mother Tongue', element: motherTongueChartRef.current, data: chartData.motherTongueDistribution })
    if (selectedSections.enrollmentTrend) chartBlocks.push({ title: 'Enrollment Trend', element: enrollmentTrendChartRef.current, data: (chartData.enrollmentTrend || []).map((t: any) => ({ name: String(t.year), value: t.enrollment })) })
    if (selectedSections.gradeDistribution) chartBlocks.push({ title: 'Grade Distribution', element: gradeDistributionRef.current, data: chartData.gradeDistribution, fullWidth: true })
    if (selectedSections.weeklyAttendance) chartBlocks.push({ title: 'Weekly Attendance', element: weeklyAttendanceChartRef.current, kind: 'weekly' })
    if (selectedSections.ageDistribution) chartBlocks.push({ title: 'Age Distribution', element: ageDistributionChartRef.current, data: chartData.ageDistribution })
    if (selectedSections.zakatStatus) chartBlocks.push({ title: 'Zakat Status', element: zakatStatusChartRef.current, data: chartData.zakatStatus })
    if (selectedSections.houseOwnership) chartBlocks.push({ title: 'House Ownership', element: houseOwnershipChartRef.current, data: chartData.houseOwnership })

    doc.open()
    doc.write('<!doctype html><html><head>')
    doc.write('<meta charset="utf-8" />')
    doc.write('<title>Custom Dashboard Report</title>')
    styleNodes.forEach((n) => doc.write(n.outerHTML))
    doc.write(`<style>
      @page { size: A4; margin: 14mm; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { background: #ffffff !important; }
      .print-container { max-width: 1024px; margin: 0 auto; }
      .print-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding:14px; border-radius:12px; color:#fff; background: linear-gradient(135deg,#274c77,#6096ba); }
      .print-title { font-size: 20px; font-weight: 800; }
      .print-meta { font-size: 12px; opacity: .9; }
      .no-print { display: none !important; }
      .filters-bar { margin: 8px 0 14px; display:flex; flex-wrap:wrap; gap:6px; }
      .filters-bar .tag { display:inline-block; background:#eef2ff; border:1px solid #c7d2fe; color:#1e3a8a; padding:4px 8px; border-radius:9999px; font-size:12px; font-weight:600; }
      .two-col-grid { display: grid; grid-template-columns: 1fr !important; gap: 16px; }
      .two-col-grid .grid-item { break-inside: avoid; grid-column: 1 / -1; }
      .two-col-grid .span-2 { grid-column: 1 / -1; }
      .chart-summary { margin-top: 8px; }
      .chart-summary .caption { font-weight: 700; color: #274c77; margin-bottom: 6px; }
      .chart-summary table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
      .chart-summary th, .chart-summary td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; font-size: 12px; }
      .chart-summary tr:last-child td { border-bottom: none; }
      .chart-summary th { background: #f8fafc; text-align: left; }
    </style>`)
    doc.write('</head><body>')
    doc.write('<div class="print-container">')
    doc.write('<div class="print-header"><div><div class="print-title">Custom Dashboard Report</div><div class="print-meta">Generated on ' + new Date().toLocaleString() + '</div></div><div class="print-meta">IAK SMS</div></div>')
    {
      const parts2: string[] = []
      const push2 = (label: string, vals: any[]) => {
        if (Array.isArray(vals) && vals.length) parts2.push(`<span class=\"tag\">${label}: ${String(vals.join(', '))}</span>`)
      }
      push2('Year', (filters.academicYears || []) as unknown as any[])
      push2('Campus', (filters.campuses || []) as unknown as any[])
      push2('Grade', (filters.grades || []) as unknown as any[])
      push2('Gender', (filters.genders || []) as unknown as any[])
      push2('Mother Tongue', (filters.motherTongues || []) as unknown as any[])
      push2('Religion', (filters.religions || []) as unknown as any[])
      if (String(shiftFilter || 'all') !== 'all') parts2.push(`<span class=\"tag\">Shift: ${String(shiftFilter)}</span>`)
      if (parts2.length) doc.write('<div class="filters-bar">' + parts2.join(' ') + '</div>')
    }
    normalBlocks.forEach((el) => doc.write(el.outerHTML))
    // helper to build generic summary tables
    function buildSummaryHTML(item: ChartItem): string {
      if (item.kind === 'weekly') {
        const rows = (weeklyAttendanceData || []).map((d: any) => `<tr><td>${d.day}</td><td style="text-align:center;">${Number(d.present ?? 0)}</td><td style=\"text-align:center;\">${Number(d.absent ?? 0)}</td></tr>`).join('')
        return `<div class="chart-summary"><div class="caption">Weekly Attendance Summary</div><table><thead><tr><th>Day</th><th style=\"text-align:center;\">Present</th><th style=\"text-align:center;\">Absent</th></tr></thead><tbody>${rows || '<tr><td colspan=3 style="text-align:center;">No data</td></tr>'}</tbody></table></div>`
      }
      const data = Array.isArray(item.data) ? item.data : []
      if (data.length === 0) return ''
      // auto-detect label/value
      const total = data.reduce((acc: number, it: any) => acc + Number(it.value ?? it.count ?? it.present ?? 0), 0)
      const rows = data.map((it: any) => {
        const label = String(it.name ?? it.label ?? it.category ?? it.group ?? it.ageGroup ?? it.status ?? '-')
        const val = Number(it.value ?? it.count ?? it.present ?? 0)
        const pct = total > 0 ? Math.round((val / total) * 100) : 0
        return `<tr><td>${label}</td><td style="text-align:center;">${val}</td><td style="text-align:center;">${pct}%</td></tr>`
      }).join('')
      return `<div class="chart-summary"><div class="caption">${item.title} - Details</div><table><thead><tr><th>Category</th><th style=\"text-align:center;\">Count</th><th style=\"text-align:center;\">%</th></tr></thead><tbody>${rows}</tbody></table></div>`
    }

    if (chartBlocks.length > 0) {
      doc.write('<div class="two-col-grid">')
      chartBlocks.forEach((item) => {
        const card = item.element ? item.element.outerHTML : ''
        const summary = buildSummaryHTML(item)
        const cls = item.fullWidth ? 'grid-item span-2' : 'grid-item'
        doc.write('<div class="' + cls + '">' + card + summary + '</div>')
      })
      doc.write('</div>')
    }
    doc.write('</div>')
    doc.write('<script>setTimeout(function(){window.print();}, 300);</script>')
    doc.write('</body></html>')
    doc.close()
    setTimeout(() => { w?.focus() }, 100)
    setCustomExportOpen(false)
  }
  const router = useRouter();
  
  // Get user role and campus for principal filtering
  useEffect(() => {
    async function getUserData() {
      if (typeof window !== "undefined") {
        const role = getCurrentUserRole();
        setUserRole(role);
        
        // For principals, get detailed profile data from API
        if (role === 'principal') {
          try {
            const userProfile = await getCurrentUserProfile() as any;
            
            if (userProfile?.shift) {
              setPrincipalShift(String(userProfile.shift));
            }
            if (userProfile?.campus?.campus_name) {
              setUserCampus(userProfile.campus.campus_name);
            } else if (userProfile?.campus) {
              setUserCampus(userProfile.campus);
            }
          } catch (error) {
            console.error('Error fetching principal profile:', error);
            // Fallback to localStorage data
            const user = getCurrentUser() as any;
            if (user?.campus?.campus_name) {
              setUserCampus(user.campus.campus_name);
            } else if (user?.campus) {
              setUserCampus(user.campus);
            }
          }
        } else {
          // For other roles, use localStorage data
          const user = getCurrentUser() as any;
          if (user?.campus?.campus_name) {
            setUserCampus(user.campus.campus_name);
          }
        }
        
        if (role === "teacher") {
          router.replace("/admin/students/student-list");
        }
      }
    }
    
    getUserData();
  }, [router]);
  const [filters, setFilters] = useState<FilterState>({
    academicYears: [],
    campuses: [],
    grades: [],
    genders: [],
    motherTongues: [],
    religions: [],
  })
  const [students, setStudents] = useState<DashboardStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [showLoader, setShowLoader] = useState(true)
  const [principalCampusId, setPrincipalCampusId] = useState<number | null>(null)
  const [cacheTimestamp, setCacheTimestamp] = useState<number>(0)
  const [totalStudentsCount, setTotalStudentsCount] = useState<number>(0) 
  const [teachersCount, setTeachersCount] = useState<number>(0) 
  const [teachers, setTeachers] = useState<any[]>([]) 
  const [weeklyAttendanceData, setWeeklyAttendanceData] = useState<any[]>([]) // Weekly attendance data
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false) // Refresh state
  const [shiftFilter, setShiftFilter] = useState<string>("all");

  useEffect(() => {
    // Dynamic title based on user role
    if (userRole === 'principal' && userCampus) {
      document.title = `${userCampus} Dashboard | IAK SMS`
    } else if (userRole === 'superadmin') {
      document.title = "Super Admin Dashboard | IAK SMS"
    } else {
    document.title = "Dashboard | IAK SMS"
    }
    let loaderTimeout: NodeJS.Timeout;
    
    async function fetchData() {
      // Check cache first (5 minutes) - but only if we have valid role
      const now = Date.now()
      const cacheKey = `dashboard_${userRole}_${userCampus || 'all'}`
      
    
      
      setLoading(true)
      setShowLoader(true)
      
      try {
        // Fetch teachers count and weekly attendance data
        try {
          const q = shiftFilter && shiftFilter !== 'all' ? `?shift=${encodeURIComponent(shiftFilter)}` : ''
          const teachersResponse: any = await apiGet(`/api/teachers/${q}`)
          const list = Array.isArray(teachersResponse)
            ? teachersResponse
            : (Array.isArray(teachersResponse?.results) ? teachersResponse.results : [])
          setTeachers(list)
          setTeachersCount(list.length)
        } catch (error) {
          console.error('Error fetching teachers:', error)
          setTeachersCount(0)
          setTeachers([])
        }

        // Fetch weekly attendance data (last 7 days)
        try {
          const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
          
          try {
            const attendanceResponse: any = await apiGet('/api/attendance/')
            
            if (attendanceResponse && Array.isArray(attendanceResponse)) {
              // Process attendance data for last 7 days
              const last7Days = Array.from({ length: 7 }, (_, i) => {
                const date = new Date()
                date.setDate(date.getDate() - (6 - i))
                return date
              })
              
              const weekData = last7Days.map((date) => {
                const dayName = daysOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1]
                const dateStr = date.toISOString().split('T')[0]
                
                // Find attendance records for this date
                const dayRecords = attendanceResponse.filter((record: any) => 
                  record.date === dateStr || record.date?.startsWith(dateStr)
                )
                
                // Calculate present/absent from records
                let present = 0
                let absent = 0
                
                dayRecords.forEach((record: any) => {
                  if (record.present_count) present += record.present_count
                  if (record.absent_count) absent += record.absent_count
                })
                
                return { day: dayName, present, absent }
              })
              
              setWeeklyAttendanceData(weekData)
            } else {
              // Fallback to empty data if API doesn't return array
              const weekData = daysOfWeek.map(day => ({ day, present: 0, absent: 0 }))
              setWeeklyAttendanceData(weekData)
            }
          } catch (apiError) {
            console.error('Error fetching real attendance:', apiError)
            // Fallback to empty data
            const weekData = daysOfWeek.map(day => ({ day, present: 0, absent: 0 }))
            setWeeklyAttendanceData(weekData)
          }
        } catch (error) {
          console.error('Error processing attendance:', error)
        }

        // Principal: Fetch campus-specific data
        if (userRole === 'principal' && userCampus) {
          // Optimize: Only fetch essential data first
          const [apiStudents, caps] = await Promise.all([
            getAllStudents(),
            getAllCampuses()
          ])
          
          // Fetch stats separately to avoid blocking
          const apiStats = await getDashboardStats()
          
          // console.log('📊 API Response:', {
          //   students: Array.isArray(apiStudents) ? apiStudents.length : 'Not array',
          //   stats: apiStats,
          //   campuses: Array.isArray(caps) ? caps.length : 'Not array'
          // });
          
          // Filter students by principal's campus
          const studentsArray = Array.isArray(apiStudents) ? apiStudents : [];
          const campusArray = Array.isArray(caps) ? caps : (Array.isArray((caps as any)?.results) ? (caps as any).results : [])
          
          // console.log('Total students fetched:', studentsArray.length)
          // console.log('Available campuses:', campusArray.map((c: any) => c.campus_name || c.name))
          
          // Find principal's campus ID
          const principalCampus = campusArray.find((c: any) => {
            if (!c) return false;
            return c.campus_name === userCampus || 
                   c.name === userCampus ||
                   c.campus_code === userCampus ||
                   String(c.id) === String(userCampus);
          })
          
          // console.log('Principal campus found:', principalCampus)
          
          if (principalCampus) {
            // Fetch real active students count for this campus directly from API (fast count)
            try {
              const countResp: any = await getFilteredStudents({ page: 1, page_size: 1, current_state: 'active', campus: Number(principalCampus.id) })
              if (countResp && typeof countResp.count === 'number') {
                setTotalStudentsCount(countResp.count)
              }
            } catch {}
            // Filter students by campus
            const campusStudents = studentsArray.filter((student: any) => {
              if (!student || !student.campus) {
                // console.log('❌ Student or campus is null:', student);
                return false;
              }
              
              const studentCampus = student.campus
              // console.log('Student campus:', studentCampus, 'Principal campus:', userCampus, 'Principal campus ID:', principalCampus.id)
              
              if (typeof studentCampus === 'object' && studentCampus !== null) {
                const matches = (studentCampus.campus_name === userCampus) || 
                               (studentCampus.name === userCampus) ||
                               (studentCampus.campus_code === userCampus) ||
                               (studentCampus.id === principalCampus.id)
                // console.log('Object campus match:', matches)
                return matches
              }
              
              // Check if student campus ID matches principal campus ID
              const matches = (studentCampus === principalCampus.id) || 
                             (studentCampus === userCampus) ||
                             (String(studentCampus) === String(principalCampus.id)) ||
                             (String(studentCampus) === String(userCampus))
              // console.log('ID campus match:', matches)
              return matches
            })
            
            // console.log('Filtered campus students:', campusStudents.length)
            
            // Process filtered students
            const idToCampusName = new Map<string, string>(
              campusArray.filter((c: any) => c && (c.campus_name || c.name)).map((c: any) => [String(c.id), String(c.campus_name || c.name || '')])
            )

            const mapped: DashboardStudent[] = campusStudents.map((item: any, idx: number) => {
              const createdAt = typeof item?.created_at === "string" ? item.created_at : ""
              const year = createdAt ? Number(createdAt.split("-")[0]) : new Date().getFullYear()
              const genderRaw = (item?.gender ?? "").toString().trim()
              const gradeName = (item?.current_grade ?? "Unknown").toString().trim()
              const motherTongue = (item?.mother_tongue ?? "Other").toString().trim()
              const religion = (item?.religion ?? "Other").toString().trim()
              const campusName = (() => {
                const raw = item?.campus
                if (raw && typeof raw === 'object' && raw.campus_name) {
                  return String(raw.campus_name).trim()
                }
                if (typeof raw === 'number' || typeof raw === 'string') {
                  const hit = idToCampusName.get(String(raw))
                  if (hit) return hit
                }
                return userCampus || 'Unknown Campus'
              })()
              
              return {
                rawData: item,
                studentId: String(item?.gr_no || item?.id || idx + 1),
                name: item?.name || "Unknown",
                academicYear: isNaN(year) ? new Date().getFullYear() : year,
                campus: campusName,
                grade: gradeName,
                current_grade: gradeName,
                gender: genderRaw || "Unknown",
                motherTongue: motherTongue,
                religion: religion,
                attendancePercentage: Math.floor(Math.random() * 31) + 70, // Mock data for now
                averageScore: Math.floor(Math.random() * 41) + 60, // Mock data for now
                retentionFlag: (item?.current_state || "").toLowerCase() === "active",
                enrollmentDate: createdAt ? new Date(createdAt) : new Date(),
              }
            })
            
            // console.log('✅ Mapped campus students:', mapped.length)
            // console.log('Sample student data:', mapped[0])
            // console.log('Campus filtering debug:', {...})
            
            setStudents(mapped)
            // Fallback to client-side mapped length if API count not available
            if (!apiStats || typeof (apiStats as any).totalStudents !== 'number') {
              setTotalStudentsCount(mapped.length)
            }
            setCacheTimestamp(Date.now())
            
            // Save to cache (with total count) - only store essential data to avoid quota exceeded
            const cacheData = {
              totalCount: mapped.length,
              // Only store first 50 students to avoid localStorage quota issues
              students: mapped.slice(0, 50),
              hasMore: mapped.length > 50
            }
            localStorage.setItem(cacheKey, JSON.stringify(cacheData))
            localStorage.setItem(`${cacheKey}_time`, now.toString())
          } else {
            // console.warn('Principal campus not found:', userCampus)
            setStudents([])
          }
        } else {
          // Super Admin: Fetch ALL students for accurate filtering and charting
        // Fetch all students for dashboard (charts need all data for accurate filtering)
        const [apiStudents, apiStats, caps] = await Promise.all([
          getAllStudents(), // Fetch ALL students for accurate charts and filtering
          getDashboardStats(), // Total count and basic stats
          getAllCampuses()
        ])

          // Use all students for charts and filtering
        const studentsArray = Array.isArray(apiStudents) ? apiStudents : [];
        
        // console.log('📊 Fetched students for Super Admin:', { total: studentsArray.length })
        
        // Set total count from live API (fast count)
        try {
          const countResp: any = await getFilteredStudents({ page: 1, page_size: 1, current_state: 'active', shift: shiftFilter !== 'all' ? shiftFilter : undefined })
          if (countResp && typeof countResp.count === 'number') {
            setTotalStudentsCount(countResp.count)
          } else if (apiStats && typeof apiStats.totalStudents === 'number') {
            setTotalStudentsCount(apiStats.totalStudents)
          }
        } catch {
          if (apiStats && typeof apiStats.totalStudents === 'number') {
            setTotalStudentsCount(apiStats.totalStudents)
          }
        }
        
        // Note: Charts are now calculated from filtered students dynamically
        const campusArray = Array.isArray(caps) ? caps : (Array.isArray((caps as any)?.results) ? (caps as any).results : [])
        const idToCampusCode = new Map<string, string>(
            campusArray.map((c: any) => [String(c.id), String(c.campus_code || c.code || '')])
        )

        // Filter students by campus if Principal
        let filteredStudents = studentsArray;
        if (userRole?.includes("principal")) {
          // Try to infer campusId from userCampus or similar variable
          const principalCampusId = typeof userCampus === "string" || typeof userCampus === "number" ? userCampus : null;
          if (principalCampusId) {
            filteredStudents = studentsArray.filter((student: any) => {
              return student.current_campus === principalCampusId || student.campus_id === principalCampusId;
            });
          }
        }

        const mapped: DashboardStudent[] = filteredStudents.map((item: any, idx: number) => {
            const createdAt = typeof item?.created_at === "string" ? item.created_at : ""
            const year = createdAt ? Number(createdAt.split("-")[0]) : new Date().getFullYear()
            const genderRaw = (item?.gender ?? "").toString().trim()
          const campusCode = (() => {
            const raw = item?.campus
              if (raw && typeof raw === 'object') return String(raw?.campus_code || raw?.code || 'Unknown').trim()
            if (typeof raw === 'number' || typeof raw === 'string') {
              const hit = idToCampusCode.get(String(raw))
              if (hit) return hit
            }
            return 'Unknown'
          })()
            const gradeName = (item?.current_grade ?? "Unknown").toString().trim()
            const motherTongue = (item?.mother_tongue ?? "Other").toString().trim()
            const religion = (item?.religion ?? "Other").toString().trim()
            return {
              rawData: item,
              studentId: String(item?.gr_no || item?.id || idx + 1),
              name: item?.name || "Unknown",
              academicYear: isNaN(year) ? new Date().getFullYear() : year,
              campus: campusCode,
              grade: gradeName,
              current_grade: gradeName,
              gender: genderRaw || "Unknown",
              motherTongue: motherTongue,
              religion: religion,
              attendancePercentage: 0, // Will be calculated from real attendance data
              averageScore: 0, // Removed mock data
              retentionFlag: (item?.current_state || "").toLowerCase() === "active",
              enrollmentDate: createdAt ? new Date(createdAt) : new Date(),
            }
          })
        
        // console.log('✅ Mapped students for charts:', mapped.length)
        
        setStudents(mapped)
        // Fallback if nothing else set
        if (!mapped.length && totalStudentsCount === 0) {
          setTotalStudentsCount(mapped.length)
        }
        setCacheTimestamp(Date.now())
        
        // Save to cache (with total count) - only store essential data to avoid quota exceeded
        const cacheData = {
          totalCount: mapped.length,
          // Only store first 50 students to avoid localStorage quota issues
          students: mapped.slice(0, 50),
          hasMore: mapped.length > 50
        }
        localStorage.setItem(cacheKey, JSON.stringify(cacheData))
        localStorage.setItem(`${cacheKey}_time`, now.toString())
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
        // Fallback to empty array
        setStudents([])
      } finally {
        setLoading(false)
      }
    }
    
    // Only fetch if userRole is set
    if (userRole) {
      fetchData()
    }
    
    loaderTimeout = setTimeout(() => {
      setShowLoader(false)
    }, 3000)
    return () => clearTimeout(loaderTimeout)
  }, [userRole, userCampus, shiftFilter])

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      // Principal campus filtering is already done in fetchData, so we only need to apply other filters
      if (filters.academicYears.length > 0 && !filters.academicYears.includes(student.academicYear)) return false
      if (filters.campuses.length > 0 && !filters.campuses.includes(student.campus)) return false
      if (filters.grades.length > 0 && !filters.grades.includes(student.grade)) return false
      if (filters.genders.length > 0 && !filters.genders.includes(student.gender)) return false
      if (filters.motherTongues.length > 0 && !filters.motherTongues.includes(student.motherTongue)) return false
      if (filters.religions.length > 0 && !filters.religions.includes(student.religion)) return false
      return true
    })
  }, [filters, students])

  // Filter teachers according to current filters so KPI reacts like charts
  const filteredTeachersCount = useMemo(() => {
    if (!teachers || teachers.length === 0) return 0
    return teachers.filter((t: any) => {
      // Campus filter
      if (filters.campuses.length > 0) {
        const tc = t?.campus
        const teacherCampus = typeof tc === 'object' && tc
          ? (tc.campus_name || tc.name || tc.campus_code || tc.code || '').toString().trim()
          : (tc || '').toString().trim()
        if (!filters.campuses.includes(teacherCampus)) return false
      }
      // Gender filter (if teacher has gender field)
      if (filters.genders.length > 0) {
        const tg = (t?.gender || '').toString()
        if (!filters.genders.includes(tg)) return false
      }
      return true
    }).length
  }, [teachers, filters])

  const metrics = useMemo(() => {
    const totalStudents = filteredStudents.length
    const teachersVisible = filteredTeachersCount
    
    // Calculate real attendance from weekly data (average of present students)
    const averageAttendance = weeklyAttendanceData.length > 0 
      ? Math.round(weeklyAttendanceData.reduce((sum, day) => sum + day.present, 0) / weeklyAttendanceData.length)
      : 0
    
    // Teacher:Student ratio based on filtered students
    const teacherStudentRatio = teachersVisible > 0 ? Math.round(totalStudents / teachersVisible) : 0
    
    // console.log('📊 Metrics calculated')
    
    return { 
      totalStudents, 
      averageAttendance, 
      teachersCount: teachersVisible,
      teacherStudentRatio,
      averageScore: 0, // Removed
      retentionRate: 0 // Removed
    }
  }, [totalStudentsCount, filteredStudents.length, filteredTeachersCount, weeklyAttendanceData])

  // Campus performance data - use filtered students
  const campusPerformanceData = useMemo(() => {
    // Use filtered students for accurate campus counts based on applied filters
    const counts = filteredStudents.reduce((acc: Record<string, number>, s) => {
      const campusName = s.campus || 'Unknown'
      if (campusName !== 'Unknown') {
        acc[campusName] = (acc[campusName] || 0) + 1
      }
      return acc
    }, {})
    const campusData = Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) // Sort by count descending
    
    return campusData
  }, [filteredStudents])

  const chartData = useMemo(() => {
    // Always calculate from filtered students to respect user's filter selections
    // console.log('🔄 Recalculating charts with filters')
    
    const gradeDistribution = getGradeDistribution(filteredStudents as unknown as any[])
    const genderDistribution = getGenderDistribution(filteredStudents as unknown as any[])
    const enrollmentTrend = getEnrollmentTrend(filteredStudents as unknown as any[])
    const motherTongueDistribution = getMotherTongueDistribution(filteredStudents as unknown as any[])
    const religionDistribution = getReligionDistribution(filteredStudents as unknown as any[])
    const ageDistribution = getAgeDistribution(filteredStudents as unknown as any[])
    const zakatStatus = getZakatStatusDistribution(filteredStudents as unknown as any[])
    const houseOwnership = getHouseOwnershipDistribution(filteredStudents as unknown as any[])
    
    const result = {
      gradeDistribution,
      genderDistribution,
      campusPerformance: campusPerformanceData,
      enrollmentTrend,
      motherTongueDistribution,
      religionDistribution,
      ageDistribution,
      zakatStatus,
      houseOwnership,
    }
    
    // console.log('📊 Calculated chart data')
    
    return result
  }, [filteredStudents, campusPerformanceData, filters])

  // Dynamic filter options based on real data
  const collator = useMemo(() => new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }), [])
  const dynamicAcademicYears = useMemo(() => {
    const years = Array.from(new Set(students.map(s => s.academicYear))).sort((a, b) => a - b)
    return years
  }, [students])
  
  const dynamicCampuses = useMemo(() => {
    const campuses = Array.from(new Set(students.map(s => (s.campus || '').toString().trim())))
      .filter(Boolean)
      .sort(collator.compare)
    return campuses
  }, [students, collator])
  
  const dynamicGrades = useMemo(() => {
    const grades = Array.from(new Set(students.map(s => (s.grade || '').toString().trim())))
      .filter(Boolean)
      .sort(collator.compare)
    return grades
  }, [students, collator])
  
  const dynamicMotherTongues = useMemo(() => {
    const motherTongues = Array.from(new Set(students.map(s => (s.motherTongue || "").toString().trim())))
      .filter(Boolean)
      .sort(collator.compare)
    return motherTongues
  }, [students, collator])
  
  const dynamicReligions = useMemo(() => {
    const religions = Array.from(new Set(students.map(s => (s.religion || "").toString().trim())))
      .filter(Boolean)
      .sort(collator.compare)
    return religions
  }, [students, collator])
  
  const dynamicGenders = useMemo(() => {
    const genders = Array.from(new Set(students.map(s => (s.gender || "").toString().trim())))
      .filter(Boolean)
      .sort(collator.compare)
    return genders
  }, [students, collator])

  const resetFilters = () => {
    setIsClearing(true)
    setFilters({ academicYears: [], campuses: [], grades: [], genders: [], motherTongues: [], religions: [] })
    // Allow the refresh icon to animate once
    setTimeout(() => setIsClearing(false), 700)
  }

  // Refresh data function
  const refreshData = async () => {
    setIsRefreshing(true)
    setLoading(true)
    setShowLoader(true)
    try {
      // Clear ALL dashboard cache to force fresh data
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('dashboard_')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
      console.log('🔄 Cleared all dashboard cache for refresh')
      
      // Force re-fetch by calling the useEffect logic directly
      window.location.reload()
    } catch (error) {
      console.error('Error refreshing data:', error)
    } finally {
      setIsRefreshing(false)
      setLoading(false)
      setShowLoader(false)
    }
  }

  // Auto-refresh disabled to prevent cache issues
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     refreshData()
  //   }, 5 * 60 * 1000) // 5 minutes

  //   return () => clearInterval(interval)
  // }, [userRole, userCampus])

  // Clear cache when user role changes (login/logout)
  useEffect(() => {
    if (userRole) {
      try {
        const keysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('dashboard_')) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key))
        console.log('🧹 Cleared cache for user role change')
      } catch (error) {
        console.warn('Error clearing cache on role change:', error)
      }
    }
  }, [userRole])

  // Function to clear old localStorage data to prevent quota exceeded

  // Extract fetchData function to be reusable
  const fetchData = async () => {
    // Clear ALL localStorage cache on every refresh to get fresh data
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('dashboard_')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
      console.log('🧹 Cleared localStorage cache for fresh data')
    } catch (error) {
      console.warn('Error clearing localStorage:', error)
    }
    
    const now = Date.now()
    const cacheKey = `dashboard_${userRole}_${userCampus || 'all'}`
    
    setLoading(true)
    
    try {
      // Fetch teachers count and weekly attendance data
      try {
        const q = shiftFilter && shiftFilter !== 'all' ? `?shift=${encodeURIComponent(shiftFilter)}` : ''
        const teachersResponse: any = await apiGet(`/api/teachers/${q}`)
        const list = Array.isArray(teachersResponse)
          ? teachersResponse
          : (Array.isArray(teachersResponse?.results) ? teachersResponse.results : [])
        setTeachers(list)
        setTeachersCount(list.length)
      } catch (error) {
        console.error('Error fetching teachers:', error)
        setTeachersCount(0)
        setTeachers([])
      }

      // Fetch weekly attendance data (last 7 days)
      try {
        const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        
        // Try to fetch real attendance data
        try {
          const attendanceResponse: any = await apiGet('/api/attendance/')
          
          if (attendanceResponse && Array.isArray(attendanceResponse)) {
            // Process attendance data for last 7 days
            const last7Days = Array.from({ length: 7 }, (_, i) => {
              const date = new Date()
              date.setDate(date.getDate() - (6 - i))
              return date
            })
            
            const weekData = last7Days.map((date) => {
              const dayName = daysOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1]
              const dateStr = date.toISOString().split('T')[0]
              
              // Find attendance records for this date
              const dayRecords = attendanceResponse.filter((record: any) => 
                record.date === dateStr || record.date?.startsWith(dateStr)
              )
              
              // Calculate present/absent from records
              let present = 0
              let absent = 0
              
              dayRecords.forEach((record: any) => {
                if (record.present_count) present += record.present_count
                if (record.absent_count) absent += record.absent_count
              })
              
              return { day: dayName, present, absent }
            })
            
            setWeeklyAttendanceData(weekData)
          } else {
            // Fallback to empty data if API doesn't return array
            const weekData = daysOfWeek.map(day => ({ day, present: 0, absent: 0 }))
            setWeeklyAttendanceData(weekData)
          }
        } catch (apiError) {
          console.error('Error fetching real attendance:', apiError)
          // Fallback to empty data
          const weekData = daysOfWeek.map(day => ({ day, present: 0, absent: 0 }))
          setWeeklyAttendanceData(weekData)
        }
      } catch (error) {
        console.error('Error processing attendance:', error)
      }

      // Principal: Fetch campus-specific data
      if (userRole === 'principal' && userCampus) {
        // Optimize: Only fetch essential data first
        const [apiStudents, caps] = await Promise.all([
          getAllStudents(false, shiftFilter === 'all' ? undefined : shiftFilter),
          getAllCampuses()
        ])
        
        // Fetch stats separately to avoid blocking
        const apiStats = await getDashboardStats()
        
        console.log('📊 API Response:', {
          students: Array.isArray(apiStudents) ? apiStudents.length : 'Not array',
          stats: apiStats,
          campuses: Array.isArray(caps) ? caps.length : 'Not array'
        });
        
        // Filter students by principal's campus
        const studentsArray = Array.isArray(apiStudents) ? apiStudents : [];
        const campusArray = Array.isArray(caps) ? caps : (Array.isArray((caps as any)?.results) ? (caps as any).results : [])
        
        console.log('Total students fetched:', studentsArray.length)
        console.log('Available campuses:', campusArray.map((c: any) => c.campus_name || c.name))
        
        // Find principal's campus ID
        const principalCampus = campusArray.find((c: any) => {
          if (!c) return false;
          return c.campus_name === userCampus || 
                 c.name === userCampus ||
                 c.campus_code === userCampus ||
                 String(c.id) === String(userCampus);
        })
        
        if (principalCampus) {
          console.log('Found principal campus:', principalCampus)
          setPrincipalCampusId(principalCampus.id)
          
          // Filter students by campus
          const campusStudents = studentsArray.filter((student: any) => {
            const studentCampus = student.campus
            if (!studentCampus) return false
            
            // Check if student belongs to this campus
            if (typeof studentCampus === 'object') {
              return studentCampus.id === principalCampus.id || 
                     studentCampus.campus_name === userCampus ||
                     studentCampus.campus_code === userCampus
            } else {
              return String(studentCampus) === String(principalCampus.id) ||
                     studentCampus === userCampus
            }
          })
          
          console.log('Campus students after filtering:', campusStudents.length)
          
          // Map students to dashboard format
          const idToCampusCode = new Map()
          campusArray.forEach((c: any) => {
            if (c?.id && c?.campus_code) {
              idToCampusCode.set(String(c.id), c.campus_code)
            }
          })

          const mapped: DashboardStudent[] = campusStudents.map((item: any, idx: number) => {
            const createdAt = typeof item?.created_at === "string" ? item.created_at : ""
            const year = createdAt ? Number(createdAt.split("-")[0]) : new Date().getFullYear()
            const genderRaw = (item?.gender ?? "").toString().trim()
          const campusCode = (() => {
            const raw = item?.campus
              if (raw && typeof raw === 'object') return String(raw?.campus_code || raw?.code || 'Unknown').trim()
            if (typeof raw === 'number' || typeof raw === 'string') {
              const hit = idToCampusCode.get(String(raw))
              if (hit) return hit
            }
            return 'Unknown'
          })()
            const gradeName = (item?.current_grade ?? "Unknown").toString().trim()
            const motherTongue = (item?.mother_tongue ?? "Other").toString().trim()
            const religion = (item?.religion ?? "Other").toString().trim()
            return {
              rawData: item,
              studentId: String(item?.gr_no || item?.id || idx + 1),
              name: item?.name || "Unknown",
              academicYear: isNaN(year) ? new Date().getFullYear() : year,
              campus: campusCode,
              grade: gradeName,
              current_grade: gradeName,
              gender: genderRaw || "Unknown",
              motherTongue: motherTongue,
              religion: religion,
              attendancePercentage: 0, // Will be calculated from real attendance data
              averageScore: 0, // Removed mock data
              retentionFlag: (item?.current_state || "").toLowerCase() === "active",
              enrollmentDate: createdAt ? new Date(createdAt) : new Date(),
            }
          })
        
        setStudents(mapped)
        setCacheTimestamp(Date.now())
        
        // Save to cache (with total count) - only store essential data to avoid quota exceeded
        const cacheData = {
          totalCount: mapped.length,
          // Only store first 50 students to avoid localStorage quota issues
          students: mapped.slice(0, 50),
          hasMore: mapped.length > 50
        }
        localStorage.setItem(cacheKey, JSON.stringify(cacheData))
        localStorage.setItem(`${cacheKey}_time`, now.toString())
        } else {
          console.warn('Principal campus not found in API response')
          setStudents([])
        }
      } else {
        // Super Admin: Fetch all data
        const [apiStudents, caps, apiStats] = await Promise.all([
          getAllStudents(false, shiftFilter === 'all' ? undefined : shiftFilter),
          getAllCampuses(),
          getDashboardStats()
        ])
        
        console.log('📊 Super Admin API Response:', {
          students: Array.isArray(apiStudents) ? apiStudents.length : 'Not array',
          stats: apiStats,
          campuses: Array.isArray(caps) ? caps.length : 'Not array'
        });
        
        const studentsArray = Array.isArray(apiStudents) ? apiStudents : [];
        const campusArray = Array.isArray(caps) ? caps : (Array.isArray((caps as any)?.results) ? (caps as any).results : [])
        
        // Map all students
        const idToCampusCode = new Map()
        campusArray.forEach((c: any) => {
          if (c?.id && c?.campus_code) {
            idToCampusCode.set(String(c.id), c.campus_code)
          }
        })

        const mapped: DashboardStudent[] = studentsArray.map((item: any, idx: number) => {
            const createdAt = typeof item?.created_at === "string" ? item.created_at : ""
            const year = createdAt ? Number(createdAt.split("-")[0]) : new Date().getFullYear()
            const genderRaw = (item?.gender ?? "").toString().trim()
          const campusCode = (() => {
            const raw = item?.campus
              if (raw && typeof raw === 'object') return String(raw?.campus_code || raw?.code || 'Unknown').trim()
            if (typeof raw === 'number' || typeof raw === 'string') {
              const hit = idToCampusCode.get(String(raw))
              if (hit) return hit
            }
            return 'Unknown'
          })()
            const gradeName = (item?.current_grade ?? "Unknown").toString().trim()
            const motherTongue = (item?.mother_tongue ?? "Other").toString().trim()
            const religion = (item?.religion ?? "Other").toString().trim()
            return {
              rawData: item,
              studentId: String(item?.gr_no || item?.id || idx + 1),
              name: item?.name || "Unknown",
              academicYear: isNaN(year) ? new Date().getFullYear() : year,
              campus: campusCode,
              grade: gradeName,
              current_grade: gradeName,
              gender: genderRaw || "Unknown",
              motherTongue: motherTongue,
              religion: religion,
              attendancePercentage: 0, // Will be calculated from real attendance data
              averageScore: 0, // Removed mock data
              retentionFlag: (item?.current_state || "").toLowerCase() === "active",
              enrollmentDate: createdAt ? new Date(createdAt) : new Date(),
            }
          })
        
        setStudents(mapped)
        setTotalStudentsCount(mapped.length)
        setCacheTimestamp(Date.now())
        
        // Save to cache (with total count) - only store essential data to avoid quota exceeded
        const cacheData = {
          totalCount: mapped.length,
          // Only store first 50 students to avoid localStorage quota issues
          students: mapped.slice(0, 50),
          hasMore: mapped.length > 50
        }
        localStorage.setItem(cacheKey, JSON.stringify(cacheData))
        localStorage.setItem(`${cacheKey}_time`, now.toString())
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
        // Fallback to empty array
        setStudents([])
      } finally {
        setLoading(false)
      }
    }

  if (loading || showLoader) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Greeting */}
          <div className="mb-6">
              <div className="rounded-2xl bg-white/60 backdrop-blur border border-gray-200 p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <Skeleton className="h-6 w-full sm:w-48" />
                <Skeleton className="h-8 w-full sm:w-24" />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 rounded-2xl bg-[#E7ECEF] p-4 shadow-lg">
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 w-full sm:w-36" />
              <Skeleton className="h-10 w-full sm:w-40" />
              <Skeleton className="h-10 w-full sm:w-32" />
              <Skeleton className="h-10 w-full sm:w-36" />
              <Skeleton className="h-10 w-full sm:w-40" />
              <Skeleton className="h-10 w-full sm:w-32" />
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-white p-5 shadow-sm border">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
                  <Skeleton className="h-4 w-full sm:w-24" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-full sm:w-28 mb-2" />
                <Skeleton className="h-3 w-full sm:w-40" />
              </div>
            ))}
          </div>

          {/* Charts rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8">
            <CardSkeleton />
            <CardSkeleton />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8">
            <CardSkeleton />
            <CardSkeleton />
          </div>

          <div className="grid grid-cols-1 gap-4 md:gap-6 mt-8">
            <CardSkeleton />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto" id="dashboard-print-root">
        {/* User Greeting */}
        <div ref={greetingRef}>
        <UserGreeting className="mb-6" />
        </div>

        {/* Filters Card */}
        <Card className="!bg-[#E7ECEF] shadow-lg mb-6 no-print">
          <CardHeader className="!bg-[#E7ECEF]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-4">
              <div className="flex gap-2 items-center w-full sm:w-auto flex-wrap">
                <Button onClick={resetFilters} variant="outline" className="flex-1 sm:flex-none transition-all duration-150 ease-in-out transform hover:shadow-lg active:scale-95 active:shadow-md">
                  <span className="inline-flex items-center gap-2"><RefreshCcw className={`h-4 w-4 transition-transform duration-500 ${isClearing ? 'rotate-[360deg]' : 'rotate-0'}`} /> <span>Reset Filters</span></span>
                </Button>
                <div className="relative flex-1 sm:flex-none">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                        aria-label="More actions"
                        className="px-3 py-2 rounded-lg shadow hover:bg-gray-100 w-full sm:w-auto transition-all duration-150 ease-in-out transform hover:shadow-lg active:scale-95 active:shadow-md"
                      >
                        <EllipsisVertical className="h-5 w-5"/>
                        <span className="ml-2 hidden sm:inline">Exports</span>
                  </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={handlePrintDashboard}>
                        Print / Save PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setCustomExportOpen(true)}>
                        Export Custom
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>            
            </div>
          </CardHeader>
          <CardContent className="!bg-[#E7ECEF]">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <MultiSelectFilter title="Academic Year" options={dynamicAcademicYears} selectedValues={filters.academicYears} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, academicYears: val as number[] }))} placeholder="All years" />
              {/* Hide campus filter for principal - they only see their campus data */}
              {userRole !== 'principal' && (
              <MultiSelectFilter title="Campus" options={dynamicCampuses} selectedValues={filters.campuses} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, campuses: val as string[] }))} placeholder="All campuses" />
              )}
              <MultiSelectFilter title="Grade" options={dynamicGrades} selectedValues={filters.grades} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, grades: val as string[] }))} placeholder="All grades" />
              <MultiSelectFilter title="Gender" options={dynamicGenders} selectedValues={filters.genders} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, genders: val as ("Male" | "Female" | "Other")[] }))} placeholder="All genders" />
              <MultiSelectFilter title="Mother Tongue" options={dynamicMotherTongues} selectedValues={filters.motherTongues} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, motherTongues: val as string[] }))} placeholder="All mother tongues" />
              <MultiSelectFilter title="Religion" options={dynamicReligions} selectedValues={filters.religions} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, religions: val as string[] }))} placeholder="All religions" />
              {/* Shift filter (principal only) */}
              {userRole === 'principal' && (
                <MultiSelectFilter
                  title="Shift"
                  options={["All", "Morning", "Afternoon", "Both"]}
                  selectedValues={[
                    shiftFilter === 'all' ? 'All' :
                    shiftFilter === 'morning' ? 'Morning' :
                    shiftFilter === 'afternoon' ? 'Afternoon' : 'Both'
                  ]}
                  onSelectionChange={(val) => {
                    // For single selection, replace the entire array with the new selection
                    const newSelection = val as (string | number)[]
                    const choice = String(newSelection[newSelection.length - 1] || 'All')
                    const normalized = choice.toLowerCase()
                    setShiftFilter(normalized)
                    // console.log('Shift filter changed to:', normalized, 'from selection:', newSelection)
                  }}
                  placeholder="All shifts"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div ref={kpisRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-8">
          <KpiCard 
            title={userRole === 'principal' && userCampus ? `${userCampus} Students` : "Total Students"} 
            value={metrics.totalStudents} 
            description={userRole === 'principal' && userCampus ? "Campus enrollments" : "Active enrollments"} 
            icon={Users} 
            bgColor="#274C77" 
            textColor="text-white" 
          />
          <KpiCard 
            title="Avg Attendance" 
            value={`${metrics.averageAttendance}`} 
            description="Daily average present students" 
            icon={Users} 
            bgColor="#adb5bd" 
            textColor="text-white" 
          />
          <KpiCard 
            title="Total Teachers" 
            value={metrics.teachersCount} 
            description="Active teaching staff" 
            icon={GraduationCap} 
            bgColor="#669bbc" 
            textColor="text-white" 
          />
          <KpiCard 
            title="Teacher:Student Ratio" 
            value={`1:${metrics.teacherStudentRatio}`} 
            description="Students per teacher" 
            icon={UsersRound} 
            bgColor="#BDC3C7" 
            textColor="text-white" 
          />
        </div>

        {/* Row 1: Gender & Religion */}
        <div ref={genderReligionRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8 items-stretch">
          <div ref={genderChartRef}>
          <GenderDistributionChart data={chartData.genderDistribution} />
          </div>
          <div ref={religionChartRef}>
          <ReligionChart data={chartData.religionDistribution} />
          </div>
        </div>

        {/* Row 2: Mother Tongue & Enrollment Trend */}
        <div ref={motherEnrollmentRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8 items-stretch">
          <div ref={motherTongueChartRef}>
          <MotherTongueChart data={chartData.motherTongueDistribution} />
          </div>
          <div ref={enrollmentTrendChartRef}>
          <EnrollmentTrendChart data={chartData.enrollmentTrend.map((t: any) => ({ name: String(t.year), value: t.enrollment }))} />
          </div>
        </div>

        {/* Row 3: Grade Distribution - Full Width (only for non-principal) */}
        {userRole !== 'principal' && (
        <div ref={gradeDistributionRef} className="grid grid-cols-1 gap-4 md:gap-6 mt-8">
            <GradeDistributionChart data={chartData.gradeDistribution} />
        </div>
        )}

        {/* Row 4: Weekly Attendance & Age Distribution */}
        <div ref={weeklyAgeRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8 items-stretch">
          <div ref={weeklyAttendanceChartRef}>
          <WeeklyAttendanceChart data={weeklyAttendanceData} />
          </div>
          <div ref={ageDistributionChartRef}>
          <AgeDistributionChart data={chartData.ageDistribution} />
          </div>
        </div>

        {/* Row 5: Zakat Status & House Ownership */}
        <div ref={zakatHouseRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8 items-stretch">
          <div ref={zakatStatusChartRef}>
          <ZakatStatusChart data={chartData.zakatStatus} />
          </div>
          <div ref={houseOwnershipChartRef}>
          <HouseOwnershipChart data={chartData.houseOwnership} />
        </div>
      </div>
      </div>
      {/* Custom Export Modal */}
      {customExportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCustomExportOpen(false)} />
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border-2 border-[#274c77]">
            <div className="px-5 py-3 bg-gradient-to-r from-[#274c77] to-[#6096ba] text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Export Custom Report</h3>
                <p className="text-xs opacity-90">Select sections to include in your report</p>
              </div>
              <button className="rounded-full h-8 w-8 hover:bg-white/20" onClick={() => setCustomExportOpen(false)}>×</button>
            </div>
            <div className="p-4 grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.greeting} onChange={(e) => setSelectedSections(s => ({...s, greeting: e.target.checked}))} /> Greeting</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.kpis} onChange={(e) => setSelectedSections(s => ({...s, kpis: e.target.checked}))} /> KPI Cards</label>
              <div className="mt-2 text-xs font-semibold text-gray-500">Charts</div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.gender} onChange={(e) => setSelectedSections(s => ({...s, gender: e.target.checked}))} /> Gender</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.religion} onChange={(e) => setSelectedSections(s => ({...s, religion: e.target.checked}))} /> Religion</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.motherTongue} onChange={(e) => setSelectedSections(s => ({...s, motherTongue: e.target.checked}))} /> Mother Tongue</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.enrollmentTrend} onChange={(e) => setSelectedSections(s => ({...s, enrollmentTrend: e.target.checked}))} /> Enrollment Trend</label>
              {userRole !== 'principal' && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.gradeDistribution} onChange={(e) => setSelectedSections(s => ({...s, gradeDistribution: e.target.checked}))} /> Grade Distribution</label>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.weeklyAttendance} onChange={(e) => setSelectedSections(s => ({...s, weeklyAttendance: e.target.checked}))} /> Weekly Attendance</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.ageDistribution} onChange={(e) => setSelectedSections(s => ({...s, ageDistribution: e.target.checked}))} /> Age Distribution</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.zakatStatus} onChange={(e) => setSelectedSections(s => ({...s, zakatStatus: e.target.checked}))} /> Zakat Status</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.houseOwnership} onChange={(e) => setSelectedSections(s => ({...s, houseOwnership: e.target.checked}))} /> House Ownership</label>
            </div>
            <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setCustomExportOpen(false)} className="px-4 py-2 text-sm">Cancel</Button>
              <Button onClick={handleCustomExport} className="px-4 py-2 text-sm bg-[#274c77] text-white hover:bg-[#274c77]/90">Generate</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}