"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Edit2 } from "lucide-react";
import { getAllCampuses, getShiftTimings, createShiftTiming, updateShiftTiming, deleteShiftTiming, getUserCampusId } from "@/lib/api";

export default function PrincipalShiftTimingsPage() {
  const [campuses, setCampuses] = useState<any[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("morning");
  const [timetableType, setTimetableType] = useState<string>("class");
  const [shiftTimings, setShiftTimings] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", order: 1, start_time: "", end_time: "", is_break: false, days: [] as string[], timetable_type: "class" });
  const [editId, setEditId] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Manage Shift Timings | Principal";
    fetchCampuses();
  }, []);

  useEffect(() => {
    if (selectedCampus && selectedShift && timetableType) fetchTimings();
  }, [selectedCampus, selectedShift, timetableType]);

  async function fetchCampuses() {
    const all = await getAllCampuses();
    const myCampusId = getUserCampusId();
    const filtered = all.filter((c: any) => c.id === myCampusId);
    setCampuses(filtered);
    if (filtered.length > 0) setSelectedCampus(filtered[0].id.toString());
  }

  async function fetchTimings() {
    if (!selectedCampus || !selectedShift || !timetableType) return;
    const timings = await getShiftTimings(Number(selectedCampus), selectedShift);
    const filtered = (timings || []).filter((t: any) => {
      const timingType = t.timetable_type || 'class';
      return timingType === timetableType;
    });
    setShiftTimings(filtered);
  }

  function openDialog(timing?: any) {
    if (timing) {
      setForm({
        name: timing.name,
        order: timing.order,
        start_time: timing.start_time,
        end_time: timing.end_time,
        is_break: timing.is_break,
        days: timing.days || [],
        timetable_type: timing.timetable_type || timetableType,
      });
      setEditId(timing.id);
    } else {
      setForm({ name: "", order: shiftTimings.length + 1, start_time: "", end_time: "", is_break: false, days: [], timetable_type: timetableType });
      setEditId(null);
    }
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.start_time || !form.end_time) {
      alert("Please fill all fields");
      return;
    }

    const timingData = {
      ...form,
      campus: Number(selectedCampus),
      shift: selectedShift,
    };

    console.log('=== Sending to API ===');
    console.log('Selected timetable type:', timetableType);
    console.log('Form timetable_type:', form.timetable_type);
    console.log('Final timing data:', timingData);

    try {
      if (editId) {
        await updateShiftTiming(editId, timingData);
      } else {
        await createShiftTiming(timingData);
      }
      setIsDialogOpen(false);
      await fetchTimings();
      alert(editId ? "Period updated successfully!" : "Period added successfully!");
    } catch (err: any) {
      console.error('Failed to save timing:', err);

      // Handle specific error messages
      if (err.message && err.message.includes('unique set')) {
        alert(
          `⚠️ Period name "${form.name}" is already used!\n\n` +
          `Please use a unique name for this period.\n\n` +
          `💡 Pro Tip: Add prefix like:\n` +
          `• "CT-Period 1" for Class Timetable\n` +
          `• "TT-Period 1" for Teacher Timetable\n` +
          `• "M-Period 1" for Morning\n` +
          `• "A-Period 1" for Afternoon`
        );
      } else if (err.message) {
        alert(`Failed to save period: ${err.message}`);
      } else {
        alert("Failed to save timing. Please try again.");
      }
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this period?")) return;
    try {
      await deleteShiftTiming(id);
      await fetchTimings();
    } catch {
      alert("Failed to delete period");
    }
  }

  return (
    <div className="w-full px-4 py-4 md:py-8 max-w-6xl mx-auto">
      <Card className="mb-6 shadow-lg">
        <CardHeader className="rounded-t-lg">
          <CardTitle className="text-xl md:text-2xl font-bold">Manage Shift Timings</CardTitle>
          <p className="text-sm md:text-base text-white/90 mt-2">Configure time periods for timetables</p>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {/* Filters Section - Responsive Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
            <div>
              <Label className="text-xs md:text-sm mb-1.5 block">Campus</Label>
              <div className="flex h-10 w-full rounded-md border border-input bg-gray-50 px-3 py-2 text-xs md:text-sm items-center">
                {campuses.find(c => c.id.toString() === selectedCampus)?.campus_name || 'Loading...'}
              </div>
            </div>
            <div>
              <Label className="text-xs md:text-sm mb-1.5 block">Timetable Type</Label>
              <Select value={timetableType} onValueChange={setTimetableType}>
                <SelectTrigger className="h-10 text-xs md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">Class Timetable</SelectItem>
                  <SelectItem value="teacher">Teacher Timetable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs md:text-sm mb-1.5 block">Shift</Label>
              <Select value={selectedShift} onValueChange={setSelectedShift}>
                <SelectTrigger className="h-10 text-xs md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => openDialog()}
                className="w-full h-10 text-xs md:text-sm bg-[#274c77] hover:bg-[#1e3a5f]"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Period
              </Button>
            </div>
          </div>

          {/* Desktop Table View - Hidden on Mobile */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse rounded-lg shadow-sm">
              <thead>
                <tr className="bg-[#274c77] text-white">
                  <th className="p-3 border-r border-white/20 w-16 text-sm">#</th>
                  <th className="p-3 border-r border-white/20 text-sm">Period Name</th>
                  <th className="p-3 border-r border-white/20 text-sm">Start Time</th>
                  <th className="p-3 border-r border-white/20 text-sm">End Time</th>
                  <th className="p-3 border-r border-white/20 text-sm">Break</th>
                  <th className="p-3 text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shiftTimings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <div className="flex flex-col items-center justify-center py-16 px-4 bg-gradient-to-br from-blue-50 to-indigo-50">
                        <div className="bg-white rounded-full p-6 shadow-lg mb-6">
                          <svg className="w-16 h-16 text-[#274c77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">No Time Periods Yet</h3>
                        <p className="text-gray-600 text-center max-w-md mb-6">
                          Get started by adding time periods for your <span className="font-semibold text-[#274c77]">{timetableType === 'class' ? 'Class' : 'Teacher'} Timetable</span> - <span className="font-semibold text-[#274c77]">{selectedShift === 'morning' ? 'Morning' : 'Afternoon'} Shift</span>
                        </p>
                        <Button
                          onClick={() => openDialog()}
                          className="bg-[#274c77] hover:bg-[#1e3a5f] shadow-lg"
                          size="lg"
                        >
                          <Plus className="mr-2 h-5 w-5" />
                          Add Your First Period
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  shiftTimings.map((timing: any, idx: number) => (
                    <tr key={timing.id} className={timing.is_break ? 'bg-yellow-50' : idx % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fa]'}>
                      <td className="p-3 border-r text-gray-500 font-medium text-sm">{idx + 1}</td>
                      <td className="p-3 border-r font-semibold text-sm">{timing.name}</td>
                      <td className="p-3 border-r text-sm">{timing.start_time.slice(0, 5)}</td>
                      <td className="p-3 border-r text-sm">{timing.end_time.slice(0, 5)}</td>
                      <td className="p-3 border-r text-center">
                        {timing.is_break && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Break</span>}
                      </td>
                      <td className="p-3 flex gap-2 justify-center">
                        <Button size="sm" variant="outline" onClick={() => openDialog(timing)}>
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(timing.id)}>
                          <X size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View - Shown on Mobile */}
          <div className="md:hidden space-y-3">
            {shiftTimings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
                <div className="bg-white rounded-full p-5 shadow-lg mb-5">
                  <svg className="w-12 h-12 text-[#274c77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2 text-center">No Time Periods Yet</h3>
                <p className="text-sm text-gray-600 text-center mb-5 px-2">
                  Add time periods for <span className="font-semibold text-[#274c77]">{timetableType === 'class' ? 'Class' : 'Teacher'}</span> - <span className="font-semibold text-[#274c77]">{selectedShift === 'morning' ? 'Morning' : 'Afternoon'}</span>
                </p>
                <Button
                  onClick={() => openDialog()}
                  className="bg-[#274c77] hover:bg-[#1e3a5f] shadow-lg w-full max-w-xs"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Period
                </Button>
                <p className="text-xs text-gray-500 mt-4 text-center px-4">
                  💡 Tip: Use unique names like "CT-Period 1" or "TT-Period 1"
                </p>
              </div>
            ) : (
              shiftTimings.map((timing: any, idx: number) => (
                <Card key={timing.id} className={`${timing.is_break ? 'bg-yellow-50 border-yellow-300' : 'bg-white'} shadow-sm`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#274c77] text-white text-xs font-bold">
                          {idx + 1}
                        </span>
                        <h3 className="font-semibold text-sm">{timing.name}</h3>
                      </div>
                      {timing.is_break && (
                        <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded font-medium">
                          Break
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                      <div className="bg-gray-50 p-2 rounded">
                        <p className="text-gray-500 mb-0.5">Start Time</p>
                        <p className="font-semibold">{timing.start_time.slice(0, 5)}</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <p className="text-gray-500 mb-0.5">End Time</p>
                        <p className="font-semibold">{timing.end_time.slice(0, 5)}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs"
                        onClick={() => openDialog(timing)}
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 px-3"
                        onClick={() => handleDelete(timing.id)}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog - Responsive */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg">{editId ? "Edit Period" : "Add Period"}</DialogTitle>
            <p className="text-xs text-gray-600 mt-1">
              💡 Use unique names (e.g., CT-P1, TT-P1) to avoid conflicts
            </p>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 py-4">
            <div className="md:col-span-1">
              <Label className="text-xs md:text-sm mb-1.5 block">Period Name</Label>
              <Input
                className="h-10 text-sm"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., CT-Period 1"
              />
            </div>
            <div className="md:col-span-1">
              <Label className="text-xs md:text-sm mb-1.5 block">Order</Label>
              <Input
                className="h-10 text-sm"
                type="number"
                value={form.order}
                onChange={e => setForm({ ...form, order: Number(e.target.value) })}
              />
            </div>
            <div className="md:col-span-1">
              <Label className="text-xs md:text-sm mb-1.5 block">Start Time</Label>
              <Input
                className="h-10 text-sm"
                type="time"
                value={form.start_time}
                onChange={e => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div className="md:col-span-1">
              <Label className="text-xs md:text-sm mb-1.5 block">End Time</Label>
              <Input
                className="h-10 text-sm"
                type="time"
                value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={form.is_break}
                  onChange={e => setForm({ ...form, is_break: e.target.checked })}
                />
                <span className="text-xs md:text-sm">This is a break period</span>
              </label>
            </div>
            <div className="col-span-1 md:col-span-2">
              {form.is_break && (
                <>
                  <Label className="text-xs md:text-sm mb-2 block">Apply to specific days (optional)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => (
                      <label key={day} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          checked={form.days.includes(day)}
                          onChange={e => {
                            if (e.target.checked) setForm(f => ({ ...f, days: [...f.days, day] }));
                            else setForm(f => ({ ...f, days: f.days.filter(d => d !== day) }));
                          }}
                        />
                        <span className="text-xs md:text-sm">{day.slice(0, 3)}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="w-full sm:w-auto text-sm h-10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-sm h-10"
            >
              {editId ? "Update" : "Add"} Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
