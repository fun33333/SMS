"use client";
import React, { useState, useEffect } from "react";
import { getTeacherTimetable, getStoredUserProfile, getShiftTimings } from "@/lib/api";

// --- Types ---
interface PeriodAssignment {
    id: string
    day: string
    timeSlot: string
    grade: string
    section: string
    subject: string
    teacherId: number
    teacherName: string
}

const WEEK_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

// Remove hardcoded TIME_SLOTS

const TeacherTimetablePage = () => {
    const [selectedDay, setSelectedDay] = useState<string>(WEEK_DAYS[0]);
    const [assignments, setAssignments] = useState<PeriodAssignment[]>([]);
    const [teacherName, setTeacherName] = useState<string>("Loading...");
    const [timeSlots, setTimeSlots] = useState<{ id: number; start_time: string; end_time: string; name?: string; is_break?: boolean; days?: string[] }[]>([]);

    // In a real app, we would get the logged-in teacher's ID from context/auth
    // For this demo, we'll try to find the first teacher who has assignments, or just show all for debug
    // or better, let's just show assignments for a specific teacher ID if we knew it.
    // Since we don't have a teacher login flow active here (we are in admin view), 
    // we might want to show a selector OR just show assignments for "Teacher 1" as a demo.
    // However, the user request implies this page is for the teacher to view *their* timetable.
    // Let's assume we can get the teacher ID from localStorage if set, or just filter for *any* assignment to show *something*.

    useEffect(() => {
        const fetchTimetableAndSlots = async () => {
            const userProfile = getStoredUserProfile();
            const teacherId = userProfile?.teacher_id;
            console.log('TeacherTimetablePage: teacherId', teacherId);
            if (!teacherId) {
                setTeacherName("No Data");
                setAssignments([]);
                return;
            }
            setTeacherName(userProfile?.full_name || "No Data");
            try {
                // Fetch time slots from backend (default campusId=1, shift='morning')
                const campusId = parseInt(localStorage.getItem('sis_campus_id') || '1');
                const slots = await getShiftTimings(campusId, 'morning');
                setTimeSlots(slots || []);

                const periods = await getTeacherTimetable({ teacher: teacherId });
                console.log('TeacherTimetablePage: periods from API', periods);
                // Map API response to PeriodAssignment[]
                const formatSlot = (start: string, end: string) => {
                    // Remove seconds, keep HH:MM
                    const s = start.split(":").slice(0, 2).join(":");
                    const e = end.split(":").slice(0, 2).join(":");
                    return `${s} - ${e}`;
                };
                const mapped = (periods || []).map((p: any) => ({
                    id: p.id?.toString() || "",
                    day: p.day?.charAt(0).toUpperCase() + p.day?.slice(1) || "",
                    timeSlot: formatSlot(p.start_time, p.end_time),
                    grade: p.grade || p.classroom?.grade || "",
                    section: p.section || p.classroom?.section || "",
                    subject: p.subject_name || p.subject?.name || "",
                    teacherId: p.teacher || teacherId,
                    teacherName: userProfile?.full_name || "",
                }));
                console.log('TeacherTimetablePage: mapped assignments', mapped);
                mapped.forEach((a: PeriodAssignment, i: number) => {
                    console.log(`Assignment[${i}]: day='${a.day}', timeSlot='${a.timeSlot}', subject='${a.subject}', grade='${a.grade}', section='${a.section}'`);
                });
                setAssignments(mapped);
            } catch (e) {
                setAssignments([]);
                setTimeSlots([]);
            }
        };
        fetchTimetableAndSlots();
    }, []);

    const getPeriodForSlot = (start: string, end: string) => {
        // Robust matching: ignore case, trim spaces
        const slotStr = `${start.split(":").slice(0, 2).join(":")} - ${end.split(":").slice(0, 2).join(":")}`;
        return assignments.find(a =>
            a.day.trim().toLowerCase() === selectedDay.trim().toLowerCase() &&
            a.timeSlot.replace(/\s+/g, '').toLowerCase() === slotStr.replace(/\s+/g, '').toLowerCase()
        );
    };

    const isBreakTime = (timeSlot: string) => timeSlot.includes("11:00 - 11:30");

    return (
        <div className="max-w-8xl mx-auto mt-6 sm:mt-12 px-2 sm:px-6 py-6 sm:py-10 bg-gradient-to-br from-[#e7ecef] to-[#f6f9fb] rounded-3xl shadow-2xl border border-[#b6d0e2]">
            <h2 className="text-[#274c77] font-extrabold text-3xl sm:text-5xl mb-4 tracking-wide text-center drop-shadow-lg">Teacher Timetable</h2>
            <div className="mb-6 sm:mb-8 text-base sm:text-xl text-[#4f5d75] text-center flex flex-col sm:flex-row sm:justify-center gap-2">
                <span className="font-bold text-[#274c77] bg-[#dbeafe] px-3 py-1 rounded-xl shadow">Name: <span className="font-normal">{teacherName}</span></span>
                <span className="font-bold text-[#274c77] bg-[#dbeafe] px-3 py-1 rounded-xl shadow">Role: <span className="font-normal">Class Teacher</span></span>
            </div>
            <div className="flex gap-2 mb-8 border-b border-[#b6d0e2] justify-center overflow-x-auto pb-2">
                {WEEK_DAYS.map((day) => (
                    <button
                        key={day}
                        className={`px-4 sm:px-7 py-2 rounded-t-2xl font-semibold transition-all duration-200 focus:outline-none whitespace-nowrap text-sm sm:text-lg shadow-sm
        ${selectedDay === day
                                ? 'bg-[#6096ba] text-white border-b-4 border-[#274c77] shadow-lg scale-105'
                                : 'bg-[#e7ecef] text-[#4f5d75] hover:bg-[#b6d0e2]/60'}`}
                        onClick={() => setSelectedDay(day)}
                    >
                        {day}
                    </button>
                ))}
            </div>

            <h3 className="text-[#6096ba] font-bold text-xl sm:text-3xl mb-4 text-center drop-shadow">{selectedDay} Periods</h3>
            <div className="overflow-x-auto w-full">
                <table className="min-w-[340px] w-full rounded-2xl overflow-hidden shadow-xl bg-white text-sm sm:text-lg">
                    <thead>
                        <tr>
                            <th className="bg-[#274c77] text-white px-4 sm:px-8 py-3 border-none font-bold text-base sm:text-xl">Time</th>
                            <th className="bg-[#274c77] text-white px-4 sm:px-8 py-3 border-none font-bold text-base sm:text-xl">Subject</th>
                            <th className="bg-[#274c77] text-white px-4 sm:px-8 py-3 border-none font-bold text-base sm:text-xl">Class</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from(new Map(timeSlots.map(s => [s.start_time + '-' + s.end_time, s])).values()).map((slot, idx) => {
                            const isBreak = slot.is_break;
                            const period = getPeriodForSlot(slot.start_time, slot.end_time);

                            // Format time for display (convert 13:00 to 01:00 if needed)
                            const formatDisplayTime = (start: string, end: string) => {
                                const sArr = start.split(":");
                                const eArr = end.split(":");
                                let sHour = parseInt(sArr[0], 10);
                                let eHour = parseInt(eArr[0], 10);
                                const sMin = sArr[1];
                                const eMin = eArr[1];
                                // Convert to 12-hour format
                                sHour = sHour > 12 ? sHour - 12 : sHour;
                                eHour = eHour > 12 ? eHour - 12 : eHour;
                                return `${sHour.toString().padStart(2, '0')}:${sMin} - ${eHour.toString().padStart(2, '0')}:${eMin}`;
                            };
                            const displayTime = formatDisplayTime(slot.start_time, slot.end_time);

                            if (isBreak) {
                                return (
                                    <tr key={idx}>
                                        <td className="px-4 sm:px-8 py-3 text-[#b45309] font-bold text-base sm:text-xl text-center border-none">{displayTime}</td>
                                        <td className="text-center text-[#b45309] font-extrabold uppercase tracking-widest border-none">LUNCH TIME</td>
                                        <td className="text-center text-[#b45309] font-extrabold uppercase tracking-widest border-none">LUNCH TIME</td>
                                    </tr>
                                );
                            }

                            return (
                                <tr key={idx} className="hover:bg-[#e7ecef] transition-all">
                                    <td className="px-4 sm:px-8 py-3 text-[#274c77] border-none text-base sm:text-xl font-semibold text-center">{displayTime}</td>
                                    <td className="px-4 sm:px-8 py-3 border-none text-[#274c77] text-base sm:text-xl text-center">
                                        {period ? <span className="font-bold text-[#6096ba]">{period.subject}</span> : <span className="text-gray-400 italic">Free Period</span>}
                                    </td>
                                    <td className="px-4 sm:px-8 py-3 border-none text-[#274c77] text-base sm:text-xl text-center">
                                        {period ? <span className="font-bold text-[#274c77]">{period.grade} - {period.section}</span> : "-"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {selectedDay === "Friday" && (
                <div className="mt-5 text-[#6096ba] font-bold text-base sm:text-lg text-center">
                    Note: <span className="text-[#274c77]">Friday is a half day. School closes at 12:30pm.</span>
                </div>
            )}
            {selectedDay !== "Friday" && (
                <div className="mt-5 text-[#8b8c89] font-bold text-base sm:text-lg text-center">
                    Note: <span className="text-[#274c77]">School closes at 1:30pm.</span>
                </div>
            )}
        </div>
    );
};

export default TeacherTimetablePage;
