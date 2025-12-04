"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar, Plus, X, Save, User, Users, GraduationCap, BookOpen } from "lucide-react"
import { getCoordinatorTeachers, findCoordinatorByEmployeeCode, getCoordinatorClasses, getSubjects, createSubject, getUserCampusId, bulkCreateClassPeriods, getClassTimetable, deleteClassPeriods, bulkCreateTeacherPeriods, getShiftTimings, createShiftTiming, updateShiftTiming, deleteShiftTiming } from "@/lib/api"

// --- Types ---

interface Teacher {
  id: number
  full_name: string
  current_subjects: string
  current_classes_taught: string
  email: string
  employee_code: string
}

interface PeriodAssignment {
  id: string
  day: string
  timeSlot: string
  grade: string
  section: string
  subject: string
  teacherId: number
  teacherName: string
}

// --- Constants ---

// Default slots as fallback
const DEFAULT_TIME_SLOTS = [
  "08:00 - 08:45",
  "08:45 - 09:30",
  "09:30 - 10:15",
  "10:15 - 11:00",
  "11:00 - 11:30", // Break
  "11:30 - 12:15",
  "12:15 - 01:00",
  "01:00 - 01:30"
]

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const DEFAULT_GRADES = [
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
  "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"
]

const SECTIONS = ["A", "B", "C", "D"]


