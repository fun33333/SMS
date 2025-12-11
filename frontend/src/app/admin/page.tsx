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
import { Skeleton, CardSkeleton, ChartSkeleton, KpiCardSkeleton } from "@/components/ui/skeleton"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { getGradeDistribution, getGenderDistribution, getEnrollmentTrend, getMotherTongueDistribution, getReligionDistribution, getAgeDistribution, getZakatStatusDistribution, getHouseOwnershipDistribution } from "@/lib/chart-utils"
import type { FilterState, LegacyStudent as DashboardStudent } from "@/types/dashboard"
import { useRouter } from "next/navigation"
import { getDashboardStats, getAllStudents, getAllCampuses, apiGet, getCurrentUserProfile, getFilteredStudents, getDashboardChartData } from "@/lib/api"
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
  const hasInitialChartsLoadedRef = useRef(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
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

  const [userCampus, setUserCampus] = useState<string>("");
  const [allCampuses, setAllCampuses] = useState<any[]>([]);
  const [, setPrincipalShift] = useState<string>("both");

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
  const [loading, setLoading] = useState(false) // Start with false to show UI immediately
  const [showLoader, setShowLoader] = useState(false) // Don't show full loader initially
  const [, setPrincipalCampusId] = useState<number | null>(null)
  const [, setCacheTimestamp] = useState<number>(0)
  const [totalStudentsCount, setTotalStudentsCount] = useState<number>(0)
  const [, setTeachersCount] = useState<number>(0)
  const [teachers, setTeachers] = useState<any[]>([])
  const [weeklyAttendanceData, setWeeklyAttendanceData] = useState<any[]>([]) // Weekly attendance data
  const [, setIsRefreshing] = useState<boolean>(false) // Refresh state
  const [shiftFilter, setShiftFilter] = useState<string>("all");

  // Progressive loading states for different sections
  const [kpisLoading, setKpisLoading] = useState(true)
  const [chartsLoading, setChartsLoading] = useState(true)
  const [filtersLoading, setFiltersLoading] = useState(true)

  // State for API chart data (optimized endpoints)
  const [apiChartData, setApiChartData] = useState<any>(null)

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
      if (!userRole) return;

      try {
        // Set all loading states at once
        setKpisLoading(true)
        setChartsLoading(true)
        setFiltersLoading(true)

        // OPTIMIZED: Fetch ALL data in parallel (KPIs, charts, filters) - Single load!
        const [kpiAndChartData, filterData] = await Promise.all([
          // Combined KPI + Chart data fetch
          (async () => {
            // For principals, we need campus-filtered count, for superadmin use total stats
            const countPromise = userRole === 'principal' && userCampus
              ? (async () => {
                try {
                  const campuses = await getAllCampuses().catch(() => [])
                  const campusArray = Array.isArray(campuses) ? campuses : (Array.isArray((campuses as any)?.results) ? (campuses as any).results : [])
                  const principalCampus = campusArray.find((c: any) => {
                    if (!c) return false;
                    return c.campus_name === userCampus ||
                      c.name === userCampus ||
                      c.campus_code === userCampus ||
                      String(c.id) === String(userCampus);
                  })

                  if (principalCampus) {
                    const countResp: any = await getFilteredStudents({
                      page: 1,
                      page_size: 1,
                      current_state: 'active',
                      campus: Number(principalCampus.id),
                      shift: shiftFilter !== 'all' ? shiftFilter : undefined
                    })
                    return countResp?.count || 0
                  }
                  return 0
                } catch {
                  return 0
                }
              })()
              : getDashboardStats().then(stats => stats.totalStudents || 0).catch(() => 0)

            const chartParams: any = {
              enrollment_year: filters.academicYears,
              campus: userRole === 'principal' && userCampus ? undefined : campusFilterIds,
              current_grade: filters.grades,
              gender: (filters.genders || []).map((g: any) => String(g).toLowerCase()),
              shift: shiftFilter !== 'all' ? shiftFilter : undefined,
            }

            // Fetch KPIs and Charts in parallel
            const [studentsCount, teachersResponse, attendanceResponse, chartDataResponse] = await Promise.all([
              countPromise,
              (async () => {
                try {
                  const q = shiftFilter && shiftFilter !== 'all' ? `?shift=${encodeURIComponent(shiftFilter)}` : ''
                  const response: any = await apiGet(`/api/teachers/${q}`)
                  return Array.isArray(response) ? response : (Array.isArray(response?.results) ? response.results : [])
                } catch {
                  return []
                }
              })(),
              (async () => {
                try {
                  const campusIdParam = campusFilterIds && campusFilterIds.length > 0
                    ? `?campus=${encodeURIComponent(String(campusFilterIds[0]))}`
                    : ''
                  const resp: any = await apiGet(`/api/attendance/${campusIdParam}`)
                  return Array.isArray(resp) ? resp : []
                } catch {
                  return []
                }
              })(),
              getDashboardChartData(chartParams).catch((error) => {
                console.error('Error fetching chart data:', error)
                return {
                  gradeDistribution: [],
                  genderDistribution: [],
                  enrollmentTrend: [],
                  motherTongueDistribution: [],
                  religionDistribution: [],
                  campusPerformance: [],
                  ageDistribution: [],
                  zakatStatus: [],
                  houseOwnership: []
                }
              })
            ])

            return { studentsCount, teachersResponse, attendanceResponse, chartDataResponse }
          })(),

          // Filter data fetch
          (async () => {
            const [campuses, filterStudentsResponse] = await Promise.all([
              getAllCampuses().catch(() => []),
              getFilteredStudents({
                page: 1,
                page_size: 100,
                current_state: 'active'
              }).catch(() => ({ results: [], count: 0, next: null, previous: null }))
            ])
            return { campuses, filterStudentsResponse }
          })()
        ])

        // Process all data
        const { studentsCount, teachersResponse, attendanceResponse, chartDataResponse } = kpiAndChartData
        const { campuses, filterStudentsResponse } = filterData

        // Process weekly attendance
        const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        let weeklyData: any[] = []

        if (Array.isArray(attendanceResponse)) {
          const last7Days = Array.from({ length: 7 }, (_, i) => {
            const date = new Date()
            date.setDate(date.getDate() - (6 - i))
            return date
          })

          const weekData = last7Days.map((date) => {
            const dayName = daysOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1]
            const dateStr = date.toISOString().split('T')[0]
            const dayRecords = attendanceResponse.filter((record: any) =>
              record.date === dateStr || record.date?.startsWith(dateStr)
            )

            let present = 0
            let absent = 0
            dayRecords.forEach((record: any) => {
              if (record.present_count) present += record.present_count
              if (record.absent_count) absent += record.absent_count
            })

            const totalStudentsInRecords = dayRecords.reduce((sum: number, record: any) => {
              return sum + (record.total_students || 0)
            }, 0)

            return { day: dayName, present, absent, totalStudentsInRecords }
          })
          weeklyData = weekData.filter((item: any) => item.day !== 'Sun')
        } else {
          const weekDaysWithoutSunday = daysOfWeek.filter(day => day !== 'Sun')
          weeklyData = weekDaysWithoutSunday.map(day => ({ day, present: 0, absent: 0 }))
        }

        // Transform chart data
        const transformedChartData = {
          gradeDistribution: (chartDataResponse.gradeDistribution || []).map((item: any) => ({
            name: item.name || item.grade,
            value: item.value || item.count || 0
          })),
          genderDistribution: chartDataResponse.genderDistribution || [],
          enrollmentTrend: (chartDataResponse.enrollmentTrend || []).map((item: any) => {
            const year = item.year || item.name
            const value = item.enrollment || item.value || item.count || 0
            return {
              name: String(year || ''),
              value: Number(value)
            }
          }),
          motherTongueDistribution: chartDataResponse.motherTongueDistribution || [],
          religionDistribution: chartDataResponse.religionDistribution || [],
          ageDistribution: (chartDataResponse.ageDistribution || []).map((item: any) => {
            const age = item.age
            const name = item.name || (age !== undefined ? `Age ${age}` : 'Unknown')
            const value = item.value || item.count || 0
            return {
              name: String(name),
              value: Number(value)
            }
          }),
          zakatStatus: (chartDataResponse.zakatStatus || []).map((item: any) => ({
            name: item.name || item.status || 'Unknown',
            value: item.value || item.count || 0
          })),
          houseOwnership: (chartDataResponse.houseOwnership || []).map((item: any) => ({
            name: item.name || item.status || 'Unknown',
            value: item.value || item.count || 0
          }))
        }

        // Process filter data
        const studentsArray = filterStudentsResponse.results || []
        const campusArray = Array.isArray(campuses) ? campuses : (Array.isArray((campuses as any)?.results) ? (campuses as any).results : [])

        const idToCampusCode = new Map<string, string>(
          campusArray.map((c: any) => [String(c.id), String(c.campus_code || c.code || '')])
        )

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
            attendancePercentage: 0,
            averageScore: 0,
            retentionFlag: (item?.current_state || "").toLowerCase() === "active",
            enrollmentDate: createdAt ? new Date(createdAt) : new Date(),
          }
        })

        // Calculate derived total from chart data
        const derivedTotal = (transformedChartData.genderDistribution || []).reduce((sum: number, item: any) => sum + Number(item.value || 0), 0)
        const finalStudentCount = derivedTotal >= 0 ? derivedTotal : studentsCount

        // BATCH ALL STATE UPDATES TOGETHER - Single re-render!
        setTotalStudentsCount(finalStudentCount)
        setTeachers(teachersResponse)
        setTeachersCount(teachersResponse.length)
        setWeeklyAttendanceData(weeklyData)
        setApiChartData(transformedChartData)
        setAllCampuses(campusArray)
        setStudents(mapped)

        // Turn off all loading states together
        setKpisLoading(false)
        setChartsLoading(false)
        setFiltersLoading(false)
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
        setKpisLoading(false)
        setChartsLoading(false)
        setFiltersLoading(false)
      }
    }

    // Only fetch if userRole is set
    if (userRole) {
      fetchData()
    }
  }, [userRole, userCampus, shiftFilter])

  // Map selected campus labels (e.g., "Campus 6" or "C06") to backend IDs
  // so that Django's ModelChoiceFilter(campus=...) receives valid PK values.
  const campusFilterIds = useMemo(() => {
    if (!filters.campuses.length || !allCampuses.length) return undefined

    const labelToId = new Map<string, number>()
    allCampuses.forEach((c: any) => {
      const label = (c.campus_name || c.name || c.campus_code || c.code || '').toString().trim()
      if (label) {
        labelToId.set(label, Number(c.id))
      }
    })

    const ids = filters.campuses
      .map((label) => labelToId.get(String(label)))
      .filter((v): v is number => v !== undefined)

    return ids.length ? ids : undefined
  }, [filters.campuses, allCampuses])

  // Refetch weekly attendance when campus filter or shift changes
  useEffect(() => {
    if (!userRole) return
    let cancelled = false

    async function fetchWeeklyAttendance() {
      try {
        const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        const campusIdParam =
          campusFilterIds && campusFilterIds.length > 0
            ? `?campus=${encodeURIComponent(String(campusFilterIds[0]))}`
            : ''

        const attendanceResponse: any = await apiGet(`/api/attendance/${campusIdParam}`).catch(() => [])

        if (cancelled) return

        if (attendanceResponse && Array.isArray(attendanceResponse)) {
          const last7Days = Array.from({ length: 7 }, (_, i) => {
            const date = new Date()
            date.setDate(date.getDate() - (6 - i))
            return date
          })

          const weekData = last7Days.map((date) => {
            const dayName = daysOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1]
            const dateStr = date.toISOString().split('T')[0]
            const dayRecords = attendanceResponse.filter((record: any) =>
              record.date === dateStr || record.date?.startsWith(dateStr)
            )

            let present = 0
            let absent = 0
            dayRecords.forEach((record: any) => {
              if (record.present_count) present += record.present_count
              if (record.absent_count) absent += record.absent_count
            })

            const totalStudentsInRecords = dayRecords.reduce((sum: number, record: any) => {
              return sum + (record.total_students || 0)
            }, 0)

            return { day: dayName, present, absent, totalStudentsInRecords }
          })

          const filteredWeekData = weekData.filter((item: any) => item.day !== 'Sun')
          setWeeklyAttendanceData(filteredWeekData)
        } else {
          const weekDaysWithoutSunday = daysOfWeek.filter(day => day !== 'Sun')
          setWeeklyAttendanceData(weekDaysWithoutSunday.map(day => ({ day, present: 0, absent: 0 })))
        }
      } catch (e) {
        console.error('Error fetching weekly attendance for campus filter:', e)
      }
    }

    fetchWeeklyAttendance()
    return () => { cancelled = true }
  }, [campusFilterIds, shiftFilter, userRole])

  // Refetch charts when filters change (so charts always reflect selected filters)
  useEffect(() => {
    let cancelled = false
    async function refetchChartsForFilters() {
      // Skip until role known
      if (!userRole) return
      // On very first load, main fetchData already fetched charts,
      // so we just mark as loaded and skip this effect once to avoid
      // double-loading and duplicate chart flashes.
      if (!hasInitialChartsLoadedRef.current) {
        hasInitialChartsLoadedRef.current = true
        return
      }
      setChartsLoading(true)
      try {
        const chartParams: any = {
          enrollment_year: filters.academicYears,
          campus: userRole === 'principal' && userCampus ? undefined : campusFilterIds,
          current_grade: filters.grades,
          gender: (filters.genders || []).map((g: any) => String(g).toLowerCase()),
          // mother_tongue: filters.motherTongues, // disabled
          // religion: filters.religions, // disabled
          shift: shiftFilter !== 'all' ? shiftFilter : undefined,
        }
        const chartDataResponse = await getDashboardChartData(chartParams)
        if (cancelled) return
        const transformedChartData = {
          gradeDistribution: (chartDataResponse.gradeDistribution || []).map((item: any) => ({
            name: item.name || item.grade,
            value: item.value || item.count || 0
          })),
          genderDistribution: chartDataResponse.genderDistribution || [],
          enrollmentTrend: (chartDataResponse.enrollmentTrend || []).map((item: any) => ({
            name: String(item.year || item.name || ''),
            value: item.enrollment || item.value || item.count || 0
          })),
          motherTongueDistribution: chartDataResponse.motherTongueDistribution || [],
          religionDistribution: chartDataResponse.religionDistribution || [],
          ageDistribution: (chartDataResponse.ageDistribution || []).map((item: any) => ({
            name: item.name || `Age ${item.age}`,
            value: item.value || item.count || 0
          })),
          zakatStatus: (chartDataResponse.zakatStatus || []).map((item: any) => ({
            name: item.name || item.status || 'Unknown',
            value: item.value || item.count || 0
          })),
          houseOwnership: (chartDataResponse.houseOwnership || []).map((item: any) => ({
            name: item.name || item.status || 'Unknown',
            value: item.value || item.count || 0
          })),
          campusPerformance: (chartDataResponse.campusPerformance || []).map((c: any) => ({ name: c.name, value: c.value }))
        }
        setApiChartData(transformedChartData)
        // Update KPI total based on filtered aggregates
        const derivedTotal = (transformedChartData.genderDistribution || []).reduce((sum: number, item: any) => sum + Number(item.value || 0), 0)
        if (derivedTotal >= 0) {
          setTotalStudentsCount(derivedTotal)
        }
      } catch (e) {
        console.error('Error refetching charts for filters:', e)
      } finally {
        if (!cancelled) setChartsLoading(false)
      }
    }
    refetchChartsForFilters()
    return () => { cancelled = true }
  }, [filters, shiftFilter, userRole, userCampus])

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
        // Normalise teacher's campus label so it matches what we show
        // in the campus filter ("Campus 4", "Campus 6", etc.).
        const rawCampus =
          // 1) Dedicated serializer field
          t?.campus_name ||
          // 2) Nested campus data
          t?.campus_data?.campus_name ||
          t?.campus_data?.name ||
          t?.campus_data?.campus_code ||
          t?.campus_data?.code ||
          // 3) Fallbacks
          t?.current_campus?.campus_name ||
          t?.current_campus?.campus_code ||
          t?.campus ||
          ''

        const teacherCampus = String(rawCampus).trim()
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
    // Use totalStudentsCount from API (actual count), not filteredStudents.length (which is only 100 for filters)
    const totalStudents = totalStudentsCount > 0 ? totalStudentsCount : filteredStudents.length
    const teachersVisible = filteredTeachersCount


    const today = new Date()
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const todayDayName = daysOfWeek[today.getDay() === 0 ? 6 : today.getDay() - 1] // Convert Sunday=0 to Monday=1

    const todayData = weeklyAttendanceData.find((day: any) => day.day === todayDayName)
    const averageAttendance = todayData
      ? (() => {
        const present = todayData.present || 0
        const absentFromRecords = todayData.absent || 0
        const totalStudentsInRecords = todayData.totalStudentsInRecords || 0

        // Total students = actual total students count (from API)
        const totalStudentsCount = totalStudents > 0 ? totalStudents : 0

        // Students without attendance records = Total - Students in records
        const studentsWithoutRecords = totalStudentsCount > totalStudentsInRecords
          ? totalStudentsCount - totalStudentsInRecords
          : 0

        // Final absent = Absent from records + Students without records
        const totalAbsent = absentFromRecords + studentsWithoutRecords

        // Total for calculation = Present + Total Absent
        const totalForCalculation = present + totalAbsent

        if (totalForCalculation > 0) {
          return Math.round((present / totalForCalculation) * 100)
        }
        return 0
      })()
      : 0

    // Teacher:Student ratio based on actual student count
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
    // Use API chart data if available (optimized), otherwise fallback to client-side calculation
    if (apiChartData && !chartsLoading) {
      return {
        ...apiChartData,
        campusPerformance: campusPerformanceData,
      }
    }

    // Fallback: Calculate from filtered students (slower, but works if API fails)
    const gradeDistribution = getGradeDistribution(filteredStudents as unknown as any[])
    const genderDistribution = getGenderDistribution(filteredStudents as unknown as any[])
    const enrollmentTrend = getEnrollmentTrend(filteredStudents as unknown as any[])
    const motherTongueDistribution = getMotherTongueDistribution(filteredStudents as unknown as any[])
    const religionDistribution = getReligionDistribution(filteredStudents as unknown as any[])
    const ageDistribution = getAgeDistribution(filteredStudents as unknown as any[])
    const zakatStatus = getZakatStatusDistribution(filteredStudents as unknown as any[])
    const houseOwnership = getHouseOwnershipDistribution(filteredStudents as unknown as any[])

    return {
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
  }, [apiChartData, chartsLoading, filteredStudents, campusPerformanceData, filters])

  // Dynamic filter options based on real data
  const collator = useMemo(() => new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }), [])
  const dynamicAcademicYears = useMemo(() => {
    if (apiChartData && !chartsLoading) {
      const years = Array.from(new Set((apiChartData.enrollmentTrend || []).map((e: any) => {
        const n = Number(String(e.name || e.year))
        return isNaN(n) ? null : n
      }).filter(Boolean))).sort((a, b) => (Number(a) - Number(b))) as number[]
      return years as number[]
    }
    const years = Array.from(new Set(students.map(s => s.academicYear))).sort((a, b) => a - b)
    return years as number[]
  }, [apiChartData, chartsLoading, students])

  const dynamicCampuses = useMemo(() => {
    // Prefer full campus list from backend so we show campuses
    // even if they currently have 0 students.
    if (allCampuses && allCampuses.length > 0) {
      const campuses = Array.from(
        new Set(
          allCampuses.map((c: any) =>
            (c.campus_name || c.name || c.campus_code || c.code || '').toString().trim()
          )
        )
      )
        .filter(Boolean)
        .sort((a, b) => collator.compare(a as string, b as string))
      return campuses as string[]
    }

    // Fallbacks based on chart data or students (legacy behaviour)
    if (apiChartData && !chartsLoading && Array.isArray(apiChartData.campusPerformance)) {
      const campuses = Array.from(new Set(apiChartData.campusPerformance.map((c: any) => (c.name || '').toString().trim())))
        .filter(Boolean)
        .sort((a, b) => collator.compare(a as string, b as string))
      return campuses as string[]
    }
    const campuses = Array.from(new Set(students.map(s => (s.campus || '').toString().trim())))
      .filter(Boolean)
      .sort((a, b) => collator.compare(a as string, b as string))
    return campuses as string[]
  }, [allCampuses, apiChartData, chartsLoading, students, collator])

  const dynamicGrades = useMemo(() => {
    // Desired logical order for grade labels coming from backend normalization
    const gradeOrder = [
      "Special Class",
      "Nursery",
      "KG-I",
      "KG-II",
      "Grade 1",
      "Grade 2",
      "Grade 3",
      "Grade 4",
      "Grade 5",
      "Grade 6",
      "Grade 7",
      "Grade 8",
      "Grade 9",
      "Grade 10",
      "Unknown Grade",
    ]

    const sortByCustomGradeOrder = (arr: string[]) => {
      return [...arr].sort((a, b) => {
        const ia = gradeOrder.indexOf(a)
        const ib = gradeOrder.indexOf(b)
        const aRank = ia === -1 ? gradeOrder.length + 1 : ia
        const bRank = ib === -1 ? gradeOrder.length + 1 : ib
        if (aRank !== bRank) return aRank - bRank
        // Fallback to locale compare for any unknown labels
        return collator.compare(a, b)
      })
    }

    if (apiChartData && !chartsLoading) {
      const grades = Array.from(
        new Set(
          (apiChartData.gradeDistribution || []).map((g: any) =>
            (g.name || "").toString().trim()
          )
        )
      ).filter(Boolean) as string[]

      return sortByCustomGradeOrder(grades)
    }

    const grades = Array.from(
      new Set(
        students.map((s) => (s.grade || "").toString().trim())
      )
    ).filter(Boolean) as string[]

    return sortByCustomGradeOrder(grades)
  }, [apiChartData, chartsLoading, students, collator])

  const dynamicMotherTongues = useMemo(() => {
    if (apiChartData && !chartsLoading) {
      const motherTongues = Array.from(new Set((apiChartData.motherTongueDistribution || []).map((m: any) => (m.name || '').toString().trim())))
        .filter(Boolean)
        .sort((a, b) => collator.compare(a as string, b as string))
      return motherTongues as string[]
    }
    const motherTongues = Array.from(new Set(students.map(s => (s.motherTongue || "").toString().trim())))
      .filter(Boolean)
      .sort((a, b) => collator.compare(a as string, b as string))
    return motherTongues as string[]
  }, [apiChartData, chartsLoading, students, collator])

  const dynamicReligions = useMemo(() => {
    if (apiChartData && !chartsLoading) {
      const religions = Array.from(new Set((apiChartData.religionDistribution || []).map((r: any) => (r.name || '').toString().trim())))
        .filter(Boolean)
        .sort((a, b) => collator.compare(a as string, b as string))
      return religions as string[]
    }
    const religions = Array.from(new Set(students.map(s => (s.religion || "").toString().trim())))
      .filter(Boolean)
      .sort((a, b) => collator.compare(a as string, b as string))
    return religions as string[]
  }, [apiChartData, chartsLoading, students, collator])

  const dynamicGenders = useMemo(() => {
    if (apiChartData && !chartsLoading) {
      const genders = Array.from(new Set((apiChartData.genderDistribution || []).map((g: any) => (g.name || '').toString().trim())))
        .filter(Boolean)
        .sort((a, b) => collator.compare(a as string, b as string))
      return genders as string[]
    }
    const genders = Array.from(new Set(students.map(s => (s.gender || "").toString().trim())))
      .filter(Boolean)
      .sort((a, b) => collator.compare(a as string, b as string))
    return genders as string[]
  }, [apiChartData, chartsLoading, students, collator])

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

            const weekData = last7Days
              .map((date) => {
                const dayName = daysOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1]
                const dateStr = date.toISOString().split('T')[0]

                // Find attendance records for this date
                const dayRecords = attendanceResponse.filter((record: any) =>
                  record.date === dateStr || record.date?.startsWith(dateStr)
                )

                // Calculate present/absent from records and total students
                let present = 0
                let absent = 0
                let totalStudentsInRecords = 0

                dayRecords.forEach((record: any) => {
                  if (record.present_count) present += record.present_count
                  if (record.absent_count) absent += record.absent_count
                  if (record.total_students) totalStudentsInRecords += record.total_students
                })

                return { day: dayName, present, absent, totalStudentsInRecords }
              })
              .filter((item: any) => item.day !== 'Sun') // Filter out Sunday

            setWeeklyAttendanceData(weekData)
          } else {
            // Fallback to empty data if API doesn't return array - exclude Sunday
            const weekDaysWithoutSunday = daysOfWeek.filter(day => day !== 'Sun')
            const weekData = weekDaysWithoutSunday.map(day => ({ day, present: 0, absent: 0 }))
            setWeeklyAttendanceData(weekData)
          }
        } catch (apiError) {
          console.error('Error fetching real attendance:', apiError)
          // Fallback to empty data - exclude Sunday
          const weekDaysWithoutSunday = daysOfWeek.filter(day => day !== 'Sun')
          const weekData = weekDaysWithoutSunday.map(day => ({ day, present: 0, absent: 0 }))
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

          const campusStudents = studentsArray.filter((student: any) => {
            const studentCampus = student.campus
            if (!studentCampus) return false

            // Check if student belongs to this 
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
              attendancePercentage: 0,
              averageScore: 0,
              retentionFlag: (item?.current_state || "").toLowerCase() === "active",
              enrollmentDate: createdAt ? new Date(createdAt) : new Date(),
            }
          })

          setStudents(mapped)
          setCacheTimestamp(Date.now())
          const cacheData = {
            totalCount: mapped.length,
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

  // Don't show full page loader - show UI immediately with skeleton loaders
  if (false) { // Disabled full page loader
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
                        <EllipsisVertical className="h-5 w-5" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <MultiSelectFilter title="Academic Year" options={dynamicAcademicYears} selectedValues={filters.academicYears} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, academicYears: val as number[] }))} placeholder="All years" />
              {/* Hide campus filter for principal - they only see their campus data */}
              {userRole !== 'principal' && (
                <MultiSelectFilter title="Campus" options={dynamicCampuses} selectedValues={filters.campuses} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, campuses: val as string[] }))} placeholder="All campuses" />
              )}
              <MultiSelectFilter title="Grade" options={dynamicGrades} selectedValues={filters.grades} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, grades: val as string[] }))} placeholder="All grades" />
              <MultiSelectFilter title="Gender" options={dynamicGenders} selectedValues={filters.genders} onSelectionChange={(val) => setFilters((prev) => ({ ...prev, genders: val as ("Male" | "Female" | "Other")[] }))} placeholder="All genders" />
              {userRole === 'principal' && (
                <MultiSelectFilter
                  title="Shift"
                  options={["All", "Morning", "Afternoon"]}
                  selectedValues={[
                    shiftFilter === 'all' ? 'All' :
                      shiftFilter === 'morning' ? 'Morning' :
                        shiftFilter === 'afternoon' ? 'Afternoon' : 'All'
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
          {(kpisLoading || chartsLoading) ? (
            Array.from({ length: 4 }).map((_, i) => (
              <KpiCardSkeleton key={i} />
            ))
          ) : (
            <>
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
                value={`${metrics.averageAttendance}%`}
                description="Today's attendance percentage"
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
            </>
          )}
        </div>

        {/* Row 1: Gender & Religion */}
        <div ref={genderReligionRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8 items-stretch">
          <div ref={genderChartRef}>
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="pie" /> : <GenderDistributionChart data={chartData.genderDistribution} />}
          </div>
          <div ref={religionChartRef}>
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="pie" /> : <ReligionChart data={chartData.religionDistribution} />}
          </div>
        </div>

        {/* Row 2: Mother Tongue & Enrollment Trend */}
        <div ref={motherEnrollmentRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8 items-stretch">
          <div ref={motherTongueChartRef}>
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="radial" /> : <MotherTongueChart data={chartData.motherTongueDistribution} />}
          </div>
          <div ref={enrollmentTrendChartRef}>
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="line" /> : <EnrollmentTrendChart data={chartData.enrollmentTrend} />}
          </div>
        </div>

        {/* Row 3: Grade Distribution - Full Width (only for non-principal) */}
        {userRole !== 'principal' && (
          <div ref={gradeDistributionRef} className="grid grid-cols-1 gap-4 md:gap-6 mt-8">
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="bar" /> : <GradeDistributionChart data={chartData.gradeDistribution} />}
          </div>
        )}

        {/* Row 4: Weekly Attendance & Age Distribution */}
        <div ref={weeklyAgeRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8 items-stretch">
          <div ref={weeklyAttendanceChartRef}>
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="stacked" /> : <WeeklyAttendanceChart data={weeklyAttendanceData} />}
          </div>
          <div ref={ageDistributionChartRef}>
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="bar" /> : <AgeDistributionChart data={chartData.ageDistribution} />}
          </div>
        </div>

        {/* Row 5: Zakat Status & House Ownership */}
        <div ref={zakatHouseRef} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-8 items-stretch">
          <div ref={zakatStatusChartRef}>
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="gauge" /> : <ZakatStatusChart data={chartData.zakatStatus} />}
          </div>
          <div ref={houseOwnershipChartRef}>
            {(kpisLoading || chartsLoading) ? <ChartSkeleton type="gauge" /> : <HouseOwnershipChart data={chartData.houseOwnership} />}
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
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.greeting} onChange={(e) => setSelectedSections(s => ({ ...s, greeting: e.target.checked }))} /> Greeting</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.kpis} onChange={(e) => setSelectedSections(s => ({ ...s, kpis: e.target.checked }))} /> KPI Cards</label>
              <div className="mt-2 text-xs font-semibold text-gray-500">Charts</div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.gender} onChange={(e) => setSelectedSections(s => ({ ...s, gender: e.target.checked }))} /> Gender</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.religion} onChange={(e) => setSelectedSections(s => ({ ...s, religion: e.target.checked }))} /> Religion</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.motherTongue} onChange={(e) => setSelectedSections(s => ({ ...s, motherTongue: e.target.checked }))} /> Mother Tongue</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.enrollmentTrend} onChange={(e) => setSelectedSections(s => ({ ...s, enrollmentTrend: e.target.checked }))} /> Enrollment Trend</label>
              {userRole !== 'principal' && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.gradeDistribution} onChange={(e) => setSelectedSections(s => ({ ...s, gradeDistribution: e.target.checked }))} /> Grade Distribution</label>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.weeklyAttendance} onChange={(e) => setSelectedSections(s => ({ ...s, weeklyAttendance: e.target.checked }))} /> Weekly Attendance</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.ageDistribution} onChange={(e) => setSelectedSections(s => ({ ...s, ageDistribution: e.target.checked }))} /> Age Distribution</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.zakatStatus} onChange={(e) => setSelectedSections(s => ({ ...s, zakatStatus: e.target.checked }))} /> Zakat Status</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedSections.houseOwnership} onChange={(e) => setSelectedSections(s => ({ ...s, houseOwnership: e.target.checked }))} /> House Ownership</label>
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