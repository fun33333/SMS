"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Search, Eye, Edit, User, Mail, Phone, GraduationCap, MapPin, Calendar, Award } from "lucide-react"
import { getAllTeachers, getCoordinatorTeachers, getCurrentUserProfile, getApiBaseUrl } from "@/lib/api"
import { useRouter } from "next/navigation"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

function CoordinatorTeacherListContent() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [teachers, setTeachers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Edit functionality
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editFormData, setEditFormData] = useState<any>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const handleEdit = async (teacher: any) => {
    try {
      setEditingTeacher(teacher);
      
      // Fetch full teacher data
      const baseForRead = getApiBaseUrl();
      const cleanBaseForRead = baseForRead.endsWith('/') ? baseForRead.slice(0, -1) : baseForRead;
      const response = await fetch(`${cleanBaseForRead}/api/teachers/${teacher.id}/`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const teacherData = await response.json();
        setEditFormData({
          full_name: teacherData.full_name || '',
          email: teacherData.email || '',
          contact_number: teacherData.contact_number || '',
          dob: teacherData.dob || '',
          gender: teacherData.gender || '',
          permanent_address: teacherData.permanent_address || '',
          marital_status: teacherData.marital_status || '',
          cnic: teacherData.cnic || '',
          education_level: teacherData.education_level || '',
          institution_name: teacherData.institution_name || '',
          year_of_passing: teacherData.year_of_passing || '',
          education_subjects: teacherData.education_subjects || '',
          education_grade: teacherData.education_grade || '',
          previous_institution_name: teacherData.previous_institution_name || '',
          previous_position: teacherData.previous_position || '',
          experience_from_date: teacherData.experience_from_date || '',
          experience_to_date: teacherData.experience_to_date || '',
          total_experience_years: teacherData.total_experience_years || '',
          joining_date: teacherData.joining_date || '',
          current_role_title: teacherData.current_role_title || '',
          shift: teacherData.shift || '',
          is_currently_active: teacherData.is_currently_active ? 'true' : 'false',
          current_subjects: teacherData.current_subjects || '',
          current_classes_taught: teacherData.current_classes_taught || '',
        });
        setShowEditDialog(true);
      } else {
        console.error('Failed to fetch teacher data');
        setError('Failed to load teacher data for editing');
      }
    } catch (err: any) {
      console.error('Error fetching teacher data:', err);
      setError(err.message || 'Failed to load teacher data');
    }
  };

  const handleEditClose = () => {
    setEditingTeacher(null);
    setShowEditDialog(false);
    setEditFormData({});
  };

  const handleEditSubmit = async () => {
    if (!editingTeacher) return;
    
    setIsSubmitting(true);
    try {
      // Prepare update data - only send fields that exist in the model and have values
      const updateData: any = {};
      
      // List of valid fields that exist in the Teacher model
      const validFields = [
        'full_name', 'email', 'contact_number', 'dob', 'gender', 'permanent_address', 
        'marital_status', 'cnic', 'education_level', 'institution_name', 
        'year_of_passing', 'education_subjects', 'education_grade', 'previous_institution_name', 
        'previous_position', 'experience_from_date', 'experience_to_date', 'total_experience_years',
        'joining_date', 'current_role_title', 'shift', 'is_currently_active',
        'current_subjects', 'current_classes_taught'
      ];
      
      // Only add valid fields that have values
      validFields.forEach(key => {
        const value = editFormData[key];
        if (value !== '' && value !== null && value !== undefined) {
          updateData[key] = value;
        }
      });
      
      // Handle required fields - don't send null for required fields, keep existing value
      // dob, gender, full_name, contact_number, email, cnic are required
      // If they're empty, we should not include them in update (PATCH allows partial updates)
      
      // Fix date fields - send null only for optional date fields
      if (editFormData.joining_date === '' || editFormData.joining_date === null || editFormData.joining_date === undefined) {
        if (editFormData.joining_date === '') {
          updateData.joining_date = null;
        }
      }
      if (editFormData.experience_from_date === '' || editFormData.experience_from_date === null || editFormData.experience_from_date === undefined) {
        if (editFormData.experience_from_date === '') {
          updateData.experience_from_date = null;
        }
      }
      if (editFormData.experience_to_date === '' || editFormData.experience_to_date === null || editFormData.experience_to_date === undefined) {
        if (editFormData.experience_to_date === '') {
          updateData.experience_to_date = null;
        }
      }
      
      // Convert specific fields
      if (updateData.year_of_passing) {
        updateData.year_of_passing = parseInt(updateData.year_of_passing);
      }
      if (updateData.total_experience_years) {
        updateData.total_experience_years = parseFloat(updateData.total_experience_years);
      }
      if (updateData.is_currently_active === 'true') {
        updateData.is_currently_active = true;
      } else if (updateData.is_currently_active === 'false') {
        updateData.is_currently_active = false;
      }
      
      // Convert gender to lowercase if provided
      if (updateData.gender) {
        updateData.gender = updateData.gender.toLowerCase();
      }
      
      console.log('Updating teacher with data:', updateData);
      
      const baseForRead = getApiBaseUrl();
      const cleanBaseForRead = baseForRead.endsWith('/') ? baseForRead.slice(0, -1) : baseForRead;
      const response = await fetch(`${cleanBaseForRead}/api/teachers/${editingTeacher.id}/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      
      if (response.ok) {
        // Refresh teacher list
        const userProfile = await getCurrentUserProfile() as any;
        const coordinatorId = userProfile?.coordinator_id;
        if (coordinatorId) {
          const response = await getCoordinatorTeachers(coordinatorId) as any;
          const teachersData = response.teachers || [];
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
          }));
          setTeachers(mappedTeachers);
        }
        handleEditClose();
      } else {
        const errorText = await response.text();
        let errorMessage = 'Failed to update teacher';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
        } catch {
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
        console.error('Error updating teacher:', errorMessage);
        setError(errorMessage);
        alert(`❌ Error updating teacher: ${errorMessage}`);
      }
    } catch (err: any) {
      console.error('Error updating teacher:', err);
      const errorMsg = err.message || 'Failed to update teacher';
      setError(errorMsg);
      alert(`❌ Error updating teacher: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

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
                            onClick={() => handleEdit(teacher)}
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
                        onClick={() => handleEdit(teacher)}
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

      {/* Edit Teacher Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-bold" style={{ color: '#274c77' }}>
              Edit Teacher - {editingTeacher?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 sm:space-y-6">
            {/* Personal Information */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4" style={{ color: '#274c77' }}>Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={editFormData.full_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, full_name: e.target.value})}
                    placeholder="Enter full name"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                    placeholder="Enter email"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="contact_number">Contact Number</Label>
                  <Input
                    id="contact_number"
                    value={editFormData.contact_number || ''}
                    onChange={(e) => setEditFormData({...editFormData, contact_number: e.target.value})}
                    placeholder="Enter contact number"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={editFormData.dob || ''}
                    onChange={(e) => setEditFormData({...editFormData, dob: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={editFormData.gender || ''} onValueChange={(value) => setEditFormData({...editFormData, gender: value})}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="marital_status">Marital Status</Label>
                  <Input
                    id="marital_status"
                    value={editFormData.marital_status || ''}
                    onChange={(e) => setEditFormData({...editFormData, marital_status: e.target.value})}
                    placeholder="Enter marital status"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="cnic">CNIC</Label>
                  <Input
                    id="cnic"
                    value={editFormData.cnic || ''}
                    onChange={(e) => setEditFormData({...editFormData, cnic: e.target.value})}
                    placeholder="Enter CNIC"
                    className="text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="permanent_address">Permanent Address</Label>
                  <Textarea
                    id="permanent_address"
                    value={editFormData.permanent_address || ''}
                    onChange={(e) => setEditFormData({...editFormData, permanent_address: e.target.value})}
                    placeholder="Enter permanent address"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Education Information */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4" style={{ color: '#274c77' }}>Education Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="education_level">Education Level</Label>
                  <Input
                    id="education_level"
                    value={editFormData.education_level || ''}
                    onChange={(e) => setEditFormData({...editFormData, education_level: e.target.value})}
                    placeholder="Enter education level"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="institution_name">Institution Name</Label>
                  <Input
                    id="institution_name"
                    value={editFormData.institution_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, institution_name: e.target.value})}
                    placeholder="Enter institution name"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="year_of_passing">Year of Passing</Label>
                  <Input
                    id="year_of_passing"
                    type="number"
                    value={editFormData.year_of_passing || ''}
                    onChange={(e) => setEditFormData({...editFormData, year_of_passing: e.target.value})}
                    placeholder="Enter year of passing"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="education_subjects">Education Subjects</Label>
                  <Input
                    id="education_subjects"
                    value={editFormData.education_subjects || ''}
                    onChange={(e) => setEditFormData({...editFormData, education_subjects: e.target.value})}
                    placeholder="Enter education subjects"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="education_grade">Education Grade</Label>
                  <Input
                    id="education_grade"
                    value={editFormData.education_grade || ''}
                    onChange={(e) => setEditFormData({...editFormData, education_grade: e.target.value})}
                    placeholder="Enter education grade"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Experience Information */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4" style={{ color: '#274c77' }}>Experience Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="previous_institution_name">Previous Institution</Label>
                  <Input
                    id="previous_institution_name"
                    value={editFormData.previous_institution_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, previous_institution_name: e.target.value})}
                    placeholder="Enter previous institution"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="previous_position">Previous Position</Label>
                  <Input
                    id="previous_position"
                    value={editFormData.previous_position || ''}
                    onChange={(e) => setEditFormData({...editFormData, previous_position: e.target.value})}
                    placeholder="Enter previous position"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="experience_from_date">Experience From Date</Label>
                  <Input
                    id="experience_from_date"
                    type="date"
                    value={editFormData.experience_from_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, experience_from_date: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="experience_to_date">Experience To Date</Label>
                  <Input
                    id="experience_to_date"
                    type="date"
                    value={editFormData.experience_to_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, experience_to_date: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="total_experience_years">Total Experience Years</Label>
                  <Input
                    id="total_experience_years"
                    type="number"
                    step="0.1"
                    value={editFormData.total_experience_years || ''}
                    onChange={(e) => setEditFormData({...editFormData, total_experience_years: e.target.value})}
                    placeholder="Enter total experience years"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Current Role Information */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4" style={{ color: '#274c77' }}>Current Role Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="joining_date">Joining Date</Label>
                  <Input
                    id="joining_date"
                    type="date"
                    value={editFormData.joining_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, joining_date: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="current_role_title">Current Role Title</Label>
                  <Input
                    id="current_role_title"
                    value={editFormData.current_role_title || ''}
                    onChange={(e) => setEditFormData({...editFormData, current_role_title: e.target.value})}
                    placeholder="Enter current role title"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="shift">Shift</Label>
                  <Select value={editFormData.shift || ''} onValueChange={(value) => setEditFormData({...editFormData, shift: value})}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="afternoon">Afternoon</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="is_currently_active">Is Currently Active</Label>
                  <Select value={editFormData.is_currently_active || ''} onValueChange={(value) => setEditFormData({...editFormData, is_currently_active: value})}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="current_subjects">Current Subjects</Label>
                  <Input
                    id="current_subjects"
                    value={editFormData.current_subjects || ''}
                    onChange={(e) => setEditFormData({...editFormData, current_subjects: e.target.value})}
                    placeholder="Enter current subjects"
                    className="text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="current_classes_taught">Current Classes Taught</Label>
                  <Input
                    id="current_classes_taught"
                    value={editFormData.current_classes_taught || ''}
                    onChange={(e) => setEditFormData({...editFormData, current_classes_taught: e.target.value})}
                    placeholder="Enter current classes taught"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-6 pt-4 border-t">
            <Button
              onClick={handleEditClose}
              variant="outline"
              className="w-full sm:w-auto px-4 sm:px-6 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 sm:px-6 text-sm"
              style={{ backgroundColor: '#6096ba' }}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Updating...
                </>
              ) : (
                'Update Teacher'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
