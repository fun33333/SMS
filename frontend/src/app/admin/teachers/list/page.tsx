"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserRole, getCurrentUser } from "@/lib/permissions";
import { getFilteredTeachers, getAllCampuses } from "@/lib/api";
import { DataTable, PaginationControls } from "@/components/shared";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { User, Mail, GraduationCap, MapPin, Award, RefreshCcw, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiBaseUrl } from "@/lib/api";

interface Teacher {
  id: number;
  full_name: string;
  employee_code: string;
  email: string;
  contact_number: string;
  current_subjects: string;
  current_classes_taught: string;
  shift: string;
  is_currently_active: boolean;
  is_class_teacher: boolean;
  campus_name: string;
  coordinator_names: string[];
  classroom_name: string;
  joining_date: string;
  total_experience_years: number;
}

interface PaginationInfo {
  count: number;
  next: string | null;
  previous: string | null;
  results: Teacher[];
}

export default function TeacherListPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    current_campus: "",
    shift: "",
    is_currently_active: "",
    is_class_teacher: "",
    current_subjects: "",
    ordering: "-joining_date"
  });
  
  // User role and campus info
  const [userRole, setUserRole] = useState<string>("");
  const [userCampus, setUserCampus] = useState<string>("");
  const [campuses, setCampuses] = useState<any[]>([]);
  
  // Edit functionality
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Debounced search
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeUserData();
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [currentPage, pageSize, filters, searchQuery]);

  const initializeUserData = async () => {
    const role = getCurrentUserRole();
    setUserRole(role);
    
    // Get user campus info
          const user = getCurrentUser() as any;
          if (user?.campus?.campus_name) {
            setUserCampus(user.campus.campus_name);
    }
    
    // Fetch campuses for filter dropdown
    try {
      const campusesData = await getAllCampuses();
      setCampuses(Array.isArray(campusesData) ? campusesData : []);
    } catch (error) {
      console.error('Error fetching campuses:', error);
    }
  };

  const fetchTeachers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = {
        page: currentPage,
        page_size: pageSize,
        search: searchQuery || undefined,
        current_campus: filters.current_campus ? parseInt(filters.current_campus) : undefined,
        shift: filters.shift || undefined,
        is_currently_active: filters.is_currently_active ? filters.is_currently_active === 'true' : undefined,
        is_class_teacher: filters.is_class_teacher ? filters.is_class_teacher === 'true' : undefined,
        current_subjects: filters.current_subjects || undefined,
        ordering: filters.ordering
      };

      const response: PaginationInfo = await getFilteredTeachers(params);
      
      setTeachers(response.results || []);
      setTotalCount(response.count || 0);
      setTotalPages(Math.ceil((response.count || 0) / pageSize));
      
      } catch (err: any) {
      console.error("Error fetching teachers:", err);
      setError(err.message || "Failed to load teachers");
      } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1); // Reset to first page when searching
    
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for debounced search
    const timeout = setTimeout(() => {
      fetchTeachers();
    }, 500);
    
    setSearchTimeout(timeout);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({
      current_campus: "",
      shift: "",
      is_currently_active: "",
      is_class_teacher: "",
      current_subjects: "",
      ordering: "-joining_date"
    });
    setSearchQuery("");
    setCurrentPage(1);
  };

  const handleClearFiltersClick = () => {
    setIsClearing(true);
    try {
      clearFilters();
    } finally {
      setTimeout(() => setIsClearing(false), 700);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  // Edit handlers
  const handleEdit = async (teacher: Teacher) => {
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
          current_address: teacherData.current_address || '',
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
          experience_subjects_classes_taught: teacherData.experience_subjects_classes_taught || '',
          previous_responsibilities: teacherData.previous_responsibilities || '',
          total_experience_years: teacherData.total_experience_years || '',
          joining_date: teacherData.joining_date || '',
          current_role_title: teacherData.current_role_title || '',
          current_subjects: teacherData.current_subjects || '',
          current_classes_taught: teacherData.current_classes_taught || '',
          current_extra_responsibilities: teacherData.current_extra_responsibilities || '',
          role_start_date: teacherData.role_start_date || '',
          role_end_date: teacherData.role_end_date || '',
          is_currently_active: teacherData.is_currently_active ? 'true' : 'false',
          shift: teacherData.shift || '',
          is_class_teacher: teacherData.is_class_teacher ? 'true' : 'false',
          save_status: teacherData.save_status || 'draft'
        });
        setShowEditDialog(true);
      } else {
        console.error('Error fetching teacher data:', response.statusText);
        alert('Error loading teacher data');
      }
    } catch (error) {
      console.error('Error fetching teacher data:', error);
      alert('Error loading teacher data');
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
      // Prepare update data - only send fields that have values
      const updateData: any = {};
      
      // Add all fields that have values
      Object.keys(editFormData).forEach(key => {
        if (editFormData[key] !== '' && editFormData[key] !== null && editFormData[key] !== undefined) {
          updateData[key] = editFormData[key];
        }
      });
      
      // Fix date fields - send null instead of empty strings for optional dates
      if (editFormData.dob === '' || editFormData.dob === null || editFormData.dob === undefined) {
        updateData.dob = null;
      }
      if (editFormData.joining_date === '' || editFormData.joining_date === null || editFormData.joining_date === undefined) {
        updateData.joining_date = null;
      }
      if (editFormData.experience_from_date === '' || editFormData.experience_from_date === null || editFormData.experience_from_date === undefined) {
        updateData.experience_from_date = null;
      }
      if (editFormData.experience_to_date === '' || editFormData.experience_to_date === null || editFormData.experience_to_date === undefined) {
        updateData.experience_to_date = null;
      }
      
      // Convert specific fields
      if (updateData.year_of_passing) {
        updateData.year_of_passing = parseInt(updateData.year_of_passing);
      }
      if (updateData.total_experience_years) {
        updateData.total_experience_years = parseFloat(updateData.total_experience_years);
      }
      if (updateData.is_currently_active) {
        updateData.is_currently_active = updateData.is_currently_active === 'true';
      }
      if (updateData.is_class_teacher) {
        updateData.is_class_teacher = updateData.is_class_teacher === 'true';
      }
      if (updateData.gender) {
        updateData.gender = updateData.gender.toLowerCase();
      }

      console.log('Updating teacher with data:', updateData);

      const baseForUpdate = getApiBaseUrl();
      const cleanBaseForUpdate = baseForUpdate.endsWith('/') ? baseForUpdate.slice(0, -1) : baseForUpdate;
      const response = await fetch(`${cleanBaseForUpdate}/api/teachers/${editingTeacher.id}/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        alert(`✅ Success! Teacher ${editFormData.full_name || editingTeacher.full_name} has been updated successfully!`);
        setShowEditDialog(false);
        setEditingTeacher(null);
        setEditFormData({});
        // Refresh the teachers list
        fetchTeachers();
      } else {
        const errorData = await response.text();
        console.error('Error updating teacher:', response.status, errorData);
        alert(`Error updating teacher: ${response.status} - ${errorData}`);
      }
    } catch (error) {
      console.error('Error updating teacher:', error);
      alert('Error updating teacher');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler
  const handleDelete = async (teacher: Teacher) => {
    try {
      if (!confirm(`Are you sure you want to delete ${teacher.full_name}?`)) return;
      const base = getApiBaseUrl();
      const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
      const res = await fetch(`${cleanBase}/api/teachers/${teacher.id}/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
        },
      });
      if (res.ok || res.status === 204) {
        alert('Teacher deleted successfully.');
        fetchTeachers();
      } else {
        const msg = await res.text();
        alert(`Failed to delete: ${res.status} ${msg}`);
      }
    } catch (err) {
      console.error('Delete teacher error:', err);
      alert('Error deleting teacher');
    }
  };

  // Columns definition for DataTable
  const columns = [
    {
      key: 'teacher_info',
      label: 'Teacher',
      icon: <User className="h-3 w-3 sm:h-4 sm:w-4" />,
      render: (teacher: Teacher) => (
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center bg-[#6096ba]">
              <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center space-x-1 sm:space-x-2">
              <span className="truncate">{teacher.full_name}</span>
              {teacher.is_class_teacher && (
                <Award className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500 flex-shrink-0" />
              )}
            </div>
            <div className="text-xs text-gray-500 flex items-center space-x-1">
              <Mail className="h-3 w-3" />
              <span className="truncate max-w-[100px] sm:max-w-[150px]">
                {teacher.email ? teacher.email.substring(0, teacher.email.length / 2) + '...' : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'subjects_classes',
      label: 'Subjects/Classes',
      icon: <GraduationCap className="h-3 w-3 sm:h-4 sm:w-4" />,
      render: (teacher: Teacher) => (
        <div className="space-y-1">
          <div className="flex items-center space-x-1 sm:space-x-2">
            <GraduationCap className="h-3 w-3 sm:h-4 sm:w-4 text-[#6096ba]" />
            <span className="text-xs sm:text-sm font-medium text-gray-900">Subjects:</span>
            <span className="text-xs sm:text-sm text-gray-600 max-w-[80px] sm:max-w-[120px] truncate">
              {teacher.current_subjects ? teacher.current_subjects.split(',').slice(0, 2).join(', ') : 'N/A'}
            </span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2">
            <User className="h-3 w-3 sm:h-4 sm:w-4 text-[#6096ba]" />
            <span className="text-xs sm:text-sm font-medium text-gray-900">Classes:</span>
            <span className="text-xs sm:text-sm text-gray-600 max-w-[80px] sm:max-w-[120px] truncate">
              {teacher.current_classes_taught ? teacher.current_classes_taught.split(',').slice(0, 2).join(', ') : 'N/A'}
            </span>
          </div>
        </div>
      )
    },
    {
      key: 'campus',
      label: 'Campus',
      icon: <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />,
      render: (teacher: Teacher) => (
        <div className="flex items-center space-x-1 sm:space-x-2">
          <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-[#6096ba]" />
          <div className="min-w-0 flex-1">
            <div className="text-xs sm:text-sm font-bold text-gray-900 truncate">
              {teacher.campus_name || 'N/A'}
            </div>
            {teacher.coordinator_names && teacher.coordinator_names.length > 0 && (
              <div className="text-xs text-gray-600 truncate">
                Coord: {teacher.coordinator_names[0]}
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      icon: <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-green-500"></div>,
      render: (teacher: Teacher) => (
        <span className={`inline-flex items-center px-2 sm:px-3 py-1 text-xs font-semibold rounded-full ${
          teacher.is_currently_active 
            ? 'bg-green-100 text-green-800 border border-green-200'
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          <div className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full mr-1 sm:mr-2 ${
            teacher.is_currently_active ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="hidden sm:inline">{teacher.is_currently_active ? 'Active' : 'Inactive'}</span>
          <span className="sm:hidden">{teacher.is_currently_active ? 'A' : 'I'}</span>
        </span>
      )
    }
  ];

  if (loading && teachers.length === 0) {
    return <LoadingSpinner message="Loading teachers..." fullScreen />;
  }

  return (
    <div className="p-2 sm:p-3 w-full max-w-full overflow-hidden">
      <div className="mb-3 sm:mb-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2" style={{ color: '#274c77' }}>
          Teachers List
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Showing {teachers.length} of {totalCount} teachers
        </p>
      </div>

       {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-2 sm:p-3 mb-3 w-full" style={{ borderColor: '#a3cef1' }}>
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base sm:text-lg font-semibold flex items-center space-x-2" style={{ color: '#274c77' }}>
              <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6096ba' }}>
                <span className="text-white text-xs font-bold"><Search className="h-4 w-4" /></span>
              </div>
              <span>Search & Filters</span>
            </h3>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleClearFiltersClick}
                className="inline-flex items-center justify-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 transition-all duration-150 ease-in-out transform shadow-sm hover:shadow-lg active:scale-95 active:shadow-md"
                style={{ backgroundColor: '#6096ba', minHeight: '36px' }}
              >
                <span className="mr-1.5">
                  <RefreshCcw className={`h-4 w-4 transition-transform duration-500 ${isClearing ? 'rotate-[360deg]' : 'rotate-0'}`} />
                </span>
                <span>Clear Filters</span>
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search by name, code, email..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2"
              style={{ borderColor: '#a3cef1' }}
               />
             </div>
             
          {/* Campus Filter */}
               <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Campus
            </label>
                 <select
              value={filters.current_campus}
              onChange={(e) => handleFilterChange('current_campus', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2"
              style={{ borderColor: '#a3cef1' }}
            >
              <option value="">All Campuses</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.campus_name || campus.name}
                </option>
              ))}
                 </select>
               </div>
               
          {/* Shift Filter */}
               <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shift
            </label>
                 <select
              value={filters.shift}
              onChange={(e) => handleFilterChange('shift', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2"
              style={{ borderColor: '#a3cef1' }}
            >
              <option value="">All Shifts</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="both">Both</option>
                 </select>
               </div>
               
          {/* Status Filter */}
               <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
                 <select
              value={filters.is_currently_active}
              onChange={(e) => handleFilterChange('is_currently_active', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2"
              style={{ borderColor: '#a3cef1' }}
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
                 </select>
               </div>
             </div>


        {/* Bottom controls removed (moved Clear Filters to header, removed per-page selector) */}
      </div>

      {/* Teachers Table - USING REUSABLE COMPONENT */}
      <DataTable
        data={teachers}
        columns={columns}
        onView={(teacher) => router.push(`/admin/teachers/profile?id=${teacher.id}`)}
        onEdit={(teacher) => handleEdit(teacher)}
        onDelete={(teacher) => handleDelete(teacher)}
        isLoading={loading}
        emptyMessage="No teachers found"
        allowEdit={userRole !== 'superadmin' && userRole !== 'coordinator'}
        allowDelete={userRole !== 'superadmin' && userRole !== 'coordinator'}
      />

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      )}

      {/* Edit Teacher Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto px-4 sm:px-6 py-6 rounded-3xl hide-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: '#274c77' }}>
              Edit Teacher - {editingTeacher?.full_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Personal Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={editFormData.full_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, full_name: e.target.value})}
                    placeholder="Enter full name"
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
                  />
                </div>
                <div>
                  <Label htmlFor="contact_number">Contact Number</Label>
                  <Input
                    id="contact_number"
                    value={editFormData.contact_number || ''}
                    onChange={(e) => setEditFormData({...editFormData, contact_number: e.target.value})}
                    placeholder="Enter contact number"
                  />
                </div>
                <div>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={editFormData.dob || ''}
                    onChange={(e) => setEditFormData({...editFormData, dob: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={editFormData.gender || ''} onValueChange={(value) => setEditFormData({...editFormData, gender: value})}>
                    <SelectTrigger>
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
                  />
                </div>
                <div>
                  <Label htmlFor="cnic">CNIC</Label>
                  <Input
                    id="cnic"
                    value={editFormData.cnic || ''}
                    onChange={(e) => setEditFormData({...editFormData, cnic: e.target.value})}
                    placeholder="Enter CNIC"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="permanent_address">Permanent Address</Label>
                  <Textarea
                    id="permanent_address"
                    value={editFormData.permanent_address || ''}
                    onChange={(e) => setEditFormData({...editFormData, permanent_address: e.target.value})}
                    placeholder="Enter permanent address"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="current_address">Current Address</Label>
                  <Textarea
                    id="current_address"
                    value={editFormData.current_address || ''}
                    onChange={(e) => setEditFormData({...editFormData, current_address: e.target.value})}
                    placeholder="Enter current address"
                  />
                </div>
              </div>
            </div>

            {/* Education Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Education Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="education_level">Education Level</Label>
                  <Input
                    id="education_level"
                    value={editFormData.education_level || ''}
                    onChange={(e) => setEditFormData({...editFormData, education_level: e.target.value})}
                    placeholder="Enter education level"
                  />
                </div>
                <div>
                  <Label htmlFor="institution_name">Institution Name</Label>
                  <Input
                    id="institution_name"
                    value={editFormData.institution_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, institution_name: e.target.value})}
                    placeholder="Enter institution name"
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
                  />
                </div>
                <div>
                  <Label htmlFor="education_subjects">Education Subjects</Label>
                  <Input
                    id="education_subjects"
                    value={editFormData.education_subjects || ''}
                    onChange={(e) => setEditFormData({...editFormData, education_subjects: e.target.value})}
                    placeholder="Enter education subjects"
                  />
                </div>
                <div>
                  <Label htmlFor="education_grade">Education Grade</Label>
                  <Input
                    id="education_grade"
                    value={editFormData.education_grade || ''}
                    onChange={(e) => setEditFormData({...editFormData, education_grade: e.target.value})}
                    placeholder="Enter education grade"
                  />
                </div>
              </div>
            </div>

            {/* Experience Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Experience Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="previous_institution_name">Previous Institution</Label>
                  <Input
                    id="previous_institution_name"
                    value={editFormData.previous_institution_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, previous_institution_name: e.target.value})}
                    placeholder="Enter previous institution"
                  />
                </div>
                <div>
                  <Label htmlFor="previous_position">Previous Position</Label>
                  <Input
                    id="previous_position"
                    value={editFormData.previous_position || ''}
                    onChange={(e) => setEditFormData({...editFormData, previous_position: e.target.value})}
                    placeholder="Enter previous position"
                  />
                </div>
                <div>
                  <Label htmlFor="experience_from_date">Experience From Date</Label>
                  <Input
                    id="experience_from_date"
                    type="date"
                    value={editFormData.experience_from_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, experience_from_date: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="experience_to_date">Experience To Date</Label>
                  <Input
                    id="experience_to_date"
                    type="date"
                    value={editFormData.experience_to_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, experience_to_date: e.target.value})}
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
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="experience_subjects_classes_taught">Experience Subjects/Classes</Label>
                  <Textarea
                    id="experience_subjects_classes_taught"
                    value={editFormData.experience_subjects_classes_taught || ''}
                    onChange={(e) => setEditFormData({...editFormData, experience_subjects_classes_taught: e.target.value})}
                    placeholder="Enter experience subjects and classes taught"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="previous_responsibilities">Previous Responsibilities</Label>
                  <Textarea
                    id="previous_responsibilities"
                    value={editFormData.previous_responsibilities || ''}
                    onChange={(e) => setEditFormData({...editFormData, previous_responsibilities: e.target.value})}
                    placeholder="Enter previous responsibilities"
                  />
                </div>
              </div>
            </div>

            {/* Current Role Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Current Role Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="joining_date">Joining Date</Label>
                  <Input
                    id="joining_date"
                    type="date"
                    value={editFormData.joining_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, joining_date: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="current_role_title">Current Role Title</Label>
                  <Input
                    id="current_role_title"
                    value={editFormData.current_role_title || ''}
                    onChange={(e) => setEditFormData({...editFormData, current_role_title: e.target.value})}
                    placeholder="Enter current role title"
                  />
                </div>
                <div>
                  <Label htmlFor="shift">Shift</Label>
                  <Select value={editFormData.shift || ''} onValueChange={(value) => setEditFormData({...editFormData, shift: value})}>
                    <SelectTrigger>
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
                  <Label htmlFor="is_class_teacher">Is Class Teacher</Label>
                  <Select value={editFormData.is_class_teacher || ''} onValueChange={(value) => setEditFormData({...editFormData, is_class_teacher: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="is_currently_active">Is Currently Active</Label>
                  <Select value={editFormData.is_currently_active || ''} onValueChange={(value) => setEditFormData({...editFormData, is_currently_active: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="save_status">Save Status</Label>
                  <Select value={editFormData.save_status || ''} onValueChange={(value) => setEditFormData({...editFormData, save_status: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
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
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="current_classes_taught">Current Classes Taught</Label>
                  <Input
                    id="current_classes_taught"
                    value={editFormData.current_classes_taught || ''}
                    onChange={(e) => setEditFormData({...editFormData, current_classes_taught: e.target.value})}
                    placeholder="Enter current classes taught"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="current_extra_responsibilities">Current Extra Responsibilities</Label>
                  <Textarea
                    id="current_extra_responsibilities"
                    value={editFormData.current_extra_responsibilities || ''}
                    onChange={(e) => setEditFormData({...editFormData, current_extra_responsibilities: e.target.value})}
                    placeholder="Enter current extra responsibilities"
                  />
                </div>
                <div>
                  <Label htmlFor="role_start_date">Role Start Date</Label>
                  <Input
                    id="role_start_date"
                    type="date"
                    value={editFormData.role_start_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, role_start_date: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="role_end_date">Role End Date</Label>
                  <Input
                    id="role_end_date"
                    type="date"
                    value={editFormData.role_end_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, role_end_date: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <Button
              onClick={handleEditClose}
              variant="outline"
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={isSubmitting}
              className="px-6"
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
  );
}