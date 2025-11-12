"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar, RefreshCw, AlertCircle, Users, Eye, Edit3, Save } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Badge } from "@/components/ui/badge"
// Tabs UI removed - using card grid view instead
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { getCurrentUserProfile, getCoordinatorClasses, getAttendanceForDate, editAttendance, getStoredUserProfile, ApiError } from "@/lib/api"
import { useRouter } from "next/navigation"
import HolidayManagement from "@/components/attendance/holiday-management"
import BackfillPermission from "@/components/attendance/backfill-permission"



interface CoordinatorProfile {
  level?: {
    id: number;
    name: string;
  };
  // optional name fields that may come from current-user payload
  full_name?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  // optional assigned levels if backend provides them
  assigned_levels?: Array<{ id: number; name: string }>;
}

interface ClassroomData {
  id: number;
  name: string;
  code: string;
  grade: string;
  section: string;
  shift: string;
  campus: string;
  class_teacher: {
    id: number;
    name: string;
    employee_code: string;
  } | null;
  student_count: number;
  level?: {
    id: number;
    name: string;
  } | null;
}


export default function AttendanceReviewPage() {
  const [coordinatorProfile, setCoordinatorProfile] = useState<CoordinatorProfile | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedClassroom, setExpandedClassroom] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeClassroomId, setActiveClassroomId] = useState<number | null>(null);
  const [activeClassroomName, setActiveClassroomName] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [canEditAttendance, setCanEditAttendance] = useState<boolean>(true);
  const [canApproveAttendance, setCanApproveAttendance] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState(false);
  const [editedAttendance, setEditedAttendance] = useState<any[]>([]);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [classroomAttendanceSummary, setClassroomAttendanceSummary] = useState<any[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [availableLevels, setAvailableLevels] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'all' | null>(null);
  const [availableShifts, setAvailableShifts] = useState<string[]>([]);
  const [selectedShift, setSelectedShift] = useState<string | null>('all');
  const [availableGrades, setAvailableGrades] = useState<string[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string | 'all' | null>('all');
  const ALLOWED_APPROVE_STATUSES = ['draft', 'submitted', 'under_review'];
  const currentAttendanceStatus = (attendanceData && attendanceData.length > 0) ? (attendanceData[0].status || 'not_marked') : 'not_marked';
  const dialogHasCounts = (attendanceData && attendanceData.length > 0)
    ? (((attendanceData[0].present_count || 0) + (attendanceData[0].absent_count || 0) + (attendanceData[0].leave_count || 0)) > 0)
    : false;
  // allow approval by status list or by presence of counts
  // If there are any counts (present/absent/leave), treat it as "marked" regardless of raw status
  const isMarkedOrAllowedStatus = dialogHasCounts || ALLOWED_APPROVE_STATUSES.includes(String(currentAttendanceStatus));
  const isAlreadyApproved = String(currentAttendanceStatus).toLowerCase() === 'approved';
  // Can only approve if: not already approved AND (has valid counts OR in allowed status list)
  const canClickApprove = !isAlreadyApproved && isMarkedOrAllowedStatus;
  const router = useRouter();

  const storedUserProfile = typeof window !== 'undefined' ? getStoredUserProfile() : null;

  const coordinatorDisplayName = coordinatorProfile?.full_name || coordinatorProfile?.name || storedUserProfile?.full_name || storedUserProfile?.name || 'Coordinator';

  const assignedLevelNames: string[] = coordinatorProfile?.assigned_levels?.length
    ? coordinatorProfile.assigned_levels.map(l => l.name)
    : (availableLevels && availableLevels.length > 0)
      ? availableLevels.map(l => l.name)
      : (coordinatorProfile?.level ? [coordinatorProfile.level.name] : []);

  const assignedLevelsDisplay = assignedLevelNames.length > 0 ? assignedLevelNames.join(', ') : '';

  useEffect(() => {
    document.title = "Attendance Review - Coordinator | IAK SMS";
    fetchCoordinatorData();
  }, []);

  // Group classrooms by grade
  const getClassroomsByGrade = () => {
    const grouped: { [key: string]: ClassroomData[] } = {};

    classrooms.forEach(classroom => {
      const grade = classroom.grade;
      if (!grouped[grade]) {
        grouped[grade] = [];
      }
      grouped[grade].push(classroom);
    });

    return grouped;
  };

  // Get unique grades for tabs
  const getUniqueGrades = () => {
    const grades = [...new Set(classrooms.map(c => c.grade))];
    return grades.sort();
  };

  // Fetch attendance summary for all classrooms
  const fetchAttendanceSummaryForClassrooms = async (classroomsData: ClassroomData[], date: string) => {
    try {
      console.log('🔍 DEBUG: fetchAttendanceSummaryForClassrooms called');
      console.log('   - classroomsData:', classroomsData);
      console.log('   - date:', date);

      setLoadingSummary(true);
      const summary = [];

      for (const classroom of classroomsData) {
        try {
          console.log(`🔍 DEBUG: Fetching attendance for classroom ${classroom.id} (${classroom.name})`);
          const data = await getAttendanceForDate(classroom.id, date);
          console.log(`   - API response for ${classroom.name}:`, data);

          if (data && (data as any).id) {
            const d: any = data;
            const totalStudents = d.total_students ?? d.total ?? classroom.student_count ?? 0;
            const presentCount = d.present_count ?? d.present ?? d.present_count_total ?? 0;
            const absentCount = d.absent_count ?? d.absent ?? d.absent_count_total ?? 0;
            const leaveCount = d.leave_count ?? d.on_leave_count ?? d.leaves_count ?? d.leaves ?? d.leave ?? 0;

            let statusCandidate = d.status ?? d.attendance_status ?? d.state ?? d.review_status ?? d.status_display ?? null;
            if (!statusCandidate) {
              if (d.approved === true || d.coordinator_approved === true || d.finalized === true) {
                statusCandidate = 'approved';
              } else if (d.finalized_at || d.approved_at) {
                statusCandidate = 'approved';
              } else if (presentCount + absentCount + leaveCount > 0) {
                statusCandidate = d.under_review ? 'under_review' : 'submitted';
              }
            }

            // If counts exist but no status found, consider it submitted
            if (!statusCandidate && (presentCount + absentCount + leaveCount > 0)) {
              statusCandidate = 'submitted';
            }

            summary.push({
              classroom_id: classroom.id,
              classroom_name: classroom.name,
              teacher_name: classroom.class_teacher?.name || 'Not Assigned',
              total_students: totalStudents,
              present_count: presentCount,
              absent_count: absentCount,
              leave_count: leaveCount,
              status: statusCandidate || 'not_marked',
              marked_by: d.marked_by || d.marked_by_name || 'Not Marked',
              attendance_percentage: d.attendance_percentage ?? d.present_pct ?? 0
            });
          } else {
            console.log(`   - No attendance data found for ${classroom.name}, using default values`);
            summary.push({
              classroom_id: classroom.id,
              classroom_name: classroom.name,
              teacher_name: classroom.class_teacher?.name || 'Not Assigned',
              total_students: classroom.student_count,
              present_count: 0,
              absent_count: 0,
              leave_count: 0,
              status: 'not_marked',
              marked_by: 'Not Marked',
              attendance_percentage: 0
            });
          }
        } catch (error) {
          console.error(`Error fetching attendance for classroom ${classroom.id}:`, error);
          summary.push({
            classroom_id: classroom.id,
            classroom_name: classroom.name,
            teacher_name: classroom.class_teacher?.name || 'Not Assigned',
            total_students: classroom.student_count,
            present_count: 0,
            absent_count: 0,
            leave_count: 0,
            status: 'not_marked',
            marked_by: 'Not Marked',
            attendance_percentage: 0
          });
        }
      }

      console.log('🔍 DEBUG: Final attendance summary:', summary);
      setClassroomAttendanceSummary(summary);
    } catch (error) {
      console.error('Error fetching attendance summary:', error);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Wrapper function to fetch attendance summary using current classrooms state
  const fetchAttendanceSummary = async (date: string) => {
    const filtered = getFilteredClassrooms();
    if (filtered.length > 0) {
      await fetchAttendanceSummaryForClassrooms(filtered, date);
    } else {
      setClassroomAttendanceSummary([]);
    }
  };

  // Return classrooms filtered by selected level and shift
  const getFilteredClassrooms = (): ClassroomData[] => {
    return classrooms.filter(c => {
      if (selectedLevelId && selectedLevelId !== 'all' && c.level && c.level.id !== selectedLevelId) return false;
      if (selectedShift && selectedShift !== 'all' && c.shift !== selectedShift) return false;
      if (selectedGrade && selectedGrade !== 'all' && c.grade !== selectedGrade) return false;
      return true;
    });
  }

  // Recompute available levels whenever classrooms or selectedShift change
  useEffect(() => {
    const levelMap = new Map<number, string>();
    const filtered = (selectedShift && selectedShift !== 'all') ? classrooms.filter(c => c.shift === selectedShift) : classrooms;
    filtered.forEach((c: any) => {
      if (c.level && c.level.id) levelMap.set(c.level.id, c.level.name);
    });
    const levels = Array.from(levelMap.entries()).map(([id, name]) => ({ id, name }));
    setAvailableLevels(levels);

    // Adjust selectedLevelId if it no longer exists in available levels
    const exists = levels.some(l => l.id === selectedLevelId);
    if (!exists) {
      if (levels.length === 1) setSelectedLevelId(levels[0].id);
      else setSelectedLevelId(levels.length > 0 ? 'all' : null);
    }
  }, [classrooms, selectedShift]);

  // Recompute available grades whenever classrooms, selectedShift or selectedLevelId change
  useEffect(() => {
    const filtered = (selectedShift && selectedShift !== 'all') ? classrooms.filter(c => c.shift === selectedShift) : classrooms;
    const furtherFiltered = (selectedLevelId && selectedLevelId !== 'all') ? filtered.filter(c => c.level && c.level.id === selectedLevelId) : filtered;
    const gradeSet = new Set<string>();
    furtherFiltered.forEach((c: any) => {
      if (c.grade) gradeSet.add(c.grade);
    });
    const grades = Array.from(gradeSet).sort();
    setAvailableGrades(grades);

    // Adjust selectedGrade if it no longer exists in available grades
    const exists = grades.includes(String(selectedGrade));
    if (!exists) {
      if (grades.length === 1) setSelectedGrade(grades[0]);
      else setSelectedGrade(grades.length > 0 ? 'all' : null);
    }
  }, [classrooms, selectedShift, selectedLevelId]);

  // When filters change, refresh the attendance summary
  useEffect(() => {
    // avoid calling on initial mount before classrooms populated
    if (classrooms.length === 0) return;
    fetchAttendanceSummary(selectedDate);
  }, [selectedLevelId, selectedShift, selectedGrade]);

  // Fetch attendance data for a classroom and specific date
  const fetchClassroomAttendance = async (classroomId: number, date: string) => {
    let data: any = null;
    try {
      setLoadingAttendance(true);

      // Fetch attendance data for specific date using getAttendanceForDate
      data = await getAttendanceForDate(classroomId, date);
      console.log('Attendance data received for date:', date, data);
      console.log('Student attendance data:', (data as any)?.student_attendance);
      console.log('Student attendance length:', (data as any)?.student_attendance?.length);
      if ((data as any)?.student_attendance?.length > 0) {
        console.log('First student record:', (data as any).student_attendance[0]);
        console.log('Student gender:', (data as any).student_attendance[0]?.student_gender);
        console.log('Student code:', (data as any).student_attendance[0]?.student_code);
        console.log('Student ID:', (data as any).student_attendance[0]?.student_id);
        console.log('All student codes:', (data as any).student_attendance.map((s: any) => s.student_code));
      }

      // If we have data, normalize it and wrap in array for consistency
      if (data && (data as any).id) {
        const d: any = data;
        const presentCount = d.present_count ?? d.present ?? d.present_count_total ?? 0;
        const absentCount = d.absent_count ?? d.absent ?? d.absent_count_total ?? 0;
        const leaveCount = d.leave_count ?? d.on_leave_count ?? d.leaves_count ?? d.leaves ?? d.leave ?? 0;
        
        // Normalize status using same logic as summary
        let statusCandidate = d.status ?? d.attendance_status ?? d.state ?? d.review_status ?? d.status_display ?? null;
        if (!statusCandidate) {
          if (d.approved === true || d.coordinator_approved === true || d.finalized === true) {
            statusCandidate = 'approved';
          } else if (d.finalized_at || d.approved_at) {
            statusCandidate = 'approved';
          } else if (presentCount + absentCount + leaveCount > 0) {
            statusCandidate = d.under_review ? 'under_review' : 'submitted';
          }
        }

        // Update the status before setting
        d.status = statusCandidate || (presentCount + absentCount + leaveCount > 0 ? 'submitted' : 'not_marked');
        setAttendanceData([d]);
      } else {
        console.log('No attendance data found for date:', date);
        setAttendanceData([]);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setAttendanceData([]);
    } finally {
      setLoadingAttendance(false);
    }
    return (data as any) || null;
  };

  const toggleClassroomExpansion = async (classroom: ClassroomData) => {
    if (expandedClassroom === classroom.id) {
      setExpandedClassroom(null);
      setAttendanceData([]);
      setEditingAttendance(false);
      setEditedAttendance([]);
    } else {
      setExpandedClassroom(classroom.id);
      await fetchClassroomAttendance(classroom.id, selectedDate);
    }
  };

  const openClassroomDialog = async (classroomId: number, classroomName: string) => {
    setActiveClassroomId(classroomId);
    setActiveClassroomName(classroomName);
    setExpandedClassroom(classroomId);
    const data = await fetchClassroomAttendance(classroomId, selectedDate);
    setEditedAttendance((data && (data as any).student_attendance) ? [...(data as any).student_attendance] : []);
    setIsDialogOpen(true);
  };

  const closeClassroomDialog = () => {
    setIsDialogOpen(false);
    setActiveClassroomId(null);
    setActiveClassroomName(null);
    setAttendanceData([]);
    setEditingAttendance(false);
    setEditedAttendance([]);
    setApprovalComment('');
  };

  // Approve attendance as coordinator
  const approveAttendance = async () => {
    try {
      if (!attendanceData || attendanceData.length === 0) {
        alert('No attendance data to approve.');
        return;
      }

      // Check if attendance is already approved
      if (isAlreadyApproved) {
        alert('This attendance is already approved.');
        return;
      }

      // Can only approve if attendance is marked (has counts) or in allowed status list
      if (!isMarkedOrAllowedStatus) {
        const currentStatus = currentAttendanceStatus.replace(/_/g, ' ');
        alert(`Cannot approve attendance with status '${currentStatus}'. Attendance must be marked or in submitted/under review status.`);
        return;
      }

      const attendanceId = attendanceData[0].id;
      setApproving(true);
      const { coordinatorApproveAttendance } = await import('@/lib/api');
      await coordinatorApproveAttendance(attendanceId, approvalComment);
      alert('Attendance approved successfully.');

      // Optimistically update local attendance state so UI reflects the approved status immediately
      const updatedAttendance = [...attendanceData];
      updatedAttendance[0] = { ...(updatedAttendance[0] || {}), status: 'approved' };
      setAttendanceData(updatedAttendance);

      // Update the classroom summary optimistically as well - try multiple matching keys
      setClassroomAttendanceSummary(prev => {
        try {
          const candidates: Array<number | string | null> = [];
          if (activeClassroomId) candidates.push(activeClassroomId);
          if (expandedClassroom) candidates.push(expandedClassroom);
          const att = updatedAttendance[0] || {};
          if (att.classroom_id) candidates.push(att.classroom_id);
          if ((att as any).classroom && typeof (att as any).classroom === 'number') candidates.push((att as any).classroom);
          if ((att as any).classroom && typeof (att as any).classroom === 'object' && (att as any).classroom.id) candidates.push((att as any).classroom.id);

          // If we have a classroom name, try matching by name as a fallback
          const classroomName = (att && (att.classroom_name || att.classroom_name_text || att.classroom)) || activeClassroomName;

          return prev.map(item => {
            const idMatch = candidates.some(c => c !== null && String(item.classroom_id) === String(c));
            const nameMatch = classroomName && String(item.classroom_name) === String(classroomName);
            if (idMatch || nameMatch) return { ...item, status: 'approved' };
            return item;
          });
        } catch (e) {
          return prev;
        }
      });

      // Refresh summary from server to get accurate counts, then close dialog
      await fetchAttendanceSummary(selectedDate);
      closeClassroomDialog();
    } catch (error) {
      console.error('Error approving attendance:', error);
      if (error instanceof ApiError && error.status === 403) {
        setCanApproveAttendance(false);
        alert(error.message || 'You do not have permission to approve this attendance');
      } else {
        alert('Failed to approve attendance.');
      }
    } finally {
      setApproving(false);
    }
  };

  // Start editing attendance
  const startEditingAttendance = () => {
    if (attendanceData.length > 0 && attendanceData[0].student_attendance) {
      setEditedAttendance([...attendanceData[0].student_attendance]);
      setEditingAttendance(true);
    }
  };

  // Update student attendance status
  const updateStudentStatus = (index: number, status: string) => {
    const updated = [...editedAttendance];
    updated[index] = { ...updated[index], status };
    setEditedAttendance(updated);
  };

  // Update student remarks
  const updateStudentRemarks = (index: number, remarks: string) => {
    const updated = [...editedAttendance];
    updated[index] = { ...updated[index], remarks };
    setEditedAttendance(updated);
  };

  // Save attendance changes
  const saveAttendanceChanges = async () => {
    try {
      const targetClassroom = expandedClassroom || activeClassroomId;
      if (attendanceData.length > 0 && targetClassroom) {
        setSavingAttendance(true);
        console.log('Saving attendance changes:', editedAttendance);

        // Prepare data for API call
        const attendanceId = attendanceData[0].id;
        const studentAttendanceData = editedAttendance.map(record => ({
          student_id: record.student_id,
          status: record.status,
          remarks: record.remarks || ''
        }));

        // Call API to save changes
        const response = await editAttendance(attendanceId, {
          student_attendance: studentAttendanceData
        });

        console.log('Attendance updated successfully:', response);

        // Update local state
        const updatedAttendanceData = [...attendanceData];
        updatedAttendanceData[0] = {
          ...updatedAttendanceData[0],
          student_attendance: editedAttendance
        };
        setAttendanceData(updatedAttendanceData);
        setEditingAttendance(false);

        alert('Attendance updated successfully!');

        await fetchClassroomAttendance(targetClassroom, selectedDate);
      }
    } catch (error: any) {
      console.error('Error saving attendance:', error);
      
      // Handle ApiError with user-friendly messages
      if (error instanceof ApiError) {
        if (error.status === 403) {
          setCanEditAttendance(false);
          // Show the user-friendly error message from ApiError
          alert(error.message || 'You do not have permission to edit this attendance');
        } else {
          // Show error message for other status codes
          alert(error.message || 'Error saving attendance. Please try again.');
        }
      } else {
        // Generic error message for unexpected errors
        alert('Error saving attendance. Please try again.');
      }
    } finally {
      setSavingAttendance(false);
    }
  };

  const cancelEditing = () => {
    setEditingAttendance(false);
    setEditedAttendance([]);
  };

  const fetchCoordinatorData = async () => {
    try {
      setLoading(true);
      setError("");

      const profile = await getCurrentUserProfile() as CoordinatorProfile;

      if (!profile) {
        setError("Failed to load coordinator profile. Please login again.");
        setTimeout(() => {
          router.push('/Universal_Login');
        }, 2000);
        return;
      }

      setCoordinatorProfile(profile);
      console.log('Coordinator profile:', profile);

      // Fetch classrooms in coordinator's level(s)
      const classesData = await getCoordinatorClasses();

      // Handle different response formats
      let classroomsData: ClassroomData[] = [];
      if (Array.isArray(classesData)) {
        classroomsData = classesData as ClassroomData[];
      } else if (classesData && typeof classesData === 'object') {
        // Check if it's a paginated response
        if ((classesData as any).results && Array.isArray((classesData as any).results)) {
          classroomsData = (classesData as any).results as ClassroomData[];
        } else if ((classesData as any).data && Array.isArray((classesData as any).data)) {
          classroomsData = (classesData as any).data as ClassroomData[];
        }
      }

      setClassrooms(classroomsData);

      // Derive available levels and shifts from returned classrooms
      const levelMap = new Map<number, string>();
      const shiftsSet = new Set<string>();
      classroomsData.forEach((c: any) => {
        if (c.level && c.level.id) levelMap.set(c.level.id, c.level.name);
        if (c.shift) shiftsSet.add(c.shift);
      });
      setAvailableShifts(['all', ...Array.from(shiftsSet)]);
      setSelectedShift('all');
      // Let the useEffect below compute availableLevels and selectedLevelId based on selectedShift
      // and then fetch summary via the filters effect.

    } catch (err: unknown) {
      console.error('Error fetching coordinator data:', err);
      setError("Failed to load coordinator data. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-12 p-10 bg-[#e7ecef] rounded-2xl shadow-2xl border-2 border-[#a3cef1]">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-6 w-6 animate-spin text-[#6096ba]" />
            <span className="text-[#274c77] font-medium">Loading attendance data...</span>
          </div>
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
            <Button onClick={fetchCoordinatorData} className="bg-[#6096ba] hover:bg-[#274c77] text-white">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 sm:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Attendance Review</h1>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-base sm:text-lg">
              <div className="flex items-center space-x-3">
                <Users className="h-5 w-5" />
                <div className="leading-tight">
                  <div className="font-medium">{coordinatorDisplayName}</div>
                  {assignedLevelsDisplay ? (
                    <div className="text-sm">{assignedLevelsDisplay}</div>
                  ) : (
                    <div className="text-sm">Coordinator</div>
                  )}
                </div>
              </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>{getFilteredClassrooms().length} Classes</span>
            </div>
          </div>
        </div>

        {/* Refresh Button Right Side */}
        <Button
          onClick={() => fetchAttendanceSummary(selectedDate)}
          className="bg-[#6096ba] hover:bg-[#274c77] text-white flex items-center self-end sm:self-center"
          disabled={loadingSummary}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingSummary ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>


      {/* Attendance Summary */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-[#a3cef1] p-4 sm:p-6">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-[#274c77] flex items-center">
            <Calendar className="h-5 sm:h-6 w-5 sm:w-6 mr-2" />
            Today's({new Date(selectedDate).toLocaleDateString()})
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Level select (show if multiple levels are available) */}
            {availableLevels && availableLevels.length > 0 ? (
              <Select
                value={selectedLevelId === 'all' ? 'all' : (selectedLevelId ? String(selectedLevelId) : 'all')}
                onValueChange={(val) => {
                  if (val === 'all') {
                    setSelectedLevelId('all');
                  } else {
                    setSelectedLevelId(Number(val));
                  }
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Levels" />
                </SelectTrigger>
                <SelectContent>
                  {availableLevels.length > 1 && (
                    <SelectItem key="all" value="all">All Levels</SelectItem>
                  )}
                  {availableLevels.map(l => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              // show label when no level info
              <div className="text-sm text-gray-700 px-2">Coordinator</div>
            )}

            {/* Grade select (dynamic based on selected level & shift) */}
            {availableGrades && availableGrades.length > 0 ? (
              <Select
                value={selectedGrade || 'all'}
                onValueChange={(val) => {
                  setSelectedGrade(val === 'all' ? 'all' : val);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Grades" />
                </SelectTrigger>
                <SelectContent>
                  {availableGrades.length > 1 && (
                    <SelectItem key="all-grades" value="all">All Grades</SelectItem>
                  )}
                  {availableGrades.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-gray-700 px-2">All Grades</div>
            )}

            {availableShifts && availableShifts.length > 0 ? (
              <Select
                value={selectedShift || 'all'}
                onValueChange={(val) => {
                  setSelectedShift(val);
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All Shifts" />
                </SelectTrigger>
                <SelectContent>
                  {availableShifts.map(s => (
                    <SelectItem key={s} value={s}>{s === 'all' ? 'All Shifts' : s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-gray-700 px-2">{availableShifts.length === 1 ? availableShifts[0] : ''}</div>
            )}

            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                fetchAttendanceSummary(e.target.value);
              }}
              className="w-full sm:w-40"
            />

          </div>
        </div>

        {loadingSummary ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6096ba]"></div>
            <span className="ml-2 text-gray-600">Loading attendance summary...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {classroomAttendanceSummary.map((summary) => {
              const hasCounts = (summary.present_count || 0) + (summary.absent_count || 0) + (summary.leave_count || 0) > 0;
              const st = summary.status;
              const badgeLabel = (st && st !== 'not_marked') ? (st.charAt(0).toUpperCase() + st.slice(1)) : (hasCounts ? 'Marked' : 'Not Marked');
              const badgeClass = st === 'approved' ? 'bg-green-100 text-green-800 border-green-300' :
                st === 'submitted' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                st === 'under_review' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                st === 'draft' ? 'bg-gray-100 text-gray-800 border-gray-300' :
                (hasCounts ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300');

              return (
              <div
                key={summary.classroom_id}
                role="button"
                tabIndex={0}
                onClick={() => openClassroomDialog(summary.classroom_id, summary.classroom_name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openClassroomDialog(summary.classroom_id, summary.classroom_name);
                  }
                }}
                className="bg-gray-50 rounded-lg p-6 border border-gray-200 hover:shadow-md transition ease-in-out duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#6096ba]"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 text-base">{summary.classroom_name}</h3>
                  <Badge
                    variant="outline"
                    className={badgeClass}
                  >
                    {badgeLabel}
                  </Badge>
                </div>
                <div className="text-sm text-gray-600 mb-3">
                  <div>Teacher: {summary.teacher_name}</div>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span>Present: {summary.present_count}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span>Absent: {summary.absent_count}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span>Leave: {summary.leave_count}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                    <span>Total: {summary.total_students}</span>
                  </div>
                </div>
                {summary.total_students > 0 && (
                  <div className="mt-4">
                    <div className="text-sm text-gray-600 mb-1">Attendance: {summary.attendance_percentage}%</div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-[#6096ba] h-2 rounded-full"
                        style={{ width: `${summary.attendance_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>


      {/* Dialog: Attendance sheet preview & approval */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeClassroomDialog(); setIsDialogOpen(open); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{activeClassroomName ? `${activeClassroomName} — Attendance` : 'Attendance'}</DialogTitle>
            <DialogDescription>
              Review the attendance sheet submitted by the teacher. You can approve it to finalize.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {/* current status is shown below; isApprovable is derived above and used for the Approve button */}
            {attendanceData && attendanceData.length > 0 ? (
              <div className="space-y-4">
                <div className="text-sm text-gray-700">Status: <strong>{attendanceData[0].status || 'Not Marked'}</strong></div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-700 font-medium">Coordinator's Comment:</label>
                  <Input 
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    placeholder="Add your comment (optional)"
                    className="w-full"
                  />
                </div>
                <div className="overflow-auto max-h-64 border rounded">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Student</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        (editedAttendance && editedAttendance.length > 0)
                        ? editedAttendance.map((s: any, idx: number) => (
                            <tr key={idx} className="border-t">
                              <td className="px-3 py-2">{s.student_name || s.student_code || s.student_id}</td>
                              <td className="px-3 py-2">{s.status}</td>
                              <td className="px-3 py-2">
                                <Input
                                  value={s.remarks || ''}
                                  onChange={(e) => updateStudentRemarks(idx, e.target.value)}
                                  placeholder="Add remark"
                                  className="w-full"
                                />
                              </td>
                            </tr>
                          ))
                        : (
                          attendanceData[0].student_attendance && attendanceData[0].student_attendance.length > 0 ? (
                            attendanceData[0].student_attendance.map((s: any, idx: number) => (
                              <tr key={idx} className="border-t">
                                <td className="px-3 py-2">{s.student_name || s.student_code || s.student_id}</td>
                                <td className="px-3 py-2">{s.status}</td>
                                <td className="px-3 py-2">{s.remarks || '-'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr><td className="p-4">No student attendance found.</td></tr>
                          )
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-600">Loading attendance...</div>
            )}
          </div>

          <DialogFooter>
            <div className="flex gap-2">
              <button onClick={closeClassroomDialog} className="px-4 py-2 border rounded">Close</button>
              <button
                onClick={saveAttendanceChanges}
                disabled={!canEditAttendance || savingAttendance || !(editedAttendance && editedAttendance.length > 0)}
                className="px-4 py-2 bg-[#2c7a7b] text-white rounded disabled:opacity-60"
              >{savingAttendance ? 'Saving...' : 'Save Remarks'}</button>
              <button
                onClick={approveAttendance}
                disabled={!canApproveAttendance || approving || !(attendanceData && attendanceData.length > 0) || !canClickApprove}
                title={isAlreadyApproved ? 'Attendance is already approved' : (!isMarkedOrAllowedStatus ? 'Only draft/submitted/under review or marked attendance can be approved' : undefined)}
                className="px-4 py-2 bg-[#274c77] text-white rounded disabled:opacity-60"
              >{approving ? 'Approving...' : 'Approve'}</button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* tablist wala kam yaha tha  */}




    </div>
  )
}
