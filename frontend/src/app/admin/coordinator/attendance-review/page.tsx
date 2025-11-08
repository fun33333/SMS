"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar, RefreshCw, AlertCircle, Users, Eye, Edit3, Save } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { getCurrentUserProfile, getCoordinatorClasses, getAttendanceForDate, editAttendance } from "@/lib/api"
import { useRouter } from "next/navigation"
import HolidayManagement from "@/components/attendance/holiday-management"
import BackfillPermission from "@/components/attendance/backfill-permission"



interface CoordinatorProfile {
  level?: {
    id: number;
    name: string;
  };
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
}


export default function AttendanceReviewPage() {
  const [coordinatorProfile, setCoordinatorProfile] = useState<CoordinatorProfile | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [expandedClassroom, setExpandedClassroom] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState(false);
  const [editedAttendance, setEditedAttendance] = useState<any[]>([]);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [classroomAttendanceSummary, setClassroomAttendanceSummary] = useState<any[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const router = useRouter();

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
            summary.push({
              classroom_id: classroom.id,
              classroom_name: classroom.name,
              teacher_name: classroom.class_teacher?.name || 'Not Assigned',
              total_students: (data as any).total_students || 0,
              present_count: (data as any).present_count || 0,
              absent_count: (data as any).absent_count || 0,
              leave_count: (data as any).leave_count || 0,
              status: (data as any).status || 'not_marked',
              marked_by: (data as any).marked_by || 'Not Marked',
              attendance_percentage: (data as any).attendance_percentage || 0
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
    if (classrooms.length > 0) {
      await fetchAttendanceSummaryForClassrooms(classrooms, date);
    }
  };

  // Fetch attendance data for a classroom and specific date
  const fetchClassroomAttendance = async (classroomId: number, date: string) => {
    try {
      setLoadingAttendance(true);
      
      // Fetch attendance data for specific date using getAttendanceForDate
      const data = await getAttendanceForDate(classroomId, date);
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
      
      // If we have data, wrap it in an array for consistency
      if (data && (data as any).id) {
        setAttendanceData([data as any]);
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
  };

  // Toggle classroom expansion
  const toggleClassroomExpansion = async (classroom: ClassroomData) => {
    if (expandedClassroom === classroom.id) {
      // Collapse
      setExpandedClassroom(null);
      setAttendanceData([]);
      setEditingAttendance(false);
      setEditedAttendance([]);
    } else {
      // Expand
      setExpandedClassroom(classroom.id);
      await fetchClassroomAttendance(classroom.id, selectedDate);
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
      if (attendanceData.length > 0 && expandedClassroom) {
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
        
        // Show success message
        alert('Attendance updated successfully!');
        
        // Refresh the data to get updated counts
        await fetchClassroomAttendance(expandedClassroom, selectedDate);
      }
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('Error saving attendance. Please try again.');
    } finally {
      setSavingAttendance(false);
    }
  };

  // Cancel editing
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
      
      if (!profile.level || !profile.level.name) {
        setError("No level assigned to you. Please contact administrator.");
        return;
      }

      setCoordinatorProfile(profile);
      console.log('Coordinator profile:', profile);
      console.log('Coordinator level:', profile.level);
      
      // Fetch classrooms in coordinator's level
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
      
      // Fetch attendance summary for today
      if (classroomsData.length > 0) {
        await fetchAttendanceSummaryForClassrooms(classroomsData, selectedDate);
      }
      
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
      <div className="bg-gradient-to-r from-[#274c77] to-[#6096ba] rounded-2xl p-4 sm:p-6 text-white shadow-xl">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Attendance Review</h1>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-base sm:text-lg">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>{coordinatorProfile?.level?.name} Level</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>{classrooms.length} Classes</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button 
              onClick={fetchCoordinatorData}
              className="bg-white/20 hover:bg-white/30 text-white border border-white/30"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Attendance Summary */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-[#a3cef1] p-4 sm:p-6">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-[#274c77] flex items-center">
            <Calendar className="h-5 sm:h-6 w-5 sm:w-6 mr-2" />
            Today's Attendance Summary ({new Date(selectedDate).toLocaleDateString()})
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                fetchAttendanceSummary(e.target.value);
              }}
              className="w-full sm:w-40"
            />
            <Button 
              onClick={() => fetchAttendanceSummary(selectedDate)}
              className="bg-[#6096ba] hover:bg-[#274c77] text-white"
              disabled={loadingSummary}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingSummary ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {loadingSummary ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6096ba]"></div>
            <span className="ml-2 text-gray-600">Loading attendance summary...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {classroomAttendanceSummary.map((summary) => (
              <div key={summary.classroom_id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{summary.classroom_name}</h3>
                  <Badge 
                    variant="outline"
                    className={
                      summary.status === 'final' ? 'bg-green-100 text-green-800 border-green-300' :
                      summary.status === 'submitted' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                      summary.status === 'under_review' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                      summary.status === 'draft' ? 'bg-gray-100 text-gray-800 border-gray-300' :
                      'bg-red-100 text-red-800 border-red-300'
                    }
                  >
                    {summary.status === 'not_marked' ? 'Not Marked' : 
                     summary.status?.charAt(0).toUpperCase() + summary.status?.slice(1)}
                  </Badge>
                </div>
                <div className="text-xs text-gray-600 mb-2">
                  <div>Teacher: {summary.teacher_name}</div>
                  <div>Marked by: {summary.marked_by}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>Present: {summary.present_count}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>Absent: {summary.absent_count}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Leave: {summary.leave_count}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                    <span>Total: {summary.total_students}</span>
                  </div>
                </div>
                {summary.total_students > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-600 mb-1">Attendance: {summary.attendance_percentage}%</div>
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div 
                        className="bg-[#6096ba] h-1 rounded-full" 
                        style={{ width: `${summary.attendance_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Classrooms List */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-[#a3cef1] p-4 sm:p-6">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-[#274c77] flex items-center">
            <Users className="h-5 sm:h-6 w-5 sm:w-6 mr-2" />
            Classrooms ({classrooms.length})
          </h2>
              <Button 
            onClick={fetchCoordinatorData}
                className="bg-[#6096ba] hover:bg-[#274c77] text-white self-start sm:self-auto"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
              </Button>
            </div>

        {classrooms.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No Classrooms Found</h3>
            <p className="text-gray-500">No classrooms are assigned to your level yet.</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto -mx-4 sm:mx-0 pb-2">
            <TabsList className="flex min-w-[600px] sm:min-w-0 w-full space-x-2 mb-4 sm:mb-6 bg-gray-100 p-1 rounded-lg">
              <TabsTrigger 
                value="all" 
                className="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                All Grades ({classrooms.length})
              </TabsTrigger>
              {getUniqueGrades().map((grade) => {
                const gradeClassrooms = getClassroomsByGrade()[grade] || [];
                return (
                  <TabsTrigger 
                    key={grade} 
                    value={grade} 
                    className="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  >
                    {grade} ({gradeClassrooms.length})
                  </TabsTrigger>
                );
              })}
            </TabsList>
            </div>
            
            {/* All Grades Tab */}
            <TabsContent value="all" className="space-y-3">
              {classrooms.map((classroom) => (
                <div key={classroom.id} className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-base sm:text-lg truncate">{classroom.name}</h3>
                          <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-2 text-sm text-gray-600">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">Students:</span>
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                                {classroom.student_count}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">Teacher:</span>
                              <span className="text-gray-900">
                                {classroom.class_teacher?.name || 'Not Assigned'}
                              </span>
                            </div>
                            {classroom.class_teacher && (
                              <div className="flex items-center space-x-2">
                                <span className="font-medium">Code:</span>
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                                  {classroom.class_teacher.employee_code}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">Shift:</span>
                              <span className="capitalize text-gray-900">{classroom.shift}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">Campus:</span>
                              <span className="text-gray-900">{classroom.campus}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
              <Button 
                variant="outline"
                            size="sm" 
                            className="w-full sm:w-auto border-[#6096ba] text-[#6096ba] hover:bg-[#6096ba] hover:text-white whitespace-nowrap"
                            onClick={() => {
                              router.push(`/admin/teachers/attendance?classroom=${classroom.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
              </Button>
              <Button 
                variant="outline"
                                    size="sm" 
                                    className="w-full sm:w-auto border-yellow-500 text-yellow-500 hover:bg-yellow-50 whitespace-nowrap"
                                    onClick={() => toggleClassroomExpansion(classroom)}
                                    disabled={loadingAttendance}
              >
                                    <Edit3 className="h-4 w-4 mr-1" />
                                    {expandedClassroom === classroom.id ? "Collapse" : "Edit"}
              </Button>
            </div>
            </div>
          </div>
                  </div>
                  
                  {/* Expanded Attendance Sheet */}
                  {expandedClassroom === classroom.id && (
                    <div className="mt-4 border-t pt-4">
                      <div className="mb-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-600" />
                            <label className="text-sm font-medium text-gray-700">Select Date:</label>
                            <Input
                              type="date"
                              value={selectedDate}
                              onChange={(e) => {
                                setSelectedDate(e.target.value);
                                fetchClassroomAttendance(classroom.id, e.target.value);
                              }}
                              className="w-full sm:w-40"
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchClassroomAttendance(classroom.id, selectedDate)}
                            disabled={loadingAttendance}
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${loadingAttendance ? 'animate-spin' : ''}`} />
                            Refresh
                          </Button>
                        </div>
                      </div>
                      
                      {/* Attendance Sheet */}
                      {loadingAttendance ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6096ba]"></div>
                          <span className="ml-2 text-gray-600">Loading attendance...</span>
                        </div>
                      ) : attendanceData.length > 0 ? (
                        <div className="bg-gray-50 rounded-lg p-4">
                              <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-gray-900">Attendance Sheet for {new Date(selectedDate).toLocaleDateString()}</h4>
                                  {!editingAttendance && attendanceData[0]?.student_attendance && attendanceData[0].student_attendance.length > 0 && (
                                    <Button
                                      onClick={startEditingAttendance}
                                      size="sm"
                                      className="bg-[#6096ba] hover:bg-[#274c77] text-white"
                                    >
                                      <Edit3 className="h-4 w-4 mr-1" />
                                      Edit Attendance
                                    </Button>
                                  )}
                                  {editingAttendance && (
                                    <div className="flex space-x-2">
                                      <Button
                                        onClick={saveAttendanceChanges}
                                        size="sm"
                                        disabled={savingAttendance}
                                        className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                                      >
                                        <Save className={`h-4 w-4 mr-1 ${savingAttendance ? 'animate-spin' : ''}`} />
                                        {savingAttendance ? 'Saving...' : 'Save Changes'}
                                      </Button>
                                      <Button
                                        onClick={cancelEditing}
                                        size="sm"
                                        variant="outline"
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center space-x-4 text-sm text-gray-600">
                                  <span><strong>Marked By:</strong> {attendanceData[0]?.marked_by || 'Unknown'}</span>
                                  <span><strong>Total Students:</strong> {attendanceData[0]?.total_students || 0}</span>
                                  <span><strong>Present:</strong> {attendanceData[0]?.present_count || 0}</span>
                                  <span><strong>Absent:</strong> {attendanceData[0]?.absent_count || 0}</span>
                                  <span><strong>Leave:</strong> {attendanceData[0]?.leave_count || 0}</span>
                                  <Badge 
                                    variant={attendanceData[0]?.status === 'final' ? 'default' : 
                                           attendanceData[0]?.status === 'submitted' ? 'secondary' : 'outline'}
                                    className={
                                      attendanceData[0]?.status === 'final' ? 'bg-green-100 text-green-800' :
                                      attendanceData[0]?.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                      attendanceData[0]?.status === 'under_review' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }
                                  >
                                    {attendanceData[0]?.status?.charAt(0).toUpperCase() + attendanceData[0]?.status?.slice(1) || 'Draft'}
                                  </Badge>
                                </div>
                              </div>
                          
                          {/* Student-wise Attendance Table */}
                          {attendanceData[0]?.student_attendance && Array.isArray(attendanceData[0].student_attendance) && attendanceData[0].student_attendance.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse border border-gray-300 bg-white">
                                <thead>
                                  <tr className="bg-gray-100">
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Student</th>
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Student Code</th>
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Gender</th>
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Status</th>
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(editingAttendance ? editedAttendance : attendanceData[0].student_attendance).map((studentRecord: any, index: number) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        <div className="flex items-center space-x-3">
                                          <div className="h-8 w-8 rounded-full bg-[#6096ba] flex items-center justify-center text-white text-sm font-medium">
                                            {studentRecord.student_name?.charAt(0).toUpperCase() || 'S'}
                                          </div>
                                          <span>{studentRecord.student_name || 'Unknown Student'}</span>
                                        </div>
                                      </td>
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                          {studentRecord.student_code || studentRecord.student_id || 'Not Assigned'}
                                        </span>
                                      </td>
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        {studentRecord.student_gender || 'Unknown'}
                                      </td>
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        {editingAttendance ? (
                                          <Select
                                            value={studentRecord.status || 'present'}
                                            onValueChange={(value) => updateStudentStatus(index, value)}
                                          >
                                            <SelectTrigger className="w-32">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="present">Present</SelectItem>
                                              <SelectItem value="absent">Absent</SelectItem>
                                              <SelectItem value="leave">Leave</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Badge 
                                            variant="outline"
                                            className={
                                              studentRecord.status === 'present' ? 'bg-green-100 text-green-800 border-green-300' :
                                              studentRecord.status === 'absent' ? 'bg-red-100 text-red-800 border-red-300' :
                                              studentRecord.status === 'leave' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                              'bg-gray-100 text-gray-800 border-gray-300'
                                            }
                                          >
                                            {studentRecord.status?.charAt(0).toUpperCase() + studentRecord.status?.slice(1) || 'Unknown'}
                                          </Badge>
                                        )}
                                      </td>
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        {editingAttendance ? (
                                          <Textarea
                                            value={studentRecord.remarks || ''}
                                            onChange={(e) => updateStudentRemarks(index, e.target.value)}
                                            placeholder="Add remarks..."
                                            className="min-h-[32px] resize-none"
                                          />
                                        ) : (
                                          <span>{studentRecord.remarks || '-'}</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-center py-8 bg-white rounded-lg">
                              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                              <h4 className="text-lg font-medium text-gray-600 mb-2">No Student Records</h4>
                              <p className="text-gray-500 mb-4">
                                No individual student attendance records found for this date.
                              </p>
                              <div className="text-sm text-gray-400">
                                <p>This could mean:</p>
                                <ul className="list-disc list-inside mt-2 space-y-1">
                                  <li>No attendance was marked for this date</li>
                                  <li>Attendance was marked but student details are not available</li>
                                  <li>Try selecting a different date</li>
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 bg-gray-50 rounded-lg">
                          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <h4 className="text-lg font-medium text-gray-600 mb-2">No Attendance Data</h4>
                          <p className="text-gray-500">
                            No attendance has been marked for this classroom on {new Date(selectedDate).toLocaleDateString()}.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>
            
            {/* Individual Grade Tabs */}
            {getUniqueGrades().map((grade) => {
              const gradeClassrooms = getClassroomsByGrade()[grade] || [];
              return (
                <TabsContent key={grade} value={grade} className="space-y-3">
                  {gradeClassrooms.map((classroom) => (
                    <div key={classroom.id} className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-900 text-base sm:text-lg truncate">{classroom.name}</h3>
                              <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-2 text-sm text-gray-600">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">Students:</span>
                                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                                    {classroom.student_count}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">Teacher:</span>
                                  <span className="text-gray-900">
                                    {classroom.class_teacher?.name || 'Not Assigned'}
                    </span>
                  </div>
                                {classroom.class_teacher && (
                                  <div className="flex items-center space-x-2">
                                    <span className="font-medium">Code:</span>
                                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                                      {classroom.class_teacher.employee_code}
                                    </span>
                </div>
                                )}
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">Shift:</span>
                                  <span className="capitalize text-gray-900">{classroom.shift}</span>
                  </div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">Campus:</span>
                                  <span className="text-gray-900">{classroom.campus}</span>
                </div>
                  </div>
                </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full sm:w-auto border-[#6096ba] text-[#6096ba] hover:bg-[#6096ba] hover:text-white whitespace-nowrap"
                                onClick={() => {
                                  router.push(`/admin/teachers/attendance?classroom=${classroom.id}`);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full sm:w-auto border-yellow-500 text-yellow-500 hover:bg-yellow-50 whitespace-nowrap"
                                onClick={() => toggleClassroomExpansion(classroom)}
                                disabled={loadingAttendance}
                              >
                                <Edit3 className="h-4 w-4 mr-1" />
                                {expandedClassroom === classroom.id ? "Collapse" : "Edit"}
                              </Button>
                </div>
                  </div>
                </div>
                  </div>
                  
                  {/* Expanded Attendance Sheet */}
                  {expandedClassroom === classroom.id && (
                    <div className="mt-4 border-t pt-4">
                      <div className="mb-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4 text-gray-600" />
                            <label className="text-sm font-medium text-gray-700">Select Date:</label>
                            <Input
                              type="date"
                              value={selectedDate}
                              onChange={(e) => {
                                setSelectedDate(e.target.value);
                                fetchClassroomAttendance(classroom.id, e.target.value);
                              }}
                              className="w-full sm:w-40"
                            />
                </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchClassroomAttendance(classroom.id, selectedDate)}
                            disabled={loadingAttendance}
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${loadingAttendance ? 'animate-spin' : ''}`} />
                            Refresh
                          </Button>
                  </div>
                </div>
                      
                      {/* Attendance Sheet */}
                      {loadingAttendance ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6096ba]"></div>
                          <span className="ml-2 text-gray-600">Loading attendance...</span>
                        </div>
                      ) : attendanceData.length > 0 ? (
                        <div className="bg-gray-50 rounded-lg p-4">
                              <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-gray-900">Attendance Sheet for {new Date(selectedDate).toLocaleDateString()}</h4>
                                  {!editingAttendance && attendanceData[0]?.student_attendance && attendanceData[0].student_attendance.length > 0 && (
                                    <Button
                                      onClick={startEditingAttendance}
                                      size="sm"
                                      className="bg-[#6096ba] hover:bg-[#274c77] text-white"
                                    >
                                      <Edit3 className="h-4 w-4 mr-1" />
                                      Edit Attendance
                                    </Button>
                                  )}
                                  {editingAttendance && (
                                    <div className="flex space-x-2">
                                      <Button
                                        onClick={saveAttendanceChanges}
                                        size="sm"
                                        disabled={savingAttendance}
                                        className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                                      >
                                        <Save className={`h-4 w-4 mr-1 ${savingAttendance ? 'animate-spin' : ''}`} />
                                        {savingAttendance ? 'Saving...' : 'Save Changes'}
                                      </Button>
                                      <Button
                                        onClick={cancelEditing}
                                        size="sm"
                                        variant="outline"
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center space-x-4 text-sm text-gray-600">
                                  <span><strong>Marked By:</strong> {attendanceData[0]?.marked_by || 'Unknown'}</span>
                                  <span><strong>Total Students:</strong> {attendanceData[0]?.total_students || 0}</span>
                                  <span><strong>Present:</strong> {attendanceData[0]?.present_count || 0}</span>
                                  <span><strong>Absent:</strong> {attendanceData[0]?.absent_count || 0}</span>
                                  <span><strong>Leave:</strong> {attendanceData[0]?.leave_count || 0}</span>
                                  <Badge 
                                    variant={attendanceData[0]?.status === 'final' ? 'default' : 
                                           attendanceData[0]?.status === 'submitted' ? 'secondary' : 'outline'}
                                    className={
                                      attendanceData[0]?.status === 'final' ? 'bg-green-100 text-green-800' :
                                      attendanceData[0]?.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                      attendanceData[0]?.status === 'under_review' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }
                                  >
                                    {attendanceData[0]?.status?.charAt(0).toUpperCase() + attendanceData[0]?.status?.slice(1) || 'Draft'}
                                  </Badge>
                                </div>
          </div>

                          {/* Student-wise Attendance Table */}
                          {attendanceData[0]?.student_attendance && Array.isArray(attendanceData[0].student_attendance) && attendanceData[0].student_attendance.length > 0 ? (
          <div className="overflow-x-auto">
                              <table className="w-full border-collapse border border-gray-300 bg-white">
              <thead>
                                  <tr className="bg-gray-100">
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Student</th>
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Student Code</th>
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Gender</th>
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Status</th>
                                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                                  {(editingAttendance ? editedAttendance : attendanceData[0].student_attendance).map((studentRecord: any, index: number) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        <div className="flex items-center space-x-3">
                                          <div className="h-8 w-8 rounded-full bg-[#6096ba] flex items-center justify-center text-white text-sm font-medium">
                                            {studentRecord.student_name?.charAt(0).toUpperCase() || 'S'}
                                          </div>
                                          <span>{studentRecord.student_name || 'Unknown Student'}</span>
                                        </div>
                        </td>
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                          {studentRecord.student_code || studentRecord.student_id || 'Not Assigned'}
                                        </span>
                        </td>
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        {studentRecord.student_gender || 'Unknown'}
                    </td>
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        {editingAttendance ? (
                                          <Select
                                            value={studentRecord.status || 'present'}
                                            onValueChange={(value) => updateStudentStatus(index, value)}
                                          >
                                            <SelectTrigger className="w-32">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="present">Present</SelectItem>
                                              <SelectItem value="absent">Absent</SelectItem>
                                              <SelectItem value="leave">Leave</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Badge 
                              variant="outline"
                                            className={
                                              studentRecord.status === 'present' ? 'bg-green-100 text-green-800 border-green-300' :
                                              studentRecord.status === 'absent' ? 'bg-red-100 text-red-800 border-red-300' :
                                              studentRecord.status === 'leave' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                              'bg-gray-100 text-gray-800 border-gray-300'
                                            }
                                          >
                                            {studentRecord.status?.charAt(0).toUpperCase() + studentRecord.status?.slice(1) || 'Unknown'}
                                          </Badge>
                                        )}
                                      </td>
                                      <td className="border border-gray-300 px-3 py-2 text-sm">
                                        {editingAttendance ? (
                                          <Textarea
                                            value={studentRecord.remarks || ''}
                                            onChange={(e) => updateStudentRemarks(index, e.target.value)}
                                            placeholder="Add remarks..."
                                            className="min-h-[32px] resize-none"
                                          />
                                        ) : (
                                          <span>{studentRecord.remarks || '-'}</span>
                                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
                          ) : (
                            <div className="text-center py-8 bg-white rounded-lg">
                              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                              <h4 className="text-lg font-medium text-gray-600 mb-2">No Student Records</h4>
                              <p className="text-gray-500 mb-4">
                                No individual student attendance records found for this date.
                              </p>
                              <div className="text-sm text-gray-400">
                                <p>This could mean:</p>
                                <ul className="list-disc list-inside mt-2 space-y-1">
                                  <li>No attendance was marked for this date</li>
                                  <li>Attendance was marked but student details are not available</li>
                                  <li>Try selecting a different date</li>
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 bg-gray-50 rounded-lg">
                          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <h4 className="text-lg font-medium text-gray-600 mb-2">No Attendance Data</h4>
                          <p className="text-gray-500">
                            No attendance has been marked for this classroom on {new Date(selectedDate).toLocaleDateString()}.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                  ))}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
                  </div>

      {/* Holiday Management and Backfill Permissions - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Holiday Management */}
        {coordinatorProfile?.level && (
          <div className="h-80">
            <HolidayManagement
              levelId={coordinatorProfile.level.id}
              levelName={coordinatorProfile.level.name}
            />
                </div>
        )}

        {/* Backfill Permission Management */}
        <div className="h-80">
          <BackfillPermission
            userRole="coordinator"
            levelId={coordinatorProfile?.level?.id}
          />
                  </div>
                </div>


    </div>
  )
}
