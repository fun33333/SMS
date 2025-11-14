"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Users, Search, Phone, Mail, GraduationCap, Building2 } from "lucide-react"
import { getAllStudents } from "@/lib/api"
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

  // Helper function to truncate subjects/grades to max 2 items

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

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(search.toLowerCase()) ||
    student.student_code.toLowerCase().includes(search.toLowerCase()) ||
    student.gr_no.toLowerCase().includes(search.toLowerCase()) ||
    student.father_name.toLowerCase().includes(search.toLowerCase()) ||
    student.email.toLowerCase().includes(search.toLowerCase())
  )

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
          <div className="flex flex-col gap-3 sm:gap-4 mb-6 sm:mb-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full lg:max-w-lg">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search students by name, ID, or father's name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
            </div>
            <div className="text-sm text-gray-500 text-left sm:text-right">
              {filteredStudents.length} of {students.length} Students
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
