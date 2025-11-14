"use client";
import React, { useState, useEffect, Suspense } from "react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Users, CheckCircle, XCircle, AlertCircle, Save, RefreshCw, Edit3, History, Eraser, Clock3, Bell, Eye, EyeOff, X } from "lucide-react";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getCurrentUserRole } from "@/lib/permissions";
import { getCurrentUserProfile, getClassStudents, markBulkAttendance, getAttendanceHistory, getAttendanceForDate, editAttendance, submitAttendance, getBackfillPermissions, finalizeAttendance, coordinatorApproveAttendance, getApiBaseUrl, ApiError, getHolidays } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";


type AttendanceStatus = "present" | "absent" | "leave";

interface Student {
  id: number;
  name: string;
  student_code: string;
  student_id?: string;
  gr_no?: string;
  gender: string;
  photo?: string;
}

interface ClassInfo {
  id: number;
  name: string;
  code: string;
  grade: string;
  section: string;
  shift: string;
  campus?: string;
}



interface SimpleClassRoom {
  id: number;
  name: string;
  code?: string;
  grade?: any;
  section?: string;
  shift?: string;
  campus?: any;
}

interface TeacherProfile {
  assigned_classroom?: SimpleClassRoom;
  assigned_classrooms?: SimpleClassRoom[];
}

