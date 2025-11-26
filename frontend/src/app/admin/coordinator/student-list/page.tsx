"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Search, GraduationCap, Building2, User, CalendarIcon } from "lucide-react"
import { getAllStudents, getCoordinatorClasses, getStudentById, apiPatch, apiDelete, getClassrooms, getApiBaseUrl, getFilteredStudents } from "@/lib/api"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useRouter } from "next/navigation"
import { DataTable } from "@/components/shared/data-table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calender"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"

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
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(25)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  
  // Available options from coordinator classes
  const [availableShifts, setAvailableShifts] = useState<string[]>([])
  const [availableGrades, setAvailableGrades] = useState<Array<{name: string, shifts: string[]}>>([])
  const [availableSections, setAvailableSections] = useState<string[]>([])
  const [coordinatorClasses, setCoordinatorClasses] = useState<any[]>([])
  
  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null)
  const [editFormData, setEditFormData] = useState<any>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDobPicker, setShowDobPicker] = useState(false)
  const [availableClassrooms, setAvailableClassrooms] = useState<any[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

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

  // Fetch students with pagination
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
           
           // Build filter params for API
           const filterParams: any = {
             page: currentPage,
             page_size: pageSize,
           }
           
           // Add search if provided
           if (search.trim()) {
             filterParams.search = search.trim()
           }
           
           // Add shift filter if not "all"
           if (selectedShift !== "all") {
             filterParams.shift = selectedShift
           }
           
           // Add grade filter if not "all"
           if (selectedGrade !== "all") {
             filterParams.current_grade = selectedGrade
           }
           
           // Add section filter if not "all"
           if (selectedSection !== "all") {
             filterParams.section = selectedSection
           }
           
           // Fetch paginated students
           const response = await getFilteredStudents(filterParams)
           
           // Map student data to the expected format
           const mappedStudents = (response.results || []).map((student: any) => ({
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
          setTotalCount(response.count || 0)
          setTotalPages(Math.ceil((response.count || 0) / pageSize))
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
  }, [currentPage, pageSize, search, selectedShift, selectedGrade, selectedSection])
  
  // Reset grade and section when shift changes
  useEffect(() => {
    if (selectedShift === "all") {
      setSelectedGrade("all")
      setSelectedSection("all")
    } else {
      setSelectedGrade("all")
      setSelectedSection("all")
    }
    setCurrentPage(1) // Reset to first page when filter changes
  }, [selectedShift])
  
  // Reset section when grade changes
  useEffect(() => {
    setSelectedSection("all")
    setCurrentPage(1) // Reset to first page when filter changes
  }, [selectedGrade])
  
  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [search])
  
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

  // No client-side filtering needed - API handles all filtering and pagination
  const filteredStudents = useMemo(() => {
    return students
  }, [students])

  // Handle edit student
  const handleEditStudent = async (student: StudentRow) => {
    try {
      // Fetch full student data
      const fullStudentData = await getStudentById(student.id)
      if (!fullStudentData) {
        toast.error("Failed to load student data")
        return
      }
      
      // Fetch classrooms for dropdown
      const classroomsData = await getClassrooms()
      const classroomsList = Array.isArray(classroomsData) ? classroomsData : ((classroomsData as any)?.results || [])
      setAvailableClassrooms(classroomsList)
      
      setEditingStudent(student)
      setEditFormData({
        name: fullStudentData.name || student.name,
        gender: fullStudentData.gender || student.gender,
        dob: fullStudentData.dob || '',
        place_of_birth: fullStudentData.place_of_birth || '',
        religion: fullStudentData.religion || '',
        mother_tongue: fullStudentData.mother_tongue || '',
        emergency_contact: fullStudentData.emergency_contact || '',
        address: fullStudentData.address || '',
        is_active: fullStudentData.is_active !== undefined ? fullStudentData.is_active : true,
        photo: fullStudentData.photo || null,
        // Father Information
        father_name: fullStudentData.father_name || student.father_name,
        father_cnic: fullStudentData.father_cnic || '',
        father_contact: fullStudentData.father_contact || fullStudentData.contact_number || student.phone,
        father_profession: fullStudentData.father_profession || '',
        father_status: fullStudentData.father_status || '',
        // Academic Information
        current_grade: fullStudentData.current_grade || student.current_grade,
        section: fullStudentData.section || '',
        enrollment_year: fullStudentData.enrollment_year || '',
        classroom: fullStudentData.classroom || fullStudentData.classroom_id || null,
        shift: fullStudentData.shift || student.shift,
      })
      setShowEditDialog(true)
    } catch (error: any) {
      console.error("Error loading student:", error)
      toast.error("Failed to load student data")
    }
  }

  // Handle delete student
  const handleDeleteStudent = async (student: StudentRow) => {
    if (!confirm(`Are you sure you want to delete student "${student.name}"? This action cannot be undone.`)) {
      return
    }
    
    setIsDeleting(true)
    try {
      await apiDelete(`/api/students/${student.id}/`)
      toast.success("Student deleted successfully!")
      
      // Refresh current page - if current page becomes empty, go to previous page
      const filterParams: any = {
        page: currentPage,
        page_size: pageSize,
      }
      
      if (search.trim()) filterParams.search = search.trim()
      if (selectedShift !== "all") filterParams.shift = selectedShift
      if (selectedGrade !== "all") filterParams.current_grade = selectedGrade
      if (selectedSection !== "all") filterParams.section = selectedSection
      
      const response = await getFilteredStudents(filterParams)
      
      // If current page is empty and not on first page, go to previous page
      if (response.results.length === 0 && currentPage > 1) {
        setCurrentPage(currentPage - 1)
      } else {
        // Refresh current page data
        const mappedStudents = (response.results || []).map((student: any) => ({
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
        setTotalCount(response.count || 0)
        setTotalPages(Math.ceil((response.count || 0) / pageSize))
      }
    } catch (error: any) {
      console.error("Error deleting student:", error)
      toast.error(error?.message || "Failed to delete student")
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle DOB select
  const handleDobSelect = (date: Date | undefined) => {
    if (date) {
      setEditFormData({ ...editFormData, dob: date.toISOString().split('T')[0] })
    }
    setShowDobPicker(false)
  }

  // Handle save student
  const handleSaveStudent = async () => {
    if (!editingStudent) return
    
    setIsSubmitting(true)
    try {
      const updateData: any = {}
      
      // Personal Information
      if (editFormData.name) updateData.name = editFormData.name
      if (editFormData.gender) updateData.gender = editFormData.gender
      if (editFormData.dob) updateData.dob = editFormData.dob
      if (editFormData.place_of_birth) updateData.place_of_birth = editFormData.place_of_birth
      if (editFormData.religion) updateData.religion = editFormData.religion
      if (editFormData.mother_tongue) updateData.mother_tongue = editFormData.mother_tongue
      if (editFormData.emergency_contact) updateData.emergency_contact = editFormData.emergency_contact
      if (editFormData.address) updateData.address = editFormData.address
      if (editFormData.is_active !== undefined) updateData.is_active = editFormData.is_active
      
      // Father Information
      if (editFormData.father_name) updateData.father_name = editFormData.father_name
      if (editFormData.father_cnic) updateData.father_cnic = editFormData.father_cnic
      if (editFormData.father_contact) updateData.father_contact = editFormData.father_contact
      if (editFormData.father_profession) updateData.father_profession = editFormData.father_profession
      if (editFormData.father_status) updateData.father_status = editFormData.father_status
      
      // Academic Information
      if (editFormData.enrollment_year) updateData.enrollment_year = parseInt(editFormData.enrollment_year)
      if (editFormData.classroom !== undefined && editFormData.classroom !== null) {
        updateData.classroom = editFormData.classroom
      }
      
      // Handle photo upload if it's a File
      const formData = new FormData()
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== null && updateData[key] !== undefined) {
          formData.append(key, updateData[key])
        }
      })
      
      // If photo is a File, add it to FormData
      if (editFormData.photo instanceof File) {
        formData.append('photo', editFormData.photo)
      }
      
      // Use FormData if photo exists, otherwise use JSON
      if (editFormData.photo instanceof File) {
        const token = localStorage.getItem('sis_access_token')
        const response = await fetch(`${getApiBaseUrl()}/api/students/${editingStudent.id}/`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData
        })
        if (!response.ok) throw new Error('Failed to update student')
      } else {
        await apiPatch(`/api/students/${editingStudent.id}/`, updateData)
      }
      
      toast.success("Student updated successfully!")
      setShowEditDialog(false)
      setEditingStudent(null)
      setEditFormData({})
      
      // Refresh current page
      const filterParams: any = {
        page: currentPage,
        page_size: pageSize,
      }
      
      if (search.trim()) filterParams.search = search.trim()
      if (selectedShift !== "all") filterParams.shift = selectedShift
      if (selectedGrade !== "all") filterParams.current_grade = selectedGrade
      if (selectedSection !== "all") filterParams.section = selectedSection
      
      const response = await getFilteredStudents(filterParams)
      
      const mappedStudents = (response.results || []).map((student: any) => ({
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
      setTotalCount(response.count || 0)
      setTotalPages(Math.ceil((response.count || 0) / pageSize))
    } catch (error: any) {
      console.error("Error updating student:", error)
      toast.error(error?.message || "Failed to update student")
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns = [
    {
      key: "name",
      label: "Student",
      render: (student: StudentRow) => (
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-gray-900">{student.name}</p>
          <div className="flex flex-wrap gap-1 text-[11px] sm:text-xs text-gray-600">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5">
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
      key: "classroom_name",
      label: "Classroom",
      render: (student: StudentRow) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-gray-900 font-medium">
            <Building2 className="h-4 w-4 text-[#274c77]" />
            {student.classroom_name}
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] sm:text-xs text-[#274c77] font-medium">
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
              Showing {filteredStudents.length} of {totalCount} Students (Page {currentPage} of {totalPages || 1})
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
            <>
              <DataTable
                data={filteredStudents}
                columns={columns}
                onView={(student) => router.push(`/admin/students/profile?id=${student.id}`)}
                onEdit={handleEditStudent}
                onDelete={handleDeleteStudent}
                allowEdit={true}
                allowDelete={true}
                emptyMessage={search ? "No students match your search." : "No students found"}
              />
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages} ({totalCount} total students)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || loading}
                    >
                      Previous
                    </Button>
                    
                    {/* Page Numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (currentPage <= 3) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            disabled={loading}
                            className={currentPage === pageNum ? "bg-[#274c77] text-white" : ""}
                          >
                            {pageNum}
                          </Button>
                        )
                      })}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || loading}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Student Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto px-4 sm:px-6 py-6 rounded-3xl hide-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: '#274c77' }}>
              Edit Student - {editingStudent?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 text-sm sm:text-base">
            {/* Personal Information */}
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5]">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Personal Information</h3>

              {/* Photo Upload */}
              <div className="mb-6">
                <Label htmlFor="photo">Profile Photo</Label>
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                  {editFormData.photo ? (
                    <div className="relative">
                      <img
                        src={typeof editFormData.photo === 'string' ? editFormData.photo : URL.createObjectURL(editFormData.photo)}
                        alt="Student photo"
                        className="w-24 h-24 object-cover rounded-lg border-2 border-gray-200"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                        onClick={() => setEditFormData({ ...editFormData, photo: null })}
                      >
                        ×
                      </Button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200">
                      <User className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      id="photo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEditFormData({ ...editFormData, photo: file });
                        }
                      }}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-gray-500">Upload a profile photo (JPG, PNG)</p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input
                    id="edit-name"
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-gender">Gender</Label>
                  <Select 
                    value={editFormData.gender || ''} 
                    onValueChange={(value) => setEditFormData({ ...editFormData, gender: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-dob">Date of Birth</Label>
                  <Popover open={showDobPicker} onOpenChange={setShowDobPicker}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full h-10 justify-start text-left font-normal ${!editFormData.dob ? 'text-muted-foreground' : ''}`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editFormData.dob ? new Date(editFormData.dob).toLocaleDateString() : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={editFormData.dob ? new Date(editFormData.dob) : undefined}
                        onSelect={handleDobSelect}
                        disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="edit-place-of-birth">Place of Birth</Label>
                  <Input
                    id="edit-place-of-birth"
                    value={editFormData.place_of_birth || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, place_of_birth: e.target.value })}
                    placeholder="Enter place of birth"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-religion">Religion</Label>
                  <Input
                    id="edit-religion"
                    value={editFormData.religion || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, religion: e.target.value })}
                    placeholder="Enter religion"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-mother-tongue">Mother Tongue</Label>
                  <Input
                    id="edit-mother-tongue"
                    value={editFormData.mother_tongue || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, mother_tongue: e.target.value })}
                    placeholder="Enter mother tongue"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-emergency-contact">Emergency Contact</Label>
                  <Input
                    id="edit-emergency-contact"
                    type="tel"
                    maxLength={11}
                    value={editFormData.emergency_contact || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setEditFormData({ ...editFormData, emergency_contact: value });
                    }}
                    placeholder="Enter emergency contact (11 digits)"
                  />
                  <p className="mt-1 text-xs text-gray-500">Must be exactly 11 digits and make sure start with 03</p>
                </div>
                <div>
                  <Label htmlFor="edit-status">Student Status</Label>
                  <Select
                    value={editFormData.is_active !== undefined ? (editFormData.is_active ? 'true' : 'false') : 'true'}
                    onValueChange={(value) => setEditFormData({ ...editFormData, is_active: value === 'true' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive (Left)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="edit-address">Permanent Address</Label>
                  <Textarea
                    id="edit-address"
                    value={editFormData.address || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                    placeholder="Enter permanent address"
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Father Information */}
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5]">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Father Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-father-name">Father Name</Label>
                  <Input
                    id="edit-father-name"
                    value={editFormData.father_name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, father_name: e.target.value })}
                    placeholder="Enter father name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-father-cnic">Father CNIC</Label>
                  <Input
                    id="edit-father-cnic"
                    type="text"
                    maxLength={13}
                    value={editFormData.father_cnic || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 13);
                      setEditFormData({ ...editFormData, father_cnic: value });
                    }}
                    placeholder="Enter father CNIC (13 digits)"
                  />
                  <p className="mt-1 text-xs text-gray-500">Must be exactly 13 digits</p>
                </div>
                <div>
                  <Label htmlFor="edit-father-contact">Father Contact</Label>
                  <Input
                    id="edit-father-contact"
                    type="tel"
                    maxLength={11}
                    value={editFormData.father_contact || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setEditFormData({ ...editFormData, father_contact: value });
                    }}
                    placeholder="Enter father contact (11 digits)"
                  />
                  <p className="mt-1 text-xs text-gray-500">Must be exactly 11 digits and make sure start with 03</p>
                </div>
                <div>
                  <Label htmlFor="edit-father-profession">Father Profession</Label>
                  <Input
                    id="edit-father-profession"
                    value={editFormData.father_profession || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, father_profession: e.target.value })}
                    placeholder="Enter father profession"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-father-status">Father Status</Label>
                  <Select 
                    value={editFormData.father_status || ''} 
                    onValueChange={(value) => setEditFormData({ ...editFormData, father_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select father status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alive">Alive</SelectItem>
                      <SelectItem value="dead">Dead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Academic Information */}
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5]">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Academic Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-grade">Current Grade</Label>
                  <Input
                    id="edit-grade"
                    value={editFormData.current_grade || ''}
                    readOnly
                    className="bg-gray-100 cursor-not-allowed"
                    placeholder="Current grade"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-section">Current Section</Label>
                  <Input
                    id="edit-section"
                    value={editFormData.section || ''}
                    readOnly
                    className="bg-gray-100 cursor-not-allowed"
                    placeholder="Current section"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-enrollment-year">Enrollment Year</Label>
                  <Input
                    id="edit-enrollment-year"
                    type="number"
                    value={editFormData.enrollment_year || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, enrollment_year: e.target.value })}
                    placeholder="Enter enrollment year"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="edit-classroom">Classroom</Label>
                  <Select
                    value={editFormData.classroom ? String(editFormData.classroom) : 'none'}
                    onValueChange={(value) => setEditFormData({ ...editFormData, classroom: value === 'none' ? null : parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select classroom" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Classroom</SelectItem>
                      {availableClassrooms.map((classroom: any) => (
                        <SelectItem key={classroom.id} value={String(classroom.id)}>
                          {classroom.grade?.name || classroom.grade_name || 'N/A'} - {classroom.section || 'N/A'} ({classroom.shift || 'N/A'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select the correct classroom for this student. This will automatically update the student's class assignment.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false)
                  setEditingStudent(null)
                  setEditFormData({})
                }}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveStudent}
                disabled={isSubmitting}
                style={{ backgroundColor: '#274c77', color: 'white' }}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? 'Saving...' : 'Update Student'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
