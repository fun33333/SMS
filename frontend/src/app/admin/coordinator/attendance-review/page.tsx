"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar, RefreshCw, AlertCircle, Users } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getCurrentUserProfile, getCoordinatorClasses, getAttendanceForDate, editAttendance, getStoredUserProfile, ApiError, getHolidays } from "@/lib/api"
import { useRouter } from "next/navigation"
import CoordinatorHolidayManagement from "@/components/attendance/coordinator-holiday-management"



const normalizeShiftLabel = (shift?: string | null) => {
  if (!shift) return 'morning'
  const value = shift.toString().trim().toLowerCase()
  if (!value) return 'morning'
  if (['all', 'both', 'morning+afternoon', 'morning + afternoon'].includes(value)) return 'both'
  if (value.startsWith('morn')) return 'morning'
  if (value.startsWith('after')) return 'afternoon'
  if (value.startsWith('even')) return 'evening'
  if (value.startsWith('night')) return 'night'
  return value
}

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
  const [availableLevels, setAvailableLevels] = useState<Array<{ id: number; name: string; shift: string }>>([]);
  const [levelShiftSummary, setLevelShiftSummary] = useState<Record<number, string>>({});
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'all' | null>(null);
  const [availableShifts, setAvailableShifts] = useState<string[]>([]);
  const [selectedShift, setSelectedShift] = useState<string | null>('all');
  const [availableGrades, setAvailableGrades] = useState<string[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string | 'all' | null>('all');
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [allUpcomingHolidays, setAllUpcomingHolidays] = useState<any[]>([]);
  const [selectedHoliday, setSelectedHoliday] = useState<any | null>(null);
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

  // Helper function to normalize grade for sorting (Nursery, KG-I, KG-II, Grade I, etc.)
  const normalizeGradeForSort = (classroomName: string): { gradeOrder: number; section: string } => {
    const name = classroomName.trim();
    
    // Define grade order (lower number = appears first)
    const gradeOrderMap: Record<string, number> = {
      'nursery': 1,
      'kg-i': 2,
      'kg-1': 2,
      'kg1': 2,
      'kg-ii': 3,
      'kg-2': 3,
      'kg2': 3,
    };
    
    // Extract grade and section
    let gradeOrder = 999; // Default for unknown grades
    let section = '';
    
    // Check for Nursery
    if (name.toLowerCase().startsWith('nursery')) {
      gradeOrder = gradeOrderMap['nursery'];
      const sectionMatch = name.match(/nursery\s*[-]?\s*([a-z])/i);
      section = sectionMatch ? sectionMatch[1].toUpperCase() : '';
    }
    // Check for KG-I
    else if (name.toLowerCase().includes('kg-i') || name.toLowerCase().includes('kg-1') || name.toLowerCase().includes('kg1')) {
      gradeOrder = gradeOrderMap['kg-i'];
      const sectionMatch = name.match(/kg[-]?i\s*[-]?\s*([a-z])/i) || name.match(/kg[-]?1\s*[-]?\s*([a-z])/i);
      section = sectionMatch ? sectionMatch[1].toUpperCase() : '';
    }
    // Check for KG-II
    else if (name.toLowerCase().includes('kg-ii') || name.toLowerCase().includes('kg-2') || name.toLowerCase().includes('kg2')) {
      gradeOrder = gradeOrderMap['kg-ii'];
      const sectionMatch = name.match(/kg[-]?ii\s*[-]?\s*([a-z])/i) || name.match(/kg[-]?2\s*[-]?\s*([a-z])/i);
      section = sectionMatch ? sectionMatch[1].toUpperCase() : '';
    }
    // Check for Grade I, II, III, etc.
    else {
      const gradeMatch = name.match(/grade\s+([ivx]+|\d+)/i);
      if (gradeMatch) {
        const gradeStr = gradeMatch[1].toUpperCase();
        // Convert Roman numerals to numbers for sorting
        const romanToNum: Record<string, number> = {
          'I': 4, 'II': 5, 'III': 6, 'IV': 7, 'V': 8,
          'VI': 9, 'VII': 10, 'VIII': 11, 'IX': 12, 'X': 13,
          'XI': 14, 'XII': 15
        };
        const numMatch = gradeStr.match(/^\d+$/);
        if (numMatch) {
          gradeOrder = parseInt(gradeStr) + 3; // Grade 1 = 4, Grade 2 = 5, etc.
        } else {
          gradeOrder = romanToNum[gradeStr] || 999;
        }
        const sectionMatch = name.match(/grade\s+[ivx\d]+\s*[-]?\s*([a-z])/i);
        section = sectionMatch ? sectionMatch[1].toUpperCase() : '';
      }
    }
    
    return { gradeOrder, section };
  };

  // Helper function to batch API calls
  const batchProcess = async <T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 5,
    delayBetweenBatches: number = 100
  ): Promise<R[]> => {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
      
      // Add delay between batches to avoid overwhelming the server
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    return results;
  };

  // Fetch attendance summary for all classrooms
  const fetchAttendanceSummaryForClassrooms = async (classroomsData: ClassroomData[], date: string) => {
    try {
      console.log('🔍 DEBUG: fetchAttendanceSummaryForClassrooms called');
      console.log('   - classroomsData:', classroomsData);
      console.log('   - date:', date);

      setLoadingSummary(true);
      const summary = [];

      // Check if date is a holiday for any level
      const normalizeDate = (dateStr: string) => {
        return dateStr.split('T')[0];
      };
      const normalizedDate = normalizeDate(date);
      
      // Separate classrooms that are holidays from those that need API calls
      const classroomsToFetch: ClassroomData[] = [];
      const holidayClassrooms: Array<{ classroom: ClassroomData; holiday: any }> = [];
      
      for (const classroom of classroomsData) {
        // Check if this date is a holiday for this classroom's level
        let holidayForClassroom: any = null;
        if (classroom.level && holidays.length > 0) {
          holidayForClassroom = holidays.find((h: any) => {
            const holidayDate = normalizeDate(h.date);
            return holidayDate === normalizedDate && h.level_id === classroom.level?.id;
          });
        }

        if (holidayForClassroom) {
          holidayClassrooms.push({ classroom, holiday: holidayForClassroom });
        } else {
          classroomsToFetch.push(classroom);
        }
      }

      // Add holiday classrooms to summary
      for (const { classroom, holiday } of holidayClassrooms) {
        summary.push({
          classroom_id: classroom.id,
          classroom_name: classroom.name,
          teacher_name: classroom.class_teacher?.name || 'Not Assigned',
          total_students: classroom.student_count,
          present_count: 0,
          absent_count: 0,
          leave_count: 0,
          status: 'holiday',
          marked_by: 'Holiday',
          attendance_percentage: 0,
          is_holiday: true,
          holiday_reason: holiday.reason,
          holiday_id: holiday.id
        });
      }

      // Process classrooms in batches to avoid overwhelming the server
      const processClassroom = async (classroom: ClassroomData) => {
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

            // Use display_status first, then check actual status
            let statusCandidate = d.display_status ?? d.status ?? d.attendance_status ?? d.state ?? d.review_status ?? d.status_display ?? null;
            if (!statusCandidate) {
              if (d.approved === true || d.coordinator_approved === true || d.finalized === true) {
                statusCandidate = 'approved';
              } else if (d.finalized_at || d.approved_at) {
                statusCandidate = 'approved';
              } else if (presentCount + absentCount + leaveCount > 0) {
                // New flow: default to under_review when attendance is marked
                statusCandidate = (d.status === 'under_review' || d.under_review === true) ? 'under_review' : 'under_review';
              }
            }

            // If counts exist but no status found, consider it under_review (new flow)
            if (!statusCandidate && (presentCount + absentCount + leaveCount > 0)) {
              statusCandidate = 'under_review';
            }

            return {
              classroom_id: classroom.id,
              classroom_name: classroom.name,
              teacher_name: classroom.class_teacher?.name || 'Not Assigned',
              total_students: totalStudents,
              present_count: presentCount,
              absent_count: absentCount,
              leave_count: leaveCount,
              status: statusCandidate || 'not_marked',
              display_status: d.display_status || null,
              marked_by: d.marked_by || d.marked_by_name || 'Not Marked',
              attendance_percentage: d.attendance_percentage ?? d.present_pct ?? 0,
              is_holiday: d.is_holiday || false
            };
          } else {
            console.log(`   - No attendance data found for ${classroom.name}, using default values`);
            return {
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
            };
          }
        } catch (error) {
          console.error(`Error fetching attendance for classroom ${classroom.id}:`, error);
          return {
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
          };
        }
      };

      // Process classrooms in batches of 5 with 100ms delay between batches
      const attendanceResults = await batchProcess(classroomsToFetch, processClassroom, 5, 100);
      summary.push(...attendanceResults);

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
    const levelMapAll = new Map<number, { id: number; name: string; shift: string }>();
    const levelMapFiltered = new Map<number, { id: number; name: string; shift: string }>();
    const shiftSummary: Record<number, string> = {};

    classrooms.forEach((c: any) => {
      if (c.level && c.level.id) {
        const normalizedShift = normalizeShiftLabel(c.level.shift ?? c.shift ?? null);
        levelMapAll.set(c.level.id, {
          id: c.level.id,
          name: c.level.name,
          shift: normalizedShift,
        });
        const existing = shiftSummary[c.level.id];
        if (!existing) {
          shiftSummary[c.level.id] = normalizedShift;
        } else if (existing !== normalizedShift) {
          shiftSummary[c.level.id] = 'both';
        }
      }
    });

    const filtered = (selectedShift && selectedShift !== 'all')
      ? classrooms.filter((c: any) => normalizeShiftLabel(c.shift ?? c.level?.shift ?? null) === selectedShift)
      : classrooms;
    filtered.forEach((c: any) => {
      if (c.level && c.level.id) {
        const normalizedShift = normalizeShiftLabel(c.level.shift ?? c.shift ?? null);
        levelMapFiltered.set(c.level.id, {
          id: c.level.id,
          name: c.level.name,
          shift: normalizedShift,
        });
      }
    });

    const allLevels = Array.from(levelMapAll.values()).map((level) => ({
      ...level,
      shift: shiftSummary[level.id] || level.shift || 'morning',
    }));
    const filteredLevels = Array.from(levelMapFiltered.values());
    setAvailableLevels(allLevels);
    setLevelShiftSummary(shiftSummary);

    // Adjust selectedLevelId if it no longer exists in available levels
    const exists = filteredLevels.some(l => l.id === selectedLevelId);
    if (!exists) {
      if (filteredLevels.length === 1) setSelectedLevelId(filteredLevels[0].id);
      else setSelectedLevelId(filteredLevels.length > 0 ? 'all' : null);
    }
  }, [classrooms, selectedShift]);

  // Recompute available grades whenever classrooms, selectedShift or selectedLevelId change
  useEffect(() => {
    const filtered = (selectedShift && selectedShift !== 'all')
      ? classrooms.filter((c: any) => normalizeShiftLabel(c.shift ?? c.level?.shift ?? null) === selectedShift)
      : classrooms;
    const furtherFiltered = (selectedLevelId && selectedLevelId !== 'all') ? filtered.filter((c: any) => c.level && c.level.id === selectedLevelId) : filtered;
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

  // Fetch holidays when date or levels change
  useEffect(() => {
    const fetchHolidaysForDate = async () => {
      if (availableLevels.length === 0) return;
      
      try {
        const allHolidays: any[] = [];
        const today = new Date().toISOString().split('T')[0];
        
        // Process holidays in batches to avoid overwhelming the server
        const processHolidayForDate = async (level: { id: number; name: string; shift: string }) => {
          try {
            const data = await getHolidays({
              levelId: level.id,
              startDate: selectedDate,
              endDate: selectedDate,
            });
            return Array.isArray(data) ? data : [];
          } catch (error) {
            console.error(`Failed to fetch holidays for level ${level.id}:`, error);
            return [];
          }
        };

        const processUpcomingHolidays = async (level: { id: number; name: string; shift: string }) => {
          try {
            const data = await getHolidays({
              levelId: level.id,
              startDate: today,
            });
            if (Array.isArray(data)) {
              // Filter to only future holidays (excluding today)
              return data.filter((h: any) => {
                const holidayDate = h.date.split('T')[0];
                return holidayDate > today;
              });
            }
            return [];
          } catch (error) {
            console.error(`Failed to fetch upcoming holidays for level ${level.id}:`, error);
            return [];
          }
        };
        
        // Fetch holidays for selected date in batches
        const holidayResults = await batchProcess(availableLevels, processHolidayForDate, 5, 100);
        allHolidays.push(...holidayResults.flat());
        
        // Fetch upcoming holidays in batches
        const upcomingResults = await batchProcess(availableLevels, processUpcomingHolidays, 5, 100);
        const upcomingHolidays = upcomingResults.flat();
        
        // Store holidays for selected date check
        setHolidays(allHolidays);
        // Store all upcoming holidays for badge count
        setAllUpcomingHolidays(upcomingHolidays);
        
        // Refresh attendance summary after holidays are fetched to update cards
        if (classrooms.length > 0) {
          fetchAttendanceSummary(selectedDate);
        }
      } catch (error) {
        console.error('Error fetching holidays:', error);
      }
    };
    
    fetchHolidaysForDate();
  }, [selectedDate, availableLevels]);

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
        
        // Normalize status using same logic as summary - use display_status first
        let statusCandidate = d.display_status ?? d.status ?? d.attendance_status ?? d.state ?? d.review_status ?? d.status_display ?? null;
        if (!statusCandidate) {
          if (d.approved === true || d.coordinator_approved === true || d.finalized === true) {
            statusCandidate = 'approved';
          } else if (d.finalized_at || d.approved_at) {
            statusCandidate = 'approved';
          } else if (presentCount + absentCount + leaveCount > 0) {
            // New flow: default to under_review when attendance is marked
            statusCandidate = (d.status === 'under_review' || d.under_review === true) ? 'under_review' : 'under_review';
          }
        }

        // Update the status before setting - new flow uses under_review
        d.status = statusCandidate || (presentCount + absentCount + leaveCount > 0 ? 'under_review' : 'not_marked');
        // Preserve display_status if available
        if (d.display_status) {
          d.display_status = d.display_status;
        }
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
    
    // Check if this is a holiday
    const classroom = classrooms.find(c => c.id === classroomId);
    const normalizeDate = (dateStr: string) => dateStr.split('T')[0];
    const normalizedDate = normalizeDate(selectedDate);
    
    if (classroom?.level) {
      const holiday = holidays.find((h: any) => {
        const holidayDate = normalizeDate(h.date);
        return holidayDate === normalizedDate && h.level_id === classroom.level?.id;
      });
      
      if (holiday) {
        setSelectedHoliday(holiday);
        setAttendanceData([]);
        setIsDialogOpen(true);
        return;
      }
    }
    
    setSelectedHoliday(null);
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
    setSelectedHoliday(null);
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

      // Update the classroom summary optimistically - remove approved attendance from list
      // (Approved attendance should not show in coordinator dashboard)
      setClassroomAttendanceSummary(prev => {
        // Filter out the approved attendance card
        return prev.filter(item => {
          const candidates: Array<number | string | null> = [];
          if (activeClassroomId) candidates.push(activeClassroomId);
          if (expandedClassroom) candidates.push(expandedClassroom);
          const att = updatedAttendance[0] || {};
          if (att.classroom_id) candidates.push(att.classroom_id);
          if ((att as any).classroom && typeof (att as any).classroom === 'number') candidates.push((att as any).classroom);
          if ((att as any).classroom && typeof (att as any).classroom === 'object' && (att as any).classroom.id) candidates.push((att as any).classroom.id);
          
          // If we have a classroom name, try matching by name as a fallback
          const classroomName = (att && (att.classroom_name || att.classroom_name_text || att.classroom)) || activeClassroomName;
          
          // Check if this item matches the approved attendance
          const idMatch = candidates.some(c => c !== null && String(item.classroom_id) === String(c));
          const nameMatch = classroomName && String(item.classroom_name) === String(classroomName);
          
          // Remove this item if it matches (it's now approved)
          return !(idMatch || nameMatch);
        });
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

        {/* Action Buttons Right Side */}
        <div className="flex w-full flex-wrap items-center justify-end gap-2 self-end sm:w-auto sm:self-center">
          {/* Upcoming Holidays Badge */}
          {allUpcomingHolidays.length > 0 && (() => {
            // Sort holidays by date
            const sortedHolidays = [...allUpcomingHolidays].sort((a, b) => {
              const dateA = new Date(a.date).getTime();
              const dateB = new Date(b.date).getTime();
              return dateA - dateB;
            });
            
            // Format dates
            const formatDate = (dateStr: string) => {
              const date = new Date(dateStr);
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            };
            
            const findLongestContinuous = (holidays: any[]) => {
              if (holidays.length === 0) return null;
              
              let longestStart = 0;
              let longestEnd = 0;
              let currentStart = 0;
              
              for (let i = 1; i < holidays.length; i++) {
                const prevDate = new Date(holidays[i - 1].date).getTime();
                const currDate = new Date(holidays[i].date).getTime();
                const diff = (currDate - prevDate) / (1000 * 60 * 60 * 24);
                
                if (diff === 1) {
                  // Continuous
                  const currentLength = i - currentStart + 1;
                  const longestLength = longestEnd - longestStart + 1;
                  
                  if (currentLength >= 3 && currentLength > longestLength) {
                    longestStart = currentStart;
                    longestEnd = i;
                  }
                } else {
                  // Break in continuity
                  currentStart = i;
                }
              }
              
              // Check if we found a sequence of at least 3
              if (longestEnd - longestStart + 1 >= 3) {
                return {
                  start: longestStart,
                  end: longestEnd,
                  holidays: holidays.slice(longestStart, longestEnd + 1)
                };
              }
              
              return null;
            };
            
            const continuousSequence = findLongestContinuous(sortedHolidays);
            
            // Get dates to display
            let datesToShow = '';
            if (continuousSequence && continuousSequence.holidays.length >= 3) {
              // Show first and last date of continuous sequence (minimum 3 days)
              const firstDate = formatDate(continuousSequence.holidays[0].date);
              const lastDate = formatDate(continuousSequence.holidays[continuousSequence.holidays.length - 1].date);
              datesToShow = `(${firstDate} - ${lastDate})`;
            } else {
              // Show individual dates (first 3 if more than 3)
              const nextHolidays = sortedHolidays.slice(0, 3);
              datesToShow = `(${nextHolidays.map(h => formatDate(h.date)).join(', ')})`;
            }
            
            return (
              <Badge className="bg-green-500 text-white border-green-600 text-sm px-3 py-1.5 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span className="font-semibold">{allUpcomingHolidays.length}</span>
                <span className="hidden sm:inline">Upcoming Holiday{allUpcomingHolidays.length !== 1 ? 's' : ''}</span>
                <span className="sm:hidden">Upcoming</span>
                {datesToShow && (
                  <span className="hidden md:inline ml-1 text-xs opacity-90">
                    {datesToShow}
                  </span>
                )}
              </Badge>
            );
          })()}
          <Button
            onClick={() => setShowHolidayModal(true)}
            className="flex w-full items-center bg-green-600 text-white hover:bg-green-700 sm:w-auto"
            variant="default"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Manage Holidays
          </Button>
          <Button
            onClick={() => fetchAttendanceSummary(selectedDate)}
            className="flex w-full items-center bg-[#6096ba] text-white hover:bg-[#274c77] sm:w-auto"
            disabled={loadingSummary}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingSummary ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>


      {/* Attendance Summary */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-[#a3cef1] p-4 sm:p-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-[#274c77] flex items-center">
            <Calendar className="h-5 sm:h-6 w-5 sm:w-6 mr-2" />
            Today's({new Date(selectedDate).toLocaleDateString()})
          </h2>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
                <SelectTrigger className="w-full sm:w-40">
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
                <SelectTrigger className="w-full sm:w-40">
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
                <SelectTrigger className="w-full sm:w-36">
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
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#a3cef1] bg-[#f8fbff] px-4 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#6096ba]/30 border-t-[#6096ba] animate-spin"></div>
            <span className="text-sm font-medium text-gray-600 sm:text-base">Loading attendance summary...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {classroomAttendanceSummary
              .filter((summary) => {
                // Hide approved attendance cards from coordinator dashboard
                const st = summary.status;
                return st !== 'approved' && st !== 'Approved';
              })
              .sort((a, b) => {
                // Sort by grade order first, then by section
                const aSort = normalizeGradeForSort(a.classroom_name);
                const bSort = normalizeGradeForSort(b.classroom_name);
                
                if (aSort.gradeOrder !== bSort.gradeOrder) {
                  return aSort.gradeOrder - bSort.gradeOrder;
                }
                
                // If same grade, sort by section (A, B, C, etc.)
                return aSort.section.localeCompare(bSort.section);
              })
              .map((summary) => {
              const hasCounts = (summary.present_count || 0) + (summary.absent_count || 0) + (summary.leave_count || 0) > 0;
              const st = summary.status;
              const badgeLabel = summary.is_holiday ? 'Holiday' : (summary.display_status || ((st && st !== 'not_marked') ? (st.charAt(0).toUpperCase() + st.slice(1)) : (hasCounts ? 'Marked' : 'Not Marked')));
              const badgeClass = summary.is_holiday ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                st === 'approved' ? 'bg-green-100 text-green-800 border-green-300' :
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
                    {summary.is_holiday && <Calendar className="h-3 w-3 mr-1" />}
                    {badgeLabel}
                  </Badge>
                </div>
                {summary.is_holiday ? (
                  <div className="text-center py-4">
                    <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-200">
                      <Calendar className="h-8 w-8 mx-auto mb-2 text-yellow-600" />
                      <div className="text-lg font-semibold text-yellow-800 mb-1">Holiday</div>
                      <div className="text-sm text-yellow-700">{summary.holiday_reason || 'Holiday'}</div>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>


      {/* Dialog: Attendance sheet preview & approval */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeClassroomDialog(); setIsDialogOpen(open); }}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader className="space-y-1 text-center sm:text-left">
            <DialogTitle className="text-lg font-semibold sm:text-xl">
              {selectedHoliday 
                ? `${activeClassroomName ? activeClassroomName : 'Class'} — Holiday` 
                : activeClassroomName ? `${activeClassroomName} — Attendance` : 'Attendance'
              }
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {selectedHoliday 
                ? 'Holiday information for this date.'
                : 'Review the attendance sheet submitted by the teacher. You can approve it to finalize.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4 sm:space-y-6">
            {selectedHoliday ? (
              <div className="space-y-4">
                <div className="bg-yellow-50 rounded-lg p-6 border-2 border-yellow-200 text-center">
                  <Calendar className="h-16 w-16 mx-auto mb-4 text-yellow-600" />
                  <div className="text-2xl font-bold text-yellow-800 mb-2">Holiday Declared</div>
                  <div className="text-lg text-yellow-700 mb-4">{selectedHoliday.reason}</div>
                  <div className="text-sm text-yellow-600">
                    Date: {new Date(selectedHoliday.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  {selectedHoliday.created_by && (
                    <div className="text-sm text-yellow-600 mt-2">
                      Created by: {selectedHoliday.created_by}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* current status is shown below; isApprovable is derived above and used for the Approve button */}
                {attendanceData && attendanceData.length > 0 ? (
              <div className="space-y-4">
                <div className="text-sm text-gray-700">Status: <strong>{attendanceData[0].display_status || attendanceData[0].status || 'Not Marked'}</strong></div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-700 font-medium">Coordinator's Comment:</label>
                  <Input 
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    placeholder="Add your comment (optional)"
                    className="w-full"
                  />
                </div>
                <div className="overflow-auto max-h-[55vh] rounded border">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="bg-gray-100 text-gray-700">
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
                ) : loadingAttendance ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#a3cef1] bg-[#f8fbff] px-4 py-10 text-center text-gray-600">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#6096ba]/30 border-t-[#6096ba] animate-spin"></div>
                    <span className="text-sm font-medium">Loading attendance...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#a3cef1] bg-[#f8fbff] px-4 py-10 text-center">
                    <AlertCircle className="h-12 w-12 text-gray-400" />
                    <div className="space-y-2">
                      <p className="text-base font-semibold text-gray-700">No Attendance Marked</p>
                      <p className="text-sm text-gray-500">
                        Attendance has not been marked for this class on {new Date(selectedDate).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}.
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        Please wait for the teacher to mark attendance before you can review and approve it.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <div className="flex w-full flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
              <button onClick={closeClassroomDialog} className="w-full px-4 py-2 border rounded sm:w-auto">Close</button>
              {!selectedHoliday && (
                <>
                  <button
                    onClick={saveAttendanceChanges}
                    disabled={!canEditAttendance || savingAttendance || !(editedAttendance && editedAttendance.length > 0)}
                    className="w-full px-4 py-2 bg-[#2c7a7b] text-white rounded disabled:opacity-60 sm:w-auto"
                  >{savingAttendance ? 'Saving...' : 'Save Remarks'}</button>
                  <button
                    onClick={approveAttendance}
                    disabled={!canApproveAttendance || approving || !(attendanceData && attendanceData.length > 0) || !canClickApprove}
                    title={isAlreadyApproved ? 'Attendance is already approved' : (!isMarkedOrAllowedStatus ? 'Only draft/submitted/under review or marked attendance can be approved' : undefined)}
                    className="w-full px-4 py-2 bg-[#274c77] text-white rounded disabled:opacity-60 sm:w-auto"
                  >{approving ? 'Approving...' : 'Approve'}</button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* tablist wala kam yaha tha  */}

      {/* Holiday Assignment Modal */}
      {/* Holiday Management Modal - Full CRUD */}
      <Dialog open={showHolidayModal} onOpenChange={setShowHolidayModal}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Calendar className="h-5 w-5" />
              Manage Holidays
            </DialogTitle>
            <DialogDescription>
              View, create, update, and delete holidays for your assigned levels
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden min-h-0">
            <CoordinatorHolidayManagement
              levels={availableLevels.length > 0
                ? availableLevels
                : (coordinatorProfile?.assigned_levels || []).map((level: any) => ({
                    id: level.id,
                    name: level.name,
                    shift: levelShiftSummary[level.id] || 'both',
                  }))
              }
              onSuccess={() => {
                fetchAttendanceSummary(selectedDate)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