function TeacherAttendanceContent() {
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<number, AttendanceStatus>>({});
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attendanceHistory] = useState<unknown[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [existingAttendanceId, setExistingAttendanceId] = useState<number | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [backfillPermissions, setBackfillPermissions] = useState<any[]>([]);
  const [hasNewPermissions, setHasNewPermissions] = useState(false);
  const [last6DaysAttendance, setLast6DaysAttendance] = useState<any[]>([]);
  const [loadingLast6Days, setLoadingLast6Days] = useState(false);
  const [expandedAttendance, setExpandedAttendance] = useState<number | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [attendanceHistoryData, setAttendanceHistoryData] = useState<any[]>([]);
  const [attendanceSubmitted, setAttendanceSubmitted] = useState(false);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [classroomOptions, setClassroomOptions] = useState<SimpleClassRoom[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [selectedHoliday, setSelectedHoliday] = useState<any | null>(null);
  
  // Helper function to normalize date format (YYYY-MM-DD)
  const normalizeDate = (dateStr: string | undefined | null): string => {
    if (!dateStr) return '';
    // Handle both date objects and strings
    if (typeof dateStr === 'string') {
      return dateStr.split('T')[0]; // Remove time part if present
    }
    return dateStr;
  };
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolveMediaUrl = (url?: string) => {
    if (!url) return "";
    if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url;
    const base = getApiBaseUrl();
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${cleanBase}${path}`;
  };


  const userRole = getCurrentUserRole();
  const classroomId = searchParams.get('classroom');
  const isWeekend = new Date(selectedDate).getDay() === 0; // Sunday

  useEffect(() => {
    if (userRole === 'teacher') {
      document.title = "Mark Attendance | IAK SMS";
      fetchTeacherData();
      fetchBackfillPermissions();
    } else if (userRole === 'coordinator' && classroomId) {
      document.title = "View Attendance | IAK SMS";
      fetchCoordinatorClassData();
      fetchCurrentMonthAttendance();
    }
  }, [userRole, classroomId]);

  // Check for approved attendance notifications
  useEffect(() => {
      if (userRole === 'teacher' && attendanceHistory) {
      checkForApprovedAttendance();
    }
  }, [attendanceHistory, userRole]);

  // Removed periodic check - approval notifications now come via WebSocket only

  const fetchTeacherData = async () => {
    try {
      setLoading(true);
      setLoadingStudents(true);
      setError("");
      
      // Get teacher's profile and classroom
      const teacherProfile = await getCurrentUserProfile() as TeacherProfile;
      
      if (!teacherProfile) {
        setError("Failed to load user profile. Please login again.");
        // Redirect to login after a short delay
        setTimeout(() => {
          router.push('/Universal_Login');
        }, 2000);
        return;
      }
      
      const multi = Array.isArray(teacherProfile.assigned_classrooms) ? teacherProfile.assigned_classrooms : []
      if (!teacherProfile.assigned_classroom && multi.length === 0) {
        setError("No classroom assigned to you. Please contact administrator.");
        return;
      }

      // Build classroom selection list
      const options: SimpleClassRoom[] = multi.length > 0 ? multi : (teacherProfile.assigned_classroom ? [teacherProfile.assigned_classroom] : [])
      setClassroomOptions(options)

      // Choose classroom from URL ?classroom=ID or default to first
      const urlParamId = searchParams.get('classroom')
      const selected = (urlParamId ? options.find(c=> String(c.id)===String(urlParamId)) : options[0]) as any
      if (!selected) {
        setError("No classroom assigned to you. Please contact administrator.");
        return;
      }

      // Set class info
      setClassInfo({
        id: selected.id,
        name: selected.name || "Unknown Class",
        code: selected.code || "",
        grade: (selected as any).grade?.name || "",
        section: (selected as any).section || "",
        shift: (selected as any).shift || "",
        campus: (selected as any).campus?.campus_name || ""
      });

      // Fetch students for this classroom
      const studentsData = await getClassStudents(selected.id) as Student[];
      console.log('Fetched students:', studentsData);
      setStudents(studentsData);
      setLoadingStudents(false);

      // Determine initial date (support ?date=YYYY-MM-DD)
      const dateParam = searchParams.get('date')
      const initialDate = dateParam || selectedDate
      setSelectedDate(initialDate)

      // Fetch holidays FIRST before loading attendance - try multiple ways to get level ID
      let levelId: number | null = null;
      
      // Method 1: Try level_id (direct - from backend update)
      if ((selected as any).level_id) {
        levelId = (selected as any).level_id;
      }
      // Method 2: Try grade.level.id (nested structure)
      else if ((selected as any).grade?.level?.id) {
        levelId = (selected as any).grade.level.id;
      }
      // Method 3: Try level.id (direct structure)
      else if ((selected as any).level?.id) {
        levelId = (selected as any).level.id;
      }
      // Method 4: Fallback - fetch full classroom details if we still don't have level_id
      if (!levelId && selected.id) {
        try {
          const { getClassrooms } = await import('@/lib/api');
          const classroomsData = await getClassrooms();
          const classroomsList = Array.isArray(classroomsData) 
            ? classroomsData 
            : ((classroomsData as any)?.results || []);
          const fullClassroom = classroomsList.find((c: any) => c.id === selected.id);
          if (fullClassroom) {
            // Try level_id first (from backend)
            if (fullClassroom.level_id) {
              levelId = fullClassroom.level_id;
            }
            // Try grade.level.id (nested)
            else if (fullClassroom.grade?.level?.id) {
              levelId = fullClassroom.grade.level.id;
            }
            // Try level.id (direct)
            else if (fullClassroom.level?.id) {
              levelId = fullClassroom.level.id;
            }
          }
        } catch (fetchError) {
          console.error('Failed to fetch classroom details:', fetchError);
        }
      }
      
      // Fetch holidays FIRST before loading attendance
      let allHolidaysForCheck: any[] = [];
      if (levelId) {
        try {
          const holidaysData = await getHolidays({ levelId });
          allHolidaysForCheck = Array.isArray(holidaysData) ? holidaysData : [];
          // Filter to only future holidays (including today) for display badges
          const today = normalizeDate(new Date().toISOString());
          const futureHolidays = allHolidaysForCheck.filter((h: any) => {
            const holidayDate = normalizeDate(h.date);
            return holidayDate >= today; // Only future or today
          });
          setHolidays(futureHolidays);
        } catch (error) {
          console.error('Failed to fetch holidays:', error);
          setHolidays([]);
        }
      }

      // Load existing attendance for initial date AFTER holidays are fetched
      // Pass levelId and allHolidays to ensure holiday check works properly
      await loadExistingAttendance(selected.id, initialDate, levelId, allHolidaysForCheck);

    } catch (err: unknown) {
      console.error('Error fetching teacher data:', err);
      setError("Failed to load class data. Please try again.");
    } finally {
      setLoading(false);
      setLoadingStudents(false);
    }
  };

  const loadExistingAttendance = async (classroomId: number, date: string, providedLevelId?: number | null, providedHolidays?: any[]) => {
    try {
      // Use provided levelId and holidays if available, otherwise try to get them
      let levelId: number | null = providedLevelId ?? null;
      let allHolidays: any[] = providedHolidays ?? [];
      
      // If not provided, try to get level ID from classroom options
      if (!levelId) {
        const currentClassroom = classroomOptions.find(c => c.id === classroomId);
        
        if (currentClassroom) {
          // Method 1: Try level_id (direct - from backend update)
          if ((currentClassroom as any).level_id) {
            levelId = (currentClassroom as any).level_id;
          }
          // Method 2: Try grade.level.id (nested structure)
          else if ((currentClassroom as any).grade?.level?.id) {
            levelId = (currentClassroom as any).grade.level.id;
          }
          // Method 3: Try level.id (direct structure)
          else if ((currentClassroom as any).level?.id) {
            levelId = (currentClassroom as any).level.id;
          }
          // Method 4: Try grade.level (if level is an object with id)
          else if ((currentClassroom as any).grade?.level && typeof (currentClassroom as any).grade.level === 'object' && (currentClassroom as any).grade.level.id) {
            levelId = (currentClassroom as any).grade.level.id;
          }
        }
      }
      
      // If holidays not provided, fetch them fresh
      if (allHolidays.length === 0 && levelId) {
        try {
          const holidaysData = await getHolidays({ levelId });
          allHolidays = Array.isArray(holidaysData) ? holidaysData : [];
          
          // Filter to only future holidays (including today) for display badges
          const today = normalizeDate(new Date().toISOString());
          const futureHolidays = allHolidays.filter((h: any) => {
            const holidayDate = normalizeDate(h.date);
            return holidayDate >= today; // Only future or today
          });
          setHolidays(futureHolidays);
        } catch (error) {
          console.error('Failed to fetch holidays:', error);
          // Fallback to state if fetch fails
          allHolidays = holidays;
        }
      } else if (allHolidays.length === 0) {
        // Fallback to state if no levelId
        allHolidays = holidays;
      }
      
      // Check if this date is a holiday (check all holidays, including past and today)
      const normalizedDate = normalizeDate(date);
      const holiday = allHolidays.find((h: any) => {
        const holidayDate = normalizeDate(h.date);
        return holidayDate === normalizedDate;
      });
      
      if (holiday) {
        // If holiday exists, don't load attendance - show holiday instead
        console.log('[Holiday Check] Holiday found for date:', normalizedDate, 'Holiday:', holiday);
        setSelectedHoliday(holiday);
        setAttendance({});
        setIsEditMode(false);
        setExistingAttendanceId(null);
        setAttendanceLoaded(false);
        return;
      } else {
        console.log('[Holiday Check] No holiday found for date:', normalizedDate, 'Total holidays checked:', allHolidays.length);
      }
      
      // Clear holiday selection if not a holiday
      setSelectedHoliday(null);
      
      const attendanceData = await getAttendanceForDate(classroomId, date) as any;
      if (attendanceData && attendanceData.id) {
        // Load the attendance data to show as read-only
        const existingAttendance: Record<number, AttendanceStatus> = {};
        if (attendanceData.student_attendance) {
          attendanceData.student_attendance.forEach((record: any) => {
            existingAttendance[record.student_id] = record.status;
          });
        }
        setAttendance(existingAttendance);
        setExistingAttendanceId(attendanceData.id);
        setIsEditMode(false); // Not in edit mode initially - read-only
        setAttendanceLoaded(false); // Not loaded for editing yet
      } else {
        setAttendance({});
        setIsEditMode(false);
        setExistingAttendanceId(null);
        setAttendanceLoaded(false);
      }
    } catch (error: unknown) {
      console.error('Error loading existing attendance:', error);
      setAttendance({});
      setIsEditMode(false);
      setExistingAttendanceId(null);
      setAttendanceLoaded(false);
    }
  };

  const handleAttendanceChange = (studentId: number, status: AttendanceStatus) => {
    // Allow changes if in edit mode OR if no existing attendance (new attendance)
    if (!isEditMode && existingAttendanceId) {
      return;
    }
    
    setAttendance(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleDateChange = async (newDate: string) => {
    setSelectedDate(newDate);
    setAttendance({});
    setIsEditMode(false);
    setExistingAttendanceId(null);
    setSelectedHoliday(null);
    
    // Refresh holidays when date changes (in case new holidays were added)
    // Try to get level ID from classroom options
    let levelId: number | null = null;
    const currentClassroom = classroomOptions.find(c => c.id === classInfo?.id);
    
    if (currentClassroom) {
      // Method 1: Try level_id (direct - from backend update)
      if ((currentClassroom as any).level_id) {
        levelId = (currentClassroom as any).level_id;
      }
      // Method 2: Try grade.level.id (nested structure)
      else if ((currentClassroom as any).grade?.level?.id) {
        levelId = (currentClassroom as any).grade.level.id;
      }
      // Method 3: Try level.id (direct structure)
      else if ((currentClassroom as any).level?.id) {
        levelId = (currentClassroom as any).level.id;
      }
      // Method 4: Try grade.level (if level is an object with id)
      else if ((currentClassroom as any).grade?.level && typeof (currentClassroom as any).grade.level === 'object' && (currentClassroom as any).grade.level.id) {
        levelId = (currentClassroom as any).grade.level.id;
      }
    }
    
    if (levelId) {
      try {
        const holidaysData = await getHolidays({ levelId });
        const allHolidays = Array.isArray(holidaysData) ? holidaysData : [];
        
        // Filter to only future holidays (including today) for display badges
        const today = normalizeDate(new Date().toISOString());
        const futureHolidays = allHolidays.filter((h: any) => {
          const holidayDate = normalizeDate(h.date);
          return holidayDate >= today; // Only future or today
        });
        setHolidays(futureHolidays);
        
        // Check if new date is a holiday (check all holidays, including past)
        const normalizedNewDate = normalizeDate(newDate);
        const holiday = allHolidays.find((h: any) => normalizeDate(h.date) === normalizedNewDate);
        if (holiday) {
          // If holiday found, set it and don't load attendance
          console.log('[handleDateChange] Holiday found for date:', normalizedNewDate, 'Holiday:', holiday);
          setSelectedHoliday(holiday);
          setAttendance({});
          setIsEditMode(false);
          setExistingAttendanceId(null);
          setAttendanceLoaded(false);
          return; // Don't load attendance for holidays
        } else {
          console.log('[handleDateChange] No holiday found for date:', normalizedNewDate, 'Total holidays:', allHolidays.length);
        }
      } catch (error) {
        console.error('Error fetching holidays:', error);
      }
    } else {
      // Fallback: check existing holidays (normalize date format)
      const normalizedNewDate = normalizeDate(newDate);
      const holiday = holidays.find((h: any) => normalizeDate(h.date) === normalizedNewDate);
      if (holiday) {
        // If holiday found, set it and don't load attendance
        setSelectedHoliday(holiday);
        setAttendance({});
        setIsEditMode(false);
        setExistingAttendanceId(null);
        setAttendanceLoaded(false);
        return; // Don't load attendance for holidays
      }
    }
    
    // Only load attendance if it's not a holiday
    if (classInfo) {
      await loadExistingAttendance(classInfo.id, newDate);
    }
  };

  const handleSubmit = () => {
    // Check if date is a holiday (normalize date format)
    const normalizedSelectedDate = normalizeDate(selectedDate);
    const holiday = holidays.find((h: any) => normalizeDate(h.date) === normalizedSelectedDate);
    if (holiday) {
      alert(`This date is a holiday: ${holiday.reason}. Attendance marking is disabled.`);
      return;
    }
    
    // Block Sunday marking entirely
    if (isWeekend) {
      alert('Weekend (Sunday) — Attendance marking disabled. System will auto-record as Weekend/Holiday.');
      return;
    }
    // Check if attendance already exists for this date
    if (!isEditMode && existingAttendanceId) {
      alert('⚠️ Attendance Already Marked!\n\nYou have already marked attendance for this date.\n\nTo edit previous attendance, please click "Load Saved Attendance" button first.');
      return;
    }
    
    // Check if all students have attendance marked
    if (students.length === 0) {
      alert('❌ No Students Found!\n\nPlease make sure students are loaded for this classroom.');
      return;
    }
    
    const markedStudents = Object.keys(attendance).length;
    const totalStudents = students.length;
    
    if (markedStudents < totalStudents) {
      const unmarkedCount = totalStudents - markedStudents;
      alert(
        `❌ Incomplete Attendance!\n\n` +
        `You have marked attendance for ${markedStudents} out of ${totalStudents} students.\n\n` +
        `Please mark attendance for all ${unmarkedCount} remaining students before submitting.\n\n` +
        `All students must have their attendance status marked (Present, Absent, or Leave).`
      );
      return;
    }
    
    // Show confirmation modal instead of directly submitting
    setShowConfirmationModal(true);
  };

  const confirmSubmit = async () => {
    if (!classInfo) return;

    try {
      setSaving(true);
      setShowConfirmationModal(false);
      
      // Prepare student attendance data
      const studentAttendanceData = Object.entries(attendance).map(([studentId, status]) => ({
          student_id: parseInt(studentId),
        status: status,
        remarks: ''
      }));

      let result;
      
      if (isEditMode && existingAttendanceId) {
        // Edit existing attendance
        result = await editAttendance(existingAttendanceId, {
          student_attendance: studentAttendanceData
        });
      } else {
        // Mark new attendance
        result = await markBulkAttendance({
          classroom_id: classInfo.id,
          date: selectedDate,
          student_attendance: studentAttendanceData
        });
      }

      alert(`✅ Attendance ${isEditMode ? 'Updated' : 'Marked'} Successfully!\n\n${isEditMode ? 'Your changes have been saved.' : 'Attendance has been recorded for this date.'}`);
      
      // Keep the sheet filled after saving - don't clear it
      // setAttendance({}); // Removed - keep sheet filled
      setIsEditMode(false);
      
      // Set existingAttendanceId for future loads
      if (result && (result as any).attendance_id) {
        setExistingAttendanceId((result as any).attendance_id);
      } else if (result && (result as any).id) {
        setExistingAttendanceId((result as any).id);
      } else if (result && (result as any).data && (result as any).data.id) {
        setExistingAttendanceId((result as any).data.id);
      }
      
      // If in edit mode, auto-submit for review
      if (isEditMode && existingAttendanceId) {
        try {
          await handleSubmitForReview();
        } catch (error) {
          console.error('Error auto-submitting for review:', error);
          // Don't show error here as the update was successful
        }
      }
      
    } catch (err: unknown) {
      console.error('Error marking attendance:', err);
      
      // Handle ApiError with user-friendly messages
      if (err instanceof ApiError) {
        // Show the user-friendly error message from ApiError
        alert(err.message);
      } else {
        // Generic error message for unexpected errors
        alert(`❌ Failed to ${isEditMode ? 'Update' : 'Mark'} Attendance!\n\nPlease check your internet connection and try again.\n\nIf the problem persists, contact the administrator.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const markAllPresent = () => {
    const newAttendance: Record<number, AttendanceStatus> = {};
    students.forEach(student => {
      newAttendance[student.id] = 'present';
    });
    setAttendance(newAttendance);
  };

  const markAllAbsent = () => {
    const newAttendance: Record<number, AttendanceStatus> = {};
    students.forEach(student => {
      newAttendance[student.id] = 'absent';
    });
    setAttendance(newAttendance);
  };

  const clearAllAttendance = () => {
    setAttendance({});
  };


  const handleSubmitForReview = async () => {
    if (!existingAttendanceId) return;
    
    // Check if all students have attendance marked
    if (students.length === 0) {
      alert('❌ No Students Found!\n\nPlease make sure students are loaded for this classroom.');
      return;
    }
    
    const markedStudents = Object.keys(attendance).length;
    const totalStudents = students.length;
    
    if (markedStudents < totalStudents) {
      const unmarkedCount = totalStudents - markedStudents;
      alert(
        `❌ Incomplete Attendance!\n\n` +
        `You have marked attendance for ${markedStudents} out of ${totalStudents} students.\n\n` +
        `Please mark attendance for all ${unmarkedCount} remaining students before submitting for review.\n\n` +
        `All students must have their attendance status marked (Present, Absent, or Leave).`
      );
      return;
    }
    
    try {
      setSubmitting(true);
      await submitAttendance(existingAttendanceId);
      alert('✅ Attendance submitted for review successfully!\n\nYour attendance has been sent to the coordinator for review.');
      
      // Clear the sheet after submitting for review
      setAttendance({});
      setIsEditMode(false);
      setExistingAttendanceId(null);
      setAttendanceSubmitted(true); // Mark as submitted
      
      // Refresh data
      fetchTeacherData();
    } catch (error) {
      console.error('Error submitting attendance:', error);
      alert('❌ Failed to submit attendance. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchBackfillPermissions = async () => {
    try {
      const permissions = await getBackfillPermissions() as any[];
      setBackfillPermissions(permissions);
      // Check if there are any new permissions (not used)
      const newPermissions = permissions.filter((p: any) => !p.is_used);
      setHasNewPermissions(newPermissions.length > 0);
    } catch (error) {
      console.error('Error fetching backfill permissions:', error);
    }
  };

  const handleBackfillIconClick = () => {
    setShowBackfillModal(true);
    fetchBackfillPermissions();
  };

  const fetchCoordinatorClassData = async () => {
    try {
      setLoading(true);
      setError("");
      
      if (!classroomId) {
        setError("No classroom specified");
        return;
      }

      // Get classroom info directly from classrooms API
      const classroomResponse = await fetch(`/api/classrooms/${classroomId}/`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        }
      });

      let classroomData = null;
      if (classroomResponse.ok) {
        classroomData = await classroomResponse.json();
        console.log('🏫 Classroom data:', classroomData);
        console.log('🏫 Classroom code:', classroomData.code);
        console.log('🏫 Classroom name:', classroomData.name);
      } else {
        console.log('❌ Classroom API failed with status:', classroomResponse.status);
      }

      // Get students and attendance history
      const [classStudents, attendanceHistory] = await Promise.all([
        getClassStudents(parseInt(classroomId)),
        getAttendanceHistory(parseInt(classroomId))
      ]);

      // Set classroom info from API or fallback
      if (classroomData) {
        console.log('🏫 Using classroom data from API');
        console.log('🏫 Classroom code from API:', classroomData.code);
        setClassInfo({
          id: classroomData.id,
          name: classroomData.name || `Classroom ${classroomId}`,
          code: classroomData.code || `C06-L2-G03-A`, // Use real code, fallback to A
          grade: classroomData.grade?.name || '',
          section: classroomData.section || '',
          shift: classroomData.shift || '',
          campus: classroomData.campus?.campus_name || ''
        });
      } else if (classStudents && Array.isArray(classStudents) && classStudents.length > 0) {
        // Fallback: Extract from first student
        const firstStudent = classStudents[0] as any;
        console.log('🔍 First student data (fallback):', firstStudent);
        console.log('🔍 Classroom code from student:', firstStudent.classroom_code);
        
        setClassInfo({
          id: parseInt(classroomId),
          name: firstStudent.classroom_name || `Classroom ${classroomId}`,
          code: firstStudent.classroom_code || `C06-L2-G03-A`, // Use real code, fallback to A
          grade: firstStudent.grade || '',
          section: firstStudent.section || '',
          shift: firstStudent.shift || '',
          campus: firstStudent.campus_name || ''
        });
      } else {
        // Final fallback with default code
        console.log('🔍 Using final fallback with default code');
        setClassInfo({
          id: parseInt(classroomId),
          name: `Classroom ${classroomId}`,
          code: `C06-L2-G03-A`, // Default to A
          grade: '',
          section: '',
          shift: '',
          campus: ''
        });
      }

      if (classStudents && Array.isArray(classStudents)) {
        setStudents(classStudents as Student[]);
      }

      if (attendanceHistory && Array.isArray(attendanceHistory) && attendanceHistory.length > 0) {
        setLast6DaysAttendance(attendanceHistory as any[]);
      }
      
    } catch (error) {
      console.error('Error fetching coordinator class data:', error);
      setError('Failed to load classroom data');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentMonthAttendance = async () => {
    try {
      setLoadingLast6Days(true);
      
      if (!classroomId) return;

      // Get current month start and end dates
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      console.log('🔍 Fetching attendance for classroom:', classroomId);
      console.log('📅 Current month range:', firstDay.toISOString().split('T')[0], 'to', lastDay.toISOString().split('T')[0]);

      const attendanceData = await getAttendanceHistory(
        parseInt(classroomId),
        firstDay.toISOString().split('T')[0],
        lastDay.toISOString().split('T')[0]
      );

      console.log('📊 Current month attendance data:', attendanceData);
      console.log('📊 Attendance data type:', typeof attendanceData);
      console.log('📊 Attendance data length:', Array.isArray(attendanceData) ? attendanceData.length : 'Not an array');

      if (Array.isArray(attendanceData) && attendanceData.length > 0) {
        console.log('👥 First record student_attendance:', attendanceData[0].student_attendance);
        console.log('👥 Student attendance type:', typeof attendanceData[0].student_attendance);
        console.log('👥 Student attendance length:', Array.isArray(attendanceData[0].student_attendance) ? attendanceData[0].student_attendance.length : 'Not an array');
      }

      setLast6DaysAttendance((attendanceData as any[]) || []);
    } catch (error) {
      console.error('Error fetching last 6 days attendance:', error);
    } finally {
      setLoadingLast6Days(false);
    }
  };

  const handleApproveAttendance = async (attendanceId: number) => {
    try {
      console.log('Approving attendance:', attendanceId);
      
      // First check the current status and handle accordingly
      const attendanceRecord = last6DaysAttendance.find(record => record.id === attendanceId);
      
      if (!attendanceRecord) {
        alert('Attendance record not found!');
        return;
      }
      
      console.log('Current status:', attendanceRecord.status);
      console.log('User role:', userRole);
      
      // Different approval flow based on user role
      if (userRole === 'coordinator') {
        // Coordinator approval flow - use new direct approval API
        if (attendanceRecord.status === 'draft' || attendanceRecord.status === 'submitted') {
          console.log('Coordinator: Directly approving attendance...');
          await coordinatorApproveAttendance(attendanceId);
          console.log('Attendance approved successfully');
          
          alert('Attendance approved successfully!');
        }
        else if (attendanceRecord.status === 'under_review') {
          console.log('Coordinator: Finalizing under review attendance...');
          await finalizeAttendance(attendanceId);
          console.log('Attendance approved successfully');
          
          alert('Attendance approved successfully!');
        }
  else if (attendanceRecord.status === 'approved') {
          alert('Attendance is already approved!');
          return;
        }
      } else if (userRole === 'teacher') {
        // Teacher approval flow (can only submit, not finalize)
        if (attendanceRecord.status === 'draft') {
          console.log('Teacher: Submitting attendance...');
          await submitAttendance(attendanceId);
          console.log('Attendance submitted successfully');
          
          alert('Attendance submitted for coordinator review!');
        } else {
          alert('Only draft attendance can be submitted by teachers.');
          return;
        }
      } else {
        alert('Access denied. Only teachers and coordinators can approve attendance.');
        return;
      }
      
      // Refresh the data
      await fetchCurrentMonthAttendance();
      
    } catch (error) {
      console.error('Error approving attendance:', error);
      alert('Error approving attendance. Please try again.');
    }
  };

  const toggleAttendanceExpansion = (attendanceId: number) => {
    setExpandedAttendance(expandedAttendance === attendanceId ? null : attendanceId);
  };

  const fetchAttendanceHistory = async () => {
    if (!classInfo) return;
    
    try {
      const history = await getAttendanceHistory(classInfo.id);
      setAttendanceHistoryData(history as any[]);
      setShowHistoryModal(true);
    } catch (error) {
      console.error('Error fetching attendance history:', error);
      alert('Failed to fetch attendance history. Please try again.');
    }
  };

  // Check if attendance is approved for the selected date
  const isAttendanceApproved = async () => {
    if (!classInfo) return false;
    
    try {
      const attendanceData = await getAttendanceForDate(classInfo.id, selectedDate) as any;
  return attendanceData && attendanceData.status === 'approved';
    } catch (error) {
      console.error('Error checking approval status:', error);
      return false;
    }
  };

  // Check for newly approved attendance
  const checkForApprovedAttendance = () => {
    if (attendanceHistory && Array.isArray(attendanceHistory)) {
      const approvedAttendance = attendanceHistory.find((record: any) => 
  record.status === 'approved' && 
        record.finalized_at && 
        new Date(record.finalized_at) > new Date(Date.now() - 30000) // Last 30 seconds
      );
      
      // Approval notifications now come via WebSocket only
    }
  };


  const enableEditMode = async () => {
    if (!classInfo) return;
    
    try {
      setLoading(true);
      const attendanceData = await getAttendanceForDate(classInfo.id, selectedDate) as any;
      
      if (attendanceData && attendanceData.id) {
        // Check if attendance is approved - prevent editing
  if (attendanceData.status === 'approved') {
          alert('❌ Cannot Edit Approved Attendance!\n\nThis attendance has been approved by the coordinator and cannot be modified.\n\nPlease contact the coordinator if changes are needed.');
          return;
        }
        
        // Enable edit mode
        setIsEditMode(true);
        setAttendanceLoaded(true);
        
        alert('✅ Edit Mode Enabled!\n\nYou can now modify the attendance. Click "Update Attendance" to save your changes.');
      } else {
        alert('No attendance found for this date.');
      }
    } catch (error) {
      console.error('Error enabling edit mode:', error);
      alert('Failed to enable edit mode. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadSavedAttendance = async () => {
    if (!classInfo) return;
    
    try {
      setLoading(true);
      const attendanceData = await getAttendanceForDate(classInfo.id, selectedDate) as any;
      
      if (attendanceData && attendanceData.id) {
        // Check if attendance is approved - prevent editing
  if (attendanceData.status === 'approved') {
          alert('❌ Cannot Edit Approved Attendance!\n\nThis attendance has been approved by the coordinator and cannot be modified.\n\nPlease contact the coordinator if changes are needed.');
          return;
        }
        
        const existingAttendance: Record<number, AttendanceStatus> = {};
        attendanceData.student_attendance.forEach((record: any) => {
          existingAttendance[record.student_id] = record.status;
        });
        setAttendance(existingAttendance);
        setIsEditMode(true);
        setExistingAttendanceId(attendanceData.id);
        setAttendanceLoaded(true);
        
        // Approval notifications now come via WebSocket only
        
        alert('Saved attendance loaded successfully! You can now make changes and update.');
      } else {
        alert('No saved attendance found for this date.');
      }
    } catch (error: unknown) {
      console.error('Error loading saved attendance:', error);
      alert('Failed to load saved attendance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats
  const totalStudents = students.length;
  const presentCount = Object.values(attendance).filter(status => status === 'present').length;
  const absentCount = Object.values(attendance).filter(status => status === 'absent').length;
  const leaveCount = Object.values(attendance).filter(status => status === 'leave').length;
  const attendancePercentage = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  // Check if date is editable (within 7 days)
  const isDateEditable = () => {
    // Block holidays
    if (selectedHoliday) return false;
    
    const selectedDateObj = new Date(selectedDate);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - selectedDateObj.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Check if date is within 7 days
    if (diffDays > 7) return false;
    // Block weekends (Sunday)
    if (isWeekend) return false;
    
    // Check if attendance is approved (prevent editing approved attendance)
    // This will be checked in the component when needed
    return true;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-12 p-10 bg-[#e7ecef] rounded-2xl shadow-2xl border-2 border-[#a3cef1]">
        <div className="space-y-6">
          <div className="flex items-center justify-center h-16">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-6 w-6 animate-spin text-[#6096ba]" />
              <span className="text-[#274c77] font-medium">Loading class data...</span>
            </div>
          </div>
          <TableSkeleton rows={8} />
        </div>
      </div>
    );
  }

  if (error) {
	return (
		<div className="max-w-6xl mx-auto mt-12 p-10 bg-[#e7ecef] rounded-2xl shadow-2xl border-2 border-[#a3cef1]">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#274c77] mb-2">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            {classroomOptions.length > 1 && (
              <div className="mx-auto max-w-xs mb-4">
                <label className="block text-sm text-gray-600 mb-1">Switch Classroom</label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  onChange={(e)=> router.push(`/admin/teachers/attendance?classroom=${e.target.value}`)}
                  defaultValue={classroomOptions[0]?.id}
                >
                  {classroomOptions.map((c)=> (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <Button onClick={fetchTeacherData} className="bg-[#6096ba] hover:bg-[#274c77] text-white">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Coordinator view - Last 6 days attendance
  if (userRole === 'coordinator' && classroomId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Attendance Review</h1>
                  <p className="text-sm text-gray-600 mt-1">
                    {classInfo?.code || classInfo?.name || `Classroom ${classroomId}`} • {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <Button 
                  onClick={() => router.back()}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          </div>


        {/* Detailed Attendance Sheets */}
        {last6DaysAttendance.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Table Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <div className="col-span-3">Date & Status</div>
                <div className="col-span-2">Marked By</div>
                <div className="col-span-2">Students</div>
                <div className="col-span-3">Attendance</div>
                <div className="col-span-2">Actions</div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-gray-200">
              {last6DaysAttendance.map((record: any, index: number) => (
                <div key={index} className="hover:bg-gray-50 transition-colors duration-200">
                  {/* Main Row */}
                  <div className="px-6 py-4">
                    <div className="grid grid-cols-12 gap-4 items-center min-h-[80px]">
                      {/* Date & Status */}
                      <div className="col-span-3 flex items-center">
                        <div className="flex items-center space-x-3 w-full">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Calendar className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="flex flex-col space-y-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {new Date(record.date).toLocaleDateString()}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <Badge 
                                variant="outline"
                                className={`w-fit ${
                                  record.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                                  record.status === 'submitted' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  record.status === 'under_review' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                  'bg-gray-50 text-gray-700 border-gray-200'
                                }`}
                              >
                                {record.display_status || (record.status?.charAt(0).toUpperCase() + record.status?.slice(1)) || 'Draft'}
                              </Badge>
                              {record.is_holiday && (
                                <Badge className="bg-yellow-500 text-white border-yellow-600 text-xs">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  Holiday
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Marked By */}
                      <div className="col-span-2 flex items-center">
                        <div className="flex items-center space-x-2 w-full">
                          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Users className="h-4 w-4 text-gray-600" />
                          </div>
                          <span className="text-sm text-gray-900 truncate">{record.marked_by_name || 'Unknown'}</span>
                        </div>
                      </div>

                      {/* Students Count */}
                      <div className="col-span-2 flex items-center">
                        <div className="flex items-center space-x-2 w-full">
                          <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <Users className="h-4 w-4 text-purple-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-900">{record.total_students || 0}</span>
                        </div>
                      </div>

                      {/* Attendance Stats */}
                      <div className="col-span-3 flex items-center">
                        <div className="flex items-center space-x-4 w-full">
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></div>
                            <span className="text-sm text-gray-600">{record.present_count || 0}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0"></div>
                            <span className="text-sm text-gray-600">{record.absent_count || 0}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0"></div>
                            <span className="text-sm text-gray-600">{record.leave_count || 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center justify-end">
                        <div className="flex items-center space-x-1">
                          <Button
                            onClick={() => toggleAttendanceExpansion(record.id)}
                            variant="outline"
                            size="sm"
                            className="border-gray-300 text-gray-700 hover:bg-gray-50 text-xs px-2 py-1"
                          >
                            {expandedAttendance === record.id ? (
                              <>
                                <EyeOff className="h-3 w-3 mr-1" />
                                Hide
                              </>
                            ) : (
                              <>
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </>
                            )}
                          </Button>
                          
                          {/* Approved Button - Show only for non-final statuses */}
                          {record.status !== 'approved' && (
                            <Button
                              onClick={() => handleApproveAttendance(record.id)}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                          )}
                          
                          {/* Approved Badge - Show only for final status */}
                          {record.status === 'approved' && (
                            <Badge 
                              variant="outline"
                              className="bg-green-50 text-green-700 border-green-200 text-xs px-2 py-1"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approved
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Content with Smooth Animation */}
                  <div 
                    className={`overflow-hidden transition-all duration-500 ease-in-out ${
                      expandedAttendance === record.id 
                        ? 'max-h-[800px] opacity-100' 
                        : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                      {/* Student Table */}
                      {record.student_attendance && Array.isArray(record.student_attendance) && record.student_attendance.length > 0 ? (
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-gray-200 rounded-lg bg-white">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gender</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {record.student_attendance.map((studentRecord: any, studentIndex: number) => (
                                <tr key={studentIndex} className="hover:bg-gray-50">
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <span className="text-sm font-medium text-blue-600">
                                          {studentRecord.student_name?.charAt(0).toUpperCase() || 'S'}
                                        </span>
                                      </div>
                                      <div className="ml-3">
                                        <div className="text-sm font-medium text-gray-900">
                                          {studentRecord.student_name || 'Unknown Student'}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                      {studentRecord.student_code || studentRecord.student_id || 'N/A'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <Badge 
                                      variant="outline"
                                      className={
                                        studentRecord.student_gender === 'male' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        studentRecord.student_gender === 'female' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                                        'bg-gray-50 text-gray-700 border-gray-200'
                                      }
                                    >
                                      {studentRecord.student_gender?.charAt(0).toUpperCase() + studentRecord.student_gender?.slice(1) || 'N/A'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <Badge 
                                      variant="outline"
                                      className={
                                        studentRecord.status === 'present' ? 'bg-green-50 text-green-700 border-green-200' :
                                        studentRecord.status === 'absent' ? 'bg-red-50 text-red-700 border-red-200' :
                                        studentRecord.status === 'leave' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        'bg-gray-50 text-gray-700 border-gray-200'
                                      }
                                    >
                                      {studentRecord.status?.charAt(0).toUpperCase() + studentRecord.status?.slice(1) || 'Unknown'}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <div className="text-gray-400 mb-2">
                            <Users className="h-12 w-12 mx-auto" />
                          </div>
                          <p className="text-gray-500 text-sm">No student records found for this date</p>
                          <p className="text-gray-400 text-xs mt-1">Please check if attendance was marked for this classroom</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto mt-4 sm:mt-6 lg:mt-8 p-2 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Approval notifications now come via WebSocket only - no toast needed */}

      {/* Header Section */}
      <div className="bg-gradient-to-r from-[#274c77] to-[#6096ba] rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2 sm:mb-3">Mark Attendance</h1>
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 text-sm sm:text-base lg:text-lg">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="truncate">{classInfo?.name} - {classInfo?.section}</span>
              </div>
              <div className="flex items-center space-x-2 flex-wrap">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className={`bg-white/20 border rounded-lg px-2 sm:px-3 py-1 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50 text-xs sm:text-sm ${
                      selectedHoliday ? 'border-yellow-400 border-2 ring-2 ring-yellow-400/50' : 'border-white/30'
                    }`}
                    title={selectedHoliday ? `Holiday: ${selectedHoliday.reason}` : ''}
                  />
                  {/* Show holiday indicator if current selected date is a holiday */}
                  {selectedHoliday && (
                    <div 
                      className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full border-2 border-white animate-pulse z-10" 
                      title={`Holiday: ${selectedHoliday.reason}`}
                    />
                  )}
                </div>
                {selectedHoliday && (
                  <Badge className="bg-yellow-500 text-white border-yellow-600 text-xs sm:text-sm px-2 sm:px-3 py-1 font-bold animate-pulse shadow-md">
                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    Holiday
                  </Badge>
                )}
                {/* Show list of upcoming holidays only (future dates, not past) */}
                {(() => {
                  const today = normalizeDate(new Date().toISOString());
                  const upcomingHolidays = holidays.filter((h: any) => {
                    const holidayDate = normalizeDate(h.date);
                    return holidayDate >= today; // Only future or today
                  });
                  
                  if (upcomingHolidays.length > 0 && !selectedHoliday) {
                    return (
                      <div className="flex flex-wrap gap-1">
                        {upcomingHolidays.slice(0, 3).map((h: any) => {
                          const holidayDate = normalizeDate(h.date);
                          const holidayDay = new Date(h.date).getDate();
                          return (
                            <Badge 
                              key={h.id}
                              className="bg-yellow-400/80 text-yellow-900 border-yellow-500 text-[10px] px-1.5 py-0.5 cursor-pointer hover:bg-yellow-400 transition-all"
                              title={`${h.date}: ${h.reason}`}
                              onClick={() => handleDateChange(holidayDate)}
                            >
                              {holidayDay}
                            </Badge>
                          );
                        })}
                        {upcomingHolidays.length > 3 && (
                          <Badge className="bg-yellow-400/80 text-yellow-900 border-yellow-500 text-[10px] px-1.5 py-0.5">
                            +{upcomingHolidays.length - 3}
                          </Badge>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-xs sm:text-sm">
                  {Object.keys(attendance).length} / {students.length} students marked
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {classroomOptions.length > 1 && (
              <div className="flex items-center gap-2 bg-white/15 border border-white/25 rounded-lg px-2 py-1">
                <span className="text-xs opacity-90">Class</span>
                <select
                  className="bg-transparent text-white text-xs sm:text-sm focus:outline-none"
                  value={classInfo?.id || classroomOptions[0]?.id}
                  onChange={(e)=> router.push(`/admin/teachers/attendance?classroom=${e.target.value}`)}
                >
                  {classroomOptions.map((c)=> (
                    <option key={c.id} value={c.id} className="text-black">{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* {!isWeekend && (
              <div className="relative">
                <Button
                  onClick={handleBackfillIconClick}
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                  size="sm"
                >
                  <Clock3 className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Backfill</span>
                </Button>
                {hasNewPermissions && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 sm:w-3 sm:h-3 bg-red-500 rounded-full flex items-center justify-center">
                    <Bell className="h-1 w-1 sm:h-2 sm:w-2 text-white" />
                  </div>
                )}
              </div>
            )} */}
            
            {isEditMode && (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
                <Edit3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="hidden sm:inline">Edit Mode</span>
                <span className="sm:hidden">Edit</span>
              </Badge>
            )}
            {!isDateEditable() && (
              <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 text-xs">
                <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="hidden sm:inline">
                  Read Only {
                    selectedHoliday 
                      ? `(Holiday: ${selectedHoliday.reason})` 
                      : isWeekend 
                        ? '(Weekend/Sunday)' 
                        : '(Older than 7 days)'
                  }
                </span>
                <span className="sm:hidden">Read Only</span>
              </Badge>
            )}
          </div>
        </div>
      </div>


      {/* Backfill Permissions Modal */}
      <Dialog open={showBackfillModal} onOpenChange={setShowBackfillModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock3 className="h-5 w-5" />
              Backfill Permissions
            </DialogTitle>
            <DialogDescription>
              View and manage your backfill permissions for missed attendance dates.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {backfillPermissions.length === 0 ? (
              <div className="text-center py-8">
                <Clock3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No backfill permissions found</p>
                <p className="text-gray-400 text-sm">Contact your coordinator for backfill permissions.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {backfillPermissions.map((permission: any, index: number) => (
                  <Card key={index} className={`${!permission.is_used ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {permission.classroom?.name || 'Unknown Class'}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Date: {new Date(permission.date).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-600">
                            Deadline: {new Date(permission.deadline).toLocaleString()}
                          </p>
                          {permission.reason && (
                            <p className="text-sm text-gray-500 mt-1">
                              Reason: {permission.reason}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          {permission.is_used ? (
                            <Badge variant="outline" className="bg-gray-100 text-gray-600">
                              Used
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-100 text-green-600 border-green-200">
                              Available
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBackfillModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Cards - Hide when holiday is selected */}
      {!selectedHoliday && (
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm opacity-90">Present</p>
                <p className="text-lg sm:text-xl lg:text-2xl font-bold">{presentCount}</p>
              </div>
              <CheckCircle className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm opacity-90">Absent</p>
                <p className="text-lg sm:text-xl lg:text-2xl font-bold">{absentCount}</p>
              </div>
              <XCircle className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm opacity-90">Leave</p>
                <p className="text-lg sm:text-xl lg:text-2xl font-bold">{leaveCount}</p>
              </div>
              <Calendar className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-[#274c77] to-[#6096ba] text-white">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm opacity-90">Total</p>
                <p className="text-lg sm:text-xl lg:text-2xl font-bold">{totalStudents}</p>
                <p className="text-xs sm:text-sm opacity-90">{attendancePercentage}%</p>
              </div>
              <Users className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Quick Actions - Hide when holiday is selected */}
      {!selectedHoliday && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[#274c77] text-base sm:text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={markAllPresent}
              className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
              disabled={!isDateEditable()}
            >
              <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Mark All Present</span>
              <span className="sm:hidden">All Present</span>
            </Button>
            <Button
              onClick={markAllAbsent}
              variant="outline"
              className="border-red-500 text-red-500 hover:bg-red-50 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
              disabled={!isDateEditable()}
            >
              <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Mark All Absent</span>
              <span className="sm:hidden">All Absent</span>
            </Button>
            <Button
              onClick={clearAllAttendance}
              variant="outline"
              className="border-orange-500 text-orange-500 hover:bg-orange-50 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
              disabled={!isDateEditable()}
            >
              <Eraser className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Clear All</span>
              <span className="sm:hidden">Clear</span>
            </Button>
            {/* Smart Button Logic */}
            {attendanceLoaded && isEditMode ? (
              // Show Update & Submit button when in edit mode
              <Button
                onClick={handleSubmit}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                disabled={saving || !isDateEditable()}
              >
                {saving ? (
                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                )}
                <span className="hidden sm:inline">Update & Submit</span>
                <span className="sm:hidden">Update</span>
              </Button>
            ) : existingAttendanceId && !isEditMode ? (
              // Show Edit Attendance button when attendance exists but not in edit mode
              <Button
                onClick={enableEditMode}
                variant="outline"
                className="border-green-500 text-green-500 hover:bg-green-50 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                disabled={loading || !isDateEditable()}
              >
                {loading ? (
                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                ) : (
                  <Edit3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                )}
                <span className="hidden sm:inline">Edit Attendance</span>
                <span className="sm:hidden">Edit</span>
              </Button>
            ) : (
              // Show Save/Update button when no attendance exists or in edit mode
            <Button
              onClick={handleSubmit} 
              className="bg-[#6096ba] hover:bg-[#274c77] text-white text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
              disabled={saving || !isDateEditable()}
            >
              {saving ? (
                <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
              ) : (
                <Save className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              )}
              <span className="hidden sm:inline">{isEditMode ? 'Update Attendance' : 'Save Attendance'}</span>
              <span className="sm:hidden">{isEditMode ? 'Update' : 'Save'}</span>
              </Button>
            )}
            
            {/* Attendance History Button */}
            <Button
              onClick={fetchAttendanceHistory}
              variant="outline"
              className="border-purple-500 text-purple-500 hover:bg-purple-50 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
            >
              <History className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Attendance History</span>
              <span className="sm:hidden">History</span>
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Holiday Display - Premium VIP Style */}
      {selectedHoliday && (
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 shadow-2xl">
          {/* Animated background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.3),transparent_50%)] animate-pulse"></div>
            <div className="absolute top-10 right-10 w-32 h-32 bg-yellow-300 rounded-full blur-3xl animate-pulse delay-300"></div>
            <div className="absolute bottom-10 left-10 w-40 h-40 bg-amber-300 rounded-full blur-3xl animate-pulse delay-700"></div>
          </div>
          
          {/* Decorative border */}
          <div className="absolute inset-0 border-4 border-transparent bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-400 rounded-lg p-[4px]">
            <div className="w-full h-full bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-lg"></div>
          </div>
          
          <CardContent className="relative p-8 sm:p-12 lg:p-16 text-center">
            <div className="flex flex-col items-center space-y-8">
              {/* Premium Icon with glow effect */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full blur-xl opacity-60 animate-pulse"></div>
                <div className="relative h-32 w-32 sm:h-36 sm:w-36 rounded-full bg-gradient-to-br from-yellow-400 via-amber-400 to-yellow-500 flex items-center justify-center shadow-2xl transform hover:scale-110 transition-transform duration-300">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-transparent"></div>
                  <Calendar className="h-16 w-16 sm:h-20 sm:w-20 text-white drop-shadow-lg relative z-10" />
                </div>
                {/* Sparkle effects */}
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-300 rounded-full animate-ping"></div>
                <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-amber-300 rounded-full animate-ping delay-300"></div>
              </div>
              
              {/* Premium Badge */}
              <div className="relative">
                <Badge className="bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-500 text-white border-0 text-lg sm:text-xl px-6 py-3 font-bold shadow-xl transform hover:scale-105 transition-transform duration-200">
                  <Calendar className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
                  <span className="tracking-wider">HOLIDAY</span>
                </Badge>
                <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 to-amber-400 rounded-lg blur opacity-50 -z-10"></div>
              </div>
              
              {/* Main Title */}
              <div>
                <h3 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-yellow-700 via-amber-700 to-yellow-700 bg-clip-text text-transparent mb-6 drop-shadow-sm">
                  Holiday Declared
                </h3>
                
                {/* Premium Card for Holiday Details */}
                <div className="relative max-w-md mx-auto">
                  {/* Card glow effect */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-400 rounded-2xl blur opacity-30"></div>
                  
                  {/* Main card */}
                  <div className="relative bg-white/95 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-2xl border-2 border-yellow-200/50">
                    {/* Decorative top border */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent"></div>
                    
                    {/* Holiday Reason */}
                    <div className="mb-4">
                      <p className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
                        {selectedHoliday.reason}
                      </p>
                    </div>
                    
                    {/* Date with icon */}
                    <div className="flex items-center justify-center gap-3 mt-6 pt-6 border-t-2 border-yellow-200/50">
                      <div className="p-2 bg-gradient-to-br from-yellow-100 to-amber-100 rounded-lg">
                        <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-700" />
                      </div>
                      <p className="text-base sm:text-lg lg:text-xl font-semibold text-gray-700">
                        {new Date(selectedHoliday.date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Warning Message - Premium Style */}
                <div className="mt-8 max-w-md mx-auto">
                  <div className="relative bg-gradient-to-r from-amber-100 via-yellow-100 to-amber-100 rounded-xl p-4 sm:p-5 border-2 border-amber-300/50 shadow-lg">
                    <div className="flex items-center justify-center gap-3">
                      <div className="p-2 bg-amber-200 rounded-full">
                        <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-amber-700" />
                      </div>
                      <p className="text-sm sm:text-base font-semibold text-amber-800">
                        Attendance marking is disabled for this date
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Students Table */}
      {!selectedHoliday && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
            <CardTitle className="text-[#274c77] text-base sm:text-lg">Students List ({students.length} students)</CardTitle>
            {existingAttendanceId && !isEditMode && (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
                <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="hidden sm:inline">Read-Only Mode - Click "Edit Attendance" to modify</span>
                <span className="sm:hidden">Read-Only</span>
              </Badge>
            )}
            {isEditMode && (
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-xs">
                <Edit3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="hidden sm:inline">Edit Mode - Make your changes</span>
                <span className="sm:hidden">Edit Mode</span>
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <Users className="h-12 w-12 sm:h-16 sm:w-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
              <p className="text-gray-600 text-base sm:text-lg">No students found in this class</p>
              <p className="text-gray-500 text-sm">Please contact administrator to add students to this classroom</p>
            </div>
          ) : (
				<>
					{/* Mobile list view */}
					<div className="block sm:hidden space-y-2">
						{students.map((student) => (
							<div key={student.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white">
								<div className="flex items-center gap-2 min-w-0">
									<div className="min-w-0">
										<p className="text-sm font-medium text-gray-900 truncate">{student.name}</p>
										<div className="flex items-center gap-2 text-[11px] text-gray-600">
											<span className="px-2 py-0.5 rounded-full bg-gray-100">{student.student_id || student.student_code || 'Not Assigned'}</span>
											<span className="px-2 py-0.5 rounded-full bg-gray-100 capitalize">{student.gender}</span>
										</div>
									</div>
								</div>
								<div className="flex items-center gap-1 ml-2">
									<Button size="sm" variant={attendance[student.id] === 'present' ? 'default' : 'outline'}
										className={`${attendance[student.id] === 'present' ? 'bg-green-600 hover:bg-green-700 text-white' : 'border-green-500 text-green-600 hover:bg-green-50'} px-2 py-1 text-xs`}
										onClick={() => handleAttendanceChange(student.id, 'present')} disabled={!isDateEditable()}>
										P
										</Button>
									<Button size="sm" variant={attendance[student.id] === 'absent' ? 'default' : 'outline'}
										className={`${attendance[student.id] === 'absent' ? 'bg-red-600 hover:bg-red-700 text-white' : 'border-red-500 text-red-600 hover:bg-red-50'} px-2 py-1 text-xs`}
										onClick={() => handleAttendanceChange(student.id, 'absent')} disabled={!isDateEditable()}>
										A
										</Button>
									<Button size="sm" variant={attendance[student.id] === 'leave' ? 'default' : 'outline'}
										className={`${attendance[student.id] === 'leave' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-blue-500 text-blue-600 hover:bg-blue-50'} px-2 py-1 text-xs`}
										onClick={() => handleAttendanceChange(student.id, 'leave')} disabled={!isDateEditable()}>
										L
										</Button>
								</div>
							</div>
						))}
					</div>

					{/* Desktop/Tablet table view */}
					<div className="hidden sm:block overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="text-xs sm:text-sm">Student</TableHead>
									<TableHead className="text-xs sm:text-sm">Student ID</TableHead>
									<TableHead className="text-xs sm:text-sm">Gender</TableHead>
									<TableHead className="text-xs sm:text-sm">Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{students.map((student) => (
									<TableRow key={student.id}>
										<TableCell className="font-medium">
											<div className="flex items-center space-x-2 sm:space-x-3">
										{student.photo ? (
											<img src={resolveMediaUrl(student.photo)} alt={student.name} className="h-6 w-6 sm:h-8 sm:w-8 rounded-full object-cover" />
										) : (
													<div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-[#6096ba] flex items-center justify-center text-white text-xs sm:text-sm font-medium">
														{student.name.charAt(0).toUpperCase()}
													</div>
												)}
												<span className="text-xs sm:text-sm truncate">{student.name}</span>
											</div>
										</TableCell>
										<TableCell className="text-xs sm:text-sm">{student.student_id || student.student_code || 'Not Assigned'}</TableCell>
										<TableCell className="text-xs sm:text-sm capitalize">{student.gender}</TableCell>
										<TableCell>
											<div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-1">
												<Button size="sm" variant={attendance[student.id] === 'present' ? 'default' : 'outline'}
													className={`${attendance[student.id] === 'present' ? 'bg-green-600 hover:bg-green-700 text-white' : 'border-green-500 text-green-500 hover:bg-green-50'} text-xs px-2 py-1`}
													onClick={() => handleAttendanceChange(student.id, 'present')} disabled={!isDateEditable()}>
													<CheckCircle className="h-3 w-3 mr-1" />
													<span className="hidden sm:inline">Present</span>
													<span className="sm:hidden">P</span>
												</Button>
												<Button size="sm" variant={attendance[student.id] === 'absent' ? 'default' : 'outline'}
													className={`${attendance[student.id] === 'absent' ? 'bg-red-600 hover:bg-red-700 text-white' : 'border-red-500 text-red-500 hover:bg-red-50'} text-xs px-2 py-1`}
													onClick={() => handleAttendanceChange(student.id, 'absent')} disabled={!isDateEditable()}>
													<XCircle className="h-3 w-3 mr-1" />
													<span className="hidden sm:inline">Absent</span>
													<span className="sm:hidden">A</span>
												</Button>
												<Button size="sm" variant={attendance[student.id] === 'leave' ? 'default' : 'outline'}
													className={`${attendance[student.id] === 'leave' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-blue-500 text-blue-500 hover:bg-blue-50'} text-xs px-2 py-1`}
													onClick={() => handleAttendanceChange(student.id, 'leave')} disabled={!isDateEditable()}>
													<Calendar className="h-3 w-3 mr-1" />
													<span className="hidden sm:inline">Leave</span>
													<span className="sm:hidden">L</span>
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</>
          )}
        </CardContent>
      </Card>
      )}

      <Dialog open={showConfirmationModal} onOpenChange={setShowConfirmationModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#274c77] text-lg sm:text-xl font-bold">
              Confirm Attendance
            </DialogTitle>
            <DialogDescription className="text-gray-600 text-sm">
              Are you sure you want to {isEditMode ? 'update' : 'mark'} attendance for {classInfo?.name} on {selectedDate}?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-3 sm:py-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {/* Present Count */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center mb-1 sm:mb-2">
                  <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-green-700">{presentCount}</div>
                <div className="text-xs sm:text-sm text-green-600 font-medium">Present</div>
              </div>

              {/* Absent Count */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center mb-1 sm:mb-2">
                  <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-red-700">{absentCount}</div>
                <div className="text-xs sm:text-sm text-red-600 font-medium">Absent</div>
              </div>

              {/* Leave Count */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center mb-1 sm:mb-2">
                  <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-blue-700">{leaveCount}</div>
                <div className="text-xs sm:text-sm text-blue-600 font-medium">Leave</div>
              </div>

              {/* Total Count */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center mb-1 sm:mb-2">
                  <Users className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-gray-700">{totalStudents}</div>
                <div className="text-xs sm:text-sm text-gray-600 font-medium">Total</div>
              </div>
            </div>

            {/* Attendance Percentage */}
            <div className="mt-3 sm:mt-4 bg-[#274c77] text-white rounded-lg p-2 sm:p-3 text-center">
              <div className="text-base sm:text-lg font-semibold">
                Attendance: {attendancePercentage}%
              </div>
              <div className="text-xs sm:text-sm opacity-90">
                {presentCount} out of {totalStudents} students
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmationModal(false)}
              disabled={saving}
              className="text-xs sm:text-sm"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmSubmit}
              className="bg-[#6096ba] hover:bg-[#274c77] text-white text-xs sm:text-sm"
              disabled={saving}
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">{isEditMode ? 'Updating...' : 'Saving...'}</span>
                  <span className="sm:hidden">{isEditMode ? 'Update' : 'Save'}</span>
                </>
              ) : (
                <>
                  <Save className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{isEditMode ? 'Update Attendance' : 'Save Attendance'}</span>
                  <span className="sm:hidden">{isEditMode ? 'Update' : 'Save'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#274c77] flex items-center text-base sm:text-lg">
              <History className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              <span className="hidden sm:inline">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Attendance History</span>
              <span className="sm:hidden">Attendance History</span>
            </DialogTitle>
            <DialogDescription className="text-sm">
              View your attendance records with their approval status
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 sm:space-y-4">
            {attendanceHistoryData && attendanceHistoryData.length > 0 ? (
              attendanceHistoryData.slice(0, 6).map((record: any, index: number) => (
                <div key={index} className={`p-3 sm:p-4 rounded-lg border ${
                  record.status === 'approved' ? 'bg-green-50 border-green-200' : 
                  record.status === 'submitted' ? 'bg-blue-50 border-blue-200' :
                  record.status === 'under_review' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center ${
                        record.status === 'approved' ? 'bg-green-100' : 
                        record.status === 'submitted' ? 'bg-blue-100' :
                        record.status === 'under_review' ? 'bg-yellow-100' :
                        'bg-gray-100'
                      }`}>
                        <Calendar className={`h-4 w-4 sm:h-5 sm:w-5 ${
                          record.status === 'approved' ? 'text-green-600' : 
                          record.status === 'submitted' ? 'text-blue-600' :
                          record.status === 'under_review' ? 'text-yellow-600' :
                          'text-gray-600'
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium text-sm sm:text-base ${
                          record.status === 'approved' ? 'text-green-800' : 
                          record.status === 'submitted' ? 'text-blue-800' :
                          record.status === 'under_review' ? 'text-yellow-800' :
                          'text-gray-800'
                        }`}>
                          <span className="hidden sm:inline">{new Date(record.date).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}</span>
                          <span className="sm:hidden">{new Date(record.date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}</span>
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600">
                          {record.present_count || 0} present, {record.absent_count || 0} absent, {record.leave_count || 0} leave
                        </p>
                        {record.marked_by && (
                          <p className="text-xs text-gray-500">
                            Marked by: {record.marked_by}
                          </p>
                        )}
                        {(() => {
                          const recordDate = normalizeDate(record.date);
                          const holiday = holidays.find((h: any) => normalizeDate(h.date) === recordDate);
                          return holiday ? (
                            <div className="mt-2">
                              <Badge className="bg-yellow-500 text-white border-yellow-600 text-sm sm:text-base px-3 py-1.5 font-bold shadow-md">
                                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                                HOLIDAY: {holiday.reason}
                              </Badge>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
                      <Badge 
                        variant="outline"
                        className={`text-xs ${
                          record.status === 'approved' ? 'bg-green-100 text-green-800 border-green-300' :
                          record.status === 'submitted' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                          record.status === 'under_review' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                          'bg-gray-100 text-gray-800 border-gray-300'
                        }`}
                      >
                        {record.display_status || 
                         (record.status === 'approved' ? '✅ Approved' : 
                          record.status === 'submitted' ? '📤 Submitted' : 
                          record.status === 'under_review' ? '⏳ Under Review' :
                          '📝 Draft')}
                      </Badge>
                      
                      {record.status === 'approved' && record.finalized_at && (
                        <span className="text-xs text-green-600">
                          <span className="hidden sm:inline">Approved on </span>{new Date(record.finalized_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 sm:py-8">
                <Calendar className="h-12 w-12 sm:h-16 sm:w-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
                <p className="text-gray-500 text-base sm:text-lg">No attendance history found</p>
                <p className="text-sm text-gray-400">Start marking attendance to see your history here</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowHistoryModal(false)}
              variant="outline"
              className="border-gray-300 text-xs sm:text-sm"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

		</div>
	);
}

export default function TeacherAttendancePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <TeacherAttendanceContent />
    </Suspense>
  )
}