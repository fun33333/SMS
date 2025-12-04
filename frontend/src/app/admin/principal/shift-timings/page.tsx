"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { getAllCampuses, getShiftTimings, createShiftTiming, updateShiftTiming, deleteShiftTiming, getUserCampusId } from "@/lib/api";

export default function PrincipalShiftTimingsPage() {
  const [campuses, setCampuses] = useState<any[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("morning");
  const [shiftTimings, setShiftTimings] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", order: 1, start_time: "", end_time: "", is_break: false, days: [] as string[] });
  const [editId, setEditId] = useState<number|null>(null);

  useEffect(() => {
    document.title = "Manage Shift Timings | Principal";
    fetchCampuses();
  }, []);

  useEffect(() => {
    if (selectedCampus && selectedShift) fetchTimings();
  }, [selectedCampus, selectedShift]);

  async function fetchCampuses() {
    const all = await getAllCampuses();
    const myCampusId = getUserCampusId();
    const filtered = all.filter((c: any) => c.id === myCampusId);
    setCampuses(filtered);
    if (filtered.length > 0) setSelectedCampus(filtered[0].id.toString());
  }

  async function fetchTimings() {
    if (!selectedCampus || !selectedShift) return;
    const timings = await getShiftTimings(Number(selectedCampus), selectedShift);
    setShiftTimings(timings || []);
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
      });
      setEditId(timing.id);
    } else {
      setForm({ name: "", order: shiftTimings.length + 1, start_time: "", end_time: "", is_break: false, days: [] });
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
      campus: Number(selectedCampus),
      shift: selectedShift,
      ...form,
    };
    try {
      if (editId) {
        await updateShiftTiming(editId, timingData);
      } else {
        await createShiftTiming(timingData);
      }
      setIsDialogOpen(false);
      await fetchTimings();
    } catch (err) {
      alert("Failed to save timing");
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
    <div className="max-w-3xl mx-auto py-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Manage Shift Timings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <Label>Campus</Label>
              <Select value={selectedCampus} onValueChange={setSelectedCampus}>
                <SelectTrigger><SelectValue placeholder="Select Campus" /></SelectTrigger>
                <SelectContent>
                  {campuses.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.campus_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Shift</Label>
              <Select value={selectedShift} onValueChange={setSelectedShift}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => openDialog()}><Plus className="mr-2" size={16}/>Add Period</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse rounded-lg shadow-sm">
              <thead>
                <tr className="bg-[#274c77] text-white">
                  <th className="p-3 border-r border-white/20 w-16">#</th>
                  <th className="p-3 border-r border-white/20">Period Name</th>
                  <th className="p-3 border-r border-white/20">Start Time</th>
                  <th className="p-3 border-r border-white/20">End Time</th>
                  <th className="p-3 border-r border-white/20">Break</th>
                  <th className="p-3 border-r border-white/20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shiftTimings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 p-4">No periods configured yet.</td>
                  </tr>
                ) : (
                  shiftTimings.map((timing: any, idx: number) => (
                    <tr key={timing.id} className={timing.is_break ? 'bg-yellow-50' : idx % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fa]'}>
                      <td className="p-3 border-r text-gray-500 font-medium">{idx + 1}</td>
                      <td className="p-3 border-r font-semibold">{timing.name}</td>
                      <td className="p-3 border-r">{timing.start_time.slice(0,5)}</td>
                      <td className="p-3 border-r">{timing.end_time.slice(0,5)}</td>
                      <td className="p-3 border-r text-center">
                        {timing.is_break && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Break</span>}
                      </td>
                      <td className="p-3 border-r flex gap-2 justify-center">
                        <Button size="sm" variant="outline" onClick={() => openDialog(timing)}>Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(timing.id)}><X size={14}/></Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Period" : "Add Period"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <div>
              <Label>Period Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Period 1, Break" />
            </div>
            <div>
              <Label>Order</Label>
              <Input type="number" value={form.order} onChange={e => setForm({ ...form, order: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Start Time</Label>
              <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <Label>End Time</Label>
              <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_break} onChange={e => setForm({ ...form, is_break: e.target.checked })} />
                <span className="text-sm">This is a break period</span>
              </label>
            </div>
            <div className="col-span-2">
              {form.is_break && (
                <>
                  <Label>Apply to specific days (optional)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => (
                      <label key={day} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.days.includes(day)}
                          onChange={e => {
                            if (e.target.checked) setForm(f => ({ ...f, days: [...f.days, day] }));
                            else setForm(f => ({ ...f, days: f.days.filter(d => d !== day) }));
                          }}
                        />
                        <span className="text-sm">{day}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">{editId ? "Update" : "Add"} Period</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