export default function TimeTablePage() {
  useEffect(() => {
    document.title = "Time Table - Coordinator | IAK SMS";
  }, []);

  // --- State ---

  const [viewMode, setViewMode] = useState<'class' | 'teacher'>('class')

  // Data
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assignments, setAssignments] = useState<PeriodAssignment[]>([])
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([])
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [availableGrades, setAvailableGrades] = useState<string[]>(DEFAULT_GRADES)
  const [savedClasses, setSavedClasses] = useState<any[]>([])
  const [savedTeachers, setSavedTeachers] = useState<any[]>([])
  const [timeSlots, setTimeSlots] = useState<string[]>(DEFAULT_TIME_SLOTS)
  const [shiftTimingsData, setShiftTimingsData] = useState<any[]>([]) // Store full timing objects with is_break

  // Selections
  const [selectedGrade, setSelectedGrade] = useState<string>("")
  const [selectedSection, setSelectedSection] = useState<string>("A")
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("")
  const [selectedShift, setSelectedShift] = useState<string>("morning") // New: shift selector
  const [availableShifts, setAvailableShifts] = useState<string[]>(["morning"]) // New: coordinator's available shifts
  const [isManagingTimings, setIsManagingTimings] = useState(false) // New: timing management modal

  // Dialog & Editing
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isAddSubjectDialogOpen, setIsAddSubjectDialogOpen] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState("")

  const [editingSlot, setEditingSlot] = useState<{ day: string, timeSlot: string } | null>(null)
  const [formData, setFormData] = useState({
    subject: '',
    teacherId: '',
    grade: '',
    section: ''
  })

  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [validationPanelVisible, setValidationPanelVisible] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [duplicateGroups, setDuplicateGroups] = useState<Array<{ key: string; indices: number[]; day?: string; start_time?: string; classroomName?: string }>>([])

  // --- Effects ---

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (classrooms.length > 0 && teachers.length > 0) {
      fetchSavedClasses()
    }
  }, [classrooms, teachers])

  useEffect(() => {
    if (viewMode === 'class') {
      if (selectedGrade && selectedSection) {
        fetchTimetable()
        fetchTimeSlots()
      }
    } else {
      if (selectedTeacherId) {
        fetchTimetable()
        // For teacher view, we might need to know which shift they are in or show all?
        // For now, let's default to morning or try to infer from their classes
        fetchTimeSlots()
      }
    }
  }, [selectedGrade, selectedSection, selectedTeacherId, viewMode, teachers, subjects])

  // Refetch timings when shift changes
  useEffect(() => {
    if (selectedShift) {
      fetchTimeSlots()
    }
  }, [selectedShift])

  // --- Data Loading ---



  const fetchData = async () => {
    try {
      setLoading(true)
      const userData = localStorage.getItem('sis_user')
      if (!userData) return

      const user = JSON.parse(userData)

      // 1. Fetch Grades from Coordinator Classes
      const classesData = await getCoordinatorClasses()
      if (Array.isArray(classesData) && classesData.length > 0) {
        setClassrooms(classesData)
        // Extract unique grades
        const uniqueGrades = Array.from(new Set(classesData.map((c: any) => c.grade)))

        const sortedGrades = uniqueGrades.sort((a: any, b: any) => {
          // Try to sort numerically if possible
          const numA = parseInt(a.replace(/\D/g, ''))
          const numB = parseInt(b.replace(/\D/g, ''))
          return (isNaN(numA) || isNaN(numB)) ? a.localeCompare(b) : numA - numB
        })

        setAvailableGrades(sortedGrades)
        if (sortedGrades.length > 0) {
          setSelectedGrade(sortedGrades[0])
        }
      }

      // 2. Fetch Teachers
      const coordinator = await findCoordinatorByEmployeeCode(user.username)

      if (coordinator) {
        const teachersData = await getCoordinatorTeachers(coordinator.id)
        let teacherList: Teacher[] = []

        if (Array.isArray(teachersData)) {
          teacherList = teachersData
        } else if (teachersData && (teachersData as any).teachers) {
          teacherList = (teachersData as any).teachers
        } else if (teachersData && Array.isArray((teachersData as any).results)) {
          teacherList = (teachersData as any).results
        }

        setTeachers(teacherList)

        if (teacherList.length > 0) {
          setSelectedTeacherId(teacherList[0].id.toString())
        }

        // Fetch subjects for the user's campus so the subject selector is populated
        try {
          const campusId = getUserCampusId()
          if (campusId) {
            const subjectsData: any[] = await getSubjects({ campus: campusId, is_active: true })
            const subjectObjs = Array.isArray(subjectsData) ? subjectsData.map(s => ({ id: s.id, name: s.name })) : []
            setSubjects(subjectObjs)
          }
        } catch (err) {
          console.error('Failed to load subjects for campus:', err)
        }

        // 3. Detect available shifts from campus
        try {
          const campusId = getUserCampusId()
          if (campusId) {
            // Fetch campus to get shift_available
            const campusResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://sms.idaraalkhair.sbs/be'}/api/campus/${campusId}/`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`
              }
            })
            if (campusResponse.ok) {
              const campusData = await campusResponse.json()
              const shiftAvailable = campusData.shift_available || 'morning'

              if (shiftAvailable === 'both') {
                setAvailableShifts(['morning', 'afternoon'])
              } else if (shiftAvailable === 'afternoon') {
                setAvailableShifts(['afternoon'])
                setSelectedShift('afternoon')
              } else {
                setAvailableShifts(['morning'])
                setSelectedShift('morning')
              }
            }
          }
        } catch (err) {
          console.error('Failed to load campus shifts:', err)
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTimeSlots = async () => {
    try {
      const campusId = getUserCampusId()
      if (!campusId) return

      // Use the selectedShift state directly
      const timings = await getShiftTimings(campusId, selectedShift)

      if (timings && timings.length > 0) {
        // Store full timing objects for break detection
        setShiftTimingsData(timings)

        // Format: "HH:MM - HH:MM"
        const slots = timings.map((t: any) => {
          const start = t.start_time.slice(0, 5)
          const end = t.end_time.slice(0, 5)
          return `${start} - ${end}`
        })
        setTimeSlots(slots)
      } else {
        setShiftTimingsData([])
        setTimeSlots([]) // Empty array if no timings - will show blank sheet
      }

    } catch (error) {
      console.error("Failed to fetch time slots", error)
      setTimeSlots([])
    }
  }

  const fetchTimetable = async () => {
    try {
      setLoading(true)
      let data: any[] = []

      if (viewMode === 'class') {
        if (!selectedGrade || !selectedSection) {
          setLoading(false)
          return
        }

        // Try to find classroom ID first
        const classroom = classrooms.find(c => c.grade === selectedGrade && c.section === selectedSection)

        if (classroom) {
          data = await getClassTimetable({
            classroom: classroom.id
          })
        } else {
          // Fallback to grade/section strings
          data = await getClassTimetable({
            grade: selectedGrade,
            section: selectedSection
          })
        }
      } else {
        if (!selectedTeacherId) {
          setLoading(false)
          return
        }
        data = await getClassTimetable({
          teacher: parseInt(selectedTeacherId)
        })
      }

      if (Array.isArray(data)) {
        // Map backend data to PeriodAssignment interface
        const mapped: PeriodAssignment[] = data
          .filter((item: any) => {
            // Filter based on view mode (using notes field as source indicator)
            // If notes is empty, show in both (legacy/fallback)
            // If notes is set, only show if it matches current view
            if (!item.notes) return true
            return item.notes === `view:${viewMode}`
          })
          .map((item: any) => {
            // Resolve teacher and subject names
            const teacherObj = teachers.find(t => t.id === item.teacher)
            const subjectObj = subjects.find(s => s.id === item.subject)

            // Helper to convert 24h string "HH:MM" to 12h string "HH:MM" for matching timeSlots
            const toDisplayTime = (timeStr: string) => {
              if (!timeStr) return ''
              const [hh, mm] = timeStr.slice(0, 5).split(':')
              let h = parseInt(hh, 10)
              if (h > 12) h -= 12
              if (h === 0) h = 12
              return `${String(h).padStart(2, '0')}:${mm}`
            }

            const start = toDisplayTime(item.start_time)
            const end = toDisplayTime(item.end_time)

            // Find the actual classroom to get correct grade/section
            let itemGrade = selectedGrade
            let itemSection = selectedSection

            if (item.classroom_details) {
              itemGrade = item.classroom_details.grade
              itemSection = item.classroom_details.section
            } else if (item.classroom) {
              // Try to find classroom in our list
              const classroom = classrooms.find(c => c.id === item.classroom)
              if (classroom) {
                itemGrade = classroom.grade
                itemSection = classroom.section
              }
            }

            return {
              id: item.id.toString(),
              day: item.day.charAt(0).toUpperCase() + item.day.slice(1), // Capitalize day
              timeSlot: `${start} - ${end}`,
              grade: itemGrade,
              section: itemSection,
              subject: subjectObj ? subjectObj.name : (item.subject_details?.name || item.subject?.toString() || ''),
              teacherId: item.teacher,
              teacherName: teacherObj ? teacherObj.full_name : (item.teacher_details?.full_name || 'Unknown')
            }
          })
        setAssignments(mapped)
      }
    } catch (error) {
      console.error("Failed to fetch timetable:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSavedClasses = async () => {
    try {
      const classesWithTimetables = []
      const teachersWithTimetables = []

      // Check classrooms for class timetables
      for (const classroom of classrooms) {
        try {
          const data = await getClassTimetable({ classroom: classroom.id })
          // Only include if there are periods marked as class view
          const classViewPeriods = data.filter((item: any) => !item.notes || item.notes === 'view:class')
          if (classViewPeriods && classViewPeriods.length > 0) {
            classesWithTimetables.push(classroom)
          }
        } catch (err) {
          // Skip classes without timetables
          console.log(`No timetable for ${classroom.grade} ${classroom.section}`)
        }
      }

      // Check teachers for teacher timetables
      for (const teacher of teachers) {
        try {
          const data = await getClassTimetable({ teacher: teacher.id })
          console.log(`Teacher ${teacher.full_name} timetable data:`, data)

          if (data && data.length > 0) {
            // Only include if there are periods marked as teacher view
            const teacherViewPeriods = data.filter((item: any) => item.notes === 'view:teacher')
            console.log(`Teacher ${teacher.full_name} has ${teacherViewPeriods.length} teacher view periods`)

            if (teacherViewPeriods && teacherViewPeriods.length > 0) {
              teachersWithTimetables.push(teacher)
            }
          }
        } catch (err) {
          // Skip teachers without timetables
          console.log(`No timetable for teacher ${teacher.full_name}`)
        }
      }

      console.log('Classes with timetables:', classesWithTimetables.length)
      console.log('Teachers with timetables:', teachersWithTimetables.length)

      setSavedClasses(classesWithTimetables)
      setSavedTeachers(teachersWithTimetables)
    } catch (error) {
      console.error('Failed to fetch saved classes:', error)
    }
  }

  const handleClassCardClick = (classroom: any) => {
    setViewMode('class')
    setSelectedGrade(classroom.grade)
    setSelectedSection(classroom.section)
    // fetchTimetable will be triggered by useEffect
  }

  // Legacy loadAssignments removed as we now fetch from API

  const saveAssignments = (newAssignments: PeriodAssignment[]) => {
    setAssignments(newAssignments)
    // localStorage.setItem('school_timetable_assignments', JSON.stringify(newAssignments)) // Removed
  }

  // --- Time helpers (moved out so multiple handlers can reuse) ---
  const toMinutes = (t: string) => {
    const [hhStr, mmStr] = t.split(':').map(s => s.trim())
    const hh = parseInt(hhStr, 10)
    const mm = parseInt(mmStr, 10)
    if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN
    return hh * 60 + mm
  }

  const formatMinutes = (m: number) => {
    const hh = Math.floor(m / 60)
    const mm = m % 60
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  // Normalize times: if end <= start assume end is in PM (add 12h)
  const normalizeTimes = (startStr: string, endStr: string) => {
    const s = toMinutes(startStr)
    let e = toMinutes(endStr)
    if (Number.isNaN(s) || Number.isNaN(e)) return null
    if (e <= s) e += 12 * 60
    return { startM: s, endM: e, start_time: formatMinutes(s), end_time: formatMinutes(e) }
  }

  const handleManualSave = async (opts?: { skipDuplicatePanel?: boolean }) => {
    if (assignments.length === 0) {
      alert('No assignments to save')
      return
    }

    try {
      setIsSaving(true)

      const periods = assignments.map(a => {
        // Find classroom id by grade + section
        const classroom = classrooms.find(c => c.grade === a.grade && c.section === a.section)
        const classroomId = classroom ? classroom.id : undefined

        // Subject may be id string or name string
        let subjectId: number | undefined
        if (a.subject) {
          if (/^\d+$/.test(a.subject)) subjectId = parseInt(a.subject)
          else {
            const subj = subjects.find(s => s.name.toLowerCase() === a.subject.toString().toLowerCase())
            if (subj) subjectId = subj.id
          }
        }

        // Parse timeSlot "HH:MM - HH:MM"
        const [start, end] = a.timeSlot.split('-').map(s => s.trim())

        return {
          classroom: classroomId,
          teacher: a.teacherId,
          subject: subjectId,
          day: a.day.toLowerCase(),
          start_time: start,
          end_time: end,
          is_break: false,
          notes: `view:${viewMode}`
        }
      })

      // Validate periods (presence & time ordering) first
      const errors: string[] = []
      const validPeriods = [] as any[]

      periods.forEach((p, idx) => {
        if (!p.classroom || !p.subject || !p.teacher) {
          errors.push(`Row ${idx + 1}: missing classroom/subject/teacher`)
          return
        }
        const normalized = normalizeTimes(p.start_time, p.end_time)
        if (!normalized) {
          errors.push(`Row ${idx + 1}: invalid time format (${p.start_time} - ${p.end_time})`)
          return
        }
        if (normalized.startM >= normalized.endM) {
          errors.push(`Row ${idx + 1}: start time must be before end time (${p.start_time} >= ${p.end_time})`)
          return
        }
        validPeriods.push({ ...p, start_time: normalized.start_time, end_time: normalized.end_time })
      })

      if (errors.length > 0) {
        console.warn('Validation errors before save:', errors)
        setValidationErrors(errors)
        alert('Cannot save timetable:\n' + errors.slice(0, 10).join('\n'))
        setIsSaving(false)
        return
      }


      // Remove duplicates (keep first occurrence) to avoid backend unique constraint errors
      const seen = new Set<string>()
      const uniquePeriods = validPeriods.filter(p => {
        const key = `${p.classroom}|${p.day}|${p.start_time}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Bulk-create on server (save all unique periods)
      try {
        if (viewMode === 'teacher') {
          // Use Teacher Timetable API
          await bulkCreateTeacherPeriods(uniquePeriods as any)
        } else {
          // Use Class Timetable API
          await bulkCreateClassPeriods(uniquePeriods as any)
        }

        // close any visible validation panel
        setValidationPanelVisible(false)
        setDuplicateGroups([])
        setValidationErrors([])
        alert('Time Table Saved Successfully!')

        await fetchTimetable()
        fetchSavedClasses()
      } catch (apiErr: any) {
        console.error('Bulk create API failed:', apiErr)
        if (apiErr instanceof Error && (apiErr as any).response) {
          try {
            const resp = JSON.parse((apiErr as any).response)
            console.error('Server response (parsed):', resp)
            // If server returned errors array, show in validation panel
            if (resp && resp.errors) {
              const msgs = resp.errors.map((e: any, i: number) => {
                if (e.errors) return `Row ${i + 1}: ${JSON.stringify(e.errors)}`
                if (e.error) return `Row ${i + 1}: ${e.error}`
                return `Row ${i + 1}: ${JSON.stringify(e)}`
              })
              setValidationErrors(msgs)
              setValidationPanelVisible(true)
            } else if (resp && resp.detail) {
              setValidationErrors([String(resp.detail)])
              setValidationPanelVisible(true)
            } else {
              alert('Failed to save timetable. See console for details.')
            }
          } catch (e) {
            alert('Failed to save timetable. See console for details.')
          }
        } else {
          alert('Failed to save timetable. See console for details.')
        }
      }
    } catch (err) {
      console.error('Failed to save timetable:', err)
      alert('Failed to save timetable to server. See console for details.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) return

    try {
      const campusId = getUserCampusId()
      if (!campusId) {
        alert("Campus ID not found. Please log in again.")
        return
      }

      // Create subject in backend
      const created: any = await createSubject({
        name: newSubjectName.trim(),
        campus: campusId,
        description: "Added via Coordinator Time Table"
      })

      // Update local state (store id + name)
      const updatedSubjects = [...subjects, { id: created.id, name: created.name }]
      setSubjects(updatedSubjects)

      // Auto-select the new subject (store id as string)
      setFormData(prev => ({ ...prev, subject: created.id.toString() }))

      setNewSubjectName("")
      setIsAddSubjectDialogOpen(false)
      alert("Subject added successfully!")
    } catch (error) {
      console.error('Failed to add subject:', error)
      alert("Failed to add subject. Please try again.")
    }
  }

  // --- Helpers ---

  const getAssignment = (day: string, timeSlot: string) => {
    if (viewMode === 'class') {
      return assignments.find(a =>
        a.day === day &&
        a.timeSlot === timeSlot &&
        a.grade === selectedGrade &&
        a.section === selectedSection
      )
    } else {
      return assignments.find(a =>
        a.day === day &&
        a.timeSlot === timeSlot &&
        a.teacherId.toString() === selectedTeacherId
      )
    }
  }

  const isBreakTime = (timeSlot: string) => {
    // Check if this slot is marked as break in the fetched timing data
    const timing = shiftTimingsData.find((t: any) => {
      const start = t.start_time.slice(0, 5)
      const end = t.end_time.slice(0, 5)
      const slot = `${start} - ${end}`
      return slot === timeSlot
    })
    return timing ? timing.is_break : false
  }

  // --- Handlers ---

  const handleSlotClick = (day: string, timeSlot: string) => {
    if (isBreakTime(timeSlot)) return

    const existing = getAssignment(day, timeSlot)
    setEditingSlot({ day, timeSlot })

    if (existing) {
      setFormData({
        subject: existing.subject,
        teacherId: existing.teacherId.toString(),
        grade: existing.grade,
        section: existing.section
      })
    } else {
      const defaultGrade = viewMode === 'class' ? selectedGrade : (availableGrades[0] || '')
      const validSections = classrooms.filter(c => c.grade === defaultGrade).map(c => c.section).sort()
      const defaultSection = viewMode === 'class' ? selectedSection : (validSections[0] || '')

      setFormData({
        subject: '',
        teacherId: viewMode === 'teacher' ? selectedTeacherId : '',
        grade: defaultGrade,
        section: defaultSection
      })
    }
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (!editingSlot) return

    const teacher = teachers.find(t => t.id.toString() === formData.teacherId)
    if (!teacher) {
      alert("Please select a valid teacher")
      return
    }

    if (!formData.subject || !formData.grade || !formData.section) {
      alert("Please fill in all fields")
      return
    }

    const teacherConflict = assignments.find(a =>
      a.day === editingSlot.day &&
      a.timeSlot === editingSlot.timeSlot &&
      a.teacherId.toString() === formData.teacherId &&
      !(a.grade === formData.grade && a.section === formData.section)
    )

    if (teacherConflict) {
      const confirm = window.confirm(
        `Conflict: ${teacher.full_name} is already assigned to ${teacherConflict.grade} ${teacherConflict.section} at this time. Overwrite?`
      )
      if (!confirm) return

      const cleaned = assignments.filter(a => a.id !== teacherConflict.id)
      saveAssignments(cleaned)
    }

    let newAssignments = [...assignments]

    newAssignments = newAssignments.filter(a =>
      !(a.day === editingSlot.day &&
        a.timeSlot === editingSlot.timeSlot &&
        a.grade === formData.grade &&
        a.section === formData.section)
    )

    newAssignments = newAssignments.filter(a =>
      !(a.day === editingSlot.day &&
        a.timeSlot === editingSlot.timeSlot &&
        a.teacherId.toString() === formData.teacherId)
    )

    const newAssignment: PeriodAssignment = {
      id: Date.now().toString(),
      day: editingSlot.day,
      timeSlot: editingSlot.timeSlot,
      grade: formData.grade,
      section: formData.section,
      subject: formData.subject,
      teacherId: parseInt(formData.teacherId),
      teacherName: teacher.full_name
    }

    newAssignments.push(newAssignment)
    saveAssignments(newAssignments)
    setIsDialogOpen(false)
  }

  const openAssignmentForIndex = (index: number) => {
    const a = assignments[index]
    if (!a) return
    // set selection to the assignment's grade/section/teacher then open edit dialog
    try {
      setSelectedGrade(a.grade)
      setSelectedSection(a.section)
      setFormData({ subject: a.subject, teacherId: a.teacherId.toString(), grade: a.grade, section: a.section })
      setEditingSlot({ day: a.day, timeSlot: a.timeSlot })
      setIsDialogOpen(true)
    } catch (e) {
      console.error('Failed to open assignment for edit', e)
    }
  }

  const handleDelete = () => {
    if (!editingSlot) return

    let newAssignments = [...assignments]

    if (viewMode === 'class') {
      newAssignments = newAssignments.filter(a =>
        !(a.day === editingSlot.day &&
          a.timeSlot === editingSlot.timeSlot &&
          a.grade === selectedGrade &&
          a.section === selectedSection)
      )
    } else {
      newAssignments = newAssignments.filter(a =>
        !(a.day === editingSlot.day &&
          a.timeSlot === editingSlot.timeSlot &&
          a.teacherId.toString() === selectedTeacherId)
      )
    }

    saveAssignments(newAssignments)
    setIsDialogOpen(false)
  }

  // --- Render ---

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#274c77]">Time Table Management</h1>
          <p className="text-gray-600">Manage schedules for classes and teachers</p>
        </div>

        <div className="flex items-center gap-4">
          <Button
            onClick={() => setIsManagingTimings(true)}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Calendar size={16} />
            Manage Timings
          </Button>

          <Button
            onClick={() => handleManualSave()}
            className="bg-[#274c77] hover:bg-[#1a365d] text-white gap-2"
            disabled={isSaving}
          >
            <Save size={16} />
            {isSaving ? "Saving..." : "Saved"}
          </Button>

          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('class')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'class'
                ? 'bg-white text-[#274c77] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <div className="flex items-center gap-2">
                <GraduationCap size={16} />
                Class View
              </div>
            </button>
            <button
              onClick={() => setViewMode('teacher')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'teacher'
                ? 'bg-white text-[#274c77] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <div className="flex items-center gap-2">
                <User size={16} />
                Teacher View
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Validation / Duplicates Panel */}
      {validationPanelVisible && duplicateGroups.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-red-700">Duplicate Periods Detected</h3>
                <p className="text-sm text-gray-700">Some rows have the same class, day and start time. Choose to remove duplicates or fix them manually.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setValidationPanelVisible(false)}>Dismiss</Button>
                <Button className="bg-red-600" onClick={async () => {
                  // Remove duplicates from assignments (keep first occurrence)
                  const seen = new Set<string>()
                  const deduped: PeriodAssignment[] = []
                  assignments.forEach(a => {
                    const classroom = classrooms.find(c => c.grade === a.grade && c.section === a.section)
                    const classroomId = classroom ? classroom.id : 'unknown'
                    const parts = a.timeSlot.split('-').map((s: string) => s.trim())
                    const normalized = normalizeTimes(parts[0], parts[1])
                    const start = normalized ? normalized.start_time : a.timeSlot
                    const key = `${classroomId}|${a.day}|${start}`
                    if (!seen.has(key)) {
                      seen.add(key)
                      deduped.push(a)
                    }
                  })
                  saveAssignments(deduped)
                  setValidationPanelVisible(false)
                  // Re-run save and allow skip of panel since duplicates removed
                  await handleManualSave({ skipDuplicatePanel: true })
                }}>Remove duplicates</Button>
              </div>
            </div>

            <div className="mt-3 space-y-2 max-h-56 overflow-auto">
              {validationErrors.length > 0 && (
                <div className="p-2 bg-white rounded border">
                  <div className="text-sm font-medium text-red-700">Server validation errors</div>
                  <div className="text-xs text-gray-700 mt-2 space-y-1">
                    {validationErrors.map((m, i) => <div key={i}>{m}</div>)}
                  </div>
                </div>
              )}

              {duplicateGroups.map((g, i) => (
                <div key={g.key} className="p-2 bg-white rounded border flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{g.classroomName} — {g.day} @ {g.start_time}</div>
                    <div className="text-xs text-gray-600">Rows: {g.indices.map(idx => idx + 1).join(', ')}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => openAssignmentForIndex(g.indices[0])}>Edit first</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters Bar */}
      <Card className="bg-[#f8f9fa] border-[#a3cef1]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            {viewMode === 'class' ? (
              <>
                <div className="w-48">
                  <Label className="text-[#274c77]">Grade</Label>
                  <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select Grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGrades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <Label className="text-[#274c77]">Section</Label>
                  <Select value={selectedSection} onValueChange={setSelectedSection}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Shift Selector - only show if coordinator has both shifts */}
                {availableShifts.length > 1 && (
                  <div className="w-40">
                    <Label className="text-[#274c77]">Shift</Label>
                    <Select value={selectedShift} onValueChange={setSelectedShift}>
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="afternoon">Afternoon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            ) : (
              <div className="w-64">
                <Label className="text-[#274c77]">Teacher</Label>
                <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select Teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Grid */}
      <Card className="border-[#a3cef1] overflow-hidden">
        {timeSlots.length === 0 ? (
          <CardContent className="p-12 text-center">
            <Calendar size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Timings Configured</h3>
            <p className="text-gray-500 mb-6">
              Please configure shift timings for {selectedShift} shift before creating timetables.
            </p>
            <Button
              onClick={() => setIsManagingTimings(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus size={16} className="mr-2" />
              Configure Timings
            </Button>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#274c77] text-white">
                  <th className="p-3 border-r border-white/20 w-32 sticky left-0 bg-[#274c77] z-10">Time</th>
                  {WEEK_DAYS.map(day => (
                    <th key={day} className="p-3 border-l border-white/20 min-w-[140px]">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot, i) => (
                  <tr key={slot} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fa]'}>
                    <td className="p-3 border-r border-gray-200 font-medium text-sm text-gray-600 sticky left-0 bg-inherit z-10">
                      {slot}
                    </td>
                    {WEEK_DAYS.map(day => {
                      const isBreak = isBreakTime(slot)
                      const assignment = getAssignment(day, slot)

                      if (isBreak) {
                        return (
                          <td key={day} className="p-2 border-l border-gray-200 bg-gray-100 text-center">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Break</span>
                          </td>
                        )
                      }

                      return (
                        <td
                          key={day}
                          className="p-2 border-l border-gray-200 cursor-pointer hover:bg-[#e7f1ff] transition-colors relative group"
                          onClick={() => handleSlotClick(day, slot)}
                        >
                          {assignment ? (
                            <div className="bg-[#d0e7ff] p-2 rounded border border-[#a3cef1] text-sm">
                              <div className="font-semibold text-[#274c77]">
                                {typeof assignment.subject === 'string' && /^\d+$/.test(assignment.subject)
                                  ? (subjects.find(s => s.id.toString() === assignment.subject)?.name || assignment.subject)
                                  : (subjects.find(s => s.name.toLowerCase() === assignment.subject.toString().toLowerCase())?.name || assignment.subject)
                                }
                              </div>
                              {viewMode === 'class' ? (
                                <div className="text-xs text-gray-600 truncate">{assignment.teacherName}</div>
                              ) : (
                                <div className="text-xs text-gray-600">{assignment.grade} - {assignment.section}</div>
                              )}
                            </div>
                          ) : (
                            <div className="h-12 flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <Plus className="text-[#a3cef1]" size={20} />
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSlot && `${editingSlot.day} @ ${editingSlot.timeSlot}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <div className="flex gap-2">
                <Select
                  value={formData.subject}
                  onValueChange={v => setFormData({ ...formData, subject: v })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsAddSubjectDialogOpen(true)}
                  title="Add New Subject"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Grade</Label>
                <Select
                  value={formData.grade}
                  onValueChange={v => {
                    const validSections = classrooms.filter(c => c.grade === v).map(c => c.section).sort()
                    setFormData({ ...formData, grade: v, section: validSections[0] || '' })
                  }}
                  disabled={viewMode === 'class'}
                >
                  <SelectTrigger><SelectValue placeholder="Select Grade" /></SelectTrigger>
                  <SelectContent>
                    {availableGrades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select
                  value={formData.section}
                  onValueChange={v => setFormData({ ...formData, section: v })}
                  disabled={viewMode === 'class'}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(
                      classrooms
                        .filter(c => c.grade === formData.grade)
                        .map(c => c.section)
                    ))
                      .sort()
                      .map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Teacher</Label>
              <Select
                value={formData.teacherId}
                onValueChange={v => setFormData({ ...formData, teacherId: v })}
                disabled={viewMode === 'teacher'}
              >
                <SelectTrigger><SelectValue placeholder="Select Teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="destructive" onClick={handleDelete} type="button">
              Clear Slot
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} className="bg-[#274c77]">Save Assignment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Subject Dialog */}
      <Dialog open={isAddSubjectDialogOpen} onOpenChange={setIsAddSubjectDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add New Subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subject Name</Label>
              <Input
                value={newSubjectName}
                onChange={e => setNewSubjectName(e.target.value)}
                placeholder="e.g. Physics"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSubjectDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSubject} className="bg-[#274c77]">Add Subject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved Class Timetables Section */}
      {savedClasses.length > 0 && (
        <Card className="border-[#a3cef1]">
          <CardHeader>
            <CardTitle className="text-[#274c77] flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Class Timetables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {savedClasses.map((classroom) => (
                <div
                  key={classroom.id}
                  onClick={() => handleClassCardClick(classroom)}
                  className="p-4 border-2 border-[#a3cef1] rounded-lg cursor-pointer hover:bg-[#f8f9fa] hover:border-[#274c77] hover:shadow-md transition-all group"
                >
                  <div className="flex flex-col items-center text-center">
                    <GraduationCap className="h-8 w-8 text-[#274c77] mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-lg font-bold text-[#274c77]">
                      {classroom.grade}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      Section {classroom.section}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {classroom.shift || 'Morning'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Teacher Timetables Section */}
      {savedTeachers.length > 0 && (
        <Card className="border-[#a3cef1]">
          <CardHeader>
            <CardTitle className="text-[#274c77] flex items-center gap-2">
              <User className="h-5 w-5" />
              Teacher Timetables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {savedTeachers.map((teacher) => (
                <div
                  key={teacher.id}
                  onClick={() => {
                    setViewMode('teacher')
                    setSelectedTeacherId(teacher.id.toString())
                  }}
                  className="p-4 border-2 border-[#a3cef1] rounded-lg cursor-pointer hover:bg-[#f8f9fa] hover:border-[#274c77] hover:shadow-md transition-all group"
                >
                  <div className="flex flex-col items-center text-center">
                    <User className="h-8 w-8 text-[#274c77] mb-2 group-hover:scale-110 transition-transform" />
                    <div className="text-sm font-bold text-[#274c77]">
                      {teacher.full_name}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {teacher.employee_code}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timing Management Dialog */}
      <Dialog open={isManagingTimings} onOpenChange={setIsManagingTimings}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Shift Timings - {selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)} Shift</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current Timings List */}
            <div>
              <h4 className="font-semibold mb-2">Current Periods</h4>
              {shiftTimingsData.length === 0 ? (
                <p className="text-gray-500 text-sm">No periods configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {shiftTimingsData.map((timing: any, index: number) => (
                    <div key={timing.id} className="flex items-center gap-2 p-2 border rounded">
                      <span className="w-8 text-sm text-gray-500">#{index + 1}</span>
                      <span className="flex-1 font-medium">{timing.name}</span>
                      <span className="text-sm">{timing.start_time.slice(0, 5)} - {timing.end_time.slice(0, 5)}</span>
                      {timing.is_break && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Break</span>}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          if (confirm('Delete this period?')) {
                            try {
                              await deleteShiftTiming(timing.id)
                              await fetchTimeSlots()
                              alert('Period deleted!')
                            } catch (err) {
                              alert('Failed to delete period')
                            }
                          }
                        }}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Period Form */}
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Add New Period</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Period Name</Label>
                  <Input
                    id="period-name"
                    placeholder="e.g., Period 1, Break"
                  />
                </div>
                <div>
                  <Label>Order</Label>
                  <Input
                    id="period-order"
                    type="number"
                    placeholder="1, 2, 3..."
                    defaultValue={shiftTimingsData.length + 1}
                  />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Input
                    id="period-start"
                    type="time"
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    id="period-end"
                    type="time"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2">
                    <input
                      id="period-break"
                      type="checkbox"
                      className="rounded"
                    />
                    <span className="text-sm">This is a break period</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManagingTimings(false)}>
              Close
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={async () => {
                const name = (document.getElementById('period-name') as HTMLInputElement)?.value
                const order = parseInt((document.getElementById('period-order') as HTMLInputElement)?.value || '0')
                const startTime = (document.getElementById('period-start') as HTMLInputElement)?.value
                const endTime = (document.getElementById('period-end') as HTMLInputElement)?.value
                const isBreak = (document.getElementById('period-break') as HTMLInputElement)?.checked

                if (!name || !startTime || !endTime) {
                  alert('Please fill all fields')
                  return
                }

                try {
                  const campusId = getUserCampusId()
                  await createShiftTiming({
                    campus: campusId,
                    shift: selectedShift,
                    name,
                    start_time: startTime,
                    end_time: endTime,
                    is_break: isBreak,
                    order
                  })

                    // Clear form
                    ; (document.getElementById('period-name') as HTMLInputElement).value = ''
                    ; (document.getElementById('period-start') as HTMLInputElement).value = ''
                    ; (document.getElementById('period-end') as HTMLInputElement).value = ''
                    ; (document.getElementById('period-break') as HTMLInputElement).checked = false

                  await fetchTimeSlots()
                  alert('Period added successfully!')
                } catch (err) {
                  console.error(err)
                  alert('Failed to add period')
                }
              }}
            >
              <Plus size={16} className="mr-2" />
              Add Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
