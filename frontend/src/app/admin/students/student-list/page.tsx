"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserRole, getCurrentUser } from "@/lib/permissions";
import { getFilteredStudents, getAllCampuses, getGrades, getClassrooms } from "@/lib/api";
import { DataTable, PaginationControls } from "@/components/shared";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { User, Search, RefreshCcw, Mail, GraduationCap, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiBaseUrl } from "@/lib/api";

interface Student {
  id: number;
  name: string;
  student_id: string;
  student_code: string;
  gr_no: string;
  current_grade: string;
  section: string;
  current_state: string;
  gender: string;
  campus_name: string;
  classroom_name: string;
  father_name: string;
  contact_number: string;
  email: string;
  coordinator_names: string[];
}

interface PaginationInfo {
  count: number;
  next: string | null;
  previous: string | null;
  results: Student[];
}

export default function StudentListPage() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
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
    campus: "",
    current_grade: "",
    section: "",
    current_state: "",
    gender: "",
    shift: "",
    ordering: "-created_at"
  });
  
  // User role and campus info
  const [userRole, setUserRole] = useState<string>("");
  const [userCampus, setUserCampus] = useState<string>("");
  const [campuses, setCampuses] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  
  // Edit functionality
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Debounced search
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeUserData();
  }, []);

  // Fetch grades when campus or shift changes
  useEffect(() => {
    fetchGrades();
  }, [filters.campus, filters.shift]);

  // When shift cleared, also clear selected grade
  useEffect(() => {
    if (!filters.shift && filters.current_grade) {
      setFilters(prev => ({ ...prev, current_grade: "" }));
    }
  }, [filters.shift]);

  useEffect(() => {
    fetchStudents();
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

  const fetchGrades = async () => {
    try {
      const campusId = filters.campus ? parseInt(filters.campus) : undefined;
      const gradesData: any = await getGrades(undefined, campusId);
      const gradesArray: any[] = gradesData?.results || (Array.isArray(gradesData) ? gradesData : []);

      let filtered: any[] = gradesArray;
      if (filters.shift) {
        // Use classrooms API to determine which grades are available for selected shift
        const classroomsData: any = await getClassrooms(undefined, undefined, campusId, filters.shift);
        const classrooms: any[] = Array.isArray(classroomsData)
          ? classroomsData
          : Array.isArray(classroomsData?.results)
            ? classroomsData.results
            : [];
        const gradeIds = new Set(
          classrooms.map((c: any) => c.grade || c.grade_id || c.gradeId).filter(Boolean)
        );
        const gradeNamesFromRooms = new Set(
          classrooms.map((c: any) => c.grade_name || c.gradeName).filter(Boolean)
        );
        filtered = gradesArray.filter((g: any) =>
          gradeIds.size > 0
            ? gradeIds.has(g.id)
            : gradeNamesFromRooms.size > 0
              ? gradeNamesFromRooms.has(g.name)
              : true
        );
      }

      // De-duplicate by name to avoid repeated entries
      const seen = new Set<string>();
      const deduped = filtered.filter((g: any) => {
        const key = (g.name || '').toString().trim().toLowerCase();
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setGrades(deduped);
    } catch (error) {
      console.error('Error fetching grades:', error);
      setGrades([]);
    }
  };

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = {
        page: currentPage,
        page_size: pageSize,
        search: searchQuery || undefined,
        campus: filters.campus ? parseInt(filters.campus) : undefined,
        // Do NOT send grade to backend; we'll normalize locally (Grade 1 vs Grade I etc.)
        current_grade: undefined,
        section: filters.section || undefined,
        current_state: filters.current_state || undefined,
        gender: filters.gender || undefined,
        shift: filters.shift || undefined,
        ordering: filters.ordering
      };

      const response: PaginationInfo = await getFilteredStudents(params);
      // Fallback: if backend ignores page_size and returns more, slice locally
      let pageResults = (response.results || []);
      if (Array.isArray(pageResults) && pageResults.length > pageSize) {
        pageResults = pageResults.slice(0, pageSize);
      }
      // Client-side normalization for grade names (Grade 1, Grade I, Grade-1 etc.)
      const normalizeGradeName = (value: string | null | undefined): string => {
        if (!value) return '';
        const s = value.toString().trim().toLowerCase();
        // extract number or roman
        // map roman numerals up to 12
        const romanMap: Record<string, string> = {
          'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5', 'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10', 'xi': '11', 'xii': '12'
        };
        const cleaned = s.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
        // try to find digits
        const digitMatch = cleaned.match(/\b(\d{1,2})\b/);
        let num = digitMatch ? digitMatch[1] : '';
        if (!num) {
          // try roman tokens
          const tokens = cleaned.split(' ');
          for (const t of tokens) {
            if (romanMap[t]) { num = romanMap[t]; break; }
          }
        }
        if (!num) return cleaned; // fallback
        return `grade ${num}`; // canonical form
      };

      let results = pageResults;
      if (filters.current_grade) {
        const selectedNorm = normalizeGradeName(filters.current_grade);
        results = results.filter((stu: any) => normalizeGradeName(stu.current_grade) === selectedNorm);
      }

      setStudents(results);
      // Adjust counts if we applied client filter; otherwise keep backend count
      const countBase = filters.current_grade ? results.length : (response.count || results.length || 0);
      setTotalCount(countBase);
      const computedTotalPages = Math.ceil(countBase / pageSize) || 1;
      setTotalPages(computedTotalPages);
      if (currentPage > computedTotalPages) {
        setCurrentPage(computedTotalPages);
        return; // trigger refetch with clamped page
      }
      
    } catch (err: any) {
      // Handle invalid page gracefully by stepping back one page (or to 1)
      if (err?.status === 404 || /invalid page/i.test(err?.message || '')) {
        setCurrentPage(prev => Math.max(1, prev - 1));
        return;
      }
      console.error("Error fetching students:", err);
      setError(err.message || "Failed to load students");
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
      fetchStudents();
    }, 500);
    
    setSearchTimeout(timeout);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({
      campus: "",
      current_grade: "",
      section: "",
      current_state: "",
      gender: "",
      shift: "",
      ordering: "-created_at"
    });
    setSearchQuery("");
    setCurrentPage(1);
  };

  const handleClearFiltersClick = () => {
    setIsClearing(true);
    try {
      clearFilters();
    } finally {
      // brief rotation cycle
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
  const handleEdit = async (student: Student) => {
    try {
      setEditingStudent(student);
      
      // Fetch full student data
      const baseForRead = getApiBaseUrl();
      const cleanBaseForRead = baseForRead.endsWith('/') ? baseForRead.slice(0, -1) : baseForRead;
      const response = await fetch(`${cleanBaseForRead}/api/students/${student.id}/`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const studentData = await response.json();
        // Load full data; UI will hide specific fields (grade/section/GR/shift/is_draft)
        setEditFormData({
          name: studentData.name || '',
          gender: studentData.gender || '',
          dob: studentData.dob || '',
          place_of_birth: studentData.place_of_birth || '',
          religion: studentData.religion || '',
          mother_tongue: studentData.mother_tongue || '',
          emergency_contact: studentData.emergency_contact || '',
          father_name: studentData.father_name || '',
          father_cnic: studentData.father_cnic || '',
          father_contact: studentData.father_contact || '',
          father_profession: studentData.father_profession || '',
          guardian_name: studentData.guardian_name || '',
          guardian_cnic: studentData.guardian_cnic || '',
          guardian_contact: studentData.guardian_contact || '',
          guardian_relation: studentData.guardian_relation || '',
          current_grade: studentData.current_grade || '',
          section: studentData.section || '',
          last_class_passed: studentData.last_class_passed || '',
          last_school_name: studentData.last_school_name || '',
          last_class_result: studentData.last_class_result || '',
          from_year: studentData.from_year || '',
          to_year: studentData.to_year || '',
          siblings_count: studentData.siblings_count || '',
          father_status: studentData.father_status || '',
          sibling_in_alkhair: studentData.sibling_in_alkhair || '',
          gr_no: studentData.gr_no || '',
          enrollment_year: studentData.enrollment_year || '',
          shift: studentData.shift || '',
          is_draft: studentData.is_draft ? 'true' : 'false'
        });
        setShowEditDialog(true);
      } else {
        console.error('Error fetching student data:', response.statusText);
        alert('Error loading student data');
      }
    } catch (error) {
      console.error('Error fetching student data:', error);
      alert('Error loading student data');
    }
  };

  const handleEditClose = () => {
    setEditingStudent(null);
    setShowEditDialog(false);
    setEditFormData({});
  };

  const handleEditSubmit = async () => {
    if (!editingStudent) return;
    
    setIsSubmitting(true);
    try {
      // Prepare update data - send all provided values EXCEPT excluded fields
      const excludeKeys = new Set(['current_grade','section','gr_no','shift','is_draft']);
      const updateData: any = {};
      Object.keys(editFormData).forEach(key => {
        if (excludeKeys.has(key)) return;
        if (editFormData[key] !== '' && editFormData[key] !== null && editFormData[key] !== undefined) {
          updateData[key] = editFormData[key];
        }
      });
      
      // Convert numeric fields
      if (updateData.from_year) updateData.from_year = parseInt(updateData.from_year);
      if (updateData.to_year) updateData.to_year = parseInt(updateData.to_year);
      if (updateData.enrollment_year) updateData.enrollment_year = parseInt(updateData.enrollment_year);
      if (updateData.siblings_count) updateData.siblings_count = parseInt(updateData.siblings_count);

      console.log('Updating student with data:', updateData);

      const baseForUpdate = getApiBaseUrl();
      const cleanBaseForUpdate = baseForUpdate.endsWith('/') ? baseForUpdate.slice(0, -1) : baseForUpdate;
      const response = await fetch(`${cleanBaseForUpdate}/api/students/${editingStudent.id}/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        alert(`✅ Success! Student ${editFormData.name || editingStudent.name} has been updated successfully!`);
        setShowEditDialog(false);
        setEditingStudent(null);
        setEditFormData({});
        // Refresh the students list
        fetchStudents();
      } else {
        const errorData = await response.text();
        console.error('Error updating student:', response.status, errorData);
        alert(`Error updating student: ${response.status} - ${errorData}`);
      }
    } catch (error) {
      console.error('Error updating student:', error);
      alert('Error updating student');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Define table columns
  const columns = [
    {
      key: 'student_info',
      label: 'Student',
      icon: <User className="h-3 w-3 sm:h-4 sm:w-4" />,
      render: (student: Student) => (
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center bg-[#6096ba]">
              <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-base font-bold text-gray-900 mb-0.5">
              {student.name}
            </div>
            <div className="text-xs sm:text-sm text-gray-600 flex items-center space-x-1.5">
              <div className="flex-shrink-0">
                <div className="h-5 w-5 rounded bg-gray-100 flex items-center justify-center">
                  <Mail className="h-3 w-3 text-gray-600" />
                </div>
              </div>
              <span className="font-mono text-xs sm:text-sm break-all">
                {student.student_id || student.student_code || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'grade_section',
      label: 'Grade/Section',
      icon: <GraduationCap className="h-3 w-3 sm:h-4 sm:w-4" />,
      render: (student: Student) => (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-[#6096ba] flex-shrink-0" />
            <div>
              <span className="text-xs font-semibold text-gray-600 uppercase">Grade: </span>
              <span className="text-sm sm:text-base font-medium text-gray-900">{student.current_grade || 'N/A'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4 sm:h-5 sm:w-5 text-[#6096ba] flex-shrink-0" />
            <div>
              <span className="text-xs font-semibold text-gray-600 uppercase">Section: </span>
              <span className="text-sm sm:text-base font-medium text-gray-900">{student.section || 'N/A'}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'campus',
      label: 'Campus',
      icon: <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />,
      render: (student: Student) => (
        <div className="flex items-start space-x-2">
          <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-[#6096ba] flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-base font-bold text-gray-900">
              {student.campus_name || 'N/A'}
            </div>
            {student.coordinator_names && student.coordinator_names.length > 0 && (
              <div className="text-xs text-gray-600 mt-0.5">
                Coord: {student.coordinator_names[0]}
              </div>
            )}
          </div>
        </div>
      )
    }
  ];

  if (loading && students.length === 0) {
    return <LoadingSpinner message="Loading students..." fullScreen />;
  }

  return (
    <div className="p-2 sm:p-3 md:p-4 w-full max-w-full overflow-x-hidden">
      <div className="mb-3 sm:mb-4">
        <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2" style={{ color: '#274c77' }}>
          Students List
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-gray-600">
          Showing {students.length} of {totalCount} students
        </p>
      </div>

       {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-2.5 sm:p-3 md:p-4 mb-3 w-full overflow-x-hidden" style={{ borderColor: '#a3cef1' }}>
        <div className="mb-2 sm:mb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2" style={{ color: '#274c77' }}>
              <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#6096ba' }}>
                <span className="text-white text-xs font-bold"><Search className="h-4 w-4" /></span>
              </div>
              <h3 className="text-sm sm:text-base md:text-lg font-semibold">Search & Filters</h3>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <button
                onClick={handleClearFiltersClick}
                className="inline-flex items-center justify-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 transition-all duration-150 ease-in-out transform shadow-sm hover:shadow-lg active:scale-95 active:shadow-md touch-manipulation"
                style={{ backgroundColor: '#6096ba', minHeight: '38px' }}
              >
                <span className="mr-1.5"><RefreshCcw className={`h-4 w-4 transition-transform duration-500 ${isClearing ? 'rotate-[360deg]' : 'rotate-0'}`} /></span>
                <span>Clear Filters</span>
              </button>
            </div>
          </div>
        </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3 md:gap-4 mb-3 sm:mb-4">
          {/* Search */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
              Search
            </label>
            <input
              type="text"
              placeholder="Search by name, code, GR number..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full px-2.5 sm:px-3 py-2.5 sm:py-2 text-sm sm:text-base border rounded-lg focus:outline-none focus:ring-2 touch-manipulation"
              style={{ borderColor: '#a3cef1', minHeight: '44px', maxWidth: '100%' }}
               />
             </div>
             
          {/* Campus Filter */}
               <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
              Campus
            </label>
                 <select
              value={filters.campus}
              onChange={(e) => handleFilterChange('campus', e.target.value)}
              className="w-full px-2.5 sm:px-3 py-2.5 sm:py-2 text-sm sm:text-base border rounded-lg focus:outline-none focus:ring-2 touch-manipulation"
              style={{ borderColor: '#a3cef1', minHeight: '44px', maxWidth: '100%' }}
            >
              <option value="">All Campuses</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.campus_name || campus.name}
                </option>
              ))}
                 </select>
               </div>
               
          {/* Grade Filter */}
               <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
              Grade
            </label>
                 <select
              value={filters.current_grade}
              onChange={(e) => handleFilterChange('current_grade', e.target.value)}
              className="w-full px-2.5 sm:px-3 py-2.5 sm:py-2 text-sm sm:text-base border rounded-lg focus:outline-none focus:ring-2 touch-manipulation"
              disabled={!filters.shift}
              style={{ borderColor: '#a3cef1', minHeight: '44px', maxWidth: '100%' }}
            >
              <option value="" disabled={!filters.shift}>
                {filters.shift ? 'All Grades' : 'Select shift first'}
              </option>
              {grades.map((g: any) => (
                <option key={g.id} value={g.name}>{g.name}</option>
              ))}
                 </select>
               </div>
               
          {/* Section Filter */}
               <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
              Section
            </label>
                 <select
              value={filters.section}
              onChange={(e) => handleFilterChange('section', e.target.value)}
              className="w-full px-2.5 sm:px-3 py-2.5 sm:py-2 text-sm sm:text-base border rounded-lg focus:outline-none focus:ring-2 touch-manipulation"
              style={{ borderColor: '#a3cef1', minHeight: '44px', maxWidth: '100%' }}
            >
              <option value="">All Sections</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
               </div>
               
          {/* Status Filter */}
               {/* <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
              Status
            </label>
                 <select
              value={filters.current_state}
              onChange={(e) => handleFilterChange('current_state', e.target.value)}
              className="w-full px-2.5 sm:px-3 py-2.5 sm:py-2 text-sm sm:text-base border rounded-lg focus:outline-none focus:ring-2 touch-manipulation"
              style={{ borderColor: '#a3cef1', minHeight: '44px', maxWidth: '100%' }}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
                 </select>
               </div> */}
               
          {/* Shift Filter */}
               <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
              Shift
            </label>
                 <select
              value={filters.shift}
              onChange={(e) => handleFilterChange('shift', e.target.value)}
              className="w-full px-2.5 sm:px-3 py-2.5 sm:py-2 text-sm sm:text-base border rounded-lg focus:outline-none focus:ring-2 touch-manipulation"
              style={{ borderColor: '#a3cef1', minHeight: '44px', maxWidth: '100%' }}
            >
              <option value="">All Shifts</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
                 </select>
               </div>
             </div>
             </div>

      {/* Students Table - USING REUSABLE COMPONENT */}
      <DataTable
        data={students}
        columns={columns}
        onView={(student) => router.push(`/admin/students/profile?id=${student.id}`)}
        onEdit={(student) => handleEdit(student)}
        isLoading={loading}
        emptyMessage="No students found"
        allowEdit={userRole !== 'superadmin' && userRole !== 'principal'} // Coordinator and teacher can edit
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

      {/* Edit Student Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold transition-all duration-150 ease-in-out transform hover:shadow-lg active:scale-95 active:shadow-md" style={{ color: '#274c77' }}>
              Edit Student - {editingStudent?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Personal Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                    placeholder="Enter full name"
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
                    </SelectContent>
                  </Select>
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
                  <Label htmlFor="place_of_birth">Place of Birth</Label>
                  <Input
                    id="place_of_birth"
                    value={editFormData.place_of_birth || ''}
                    onChange={(e) => setEditFormData({...editFormData, place_of_birth: e.target.value})}
                    placeholder="Enter place of birth"
                  />
                </div>
                <div>
                  <Label htmlFor="religion">Religion</Label>
                  <Input
                    id="religion"
                    value={editFormData.religion || ''}
                    onChange={(e) => setEditFormData({...editFormData, religion: e.target.value})}
                    placeholder="Enter religion"
                  />
                </div>
                <div>
                  <Label htmlFor="mother_tongue">Mother Tongue</Label>
                  <Input
                    id="mother_tongue"
                    value={editFormData.mother_tongue || ''}
                    onChange={(e) => setEditFormData({...editFormData, mother_tongue: e.target.value})}
                    placeholder="Enter mother tongue"
                  />
                </div>
                <div>
                  <Label htmlFor="emergency_contact">Emergency Contact</Label>
                  <Input
                    id="emergency_contact"
                    value={editFormData.emergency_contact || ''}
                    onChange={(e) => setEditFormData({...editFormData, emergency_contact: e.target.value})}
                    placeholder="Enter emergency contact"
                  />
                </div>
              </div>
            </div>

            {/* Father Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Father Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="father_name">Father Name</Label>
                  <Input
                    id="father_name"
                    value={editFormData.father_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, father_name: e.target.value})}
                    placeholder="Enter father name"
                  />
                </div>
                <div>
                  <Label htmlFor="father_cnic">Father CNIC</Label>
                  <Input
                    id="father_cnic"
                    value={editFormData.father_cnic || ''}
                    onChange={(e) => setEditFormData({...editFormData, father_cnic: e.target.value})}
                    placeholder="Enter father CNIC"
                  />
                </div>
                <div>
                  <Label htmlFor="father_contact">Father Contact</Label>
                  <Input
                    id="father_contact"
                    value={editFormData.father_contact || ''}
                    onChange={(e) => setEditFormData({...editFormData, father_contact: e.target.value})}
                    placeholder="Enter father contact"
                  />
                </div>
                <div>
                  <Label htmlFor="father_profession">Father Profession</Label>
                  <Input
                    id="father_profession"
                    value={editFormData.father_profession || ''}
                    onChange={(e) => setEditFormData({...editFormData, father_profession: e.target.value})}
                    placeholder="Enter father profession"
                  />
                </div>
                <div>
                  <Label htmlFor="father_status">Father Status</Label>
                  <Select value={editFormData.father_status || ''} onValueChange={(value) => setEditFormData({...editFormData, father_status: value})}>
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

            {/* Guardian Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Guardian Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="guardian_name">Guardian Name</Label>
                  <Input
                    id="guardian_name"
                    value={editFormData.guardian_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, guardian_name: e.target.value})}
                    placeholder="Enter guardian name"
                  />
                </div>
                <div>
                  <Label htmlFor="guardian_cnic">Guardian CNIC</Label>
                  <Input
                    id="guardian_cnic"
                    value={editFormData.guardian_cnic || ''}
                    onChange={(e) => setEditFormData({...editFormData, guardian_cnic: e.target.value})}
                    placeholder="Enter guardian CNIC"
                  />
                </div>
                <div>
                  <Label htmlFor="guardian_contact">Guardian Contact</Label>
                  <Input
                    id="guardian_contact"
                    value={editFormData.guardian_contact || ''}
                    onChange={(e) => setEditFormData({...editFormData, guardian_contact: e.target.value})}
                    placeholder="Enter guardian contact"
                  />
                </div>
                <div>
                  <Label htmlFor="guardian_relation">Guardian Relation</Label>
                  <Input
                    id="guardian_relation"
                    value={editFormData.guardian_relation || ''}
                    onChange={(e) => setEditFormData({...editFormData, guardian_relation: e.target.value})}
                    placeholder="Enter guardian relation"
                  />
                </div>
              </div>
            </div>

            {/* Academic Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Academic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="last_class_passed">Last Class Passed</Label>
                  <Input
                    id="last_class_passed"
                    value={editFormData.last_class_passed || ''}
                    onChange={(e) => setEditFormData({...editFormData, last_class_passed: e.target.value})}
                    placeholder="Enter last class passed"
                  />
                </div>
                <div>
                  <Label htmlFor="last_school_name">Last School Name</Label>
                  <Input
                    id="last_school_name"
                    value={editFormData.last_school_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, last_school_name: e.target.value})}
                    placeholder="Enter last school name"
                  />
                </div>
                <div>
                  <Label htmlFor="last_class_result">Last Class Result</Label>
                  <Input
                    id="last_class_result"
                    value={editFormData.last_class_result || ''}
                    onChange={(e) => setEditFormData({...editFormData, last_class_result: e.target.value})}
                    placeholder="Enter last class result"
                  />
                </div>
                <div>
                  <Label htmlFor="enrollment_year">Enrollment Year</Label>
                  <Input
                    id="enrollment_year"
                    type="number"
                    value={editFormData.enrollment_year || ''}
                    onChange={(e) => setEditFormData({...editFormData, enrollment_year: e.target.value})}
                    placeholder="Enter enrollment year"
                  />
                </div>
              </div>
            </div>

            {/* Family Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Family Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="siblings_count">Siblings Count</Label>
                  <Input
                    id="siblings_count"
                    type="number"
                    value={editFormData.siblings_count || ''}
                    onChange={(e) => setEditFormData({...editFormData, siblings_count: e.target.value})}
                    placeholder="Enter siblings count"
                  />
                </div>
                <div>
                  <Label htmlFor="sibling_in_alkhair">Sibling in Alkhair</Label>
                  <Select value={editFormData.sibling_in_alkhair || ''} onValueChange={(value) => setEditFormData({...editFormData, sibling_in_alkhair: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="from_year">From Year</Label>
                  <Input
                    id="from_year"
                    type="number"
                    value={editFormData.from_year || ''}
                    onChange={(e) => setEditFormData({...editFormData, from_year: e.target.value})}
                    placeholder="Enter from year"
                  />
                </div>
                <div>
                  <Label htmlFor="to_year">To Year</Label>
                  <Input
                    id="to_year"
                    type="number"
                    value={editFormData.to_year || ''}
                    onChange={(e) => setEditFormData({...editFormData, to_year: e.target.value})}
                    placeholder="Enter to year"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6 transition-all duration-150 ease-in-out transform hover:shadow-lg active:scale-95 active:shadow-md">
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
                'Update Student'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}