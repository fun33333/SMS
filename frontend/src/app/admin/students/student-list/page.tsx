"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUserRole, getCurrentUser } from "@/lib/permissions";
import { getFilteredStudents, getAllCampuses, getGrades, getClassrooms, getCurrentUserProfile } from "@/lib/api";
import { DataTable, PaginationControls } from "@/components/shared";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { User, Search, RefreshCcw, Mail, GraduationCap, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calender";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
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
  is_active?: boolean;
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
    ordering: "name"
  });
  
  // User role and campus info
  const [userRole, setUserRole] = useState<string>("");
  const [userCampus, setUserCampus] = useState<string>("");
  const [userCampusId, setUserCampusId] = useState<number | null>(null);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [teacherShifts, setTeacherShifts] = useState<string[]>([]);
  const [showShiftFilter, setShowShiftFilter] = useState(true);
  const [teacherSections, setTeacherSections] = useState<string[]>([]);
  const [showSectionFilter, setShowSectionFilter] = useState(true);
  const [teacherGrades, setTeacherGrades] = useState<string[]>([]);
  const [showGradeFilter, setShowGradeFilter] = useState(true);
  
  // Edit functionality
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  
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
    if (user?.campus?.id) {
      setUserCampusId(user.campus.id);
    }
    
    // For teachers, fetch their profile and classrooms to determine shifts
    if (role === 'teacher') {
      try {
        const profile: any = await getCurrentUserProfile();
        if (profile) {
          // Get teacher's campus ID
          const teacherCampusId = profile.campus?.id || profile.campus_id || user?.campus?.id;
          if (teacherCampusId) {
            setUserCampusId(teacherCampusId);
            // Pre-fill campus filter for teachers
            setFilters(prev => ({ ...prev, campus: String(teacherCampusId) }));
          }
          
          // Get teacher's assigned classrooms from profile
          // Handle both assigned_classrooms (array) and assigned_classroom (single object)
          let classroomsList: any[] = [];
          
          if (profile.assigned_classrooms && Array.isArray(profile.assigned_classrooms) && profile.assigned_classrooms.length > 0) {
            classroomsList = profile.assigned_classrooms;
          } else if (profile.assigned_classroom) {
            // Fallback to singular assigned_classroom if assigned_classrooms is empty
            classroomsList = [profile.assigned_classroom];
          } else if (profile.classrooms && Array.isArray(profile.classrooms)) {
            classroomsList = profile.classrooms;
          }
          
          console.log('Teacher Profile:', profile);
          console.log('Teacher Classrooms List:', classroomsList);
          
          if (classroomsList.length > 0) {
            // Get unique shifts, sections, and grades from teacher's classrooms
            const shifts = new Set<string>();
            const sections = new Set<string>();
            const grades = new Set<string>();
            
            classroomsList.forEach((classroom: any) => {
              console.log('Processing classroom:', classroom);
              if (classroom.shift) {
                shifts.add(classroom.shift.toLowerCase());
              }
              if (classroom.section) {
                sections.add(classroom.section.toUpperCase());
              }
              // Backend returns grade as string in 'grade' field
              if (classroom.grade) {
                if (typeof classroom.grade === 'string') {
                  grades.add(classroom.grade);
                } else if (classroom.grade?.name) {
                  grades.add(classroom.grade.name);
                }
              } else if (classroom.grade_name) {
                grades.add(classroom.grade_name);
              }
            });
            
            const shiftsArray = Array.from(shifts);
            const sectionsArray = Array.from(sections);
            const gradesArray = Array.from(grades);
            
            console.log('Extracted - Shifts:', shiftsArray, 'Sections:', sectionsArray, 'Grades:', gradesArray);
            
            setTeacherShifts(shiftsArray);
            setTeacherSections(sectionsArray);
            setTeacherGrades(gradesArray);
            
            // Auto-fill and hide filters if teacher has only one option
            const newFilters: any = {};
            
            // Shift filter logic
            if (shiftsArray.length === 1) {
              newFilters.shift = shiftsArray[0];
              setShowShiftFilter(false);
              console.log('Hiding shift filter, auto-filling:', shiftsArray[0]);
            } else {
              setShowShiftFilter(true);
            }
            
            // Section filter logic
            if (sectionsArray.length === 1) {
              newFilters.section = sectionsArray[0];
              setShowSectionFilter(false);
              console.log('Hiding section filter, auto-filling:', sectionsArray[0]);
            } else {
              setShowSectionFilter(true);
            }
            
            // Grade filter logic
            if (gradesArray.length === 1) {
              newFilters.current_grade = gradesArray[0];
              setShowGradeFilter(false);
              console.log('Hiding grade filter, auto-filling:', gradesArray[0]);
            } else {
              setShowGradeFilter(true);
            }
            
            // Apply all filters at once
            if (Object.keys(newFilters).length > 0) {
              console.log('Applying filters:', newFilters);
              setFilters(prev => ({ ...prev, ...newFilters }));
            }
          } else {
            // Fallback: Get all classrooms from campus if teacher classrooms not in profile
            if (teacherCampusId) {
              const allClassrooms: any = await getClassrooms(undefined, undefined, teacherCampusId);
              const allClassroomsList = Array.isArray(allClassrooms) 
                ? allClassrooms 
                : Array.isArray(allClassrooms?.results) 
                  ? allClassrooms.results 
                  : [];
              
              // Get unique shifts from all classrooms
              const shifts = new Set<string>();
              allClassroomsList.forEach((classroom: any) => {
                if (classroom.shift) {
                  shifts.add(classroom.shift.toLowerCase());
                }
              });
              
              const shiftsArray = Array.from(shifts);
              setTeacherShifts(shiftsArray);
              
              // If teacher teaches only one shift, auto-filter by that shift and hide filter
              if (shiftsArray.length === 1) {
                setFilters(prev => ({ ...prev, shift: shiftsArray[0] }));
                setShowShiftFilter(false);
              } else {
                setShowShiftFilter(true);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching teacher profile:', error);
      }
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

      // Sort results: Active students first, then inactive students at the end
      // Within each group, sort by name in ascending order
      let results = [...pageResults].sort((a, b) => {
        const aIsActive = a.is_active !== false; // true if active or undefined
        const bIsActive = b.is_active !== false;
        
        // If both have same status, sort by name in ascending order
        if (aIsActive === bIsActive) {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        }
        
        // Active students come first (return -1), inactive come last (return 1)
        return aIsActive ? -1 : 1;
      });
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
      ordering: "name"
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
            const formData = {
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
            is_draft: studentData.is_draft ? 'true' : 'false',
            is_active: studentData.is_active !== undefined ? studentData.is_active : true,
            classroom: studentData.classroom || studentData.classroom_id || '',
            photo: studentData.photo || null,
                  };
                  
                  // Fetch classrooms for this student's campus and shift
                  if (studentData.campus) {
                    const campusId = typeof studentData.campus === 'object' ? studentData.campus.id : studentData.campus;
                    const studentShift = studentData.shift || '';
                    try {
                      const classroomsData: any = await getClassrooms(undefined, undefined, campusId, studentShift);
                      const classroomsList: any[] = Array.isArray(classroomsData)
                        ? classroomsData
                        : Array.isArray(classroomsData?.results)
                          ? classroomsData.results
                          : [];
                      setClassrooms(classroomsList);
                    } catch (error) {
                      console.error('Error fetching classrooms:', error);
                      setClassrooms([]);
                    }
                  }

                  setEditFormData(formData);
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

  const handleDeletePhoto = async () => {
    if (!editingStudent) return;

    // If the photo in state is a File object (not uploaded yet), just clear it locally
    if (editFormData.photo && editFormData.photo instanceof File) {
      setEditFormData((prev: any) => ({ ...prev, photo: null }));
      return;
    }

    // Otherwise request backend to delete stored photo
    try {
      const baseForUpdate = getApiBaseUrl();
      const cleanBaseForUpdate = baseForUpdate.endsWith('/') ? baseForUpdate.slice(0, -1) : baseForUpdate;
      const resp = await fetch(`${cleanBaseForUpdate}/api/students/${editingStudent.id}/delete-photo/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
        },
      });

      if (resp.ok) {
        // clear preview
        setEditFormData((prev: any) => ({ ...prev, photo: null }));
        alert('✅ Photo deleted');
      } else {
        const text = await resp.text();
        console.error('Failed to delete photo:', resp.status, text);
        alert(`Error deleting photo: ${resp.status} - ${text}`);
      }
    } catch (err) {
      console.error('Error deleting photo:', err);
      alert('Error deleting photo');
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
      // Handle photo upload first if there's a new photo
      let photoUrl = editFormData.photo;
      if (editFormData.photo && editFormData.photo instanceof File) {
        const formData = new FormData();
        formData.append('photo', editFormData.photo);
        
        const baseForUpdate = getApiBaseUrl();
        const cleanBaseForUpdate = baseForUpdate.endsWith('/') ? baseForUpdate.slice(0, -1) : baseForUpdate;
        
        try {
          const photoResponse = await fetch(`${cleanBaseForUpdate}/api/students/${editingStudent.id}/upload-photo/`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
            },
            body: formData,
          });
          
          if (photoResponse.ok) {
            const photoData = await photoResponse.json();
            photoUrl = photoData.photo_url; // Get the URL of the uploaded photo
            // update local form preview to use server URL (but do NOT send this URL again in the PATCH body)
            setEditFormData((prev: any) => ({ ...prev, photo: photoUrl }));
          }
        } catch (error) {
          console.error('Error uploading photo:', error);
        }
      }

      // Prepare update data - send all provided values EXCEPT excluded fields
      // Note: classroom is NOT excluded - we want to allow classroom updates
      const excludeKeys = new Set(['current_grade', 'section', 'gr_no', 'shift', 'is_draft', 'photo']);
      const updateData: any = {};
      Object.keys(editFormData).forEach(key => {
        if (excludeKeys.has(key)) return;
        // Include classroom even if it's null (to allow removing assignment)
        if (key === 'classroom') {
          updateData[key] = editFormData[key] !== undefined ? (editFormData[key] || null) : undefined;
        } else if (editFormData[key] !== '' && editFormData[key] !== null && editFormData[key] !== undefined) {
          updateData[key] = editFormData[key];
        }
      });
      
    
      
      // Convert numeric fields
      if (updateData.from_year) updateData.from_year = parseInt(updateData.from_year);
      if (updateData.to_year) updateData.to_year = parseInt(updateData.to_year);
      if (updateData.enrollment_year) updateData.enrollment_year = parseInt(updateData.enrollment_year);
      if (updateData.siblings_count) updateData.siblings_count = parseInt(updateData.siblings_count);

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

  const handleDobSelect = (date: Date | undefined) => {
    if (date) {
      const iso = date.toISOString().slice(0, 10);
      setEditFormData((prev: any) => ({ ...prev, dob: iso }));
    }
    setShowDobPicker(false);
  };

  const handleDelete = async (student: Student) => {
    const confirm = window.confirm(`Are you sure you want to delete ${student.name}?`);
    if (!confirm) return;
    try {
      const base = getApiBaseUrl();
      const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
      const response = await fetch(`${cleanBase}/api/students/${student.id}/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
        },
      });
      if (response.ok || response.status === 204) {
        alert(`✅ Student ${student.name} deleted successfully.`);
        fetchStudents();
      } else {
        const text = await response.text();
        alert(`Error deleting student: ${response.status} - ${text}`);
      }
    } catch (error) {
      console.error('Error deleting student:', error);
      alert('Failed to delete student. Please try again.');
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
    },
    {
      key: 'status',
      label: 'Status',
      icon: <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />,
      render: (student: Student) => (
        <div className="flex items-center space-x-2">
          {student.is_active !== false ? (
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs sm:text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                Active
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 flex-shrink-0" />
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs sm:text-sm font-medium bg-red-100 text-red-800 border border-red-200">
                Inactive
              </span>
            </div>
          )}
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
              disabled={userRole === 'teacher' && userCampusId !== null}
              className="w-full px-2.5 sm:px-3 py-2.5 sm:py-2 text-sm sm:text-base border rounded-lg focus:outline-none focus:ring-2 touch-manipulation"
              style={{ 
                borderColor: '#a3cef1', 
                minHeight: '44px', 
                maxWidth: '100%',
                backgroundColor: userRole === 'teacher' && userCampusId !== null ? '#f3f4f6' : 'white',
                cursor: userRole === 'teacher' && userCampusId !== null ? 'not-allowed' : 'pointer'
              }}
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
               {showGradeFilter && (
               <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
              Grade
            </label>
                 <select
              value={filters.current_grade}
              onChange={(e) => handleFilterChange('current_grade', e.target.value)}
              className="w-full px-2.5 sm:px-3 py-2.5 sm:py-2 text-sm sm:text-base border rounded-lg focus:outline-none focus:ring-2 touch-manipulation"
              disabled={!filters.shift && userRole !== 'teacher'}
              style={{ borderColor: '#a3cef1', minHeight: '44px', maxWidth: '100%' }}
            >
              <option value="" disabled={!filters.shift && userRole !== 'teacher'}>
                {filters.shift || userRole === 'teacher' ? 'All Grades' : 'Select shift first'}
              </option>
              {userRole === 'teacher' && teacherGrades.length > 0 ? (
                teacherGrades.map((grade: string) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))
              ) : (
                grades.map((g: any) => (
                  <option key={g.id} value={g.name}>{g.name}</option>
                ))
              )}
                 </select>
               </div>
               )}
               
          {/* Section Filter */}
               {showSectionFilter && (
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
              {userRole === 'teacher' && teacherSections.length > 0 ? (
                teacherSections.map((section: string) => (
                  <option key={section} value={section}>{section}</option>
                ))
              ) : (
                <>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </>
              )}
            </select>
               </div>
               )}
               {showShiftFilter && (
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
              {teacherShifts.length > 0 ? (
                teacherShifts.map((shift) => (
                  <option key={shift} value={shift}>
                    {shift.charAt(0).toUpperCase() + shift.slice(1)}
                  </option>
                ))
              ) : (
                <>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                </>
              )}
                 </select>
               </div>
               )}
             </div>
             </div>

      {/* Students Table - USING REUSABLE COMPONENT */}
      <DataTable
        data={students}
        columns={columns}
        onView={(student) => router.push(`/admin/students/profile?id=${student.id}`)}
        onEdit={(student) => handleEdit(student)}
        onDelete={(student) => handleDelete(student)}
        isLoading={loading}
        emptyMessage="No students found"
        allowEdit={userRole !== 'superadmin'} // Coordinator and teacher can edit
        allowDelete={userRole !== 'superadmin' && userRole !== 'teacher'} // Hide delete for teachers
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
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto px-4 sm:px-6 py-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold transition-all duration-150 ease-in-out transform hover:shadow-lg active:scale-95 active:shadow-md" style={{ color: '#274c77' }}>
              Edit Student - {editingStudent?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 text-sm sm:text-base">
            {/* Personal Information */}
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5] shadow-inner">
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
                        onClick={async () => {
                          // If the photo is a File (not uploaded yet), just clear it locally.
                          if (editFormData.photo && editFormData.photo instanceof File) {
                            setEditFormData((prev: any) => ({ ...prev, photo: null }));
                            return;
                          }
                          // Otherwise ask backend to delete stored photo
                          await handleDeletePhoto();
                        }}
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
                          setEditFormData({...editFormData, photo: file});
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
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5] shadow-inner">
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
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5] shadow-inner">
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
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5] shadow-inner">
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
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5] shadow-inner">
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

            {/* Academic Information - Classroom Assignment */}
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5] shadow-inner">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>Classroom Assignment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="classroom">Classroom</Label>
                  <Select 
                    value={editFormData.classroom ? String(editFormData.classroom) : 'none'} 
                    onValueChange={(value) => setEditFormData({...editFormData, classroom: value === 'none' ? null : parseInt(value)})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select classroom" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Classroom</SelectItem>
                      {classrooms.map((classroom: any) => (
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

            {/* System Information */}
            <div className="bg-gray-50 p-4 sm:p-5 rounded-2xl border border-[#e4ecf5] shadow-inner">
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#274c77' }}>System Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="is_active">Student Status</Label>
                  <Select 
                    value={editFormData.is_active !== undefined ? (editFormData.is_active ? 'true' : 'false') : 'true'} 
                    onValueChange={(value) => setEditFormData({...editFormData, is_active: value === 'true'})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive (Left)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-gray-500">Inactive students will not appear in attendance sheets</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-6 transition-all duration-150">
            <Button
              onClick={handleEditClose}
              variant="outline"
              className="px-6 w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={isSubmitting}
              className="px-6 w-full sm:w-auto"
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