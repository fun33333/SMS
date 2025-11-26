"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  Users,
  UserCheck,
  Layers,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  ArrowRight,
  Activity,
  PieChart,
  MapPin,
  RefreshCw
} from "lucide-react"
import {
  getCoordinatorDashboardStats,
  findCoordinatorByEmployeeCode,
  getAllCoordinators,
  getCoordinatorClasses,
  getLevelAttendanceSummary,
  getCoordinatorRequests,
  getCoordinatorTeachers
} from "@/lib/api"
import { getCurrentUserRole, getCurrentUser } from "@/lib/permissions"
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from "recharts"
import type { PieLabelRenderProps } from "recharts"

type SubjectSlice = { name: string; value: number; percentage?: number; color?: string }

interface ClassroomData {
  id: number
  name: string
  code: string
  grade: string
  section: string
  shift: string
  campus?: string
  student_count?: number
  class_teacher?: {
    id?: number | null
    name?: string | null
    employee_code?: string | null
  } | null
  level?: { id: number; name: string } | null
}

type DashboardStatsPayload = {
  stats?: {
    total_teachers?: number
    total_students?: number
    total_classes?: number
    pending_requests?: number
  }
  subject_distribution?: SubjectSlice[]
} | null

type DashboardRequestOverview = RequestStats | { error?: string } | null

interface RequestStats {
  total_requests: number
  submitted: number
  under_review: number
  in_progress: number
  waiting: number
  resolved: number
  rejected: number
}

interface CoordinatorRequest {
  id: number
  subject: string
  category_display: string
  status: string
  status_display: string
  teacher_name: string
  updated_at: string
}

interface AttendanceSummary {
  date_range?: { start_date?: string; end_date?: string }
  summary: {
    total_classrooms: number
    total_students: number
    total_present: number
    total_absent: number
    total_late: number
    total_leave: number
    overall_percentage: number
  }
  classrooms: Array<{
    classroom: {
      id: number
      name: string
      grade?: string
      section?: string
      shift: string
      campus?: string | null
    }
    student_count: number
    average_percentage: number
    records_count?: number
    total_present?: number
    total_absent?: number
    total_late?: number
    total_leave?: number
    last_attendance?: string | null
  }>
}

const SHIFT_LABELS: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  both: "Both Shifts",
  all: "All Shifts"
}

const normalizeShiftValue = (shift?: string | null) => {
  if (!shift) return "morning"
  const value = shift.toString().trim().toLowerCase()
  if (["both", "all", "morning+afternoon", "morning + afternoon"].includes(value)) return "both"
  if (value.startsWith("morn")) return "morning"
  if (value.startsWith("after")) return "afternoon"
  if (value.startsWith("even")) return "evening"
  if (value.startsWith("night")) return "night"
  return value || "morning"
}

const getShiftLabel = (shiftValue: string) =>
  SHIFT_LABELS[shiftValue] || shiftValue.charAt(0).toUpperCase() + shiftValue.slice(1)

const normalizeShiftLabel = (shift?: string | null) => getShiftLabel(normalizeShiftValue(shift))

const extractEmployeeCode = (teacherName?: string | null) => {
  if (!teacherName) return null
  const match = teacherName.match(/\(([^)]+)\)\s*$/)
  return match ? match[1].trim() : null
}

const normalizeClassesResponse = (payload: any): ClassroomData[] => {
  if (Array.isArray(payload)) return payload
  if (payload?.results && Array.isArray(payload.results)) return payload.results
  if (payload?.data && Array.isArray(payload.data)) return payload.data
  return []
}

const formatNumber = (value?: number) => new Intl.NumberFormat("en-PK").format(value ?? 0)

const formatDate = (value?: string | null) => {
  if (!value) return "—"
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(value))
  } catch {
    return value
  }
}

const SUBJECT_COLORS = [
  "#b0c4b1",
  "#184e77",
  "#b7d1f3",
  "#98c1d9",
  "#936639",
  "#f8fafc",
  "#f8fafc",
  "#f8fafc"
]

const mergeAttendanceSummaries = (summaries: Array<any>): AttendanceSummary | null => {
  const valid = summaries.filter((item) => item && !item.error)
  if (!valid.length) return null

  const merged = valid.reduce<AttendanceSummary>(
    (acc, current) => {
      const summary = current?.summary || {}
      acc.summary.total_classrooms += summary.total_classrooms ?? 0
      acc.summary.total_students += summary.total_students ?? 0
      acc.summary.total_present += summary.total_present ?? 0
      acc.summary.total_absent += summary.total_absent ?? 0
      acc.summary.total_late += summary.total_late ?? 0
      acc.summary.total_leave += summary.total_leave ?? 0
      acc.classrooms = acc.classrooms.concat(
        (current?.classrooms || []).map((item: any) => ({
          classroom: item.classroom,
          student_count: item.student_count,
          average_percentage: item.average_percentage,
          last_attendance: item.last_attendance
        }))
      )

      const start = current?.date_range?.start_date
      const end = current?.date_range?.end_date
      if (start && (!acc.date_range?.start_date || start < acc.date_range.start_date)) {
        acc.date_range = { ...acc.date_range, start_date: start }
      }
      if (end && (!acc.date_range?.end_date || end > acc.date_range.end_date)) {
        acc.date_range = { ...acc.date_range, end_date: end }
      }
      return acc
    },
    {
      summary: {
        total_classrooms: 0,
        total_students: 0,
        total_present: 0,
        total_absent: 0,
        total_late: 0,
        total_leave: 0,
        overall_percentage: 0
      },
      classrooms: [],
      date_range: { start_date: undefined, end_date: undefined }
    }
  )

  const attendanceEvents = merged.summary.total_present + merged.summary.total_absent
  if (attendanceEvents > 0) {
    merged.summary.overall_percentage = Number(
      ((merged.summary.total_present / attendanceEvents) * 100).toFixed(2)
    )
  }

  merged.classrooms.sort((a, b) => (b.average_percentage || 0) - (a.average_percentage || 0))
  return merged
}

