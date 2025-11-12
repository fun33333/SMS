"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Users, Search, Eye, Edit, User, Mail, Phone, GraduationCap, MapPin, Calendar, Award } from "lucide-react"
import { getAllTeachers, getCoordinatorTeachers, getCurrentUserProfile } from "@/lib/api"
import { useRouter } from "next/navigation"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

function CoordinatorTeacherListContent() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [teachers, setTeachers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Helper function to truncate subjects/grades to max 2 items
  const truncateList = (listString: string, maxItems: number = 2) => {
    if (!listString) return ''
    const items = listString.split(', ').map(item => item.trim())
    if (items.length <= maxItems) {
      return listString
    }
    return `${items.slice(0, maxItems).join(', ')} ...`
  }

  useEffect(() => {
    async function fetchTeachers() {
      setLoading(true)
      setError(null)
      try {
        // Check if we're on client side
        if (typeof window === 'undefined') {
          setError("Please wait, loading...");
          return;
        }
        
        // Get current user profile to get coordinator ID
        const userProfile = await getCurrentUserProfile() as any;
        console.log('User profile:', userProfile);
        const coordinatorId = userProfile?.coordinator_id;
        console.log('Coordinator ID:', coordinatorId);
        
        if (!coordinatorId) {
          console.error('Coordinator ID not found in user profile:', userProfile);
          setError(`Coordinator ID not found in user profile. User role: ${userProfile?.role || 'unknown'}, Available fields: ${Object.keys(userProfile || {}).join(', ')}`);
          return;
        }
        
        // Use coordinator-specific API to get assigned teachers
        console.log('Calling getCoordinatorTeachers with ID:', coordinatorId);
        const response = await getCoordinatorTeachers(coordinatorId) as any;
        console.log('Coordinator teachers response:', response);
        
        if (!response || !response.teachers) {
          console.error('Invalid response from getCoordinatorTeachers:', response);
          setError('Invalid response from coordinator teachers API');
          return;
        }
        
        const teachersData = response.teachers || [];
        
        // Map teacher data to the expected format
        const mappedTeachers = teachersData.map((teacher: any) => ({
          id: teacher.id,
          name: teacher.full_name || 'Unknown',
          subject: teacher.current_subjects || 'Not Assigned',
          classes: teacher.current_classes_taught || 'Not Assigned',
          email: teacher.email || 'Not provided',
          phone: teacher.contact_number || 'Not provided',
          joining_date: teacher.joining_date || 'Not provided',
          experience: teacher.total_experience_years ? `${teacher.total_experience_years} years` : 'Not provided',
          employee_code: teacher.employee_code,
          shift: teacher.shift,
          is_class_teacher: teacher.is_class_teacher
        }))
        
        setTeachers(mappedTeachers)
      } catch (err: any) {
        console.error("Error fetching teachers:", err)
        setError(err.message || "Failed to load teachers")
      } finally {
        setLoading(false)
      }
    }
    fetchTeachers()
  }, [])

   const filteredTeachers = teachers.filter(teacher =>
     teacher.name.toLowerCase().includes(search.toLowerCase()) ||
     teacher.subject.toLowerCase().includes(search.toLowerCase()) ||
     teacher.email.toLowerCase().includes(search.toLowerCase())
   )

  return (
    <div className="px-2 sm:px-3 md:px-4 lg:px-6 py-3 sm:py-4 md:py-6 space-y-3 sm:space-y-4 md:space-y-6 overflow-x-hidden">
      <div className="mb-3 sm:mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3 flex-wrap" style={{ color: '#274c77' }}>
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#6096ba' }}>
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <span>Teacher List</span>
        </h1>
        <p className="text-xs sm:text-sm text-gray-600">
          Showing {filteredTeachers.length} of {teachers.length} teachers
        </p>
      </div>

      {/* Search Section */}
      <Card style={{ backgroundColor: 'white', borderColor: '#a3cef1' }} className="border-2">
        <CardContent className="p-2 sm:p-3 md:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 text-xs sm:text-sm"
              style={{ borderColor: '#a3cef1' }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Teachers Table - Responsive */}
      <Card style={{ backgroundColor: 'white', borderColor: '#a3cef1' }} className="border-2 overflow-x-auto">
        <CardHeader className="pb-2 sm:pb-3 md:pb-4">
          <CardTitle style={{ color: '#274c77' }} className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            Teachers Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3 md:p-6">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow style={{ backgroundColor: '#274c77' }}>
                  <TableHead className="text-white text-xs sm:text-sm">Teacher</TableHead>
                  <TableHead className="text-white text-xs sm:text-sm">Subject</TableHead>
                  <TableHead className="text-white text-xs sm:text-sm">Email</TableHead>
                  <TableHead className="text-white text-xs sm:text-sm">Classes</TableHead>
                  <TableHead className="text-white text-xs sm:text-sm">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <LoadingSpinner message="Loading teachers..." />
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="text-red-600 mb-4">Error: {error}</div>
                      <Button onClick={() => window.location.reload()} variant="outline">
                        Try Again
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTeachers.map((teacher, index) => (
                    <TableRow 
                      key={teacher.id}
                      className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : ''}`}
                      style={{ backgroundColor: index % 2 === 0 ? '#e7ecef' : 'white' }}
                    >
                      <TableCell className="font-medium text-xs sm:text-sm">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6096ba' }}>
                              <User className="h-4 w-4 text-white" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-1 sm:gap-2">
                              <span className="truncate">{teacher.name}</span>
                              {teacher.is_class_teacher && (
                                <Award className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500 flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-0.5 sm:gap-1">
                              <Calendar className="h-3 w-3" />
                              <span className="capitalize">{teacher.shift || 'Morning'}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <GraduationCap className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" style={{ color: '#6096ba' }} />
                          <div className="text-gray-900 truncate">{truncateList(teacher.subject)}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-gray-600">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <Mail className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" style={{ color: '#6096ba' }} />
                          <div className="text-gray-900 truncate">{teacher.email}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <User className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" style={{ color: '#6096ba' }} />
                          <div className="text-gray-900 truncate">{truncateList(teacher.classes)}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 sm:gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            style={{ borderColor: '#6096ba', color: '#274c77' }}
                            onClick={() => router.push(`/admin/teachers/profile?id=${teacher.id}`)}
                            title="View Teacher Profile"
                            className="text-xs px-2 py-1"
                          >
                            <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                            View
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            style={{ borderColor: '#6096ba', color: '#274c77' }}
                            className="text-xs px-2 py-1"
                          >
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="py-8 text-center">
                <LoadingSpinner message="Loading teachers..." />
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <div className="text-red-600 mb-4 text-sm">{error}</div>
                <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : (
              filteredTeachers.map((teacher, index) => (
                <Card key={teacher.id} style={{ borderColor: '#a3cef1' }} className="border">
                  <CardContent className="p-3 sm:p-4">
                    {/* Teacher Name & Shift */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#6096ba' }}>
                        <User className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1">
                          <span className="truncate">{teacher.name}</span>
                          {teacher.is_class_teacher && (
                            <Award className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                          )}
                        </h3>
                        <p className="text-xs text-gray-500 flex items-center gap-0.5 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          <span className="capitalize">{teacher.shift || 'Morning'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Subject */}
                    <div className="mb-2 pb-2 border-b border-gray-200">
                      <p className="text-xs text-gray-600 font-medium flex items-center gap-1.5 mb-1">
                        <GraduationCap className="h-4 w-4" style={{ color: '#6096ba' }} />
                        Subject
                      </p>
                      <p className="text-xs text-gray-900 ml-5">{truncateList(teacher.subject)}</p>
                    </div>

                    {/* Email */}
                    <div className="mb-2 pb-2 border-b border-gray-200">
                      <p className="text-xs text-gray-600 font-medium flex items-center gap-1.5 mb-1">
                        <Mail className="h-4 w-4" style={{ color: '#6096ba' }} />
                        Email
                      </p>
                      <p className="text-xs text-gray-900 ml-5 truncate">{teacher.email}</p>
                    </div>

                    {/* Classes */}
                    <div className="mb-3 pb-2 border-b border-gray-200">
                      <p className="text-xs text-gray-600 font-medium flex items-center gap-1.5 mb-1">
                        <User className="h-4 w-4" style={{ color: '#6096ba' }} />
                        Classes
                      </p>
                      <p className="text-xs text-gray-900 ml-5">{truncateList(teacher.classes)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        style={{ borderColor: '#6096ba', color: '#274c77' }}
                        onClick={() => router.push(`/admin/teachers/profile?id=${teacher.id}`)}
                        title="View Teacher Profile"
                        className="flex-1 text-xs py-1"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        style={{ borderColor: '#6096ba', color: '#274c77' }}
                        className="flex-1 text-xs py-1"
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function CoordinatorTeacherListPage() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    document.title = "Teacher List - Coordinator | IAK SMS";
  }, [])

  if (!isClient) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: '#274c77' }}>
              <Users className="h-5 w-5" />
              Teacher List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LoadingSpinner message="Loading..." />
          </CardContent>
        </Card>
      </div>
    )
  }

  return <CoordinatorTeacherListContent />
}
