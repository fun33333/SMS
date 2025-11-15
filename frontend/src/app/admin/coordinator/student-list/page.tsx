"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Search, Phone, Mail, GraduationCap, Building2 } from "lucide-react"
import { getAllStudents, getCoordinatorClasses } from "@/lib/api"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useRouter } from "next/navigation"
import { DataTable } from "@/components/shared/data-table"

type StudentRow = {
  id: number
  name: string
  student_code: string
  gr_no: string
  father_name: string
  email: string
  phone: string
  enrollment_year: string
  current_grade: string
  classroom_name: string
  campus_name: string
  current_state: string
  gender: string
  shift: string
}

function CoordinatorStudentListContent() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCoordinator, setIsCoordinator] = useState(false)
  
  // Filter states
  const [selectedShift, setSelectedShift] = useState<string>("all")
  const [selectedGrade, setSelectedGrade] = useState<string>("all")
  const [selectedSection, setSelectedSection] = useState<string>("all")
  
  // Available options from coordinator classes
  const [availableShifts, setAvailableShifts] = useState<string[]>([])
  const [availableGrades, setAvailableGrades] = useState<Array<{name: string, shifts: string[]}>>([])
  const [availableSections, setAvailableSections] = useState<string[]>([])
  const [coordinatorClasses, setCoordinatorClasses] = useState<any[]>([])

  // Helper function to truncate subjects/grades to max 2 items

  // Fetch coordinator classes to get available shifts, grades, and sections
  useEffect(() => {
    async function fetchCoordinatorClasses() {
      try {
        const classesData = await getCoordinatorClasses()
        const classes = Array.isArray(classesData) ? classesData : []
        setCoordinatorClasses(classes)
        
        // Extract unique shifts
        const shifts = new Set<string>()
        classes.forEach((cls: any) => {
          if (cls.shift) {
            shifts.add(cls.shift.toLowerCase())
          }
        })
        setAvailableShifts(Array.from(shifts).sort())
        
        // Extract unique grades with their shifts (a grade can appear in multiple shifts)
        const gradesMap = new Map<string, Set<string>>()
        classes.forEach((cls: any) => {
          if (cls.grade) {
            const gradeName = typeof cls.grade === 'string' ? cls.grade : cls.grade.name || cls.grade
            const shift = cls.shift?.toLowerCase() || ''
            if (!gradesMap.has(gradeName)) {
              gradesMap.set(gradeName, new Set())
            }
            if (shift) {
              gradesMap.get(gradeName)!.add(shift)
            }
          }
        })
        // Convert to array format: each grade can have multiple shifts
        const grades: Array<{name: string, shifts: string[]}> = Array.from(gradesMap.entries()).map(([name, shifts]) => ({ 
          name, 
          shifts: Array.from(shifts) 
        }))
        setAvailableGrades(grades.sort((a, b) => a.name.localeCompare(b.name)) as any)
        
        // Extract unique sections
        const sections = new Set<string>()
        classes.forEach((cls: any) => {
          if (cls.section) {
            sections.add(cls.section.toUpperCase())
          }
        })
        setAvailableSections(Array.from(sections).sort())
      } catch (err) {
        console.error("Error fetching coordinator classes:", err)
      }
    }
    fetchCoordinatorClasses()
  }, [])

  useEffect(() => {
    async function fetchStudents() {
      setLoading(true)
      setError(null)
      try {
        // Check if we're on client side
        if (typeof window === 'undefined') {
          setError("Please wait, loading...");
          return;
        }
        
         // Get user from localStorage
         const user = localStorage.getItem("sis_user");
         if (user) {
           try {
             const parsedUser = JSON.parse(user)
             const role = String(parsedUser?.role || '').toLowerCase()
             setIsCoordinator(role.includes('coord'))
           } catch {
             setIsCoordinator(false)
           }
           
           // Backend automatically filters students based on logged-in coordinator
           // No need to find coordinator separately
           const studentsData = await getAllStudents(true); // Force refresh to get latest data
           
           // Map student data to the expected format
           const mappedStudents = studentsData.map((student: any) => ({
             id: student.id,
             name: student.name || 'Unknown',
             student_code: student.student_id || student.student_code || 'Not Assigned',
             gr_no: student.gr_no || 'Not Assigned',
             father_name: student.father_name || 'Not provided',
             email: student.email || 'Not provided',
             phone: student.contact_number || 'Not provided',
             enrollment_year: student.enrollment_year || 'Not provided',
             current_grade: student.current_grade || 'Not Assigned',
             classroom_name: student.classroom_name || 'Not Assigned',
             campus_name: student.campus_name || 'Not Assigned',
             current_state: student.current_state || 'Active',
             gender: student.gender || 'Not specified',
             shift: student.shift || 'Not specified'
           }))
          
          setStudents(mappedStudents)
        } else {
          setIsCoordinator(false)
          setError("User not logged in")
        }
      } catch (err: any) {
        console.error("Error fetching students:", err)
        setError(err.message || "Failed to load students")
      } finally {
        setLoading(false)
      }
    }
    fetchStudents()
  }, [])
  
  // Reset grade and section when shift changes
  useEffect(() => {
    if (selectedShift === "all") {
      setSelectedGrade("all")
      setSelectedSection("all")
    } else {
      setSelectedGrade("all")
      setSelectedSection("all")
    }
  }, [selectedShift])
  
  // Reset section when grade changes
  useEffect(() => {
    setSelectedSection("all")
  }, [selectedGrade])
  
  // Get filtered grades based on selected shift
  const filteredGrades = useMemo(() => {
    if (selectedShift === "all") {
      return availableGrades
    }
    return availableGrades.filter(grade => 
      grade.shifts.includes(selectedShift.toLowerCase())
    )
  }, [selectedShift, availableGrades])
  
  // Get filtered sections based on selected grade
  const filteredSections = useMemo(() => {
    if (selectedGrade === "all") {
      return availableSections
    }
    // Get sections for the selected grade from coordinator classes
    const sections = new Set<string>()
    coordinatorClasses.forEach((cls: any) => {
      const gradeName = typeof cls.grade === 'string' ? cls.grade : cls.grade?.name || cls.grade
      if (gradeName === selectedGrade && cls.section) {
        sections.add(cls.section.toUpperCase())
      }
    })
    return Array.from(sections).sort()
  }, [selectedGrade, coordinatorClasses])

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Search filter (only apply if search has value)
      if (search.trim()) {
        const matchesSearch = 
          student.name.toLowerCase().includes(search.toLowerCase()) ||
          student.student_code.toLowerCase().includes(search.toLowerCase()) ||
          student.gr_no.toLowerCase().includes(search.toLowerCase()) ||
          student.father_name.toLowerCase().includes(search.toLowerCase()) ||
          student.email.toLowerCase().includes(search.toLowerCase())
        
        if (!matchesSearch) return false
      }
      
      // Shift filter
      if (selectedShift !== "all") {
        const studentShift = (student.shift || '').toLowerCase()
        if (studentShift !== selectedShift.toLowerCase()) {
          return false
        }
      }
      
      // Grade filter
      if (selectedGrade !== "all") {
        const studentGrade = (student.current_grade || '').trim()
        const filterGrade = selectedGrade.trim()
        
        // Normalize grade names for comparison - CRITICAL: Keep KG-I and KG-II STRICTLY separate
        const normalizeGrade = (grade: string): string => {
          if (!grade) return ''
          let normalized = grade.toLowerCase().trim()
          
          // CRITICAL: Check for KG-II FIRST (longer match) before any other processing
          // This ensures "KG-II" doesn't get matched as "KG-I"
          if (normalized.includes('kg-ii') || normalized === 'kg-2' || normalized === 'kg2') {
            return 'kg-ii'
          }
          
          // Now check for KG-I (but NOT if it's part of KG-II)
          if (normalized.includes('kg-i') && !normalized.includes('kg-ii')) {
            return 'kg-i'
          }
          if (normalized === 'kg-1' || normalized === 'kg1') {
            return 'kg-i'
          }
          
          // For other grades, remove section suffix and normalize
          normalized = normalized
            .replace(/\s*-\s*[a-z]$/i, '')  // Remove " - A" suffix
            .replace(/\s+[a-z]$/i, '')     // Remove " A" suffix
            .replace(/[a-z]$/i, '')         // Remove single letter suffix at end
          
          return normalized.replace(/\s+/g, '-').trim()
        }
        
        // Check if grade matches in current_grade field (with normalization)
        let gradeMatches = normalizeGrade(studentGrade) === normalizeGrade(filterGrade)
        
        // If not matched, try to extract grade from classroom_name
        if (!gradeMatches && student.classroom_name) {
          const classroomName = student.classroom_name.trim().toLowerCase()
          
          // CRITICAL: Check for KG-II FIRST in classroom name (exact match, not substring)
          // This prevents "KG-II" from being matched as "KG-I"
          if (classroomName.includes('kg-ii')) {
            // This is definitely KG-II, check if filter matches
            const normalizedExtracted = 'kg-ii'
            const normalizedFilter = normalizeGrade(filterGrade)
            gradeMatches = (normalizedExtracted === normalizedFilter)
          } else if (classroomName.includes('kg-i') && !classroomName.includes('kg-ii')) {
            // This is KG-I (and NOT KG-II), check if filter matches
            const normalizedExtracted = 'kg-i'
            const normalizedFilter = normalizeGrade(filterGrade)
            gradeMatches = (normalizedExtracted === normalizedFilter)
          } else {
            // For other grades, use pattern matching
            const gradePatterns = [
              /^(.+?)\s*-\s*([A-Z])/i,         // "KG-I - A" -> "KG-I" (matches "KG-I - A" format)
              /^(.+?)-([A-Z])$/i,              // "KG-I-A" -> "KG-I" (matches "KG-I-A" format, no space)
              /^(.+?)\s+([A-Z])$/i,           // "KG-I A" -> "KG-I" (matches "KG-I A" format)
            ]
            
            for (const pattern of gradePatterns) {
              const match = student.classroom_name.trim().match(pattern)
              if (match && match[1]) {
                const extractedGrade = match[1].trim()
                // Normalize both for comparison - must match exactly
                const normalizedExtracted = normalizeGrade(extractedGrade)
                const normalizedFilter = normalizeGrade(filterGrade)
                
                // Strict comparison - KG-I should NOT match KG-II
                if (normalizedExtracted === normalizedFilter) {
                  gradeMatches = true
                  break
                }
              }
            }
          }
        }
        
        if (!gradeMatches) {
          return false
        }
      }
      
      // Section filter
      if (selectedSection !== "all") {
        // Extract section from classroom_name (e.g., "Nursery - A" -> "A", "KG-I-A" -> "A", "KG-I - A" -> "A")
        const classroomName = (student.classroom_name || '').trim()
        
        // Try multiple patterns: "Grade - Section", "Grade-Section", "GradeSection"
        // Order matters: check space-dash format first (most common), then no-space dash, then space, then last letter
        const patterns = [
          /\s*-\s*([A-Z])$/i,
          /\s*-\s*([A-Z])/i,           
          /-([A-Z])$/i,
          /-\s*([A-Z])/i,              
          /\s+([A-Z])$/i,              
          /([A-Z])$/i,                 
        ]
        
        let studentSection = ''
        for (const pattern of patterns) {
          const match = classroomName.match(pattern)
          if (match && match[1]) {
            studentSection = match[1].toUpperCase()
            break
          }
        }
        
        // Debug log for section matching
        if (selectedSection === "A" && studentSection !== selectedSection.toUpperCase()) {
          console.log('🔍 Section Mismatch:', {
            classroomName,
            extractedSection: studentSection,
            selectedSection: selectedSection.toUpperCase(),
            match: studentSection === selectedSection.toUpperCase()
          })
        }
        
        if (studentSection !== selectedSection.toUpperCase()) {
          return false
        }
      }
      
      return true
    })
  }, [students, search, selectedShift, selectedGrade, selectedSection])

  const columns = [
    {
      key: "name",
      label: "Student",
      render: (student: StudentRow) => (
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-gray-900">{student.name}</p>
          <div className="flex flex-wrap gap-1 text-[11px] sm:text-xs text-gray-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e7ecef] px-1.5 py-0.5">
              <Users className="h-3.5 w-3.5 text-[#274c77]" />
              {student.gender}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e7ecef] px-1.5 py-0.5">
              <GraduationCap className="h-3.5 w-3.5 text-[#274c77]" />
              {student.current_grade}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "student_code",
      label: "Student ID",
      render: (student: StudentRow) => (
        <div className="space-y-1">
          <span className="font-medium text-gray-900">{student.student_code}</span>
          <span className="block text-xs text-gray-500">GR: {student.gr_no}</span>
        </div>
      ),
    },
    {
      key: "father_name",
      label: "Guardian",
      render: (student: StudentRow) => (
        <div className="space-y-1">
          <p className="text-gray-900 font-medium">{student.father_name}</p>
          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {student.phone}
            </span>
            <span className="inline-flex items-center gap-1 break-all">
              <Mail className="h-3.5 w-3.5" />
              {student.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "classroom_name",
      label: "Classroom",
      render: (student: StudentRow) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-gray-900 font-medium">
            <Building2 className="h-4 w-4 text-[#274c77]" />
            {student.classroom_name}
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#a3cef1]/40 px-2 py-0.5 text-[11px] sm:text-xs text-[#274c77] font-medium">
            {student.campus_name}
          </span>
        </div>
      ),
    },
    {
      key: "current_state",
      label: "Status",
      render: (student: StudentRow) => (
        <Badge
          variant={student.current_state === 'Active' ? 'default' : 'secondary'}
          className="px-3 py-1 text-xs sm:text-sm"
          style={{
            backgroundColor: student.current_state === 'Active' ? '#10b981' : '#6b7280',
            color: 'white'
          }}
        >
          {student.current_state}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Student List
          </CardTitle>
          <p className="text-sm text-gray-600">
            View and manage students from classrooms taught by your assigned teachers
          </p>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Shift Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Shift</Label>
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Shifts</SelectItem>
                    {availableShifts.map((shift) => (
                      <SelectItem key={shift} value={shift}>
                        {shift.charAt(0).toUpperCase() + shift.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Grade Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Grade</Label>
                <Select 
                  value={selectedGrade} 
                  onValueChange={setSelectedGrade}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grades</SelectItem>
                    {filteredGrades.map((grade) => (
                      <SelectItem key={grade.name} value={grade.name}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Section Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Section</Label>
                <Select 
                  value={selectedSection} 
                  onValueChange={setSelectedSection}
                  disabled={selectedGrade === "all"}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={selectedGrade === "all" ? "Select grade first" : "Select section"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {filteredSections.map((section) => (
                      <SelectItem key={section} value={section}>
                        {section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Search */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search students..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 w-full"
                  />
                </div>
              </div>
            </div>
            
            <div className="text-sm text-gray-500 text-left">
              Showing {filteredStudents.length} of {students.length} Students
            </div>
          </div>

          {loading ? (
            <LoadingSpinner message="Loading students..." />
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 mb-4">
                <Users className="h-12 w-12 mx-auto mb-2" />
                <p className="font-medium">Error: {error}</p>
              </div>
              <Button onClick={() => window.location.reload()} variant="outline">
                Try Again
              </Button>
            </div>
          ) : (
            <DataTable
              data={filteredStudents}
              columns={columns}
              onView={(student) => router.push(`/admin/students/profile?id=${student.id}`)}
              onEdit={isCoordinator ? undefined : (student) => router.push(`/admin/students/edit?id=${student.id}`)}
              allowEdit={!isCoordinator}
              allowDelete={false}
              emptyMessage={search ? "No students match your search." : "No students found"}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CoordinatorStudentListPage() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    document.title = "Student List - Coordinator | IAK SMS";
  }, [])

  if (!isClient) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Student List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LoadingSpinner message="Loading..." />
          </CardContent>
        </Card>
      </div>
    )
  }

  return <CoordinatorStudentListContent />
}
