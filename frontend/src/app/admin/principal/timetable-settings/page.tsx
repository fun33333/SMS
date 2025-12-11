"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Calendar, Users } from "lucide-react";
import { getAllCampuses, getUserCampusId, getShiftTimings } from "@/lib/api";

type TimetableType = 'class' | 'teacher';
type ShiftType = 'morning' | 'afternoon';

export default function PrincipalTimetableSettingsPage() {
  const [campuses, setCampuses] = useState<any[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string>("");
  const [timetableType, setTimetableType] = useState<TimetableType>('class');
  const [shiftType, setShiftType] = useState<ShiftType>('morning');

  // Timings for each combination
  const [classTimings, setClassTimings] = useState<{ morning: any[], afternoon: any[] }>({ morning: [], afternoon: [] });
  const [teacherTimings, setTeacherTimings] = useState<{ morning: any[], afternoon: any[] }>({ morning: [], afternoon: [] });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Timetable Settings | Principal";
    fetchCampuses();
  }, []);

  useEffect(() => {
    if (selectedCampus) {
      fetchAllTimings();
    }
  }, [selectedCampus]);

  async function fetchCampuses() {
    const all = await getAllCampuses();
    const myCampusId = getUserCampusId();
    const filtered = all.filter((c: any) => c.id === myCampusId);
    setCampuses(filtered);
    if (filtered.length > 0) setSelectedCampus(filtered[0].id.toString());
  }

  async function fetchAllTimings() {
    if (!selectedCampus) return;
    setLoading(true);
    try {
      // Fetch all timings and filter by timetable_type
      const [morningTimings, afternoonTimings] = await Promise.all([
        getShiftTimings(Number(selectedCampus), 'morning'),
        getShiftTimings(Number(selectedCampus), 'afternoon')
      ]);

      // Filter class timings
      const classMorning = (morningTimings || []).filter((t: any) => (t.timetable_type || 'class') === 'class');
      const classAfternoon = (afternoonTimings || []).filter((t: any) => (t.timetable_type || 'class') === 'class');

      // Filter teacher timings
      const teacherMorning = (morningTimings || []).filter((t: any) => t.timetable_type === 'teacher');
      const teacherAfternoon = (afternoonTimings || []).filter((t: any) => t.timetable_type === 'teacher');

      setClassTimings({ morning: classMorning, afternoon: classAfternoon });
      setTeacherTimings({ morning: teacherMorning, afternoon: teacherAfternoon });
    } catch (error) {
      console.error('Failed to fetch timings:', error);
    } finally {
      setLoading(false);
    }
  }

  function getCurrentTimings() {
    if (timetableType === 'class') {
      return shiftType === 'morning' ? classTimings.morning : classTimings.afternoon;
    } else {
      return shiftType === 'morning' ? teacherTimings.morning : teacherTimings.afternoon;
    }
  }

  function navigateToShiftTimings() {
    window.location.href = '/admin/principal/shift-timings';
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <Card className="mb-6 border-t-4 border-t-[#274c77]">
        <CardHeader className="bg-gradient-to-r from-[#274c77] to-[#1e3a5f] text-white rounded-t-lg">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-6 h-6" />
            Timetable Settings Overview
          </CardTitle>
          <p className="text-sm text-white/80 mt-2">
            Configure different timetable timings for classes and teachers across morning and afternoon shifts
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Campus</label>
            <div className="flex h-10 max-w-md rounded-md border border-input bg-gray-50 px-3 py-2 text-sm items-center">
              {campuses.find(c => c.id.toString() === selectedCampus)?.campus_name || 'Loading...'}
            </div>
          </div>

          <Tabs value={timetableType} onValueChange={(v) => setTimetableType(v as TimetableType)}>
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
              <TabsTrigger value="class" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Class Timetable
              </TabsTrigger>
              <TabsTrigger value="teacher" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Teacher Timetable
              </TabsTrigger>
            </TabsList>

            <TabsContent value="class">
              <ShiftTimingsView
                shiftType={shiftType}
                setShiftType={setShiftType}
                timings={getCurrentTimings()}
                loading={loading}
                timetableType="Class"
                onManageClick={navigateToShiftTimings}
              />
            </TabsContent>

            <TabsContent value="teacher">
              <ShiftTimingsView
                shiftType={shiftType}
                setShiftType={setShiftType}
                timings={getCurrentTimings()}
                loading={loading}
                timetableType="Teacher"
                onManageClick={navigateToShiftTimings}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg mb-1">Manage Time Periods</h3>
              <p className="text-sm text-gray-600">
                Click below to add, edit, or remove time periods for each shift
              </p>
            </div>
            <Button
              onClick={navigateToShiftTimings}
              className="bg-[#274c77] hover:bg-[#1e3a5f]"
            >
              <Clock className="w-4 h-4 mr-2" />
              Manage Shift Timings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ShiftTimingsView({
  shiftType,
  setShiftType,
  timings,
  loading,
  timetableType,
  onManageClick
}: {
  shiftType: ShiftType;
  setShiftType: (s: ShiftType) => void;
  timings: any[];
  loading: boolean;
  timetableType: string;
  onManageClick: () => void;
}) {
  return (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Shift</label>
        <Select value={shiftType} onValueChange={(v) => setShiftType(v as ShiftType)}>
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="morning">Morning Shift</SelectItem>
            <SelectItem value="afternoon">Afternoon Shift</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <h3 className="font-semibold text-lg mb-4 text-gray-800">
          {timetableType} Timetable - {shiftType === 'morning' ? 'Morning' : 'Afternoon'} Shift
        </h3>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading timings...</div>
        ) : timings.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">No time periods configured for this shift yet.</p>
            <Button onClick={onManageClick} variant="outline">
              <Clock className="w-4 h-4 mr-2" />
              Add Time Periods
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
              <thead>
                <tr className="bg-[#274c77] text-white">
                  <th className="p-3 text-left border-r border-white/20">#</th>
                  <th className="p-3 text-left border-r border-white/20">Period Name</th>
                  <th className="p-3 text-left border-r border-white/20">Start Time</th>
                  <th className="p-3 text-left border-r border-white/20">End Time</th>
                  <th className="p-3 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {timings.map((timing: any, idx: number) => (
                  <tr
                    key={timing.id}
                    className={timing.is_break ? 'bg-yellow-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="p-3 border-r border-gray-200 font-medium text-gray-600">{idx + 1}</td>
                    <td className="p-3 border-r border-gray-200 font-semibold">{timing.name}</td>
                    <td className="p-3 border-r border-gray-200">{timing.start_time.slice(0, 5)}</td>
                    <td className="p-3 border-r border-gray-200">{timing.end_time.slice(0, 5)}</td>
                    <td className="p-3">
                      {timing.is_break ? (
                        <span className="inline-block px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded font-medium">
                          Break
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded font-medium">
                          Period
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> These timings will be used for {timetableType.toLowerCase()} timetable generation.
          Coordinators will only see timetables matching their assigned shift ({shiftType}).
        </p>
      </div>
    </div>
  );
}
