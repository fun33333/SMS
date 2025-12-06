"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, User, Book, Clock, AlertCircle, GraduationCap } from "lucide-react";
import {getCoordinatorTeachers,getCoordinatorClasses,getSubjects,getClassTimetable,
  getTeacherTimetable,getShiftTimings,getStoredUserProfile,createClassTimetable,
  createTeacherTimetable,deleteClassTimetable,deleteTeacherTimetable,bulkCreateTeacherPeriods}from "@/lib/api";

// Define ShiftTiming type
type ShiftTiming = {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  is_break?: boolean;
  days?: string[];
  order?: number;
  timetable_type?: string;
};

// Define WEEK_DAYS constant
const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

// ...existing code...
  // Teacher interface
  interface Teacher {
    id: number;
    full_name: string;
    employee_code: string;
  }

  export default function Page() {
    // State declarations
    const [timetableType, setTimetableType] = useState<'class' | 'teacher'>('class');
    const [selectedShift, setSelectedShift] = useState<string>('morning');
    const [coordinatorShifts, setCoordinatorShifts] = useState<string[]>([]);
    const [classrooms, setClassrooms] = useState<any[]>([]);
    const [availableGrades, setAvailableGrades] = useState<string[]>([]);
    const [selectedGrade, setSelectedGrade] = useState<string>("");
    const [availableSections, setAvailableSections] = useState<string[]>([]);
    const [selectedSection, setSelectedSection] = useState<string>("");
  // ...existing code...
  // Teacher View States
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");

  // Timetable Data
  const [timeSlots, setTimeSlots] = useState<ShiftTiming[]>([]);
  const [timetableData, setTimetableData] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // Dialog States
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState<{
    day: string;
    slotId: number;
    startTime: string;
    endTime: string;
    existingId?: number;
    subjectId?: string;
    teacherId?: string;
    classroomId?: string; // For teacher view
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch time slots when shift changes
  useEffect(() => {
    if (selectedShift) {
      fetchTimeSlots();
    }
  }, [selectedShift, timetableType]);

  // Fetch timetable when selection changes
  // Update sections when grade changes
  useEffect(() => {
    if (selectedGrade && classrooms.length > 0) {
      const sections = Array.from(new Set(
        classrooms
          .filter((c: any) => c.grade === selectedGrade)
          .map((c: any) => c.section)
          .filter(Boolean)
      )).sort();

      console.log(`Sections for grade ${selectedGrade}:`, sections);
      setAvailableSections(sections);

      // Set first section as default
      if (sections.length > 0 && !sections.includes(selectedSection)) {
        setSelectedSection(sections[0]);
      }
    }
  }, [selectedGrade, classrooms]);

  useEffect(() => {
    if (timetableType === 'class' && selectedGrade && selectedSection) {
      fetchTimetable();
    } else if (timetableType === 'teacher' && selectedTeacherId) {
      fetchTimetable();
    }
  }, [timetableType, selectedGrade, selectedSection, selectedTeacherId, selectedShift]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const userProfile = getStoredUserProfile();

      console.log('=== COORDINATOR PROFILE ===');
      console.log('User Profile:', userProfile);

      // Fetch classes first to detect shifts
      const initialClassesData = (await getCoordinatorClasses()) as any[];
      console.log('Total classes:', initialClassesData.length);
      console.log('Sample class data:', initialClassesData[0]);

      // Extract unique shifts from classes
      const uniqueShifts = Array.from(new Set(
        initialClassesData.map((c: any) => c.shift).filter(Boolean)
      )) as string[];

      console.log('Unique shifts detected:', uniqueShifts);

      // Set coordinator shifts
      let shifts: string[] = [];
      if (uniqueShifts.length > 1) {
        // Both shifts available
        console.log('✅ Coordinator has BOTH shifts!');
        shifts = uniqueShifts.sort();
        setCoordinatorShifts(shifts);
        setSelectedShift(shifts.includes('morning') ? 'morning' : shifts[0]);
      } else if (uniqueShifts.length === 1) {
        // Single shift
        console.log('✅ Coordinator has single shift:', uniqueShifts[0]);
        shifts = uniqueShifts;
        setCoordinatorShifts(shifts);
        setSelectedShift(shifts[0]);
      } else {
        // Fallback
        console.log('⚠️ No shifts detected, using default');
        shifts = ['morning'];
        setCoordinatorShifts(shifts);
        setSelectedShift('morning');
      }

      // Fetch teachers and subjects (classes already fetched above)
      const coordinatorId = userProfile?.coordinator_id || 0;

      const [teachersData, subjectsData] = await Promise.all([
        getCoordinatorTeachers(coordinatorId),
        getSubjects()
      ]) as [any, any[]];

      console.log('API Responses:', { classesData: initialClassesData, teachersData, subjectsData });

      // Ensure all data is arrays
      const safeClasses = Array.isArray(initialClassesData) ? initialClassesData : [];
      // Extract teachers array from response object
      const safeTeachers = Array.isArray(teachersData)
        ? teachersData
        : ((teachersData as any)?.teachers || []);
      const safeSubjects = Array.isArray(subjectsData) ? subjectsData : [];

      console.log('Safe Arrays:', { safeClasses, safeTeachers, safeSubjects });

      setClassrooms(safeClasses);
      setTeachers(safeTeachers);
      setSubjects(safeSubjects);

      // Set available grades from classes
      console.log('Extracting grades from classes...');
      console.log('Sample class:', safeClasses[0]);

      const grades = Array.from(new Set(
        safeClasses.map((c: any) => c.grade).filter(Boolean)  // grade is string, not object
      )).sort();

      console.log('Extracted grades:', grades);
      console.log('Grades length:', grades.length);

      setAvailableGrades(grades as string[]);
      if (grades.length > 0) setSelectedGrade(grades[0] as string);

      console.log('Available grades state will be set to:', grades);


    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeSlots = async () => {
    try {
      const campusId = parseInt(localStorage.getItem('sis_campus_id') || '1');
      const timings = await getShiftTimings(campusId, selectedShift);

      // Filter by timetable type
      const filtered = (timings || []).filter((t: any) =>
        (t.timetable_type || 'class') === timetableType
      );

      // Sort by order
      filtered.sort((a: any, b: any) => a.order - b.order);
      setTimeSlots(filtered);
    } catch (error) {
      console.error('Error fetching time slots:', error);
    }
  };

  const fetchTimetable = async () => {
    try {
      let data: any[] = [];

      if (timetableType === 'class') {
        const classroom = classrooms.find(
          c => c.grade === selectedGrade && c.section === selectedSection
        );
        if (classroom) {
          data = await getClassTimetable({ classroom: classroom.id }) as any[];
        }
      } else {
        if (selectedTeacherId) {
          data = await getTeacherTimetable({ teacher: parseInt(selectedTeacherId) }) as any[];
        }
      }

      setTimetableData(data || []);
    } catch (error) {
      console.error('Error fetching timetable:', error);
      setTimetableData([]);
    }
  };

  const getAssignment = (day: string, slotId: number) => {
    return timetableData.find(
      (t: any) => t.day.toLowerCase() === day.toLowerCase() &&
        t.start_time === timeSlots.find(s => s.id === slotId)?.start_time
    );
  };

  const isBreakTime = (slot: ShiftTiming, day: string) => {
    return slot.is_break || (slot.days && slot.days.length > 0 && !slot.days.includes(day));
  };

  const handleCellClick = (day: string, slot: ShiftTiming, assignment: any) => {
    if (isBreakTime(slot, day)) return;

    // For Class Timetable, we need subject and teacher
    // For Teacher Timetable, we need subject and classroom

    setDialogData({
      day,
      slotId: slot.id,
      startTime: slot.start_time,
      endTime: slot.end_time,
      existingId: assignment?.id,
      subjectId: assignment?.subject?.toString() || "",
      teacherId: assignment?.teacher?.toString() || "",
      classroomId: assignment?.classroom?.toString() || "",
    });

    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!dialogData) return;

    try {
      setIsSaving(true);

      const commonData = {
        // Backend DAY_CHOICES use lowercase keys like 'monday', 'tuesday', etc.
        day: (dialogData.day || '').toString().toLowerCase(),
        start_time: dialogData.startTime,
        end_time: dialogData.endTime,
        subject: parseInt(dialogData.subjectId || "0"),
      };

      if (timetableType === 'class') {
        const classroom = classrooms.find(
          c => c.grade === selectedGrade && c.section === selectedSection
        );

        if (!classroom) {
          alert("Classroom not found!");
          return;
        }

        const payload = {
          ...commonData,
          classroom: classroom.id,
          teacher: parseInt(dialogData.teacherId || "0"),
        };

        if (dialogData.existingId) {
          // Update logic would go here if API supports it, for now we can maybe delete and create?
          // Or just create (backend might handle upsert or error)
          // If update endpoint is different, we'd need that. Assuming create for now or if ID exists handle accordingly.
          // Actually, standard is usually PUT for update. I'll use create for now as requested "assign", but for existing maybe I should offer delete.
          alert("Update not fully implemented yet - try deleting first");
        } else {
          await createClassTimetable(payload);
        }
      } else {
        // Teacher Timetable
        // We need to know which classroom to assign
        // But wait, the API createTeacherTimetable might be creating a TeacherTimeTable record...
        // Actually, typically ClassTimeTable is the source of truth.
        // If we are "assigning" for a teacher, we are essentially creating a ClassTimeTable entry where this teacher teaches a subject in a classroom.

        // However, if the backend has separate TeacherTimeTable model (it does), how are they synced?
        // Is TeacherTimeTable manual?
        // The backend serializer shows TeacherTimeTable model.

        const payload = {
          ...commonData,
          teacher: parseInt(selectedTeacherId),
          classroom: parseInt(dialogData.classroomId || "0"),
        };

        await createTeacherTimetable(payload);
      }

      setIsDialogOpen(false);
      fetchTimetable(); // Refresh grid

    } catch (error) {
      console.error("Failed to save assignment:", error);
      alert("Failed to save assignment. Please check inputs.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!dialogData?.existingId) return;
    if (!confirm("Are you sure you want to delete this assignment?")) return;

    try {
      setIsSaving(true);
      if (timetableType === 'class') {
        await deleteClassTimetable(dialogData.existingId);
      } else {
        await deleteTeacherTimetable(dialogData.existingId);
      }
      setIsDialogOpen(false);
      fetchTimetable();
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete assignment.");
    } finally {
      setIsSaving(false);
    }
  };


  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Clock className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading timetable...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4">
      {/* Header Card */}
      <Card className="mb-3 sm:mb-4 shadow-lg border-t-4 border-t-blue-600">
        <CardHeader className="py-2 sm:py-3 px-3 sm:px-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="truncate">Timetable Management</span>
            </CardTitle>
            <div className="bg-blue-50 px-2 sm:px-3 py-1 rounded-md border border-blue-200 self-start sm:self-auto">
              <p className="text-xs text-blue-600 font-medium whitespace-nowrap">
                {selectedShift === 'morning' ? 'Morning Shift' : 'Afternoon Shift'}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-4">
          {/* Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            {/* Timetable Type */}
            <div>
              <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 text-gray-700">
                <Book className="inline h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                Timetable Type
              </label>
              <Select value={timetableType} onValueChange={(v: any) => setTimetableType(v)}>
                <SelectTrigger className="h-9 sm:h-11 text-sm border-2 border-blue-200 focus:border-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">
                    <span className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" />
                      Class Timetable
                    </span>
                  </SelectItem>
                  <SelectItem value="teacher">
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Teacher Timetable
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Shift Selector (only if multiple shifts) */}
            {coordinatorShifts.length > 1 && (
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 text-gray-700">
                  <Clock className="inline h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  Shift
                </label>
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger className="h-9 sm:h-11 text-sm border-2 border-indigo-200 focus:border-indigo-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning Shift</SelectItem>
                    <SelectItem value="afternoon">Afternoon Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Class View Selectors */}
            {timetableType === 'class' && (
              <>
                <div>
                  <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 text-gray-700">Grade</label>
                  <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                    <SelectTrigger className="h-9 sm:h-11 text-sm border-2 border-green-200 focus:border-green-500">
                      <SelectValue placeholder="Select Grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGrades.map((grade) => (
                        <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 text-gray-700">Section</label>
                  <Select value={selectedSection} onValueChange={setSelectedSection}>
                    <SelectTrigger className="h-9 sm:h-11 text-sm border-2 border-purple-200 focus:border-purple-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSections.length > 0 ? (
                        availableSections.map((section) => (
                          <SelectItem key={section} value={section}>{section}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="disabled" disabled>No sections available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Teacher View Selector */}
            {timetableType === 'teacher' && (
              <div className="sm:col-span-2">
                <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 text-gray-700">Teacher</label>
                <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                  <SelectTrigger className="h-9 sm:h-11 text-sm border-2 border-orange-200 focus:border-orange-500">
                    <SelectValue placeholder="Select Teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id.toString()}>
                        {teacher.full_name} ({teacher.employee_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timetable Grid */}
      <Card className="shadow-xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                {/* No Save buttons for teacher timetable in coordinator view */}
                <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                  <th className="p-2 sm:p-4 text-left text-xs sm:text-sm font-semibold border-r border-slate-600 sticky left-0 bg-slate-700 z-10 min-w-[100px] sm:min-w-[120px]">
                    Time / Day
                  </th>
                  {WEEK_DAYS.map((day) => (
                    <th key={day} className="p-2 sm:p-4 text-center text-xs sm:text-sm font-semibold border-r border-slate-600 last:border-r-0 min-w-[100px] sm:min-w-[120px]">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center">
                      <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg font-medium">No time slots configured</p>
                      <p className="text-gray-400 text-sm mt-2">Please configure shift timings first</p>
                    </td>
                  </tr>
                ) : (
                  timeSlots.map((slot) => (
                    <tr key={slot.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 border-b border-r font-medium text-sm bg-gray-50 sticky left-0 z-10">
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-semibold">{slot.name}</span>
                          <span className="text-xs text-gray-500">
                            {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                          </span>
                        </div>
                      </td>
                      {WEEK_DAYS.map((day) => {
                        const assignment = getAssignment(day, slot.id);
                        const isBreak = isBreakTime(slot, day);

                        return (
                          <td
                            key={day}
                            className={`p-2 border-b border-r last:border-r-0 ${isBreak
                              ? 'bg-yellow-50'
                              : 'bg-white hover:bg-blue-50 cursor-pointer'
                              }`}
                            onClick={() => handleCellClick(day, slot, assignment)}
                          >
                            {isBreak ? (
                              <div className="text-center py-4">
                                <span className="inline-block bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                                  BREAK
                                </span>
                              </div>
                            ) : assignment ? (
                              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-2 sm:p-3 rounded-lg shadow-md h-full">
                                <div className="font-semibold text-xs sm:text-sm mb-0.5 sm:mb-1">
                                  {assignment.subject_name || assignment.subject?.name || 'N/A'}
                                </div>
                                <div className="text-xs opacity-90">
                                  {timetableType === 'class'
                                    ? (assignment.teacher_name || assignment.teacher?.full_name)
                                    : `${assignment.grade || assignment.classroom?.grade?.name} - ${assignment.section || assignment.classroom?.section}`
                                  }
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4 text-gray-400 text-sm">
                                <span className="opacity-50">Click to assign</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>


      {/* Assignment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {dialogData?.existingId ? 'Edit Assignment' : 'New Assignment'}
            </DialogTitle>
            <DialogDescription>
              {dialogData?.day} - {formatTime(dialogData?.startTime || '')} to {formatTime(dialogData?.endTime || '')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject" className="text-right">
                Subject
              </Label>
              <Select
                value={dialogData?.subjectId}
                onValueChange={(val) => setDialogData(prev => prev ? ({ ...prev, subjectId: val }) : null)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select Subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {timetableType === 'class' ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="teacher" className="text-right">
                  Teacher
                </Label>
                <Select
                  value={dialogData?.teacherId}
                  onValueChange={(val) => setDialogData(prev => prev ? ({ ...prev, teacherId: val }) : null)}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select Teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.full_name} ({t.employee_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // For Teacher View, select Classroom
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="classroom" className="text-right">
                  Classroom
                </Label>
                <Select
                  value={dialogData?.classroomId}
                  onValueChange={(val) => setDialogData(prev => prev ? ({ ...prev, classroomId: val }) : null)}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classrooms.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.grade} - {c.section} {c.shift ? `(${c.shift.charAt(0).toUpperCase() + c.shift.slice(1)})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            {dialogData?.existingId && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isSaving}
                type="button"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
// ...existing code...
}