const RADIAN = Math.PI / 180

const GRADE_ORDER = [
  "nursery",
  "kg-i",
  "kg-ii",
  "kg iii",
  "grade 1",
  "grade i",
  "grade 2",
  "grade ii",
  "grade 3",
  "grade iii",
  "grade 4",
  "grade iv",
  "grade 5",
  "grade v",
  "grade 6",
  "grade vi",
  "grade 7",
  "grade vii",
  "grade 8",
  "grade viii",
  "grade 9",
  "grade ix",
  "grade 10",
  "grade x"
]

const normalizeGradeKey = (grade?: string) => {
  if (!grade) return ""
  return grade
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function renderSubjectLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  name,
  value,
  payload
}: PieLabelRenderProps) {
  const numericCx = typeof cx === "number" ? cx : Number(cx) || 0
  const numericCy = typeof cy === "number" ? cy : Number(cy) || 0
  const numericOuterRadius =
    typeof outerRadius === "number" ? outerRadius : Number(outerRadius) || 0
  const numericMidAngle = typeof midAngle === "number" ? midAngle : Number(midAngle) || 0
  const numericValue = typeof value === "number" ? value : Number(value) || 0
  const label = typeof name === "string" ? name : String(name)
  
  // Get percentage from payload if available
  const percentage = (payload as any)?.percentage
  const percentageText = percentage !== undefined ? `${percentage}%` : ""

  const radius = numericOuterRadius + 18
  const x = numericCx + radius * Math.cos(-numericMidAngle * RADIAN)
  const y = numericCy + radius * Math.sin(-numericMidAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill="#274c77"
      textAnchor={x > numericCx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={12}
    >
      {percentageText ? `${label} - ${percentageText}` : `${label}`}
    </text>
  )
}

export default function CoordinatorPage() {
  const router = useRouter()
  const [coreStats, setCoreStats] = useState({
    total_teachers: 0,
    total_students: 0,
    total_classes: 0,
    pending_requests: 0
  })
  const [subjectData, setSubjectData] = useState<SubjectSlice[]>([])
  const [classrooms, setClassrooms] = useState<ClassroomData[]>([])
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null)
  const [levelSummaries, setLevelSummaries] = useState<Record<number, AttendanceSummary>>({})
  const [requestStats, setRequestStats] = useState<RequestStats | null>(null)
  const [allRequests, setAllRequests] = useState<CoordinatorRequest[]>([])
  const [coordinatorInfo, setCoordinatorInfo] = useState<any>(null)
  const [coordinators, setCoordinators] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [userRole, setUserRole] = useState("")
  const [userCampus, setUserCampus] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedShift, setSelectedShift] = useState<string | null>(null)
  const [selectedLevelId, setSelectedLevelId] = useState<string>("all")

  useEffect(() => {
    document.title = "Coordinator Dashboard | IAK SMS"
    const role = getCurrentUserRole()
    setUserRole(role)

    const user = getCurrentUser() as any
    if (user?.campus?.campus_name) {
      setUserCampus(user.campus.campus_name)
    }
  }, [])

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null)
        setLoading(true)
        
      if (userRole === "principal" && userCampus) {
        const allCoordinators = (await getAllCoordinators()) as any[]
        const campusCoordinators = allCoordinators.filter(
          (coord: any) =>
            coord.campus?.campus_name === userCampus || coord.campus === userCampus
          )
          setCoordinators(campusCoordinators)
          return
        }
        
      const rawUser = localStorage.getItem("sis_user")
      if (!rawUser) {
        setError("Session expired. Please sign in again.")
          return
        }

      const parsedUser = JSON.parse(rawUser)
      const coordinator = await findCoordinatorByEmployeeCode(parsedUser.username)
      if (!coordinator) {
        setError("Coordinator profile not found.")
        return
      }
      setCoordinatorInfo(coordinator)

      const [core, classPayload, requestOverview, requestList, teachersPayload] = await Promise.all([
        getCoordinatorDashboardStats(coordinator.id),
        getCoordinatorClasses(),
        getCoordinatorDashboardStats(),
        getCoordinatorRequests(),
        getCoordinatorTeachers(coordinator.id)
      ])

      const typedCore = core as DashboardStatsPayload
      setCoreStats({
        total_teachers: typedCore?.stats?.total_teachers ?? 0,
        total_students: typedCore?.stats?.total_students ?? 0,
        total_classes: typedCore?.stats?.total_classes ?? 0,
        pending_requests: typedCore?.stats?.pending_requests ?? 0
      })

      setSubjectData(
        Array.isArray(typedCore?.subject_distribution) ? typedCore.subject_distribution : []
      )

      const normalizedClasses = normalizeClassesResponse(classPayload)
      setClassrooms(normalizedClasses)
      setTeachers(Array.isArray((teachersPayload as any)?.teachers) ? (teachersPayload as any).teachers : [])

      const explicitLevelIds: number[] = []
      if (Array.isArray(coordinator.assigned_levels) && coordinator.assigned_levels.length) {
        coordinator.assigned_levels.forEach((lvl: any) => {
          const id = Number(lvl?.id)
          if (!Number.isNaN(id)) {
            explicitLevelIds.push(id)
          }
        })
      } else if (coordinator.level?.id) {
        explicitLevelIds.push(Number(coordinator.level.id))
      }

      const derivedLevelIds = normalizedClasses
        .map((cls) => (cls.level?.id !== undefined ? Number(cls.level.id) : NaN))
        .filter((id) => !Number.isNaN(id))

      const uniqueLevelIds = Array.from(new Set([...explicitLevelIds, ...derivedLevelIds]))

      if (uniqueLevelIds.length) {
        const summaries = await Promise.all(
          uniqueLevelIds.map(async (id) => {
            try {
              return await getLevelAttendanceSummary(id)
            } catch (summaryError: any) {
              if (summaryError?.status === 403 || summaryError?.status === 401) {
                return { error: "access_denied" }
              }
              throw summaryError
            }
          })
        )
        const summaryMap: Record<number, AttendanceSummary> = {}
        uniqueLevelIds.forEach((id, index) => {
          const payload = summaries[index]
          if (payload && !(payload as any)?.error) {
            summaryMap[id] = payload as AttendanceSummary
          }
        })
        setLevelSummaries(summaryMap)
        setAttendanceSummary(mergeAttendanceSummaries(Object.values(summaryMap)))
        } else {
        setLevelSummaries({})
        setAttendanceSummary(null)
      }

      const overviewPayload = requestOverview as DashboardRequestOverview
      if (overviewPayload && "error" in overviewPayload) {
        setRequestStats(null)
      } else {
        setRequestStats((overviewPayload ?? null) as RequestStats | null)
      }

      if (Array.isArray(requestList)) {
        const sorted = [...requestList].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        setAllRequests(sorted)
      } else {
        setAllRequests([])
      }
    } catch (err) {
      console.error("Coordinator dashboard load failed:", err)
      setError("Unable to load dashboard. Please try again.")
      } finally {
        setLoading(false)
      }
  }, [userRole, userCampus])

  useEffect(() => {
    if (!userRole) return
    fetchDashboard()
  }, [userRole, userCampus, fetchDashboard])

  const shiftStructure = useMemo(() => {
    const levelsByShift = new Map<string, Map<number, string>>()
    const uniqueLevels = new Map<number, string>()
    classrooms.forEach((cls) => {
      const shiftValue = normalizeShiftValue(cls.shift)
      if (!levelsByShift.has(shiftValue)) {
        levelsByShift.set(shiftValue, new Map())
      }
      const levelId = cls.level?.id
      const levelName = cls.level?.name || cls.grade
      if (levelId && levelName) {
        levelsByShift.get(shiftValue)!.set(levelId, levelName)
        uniqueLevels.set(levelId, levelName)
      }
    })
    const order = ["morning", "afternoon", "evening", "night", "both"]
    const baseShiftOptions = Array.from(levelsByShift.entries())
      .map(([value, levelMap]) => ({
        value,
        label: getShiftLabel(value),
        levels: Array.from(levelMap.entries()).map(([id, name]) => ({ id, name }))
      }))
      .sort((a, b) => {
        const ai = order.indexOf(a.value)
        const bi = order.indexOf(b.value)
        if (ai === -1 && bi === -1) return a.label.localeCompare(b.label)
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    return {
      baseShiftOptions,
      combinedLevels: Array.from(uniqueLevels.entries()).map(([id, name]) => ({ id, name }))
    }
  }, [classrooms])

  const shiftOptions = useMemo(() => {
    if (shiftStructure.baseShiftOptions.length > 1) {
      return [
        { value: "both", label: "Both Shifts", levels: shiftStructure.combinedLevels },
        ...shiftStructure.baseShiftOptions
      ]
    }
    if (shiftStructure.baseShiftOptions.length === 1) {
      return shiftStructure.baseShiftOptions
    }
    if (coordinatorInfo?.shift) {
      const value = normalizeShiftValue(coordinatorInfo.shift)
      return [{ value, label: getShiftLabel(value), levels: shiftStructure.combinedLevels }]
    }
    return []
  }, [shiftStructure, coordinatorInfo])

  useEffect(() => {
    if (!shiftOptions.length) {
      setSelectedShift(null)
      return
    }
    if (!selectedShift || !shiftOptions.some((option) => option.value === selectedShift)) {
      setSelectedShift(shiftOptions[0].value)
    }
  }, [shiftOptions, selectedShift])

  const currentShiftValue = selectedShift ?? shiftOptions[0]?.value ?? null
  const currentShiftOption = useMemo(
    () => shiftOptions.find((option) => option.value === currentShiftValue) ?? shiftOptions[0],
    [shiftOptions, currentShiftValue]
  )

  const allLevelOptions = useMemo(() => {
    const seen = new Map<number, string>()
    shiftStructure.combinedLevels.forEach((item) => {
      if (item.id) {
        seen.set(item.id, item.name || `Level ${item.id}`)
      }
    })
    return Array.from(seen.entries()).map(([id, name]) => ({ value: id.toString(), label: name }))
  }, [shiftStructure])

  const currentLevelOptions = useMemo(() => {
    if (!currentShiftOption) return allLevelOptions
    const seen = new Map<number, string>()
    ;(currentShiftOption.levels || allLevelOptions).forEach((item) => {
      if (item.id) {
        seen.set(item.id, item.name || `Level ${item.id}`)
      }
    })
    const levelList = Array.from(seen.entries()).map(([id, name]) => ({
      value: id.toString(),
      label: name
    }))
    if (levelList.length > 1) {
      return [{ value: "all", label: "All Levels" }, ...levelList]
    }
    return levelList
  }, [currentShiftOption, allLevelOptions])

  useEffect(() => {
    if (!currentLevelOptions.length) {
      setSelectedLevelId("all")
      return
    }
    const actualLevels = currentLevelOptions.filter((option) => option.value !== "all")
    if (actualLevels.length === 1) {
      setSelectedLevelId(actualLevels[0].value)
      return
    }
    if (!currentLevelOptions.some((option) => option.value === selectedLevelId)) {
      setSelectedLevelId("all")
    }
  }, [currentLevelOptions, selectedLevelId])

  const showShiftFilter = shiftOptions.length > 1
  const showLevelFilter =
    currentLevelOptions.filter((option) => option.value !== "all").length > 1

  const fallbackLevelIds = useMemo(
    () =>
      Object.keys(levelSummaries)
        .map((id) => Number(id))
        .filter((id) => !Number.isNaN(id)),
    [levelSummaries]
  )

  const baseLevelIds = useMemo(
    () =>
      currentLevelOptions
        .filter((option) => option.value !== "all")
        .map((option) => Number(option.value))
        .filter((id) => !Number.isNaN(id)),
    [currentLevelOptions]
  )

  const isSpecificLevelSelected =
    selectedLevelId !== "all" &&
    currentLevelOptions.some((option) => option.value === selectedLevelId)

  const effectiveLevelIds = useMemo(() => {
    const availableIds = baseLevelIds.length ? baseLevelIds : fallbackLevelIds
    if (!availableIds.length) return []
    if (!isSpecificLevelSelected || !selectedLevelId) return availableIds
    const numericId = Number(selectedLevelId)
    if (Number.isNaN(numericId)) return availableIds
    return availableIds.includes(numericId) ? [numericId] : availableIds
  }, [baseLevelIds, fallbackLevelIds, isSpecificLevelSelected, selectedLevelId])

  const levelFilterSet = useMemo(() => new Set(effectiveLevelIds), [effectiveLevelIds])
  const shiftFilterValue =
    currentShiftOption && currentShiftOption.value !== "both" ? currentShiftOption.value : null
  const filtersActive = Boolean(shiftFilterValue) || isSpecificLevelSelected

  const filteredClassrooms = useMemo(() => {
    return classrooms.filter((classroom) => {
      const shiftValue = normalizeShiftValue(classroom.shift)
      if (shiftFilterValue && shiftValue !== shiftFilterValue) return false
      if (levelFilterSet.size) {
        const levelId = classroom.level?.id
        if (!levelId) return false
        return levelFilterSet.has(levelId)
      }
      return true
    })
  }, [classrooms, shiftFilterValue, levelFilterSet])

  const teacherLevelMap = useMemo(() => {
    const map = new Map<number, Set<number>>()
    classrooms.forEach((classroom) => {
      const teacherId = classroom.class_teacher?.id
      const levelId = classroom.level?.id
      if (teacherId && levelId) {
        if (!map.has(teacherId)) {
          map.set(teacherId, new Set())
        }
        map.get(teacherId)!.add(levelId)
      }
    })
    return map
  }, [classrooms])

  const teacherMetaByCode = useMemo(() => {
    const map = new Map<
      string,
      { shiftValue: string; levelIds: Set<number> }
    >()
    teachers.forEach((teacher: any) => {
      const code = teacher.employee_code || teacher.employeeCode
      if (!code) return
      const shiftValue = normalizeShiftValue(teacher.shift)
      const levelIds = teacherLevelMap.get(teacher.id) || new Set<number>()
      map.set(code, { shiftValue, levelIds })
    })
    return map
  }, [teachers, teacherLevelMap])

  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher: any) => {
      const shiftValue = normalizeShiftValue(teacher.shift)
      if (shiftFilterValue && shiftValue !== shiftFilterValue) return false
      if (!isSpecificLevelSelected || !levelFilterSet.size) return true
      const teacherLevels = teacherLevelMap.get(teacher.id)
      if (!teacherLevels || !teacherLevels.size) return true
      return Array.from(teacherLevels).some((id) => levelFilterSet.has(id))
    })
  }, [teachers, shiftFilterValue, levelFilterSet, teacherLevelMap, isSpecificLevelSelected])

  const filteredSubjectData = useMemo(() => {
    if (!filteredTeachers.length) return []
    const counts: Record<string, number> = {}
    let teachersWithSubjects = 0
    
    filteredTeachers.forEach((teacher: any) => {
      if (teacher.current_subjects) {
        const subjects = teacher.current_subjects
          .split(",")
          .map((subject: string) => subject.trim())
          .filter(Boolean)
        if (subjects.length > 0) {
          teachersWithSubjects += 1
          subjects.forEach((subject: string) => {
            counts[subject] = (counts[subject] || 0) + 1
          })
        }
      }
    })
    
    // Add "none" category for teachers without subjects
    const teachersWithoutSubjects = filteredTeachers.length - teachersWithSubjects
    if (teachersWithoutSubjects > 0) {
      counts['none'] = teachersWithoutSubjects
    }
    
    // Calculate percentage for each subject based on total teachers (not filtered)
    // Use coreStats.total_teachers for consistent percentage calculation
    const totalTeachers = coreStats.total_teachers || filteredTeachers.length
    
    // First calculate raw percentages
    const rawData = Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      rawPercentage: totalTeachers > 0 ? (value / totalTeachers) * 100 : 0
    }))
    
    // Calculate sum of all raw percentages
    const sumOfPercentages = rawData.reduce((sum, item) => sum + item.rawPercentage, 0)
    
    // Normalize percentages so they sum to 100%
    return rawData.map((item) => ({
      name: item.name,
      value: item.value,
      percentage: sumOfPercentages > 0
        ? Math.round((item.rawPercentage / sumOfPercentages) * 100 * 10) / 10
        : 0
    }))
  }, [filteredTeachers, coreStats.total_teachers])

  const subjectChartData = useMemo(() => {
    const source =
      filtersActive || filteredSubjectData.length
        ? filteredSubjectData
        : subjectData
    
    if (source.length === 0) return []
    
    // Recalculate percentage based on real total_teachers for accuracy
    const totalTeachers = coreStats.total_teachers || 0
    
    // First, calculate raw percentages
    const dataWithRawPercentages = source.map((slice) => {
      const rawPercentage = totalTeachers > 0 
        ? (slice.value / totalTeachers) * 100
        : (slice.percentage || 0)
      
      return {
        ...slice,
        rawPercentage
      }
    })
    
    // Calculate sum of all raw percentages
    const sumOfPercentages = dataWithRawPercentages.reduce((sum, item) => sum + item.rawPercentage, 0)
    
    // Normalize percentages so they sum to 100%
    const normalizedData = dataWithRawPercentages.map((item, index) => {
      const normalizedPercentage = sumOfPercentages > 0
        ? Math.round((item.rawPercentage / sumOfPercentages) * 100 * 10) / 10
        : 0
      
      return {
        ...item,
        percentage: normalizedPercentage,
        color: SUBJECT_COLORS[index % SUBJECT_COLORS.length]
      }
    })
    
    return normalizedData
  }, [filteredSubjectData, subjectData, filtersActive, coreStats.total_teachers])

  const filteredLevelSummaries = useMemo(() => {
    if (!effectiveLevelIds.length) return Object.values(levelSummaries)
    return effectiveLevelIds.map((id) => levelSummaries[id]).filter(Boolean)
  }, [effectiveLevelIds, levelSummaries])

  const scopedAttendanceSummary = useMemo(() => {
    if (filteredLevelSummaries.length) {
      return mergeAttendanceSummaries(filteredLevelSummaries) ?? attendanceSummary
    }
    return attendanceSummary
  }, [filteredLevelSummaries, attendanceSummary])

  const studentsManaged = useMemo(() => {
    if (scopedAttendanceSummary?.summary?.total_students !== undefined) {
      return scopedAttendanceSummary.summary.total_students
    }
    return filteredClassrooms.reduce((total, classroom) => total + (classroom.student_count ?? 0), 0)
  }, [scopedAttendanceSummary, filteredClassrooms])

  const classesManaged =
    scopedAttendanceSummary?.summary?.total_classrooms ?? filteredClassrooms.length

  const filteredShiftBreakdown = useMemo(() => {
    return filteredClassrooms.reduce<Record<string, number>>((acc, classroom) => {
      const label = normalizeShiftLabel(classroom.shift)
      acc[label] = (acc[label] || 0) + 1
      return acc
    }, {})
  }, [filteredClassrooms])

  const filteredTopClasses = useMemo(() => {
    return [...filteredClassrooms]
      .sort((a, b) => (b.student_count ?? 0) - (a.student_count ?? 0))
      .slice(0, 4)
  }, [filteredClassrooms])

  const gradeAttendanceRows = useMemo(() => {
    if (!scopedAttendanceSummary?.classrooms?.length) return []
    type GradeRow = {
      grade: string
      weightedTotal: number
      totalWeight: number
      percentage: number
      last_attendance?: string | null
      shift?: string
      sections: { name: string; percentage: number }[]
    }
    const map = new Map<string, GradeRow>()
    scopedAttendanceSummary.classrooms.forEach((entry) => {
      const sectionName = entry.classroom.name || "Section"
      const gradeName =
        entry.classroom.grade ||
        sectionName.split(" - ")?.[0] ||
        "Grade"
      const key = `${gradeName}__${entry.classroom.shift}`
      const recordsCount = entry.records_count || 1
      const sectionAverage = entry.average_percentage || 0
      const current = map.get(key) || {
        grade: gradeName,
        weightedTotal: 0,
        totalWeight: 0,
        percentage: 0,
        last_attendance: entry.last_attendance,
        shift: entry.classroom.shift,
        sections: []
      }
      current.weightedTotal += sectionAverage * recordsCount
      current.totalWeight += recordsCount
      if (
        entry.last_attendance &&
        (!current.last_attendance || entry.last_attendance > current.last_attendance)
      ) {
        current.last_attendance = entry.last_attendance
      }
      const existingSection = current.sections.find((sec) => sec.name === sectionName)
      const sectionPercentage = sectionAverage
      if (existingSection) {
        existingSection.percentage = sectionPercentage
      } else {
        current.sections.push({ name: sectionName, percentage: sectionPercentage })
      }
      current.percentage =
        current.totalWeight > 0 ? Number((current.weightedTotal / current.totalWeight).toFixed(1)) : 0
      map.set(key, current)
    })
    return Array.from(map.values()).sort((a, b) => {
      const keyA = normalizeGradeKey(a.grade)
      const keyB = normalizeGradeKey(b.grade)
      const indexA = GRADE_ORDER.indexOf(keyA)
      const indexB = GRADE_ORDER.indexOf(keyB)
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      if (keyA === keyB) {
        return (a.shift || "").localeCompare(b.shift || "")
      }
      return keyA.localeCompare(keyB)
    })
  }, [scopedAttendanceSummary])

  const filteredGrades = useMemo(() => {
    if (!gradeAttendanceRows.length) return []
    if (!levelFilterSet.size) return gradeAttendanceRows
    return gradeAttendanceRows.filter((row) => {
      const matchingClassrooms = filteredClassrooms.filter(
        (cls) =>
          cls.grade === row.grade &&
          (!row.shift || normalizeShiftValue(cls.shift) === normalizeShiftValue(row.shift))
      )
      return matchingClassrooms.length > 0
    })
  }, [gradeAttendanceRows, filteredClassrooms, levelFilterSet])

  const filteredTeacherIdsFromClasses = useMemo(() => {
    const ids = new Set<number>()
    filteredClassrooms.forEach((classroom) => {
      if (classroom.class_teacher?.id) {
        ids.add(classroom.class_teacher.id)
      }
    })
    return ids
  }, [filteredClassrooms])

  const filteredRequests = useMemo(() => {
    if (!filtersActive) return allRequests
    return allRequests.filter((request) => {
      const code = extractEmployeeCode(request.teacher_name)
      if (!code) return false
      const meta = teacherMetaByCode.get(code)
      if (!meta) return false
      if (shiftFilterValue && meta.shiftValue !== shiftFilterValue) return false
      if (!isSpecificLevelSelected || !levelFilterSet.size) return true
      if (!meta.levelIds || !meta.levelIds.size) return false
      return Array.from(meta.levelIds).some((id) => levelFilterSet.has(id))
    })
  }, [allRequests, filtersActive, shiftFilterValue, isSpecificLevelSelected, levelFilterSet, teacherMetaByCode])

  type RequestStatusSummary = {
    submitted: number
    under_review: number
    in_progress: number
    waiting: number
    resolved: number
    rejected: number
  }

  const filteredRequestStats = useMemo<RequestStatusSummary>(() => {
    const summary: RequestStatusSummary = {
      submitted: 0,
      under_review: 0,
      in_progress: 0,
      waiting: 0,
      resolved: 0,
      rejected: 0
    }
    filteredRequests.forEach((request) => {
      const status = (request.status || "").toLowerCase() as keyof RequestStatusSummary
      if (summary[status] !== undefined) {
        summary[status] += 1
      }
    })
    return summary
  }, [filteredRequests])

  const filteredOpenRequestsCount =
    filteredRequestStats.submitted +
    filteredRequestStats.under_review +
    filteredRequestStats.in_progress +
    filteredRequestStats.waiting

  const displayedRequests = useMemo(() => filteredRequests.slice(0, 5), [filteredRequests])

  const subjectGroupCount = filtersActive ? filteredSubjectData.length : subjectData.length

  const derivedLevelNames = useMemo(() => {
    const names = new Set<string>()
    classrooms.forEach((cls) => {
      if (cls.level?.name) {
        names.add(cls.level.name)
      } else if (cls.grade) {
        names.add(cls.grade)
      }
    })
    return Array.from(names)
  }, [classrooms])

  const levelsDisplay = useMemo(() => {
    if (Array.isArray(coordinatorInfo?.assigned_levels) && coordinatorInfo.assigned_levels.length) {
      const names = coordinatorInfo.assigned_levels.map((lvl: any) => lvl?.name).filter(Boolean)
      if (names.length) return names.join(", ")
    }
    if (coordinatorInfo?.level?.name) {
      return coordinatorInfo.level.name
    }
    if (derivedLevelNames.length) {
      return derivedLevelNames.join(", ")
    }
    return "—"
  }, [coordinatorInfo, derivedLevelNames])

  const campusDisplay = useMemo(() => {
    return (
      coordinatorInfo?.campus?.campus_name ||
      coordinatorInfo?.campus_name ||
      userCampus ||
      "—"
    )
  }, [coordinatorInfo, userCampus])

  const shiftDisplayLabel = currentShiftOption?.label || normalizeShiftLabel(coordinatorInfo?.shift)
  const currentLevelLabel = useMemo(() => {
    if (showLevelFilter && isSpecificLevelSelected) {
      return (
        currentLevelOptions.find((option) => option.value === selectedLevelId)?.label ||
        levelsDisplay
      )
    }
    return levelsDisplay
  }, [showLevelFilter, isSpecificLevelSelected, currentLevelOptions, selectedLevelId, levelsDisplay])

  const filteredTeacherCount = filteredTeachers.length || filteredTeacherIdsFromClasses.size
  const displayTeacherCount = filtersActive
    ? filteredTeacherCount
    : teachers.length || coreStats.total_teachers || filteredTeacherCount

  const overviewCards = [
    {
      title: "Teachers",
      value: formatNumber(displayTeacherCount),
      icon: Users,
      accent: "bg-[#274c77]",
      detail: `${subjectGroupCount} subject groups`
    },
    {
      title: "Students",
      value: formatNumber(studentsManaged),
      icon: UserCheck,
      accent: "bg-[#6096ba]",
      detail: `${classesManaged} classes`
    },
    {
      title: "Classes",
      value: formatNumber(classesManaged),
      icon: Layers,
      accent: "bg-[#a3cef1]",
      detail: `${Object.keys(filteredShiftBreakdown).length || 0} shifts`
    },
    {
      title: "Open Requests",
      value: formatNumber(filteredOpenRequestsCount),
      icon: ClipboardList,
      accent: "bg-[#f7b267]",
      detail: `${formatNumber(filteredRequests.length)} total`
    }
  ]

  if (loading) {
    return (
      <div className="px-3 py-6 space-y-6">
        <div className="bg-white/70 border border-[#a3cef1] rounded-3xl p-6 animate-pulse space-y-4">
          <div className="h-6 w-1/3 bg-gray-200 rounded" />
          <div className="h-4 w-1/4 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-28 bg-gray-100 rounded-2xl" />
            ))}
        </div>
                  </div>
        <div className="h-64 bg-white/70 border border-[#a3cef1] rounded-3xl animate-pulse" />
                  </div>
    )
  }

  if (error) {
    return (
      <div className="px-3 py-10">
        <Card className="border-2 border-red-200 bg-red-50">
          <CardContent className="flex flex-col items-center text-center space-y-4 py-10">
            <AlertTriangle className="h-12 w-12 text-red-500" />
            <div>
              <p className="text-lg font-semibold text-red-600">{error}</p>
              <p className="text-sm text-gray-600 mt-1">
                Please refresh the page or log in again to continue.
              </p>
                </div>
            <Button
              onClick={fetchDashboard}
              className="bg-[#274c77] hover:bg-[#1d3557] text-white"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
              </CardContent>
            </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 px-3 py-6">
      <section className="bg-gradient-to-r from-[#f8fbff] via-white to-[#e8f0ff] border border-[#d7e3fc] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-wide text-[#6096ba]">Coordinator Workspace</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#274c77]">Coordinator Dashboard</h1>
            <div className="text-gray-600 space-y-1 text-sm sm:text-base">
              <p>Campus: {campusDisplay}</p>
              <p>Levels: {currentLevelLabel}</p>
              <p>Shift: {shiftDisplayLabel}</p>
      </div>
                  </div>
          <div className="flex flex-col gap-4 w-full lg:w-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                <p className="text-xs text-gray-500">Students Managed</p>
                <p className="text-2xl font-semibold text-[#274c77]">
                  {formatNumber(studentsManaged)}
                </p>
                  </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                <p className="text-xs text-gray-500">Classes Tracked</p>
                <p className="text-2xl font-semibold text-[#274c77]">
                  {formatNumber(classesManaged)}
                </p>
                </div>
                </div>
            <div className="flex flex-wrap gap-3">
              {showShiftFilter && shiftOptions.length > 0 && (
                <div className="flex flex-col w-full sm:w-48">
                  <span className="text-xs text-gray-500 mb-1">Shift Filter</span>
                  <Select
                    value={currentShiftValue || ""}
                    onValueChange={(value) => setSelectedShift(value)}
                  >
                    <SelectTrigger className="bg-white/80 border border-[#d7e3fc]">
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {shiftOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
      </div>
              )}
              {showLevelFilter && currentLevelOptions.length > 0 && (
                <div className="flex flex-col w-full sm:w-48">
                  <span className="text-xs text-gray-500 mb-1">Level Filter</span>
                  <Select value={selectedLevelId} onValueChange={setSelectedLevelId}>
                    <SelectTrigger className="bg-white/80 border border-[#d7e3fc]">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentLevelOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {overviewCards.map((card) => {
          const Icon = card.icon
          return (
            <Card
              key={card.title}
              className="border-0 shadow-sm rounded-3xl overflow-hidden"
              style={{
                background:
                  card.title === "Teachers"
                    ? "linear-gradient(135deg, #274c77 0%, #3a6ea5 100%)"
                    : card.title === "Students"
                      ? "linear-gradient(135deg, #6096ba 0%, #78b0d8 100%)"
                      : card.title === "Classes"
                        ? "linear-gradient(135deg, #a3cef1 0%, #c0e0ff 100%)"
                        : "linear-gradient(135deg, #f7b267 0%, #f9c784 100%)",
                color: "#ffffff"
              }}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="rounded-2xl bg-white/20 text-white p-3 shadow">
                  <Icon className="h-6 w-6" />
              </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/80">{card.title}</p>
                  <p className="text-3xl font-semibold">{card.value}</p>
                  <p className="text-xs text-white/80 mt-1">{card.detail}</p>
            </div>
          </CardContent>
        </Card>
          )
        })}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="border border-[#d7e3fc] rounded-3xl xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#274c77]">
              <CheckCircle2 className="h-5 w-5" />
              Attendance Pulse
            </CardTitle>
            {scopedAttendanceSummary?.date_range && (
              <p className="text-xs text-gray-500">
                {scopedAttendanceSummary.date_range.start_date} –{" "}
                {scopedAttendanceSummary.date_range.end_date}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {scopedAttendanceSummary ? (
              <>
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Overall Rate</p>
                    <p className="text-4xl font-bold text-[#274c77]">
                      {scopedAttendanceSummary.summary.overall_percentage || 0}%
                    </p>
            </div>
                  <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                    <span>Present: {formatNumber(scopedAttendanceSummary.summary.total_present)}</span>
                    <span>Absent: {formatNumber(scopedAttendanceSummary.summary.total_absent)}</span>
                    <span>Late: {formatNumber(scopedAttendanceSummary.summary.total_late)}</span>
                  </div>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {filteredGrades.length === 0 && (
                    <p className="text-sm text-gray-500">Attendance history is not available yet.</p>
                  )}
                  {filteredGrades.map((entry) => (
                    <div key={`${entry.grade}-${entry.shift || "all"}`} className="rounded-2xl border border-[#eff2fb] bg-white px-3 py-2 space-y-2">
                      <div className="flex justify-between text-sm">
                        <div>
                          <p className="font-medium text-[#274c77]">
                            {entry.grade}
                            {entry.shift ? ` • ${normalizeShiftLabel(entry.shift)}` : ""}
                          </p>
                          <p className="text-xs text-gray-500">
                            Last marked{" "}
                            {entry.last_attendance ? formatDate(entry.last_attendance) : "—"}
                          </p>
                        </div>
                        <p className="text-gray-500">{entry.percentage}%</p>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full mt-2">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#76c893] to-[#34a0a4]"
                          style={{ width: `${entry.percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500">
                        {entry.sections.length > 0 && (
                          <p>
                            Sections:{" "}
                            {entry.sections
                              .sort((a, b) => b.percentage - a.percentage)
                              .map((section, idx) => (
                                <span key={section.name}>
                                  {section.name}: {section.percentage}%
                                  {idx < entry.sections.length - 1 ? ", " : ""}
                                </span>
                              ))}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Attendance analytics will appear after teachers start submitting records.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border border-[#d7e3fc] rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#274c77]">
              <BookOpen className="h-5 w-5" />
              Shift & Class Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(filteredShiftBreakdown).map(([label, count]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[#e1e8ff] bg-[#f6f9ff] px-4 py-3"
                >
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-xl font-semibold text-[#274c77]">{count}</p>
                </div>
              ))}
              {!Object.keys(filteredShiftBreakdown).length && (
                <p className="text-sm text-gray-500">No classrooms assigned yet.</p>
              )}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Top Classes By Shudents</p>
              {filteredTopClasses.map((cls) => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between rounded-2xl bg-white border border-[#eff2fb] px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-[#274c77]">{cls.name}</p>
                    <p className="text-xs text-gray-500">{normalizeShiftLabel(cls.shift)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-[#274c77]">
                      {cls.student_count ?? "—"}
                    </p>
                    <p className="text-xs text-gray-500">students</p>
                  </div>
                </div>
              ))}
              {!filteredTopClasses.length && (
                <p className="text-sm text-gray-500">Class roster will display when data is available.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border border-[#d7e3fc] rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#274c77]">
              <ClipboardList className="h-5 w-5" />
              Request Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredRequests.length ? (
              (
                [
                  ["Submitted", filteredRequestStats.submitted],
                  ["Under Review", filteredRequestStats.under_review],
                  ["In Progress", filteredRequestStats.in_progress],
                  ["Waiting", filteredRequestStats.waiting],
                  ["Resolved", filteredRequestStats.resolved],
                  ["Rejected", filteredRequestStats.rejected]
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <p className="text-gray-600">{label}</p>
                  <p className="font-semibold text-[#274c77]">{formatNumber(value)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">
                {filtersActive
                  ? "No requests match the selected shift/level."
                  : "No coordinator requests logged yet."}
              </p>
            )}
            <Button
              variant="outline"
              className="w-full border-[#274c77] text-[#274c77]"
              onClick={() => router.push("/admin/coordinator/requests")}
            >
              Go to Requests Desk
            </Button>
          </CardContent>
        </Card>

        <Card className="border border-[#d7e3fc] rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#274c77]">
              <Activity className="h-5 w-5" />
              Recent Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {displayedRequests.length === 0 && (
              <p className="text-sm text-gray-500">
                {filtersActive
                  ? "No coordinator requests logged for the selected scope."
                  : "No coordinator requests logged yet."}
              </p>
            )}
            {displayedRequests.map((req) => (
              <div
                key={req.id}
                className="rounded-2xl border border-[#eff2fb] bg-white px-4 py-3 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-[#274c77]">{req.subject}</p>
                  <Badge className="bg-[#e7ecef] text-[#274c77] border-none">
                    {req.status_display}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">{req.teacher_name}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{req.category_display}</span>
                  <span>{formatDate(req.updated_at)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-[#d7e3fc] rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#274c77]">
              <PieChart className="h-5 w-5" />
              Teacher Distribution by Subject
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Total Teachers: {coreStats.total_teachers}
            </p>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center">
            {subjectChartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={subjectChartData}
                    dataKey="value"
                    outerRadius={110}
                    labelLine={false}
                    label={renderSubjectLabel}
                  >
                    {subjectChartData.map((slice, index) => (
                      <Cell
                        key={slice.name}
                        fill={slice.color}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500">
                Subject breakdown will appear as soon as teachers are tagged with subjects.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border border-[#d7e3fc] rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#274c77]">
              <MapPin className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                label: "Review Attendance",
                hint: "Approve or return submissions",
                route: "/admin/coordinator/attendance-review"
              },
              {
                label: "Manage Students",
                hint: "Update student profiles & sections",
                route: "/admin/students/student-list"
              },
              {
                label: "Teacher Directory",
                hint: "View current teacher roster",
                route: "/admin/teachers/list"
              }
            ].map((action) => (
              <button
                key={action.route}
                onClick={() => router.push(action.route)}
                className="w-full border border-[#d7e3fc] rounded-2xl px-4 py-3 flex items-center justify-between text-left hover:border-[#274c77] transition"
              >
                <div>
                  <p className="font-medium text-[#274c77]">{action.label}</p>
                  <p className="text-xs text-gray-500">{action.hint}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-[#274c77]" />
              </button>
            ))}
          </CardContent>
        </Card>
      </section>

      {userRole === "principal" && coordinators.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-[#274c77]">Campus Coordinators</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {coordinators.map((coord: any) => (
              <Card key={coord.id} className="border border-[#d7e3fc] rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-[#274c77]">{coord.full_name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-gray-600 space-y-1">
                  <p>Campus: {coord.campus?.campus_name || coord.campus || "—"}</p>
                  <p>Level: {coord.level?.name || "—"}</p>
                  <p>Email: {coord.email || "—"}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

