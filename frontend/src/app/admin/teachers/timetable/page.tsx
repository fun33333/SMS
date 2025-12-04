"use client";
import React, { useState, useEffect } from "react";

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

const TIME_SLOTS = [
    "08:00 - 08:45",
    "08:45 - 09:30",
    "09:30 - 10:15",
    "10:15 - 11:00",
    "11:00 - 11:30", // Break
    "11:30 - 12:15",
    "12:15 - 01:00",
    "01:00 - 01:30"  // Last period
]

const TeacherTimetablePage = () => {
    const [selectedDay, setSelectedDay] = useState<string>(WEEK_DAYS[0]);
    const [assignments, setAssignments] = useState<PeriodAssignment[]>([]);
    const [teacherName, setTeacherName] = useState<string>("Loading...");

    // In a real app, we would get the logged-in teacher's ID from context/auth
    // For this demo, we'll try to find the first teacher who has assignments, or just show all for debug
    // or better, let's just show assignments for a specific teacher ID if we knew it.
    // Since we don't have a teacher login flow active here (we are in admin view), 
    // we might want to show a selector OR just show assignments for "Teacher 1" as a demo.
    // However, the user request implies this page is for the teacher to view *their* timetable.
    // Let's assume we can get the teacher ID from localStorage if set, or just filter for *any* assignment to show *something*.

    useEffect(() => {
        const loadData = () => {
            const saved = localStorage.getItem('school_timetable_assignments');
            if (saved) {
                try {
                    const allAssignments: PeriodAssignment[] = JSON.parse(saved);

                    // For demo purposes, we'll filter for the teacher who has the most assignments
                    // or just pick the first one found in the list to simulate "Logged In Teacher"
                    if (allAssignments.length > 0) {
                        const firstTeacherId = allAssignments[0].teacherId;
                        const myAssignments = allAssignments.filter(a => a.teacherId === firstTeacherId);
                        setAssignments(myAssignments);
                        setTeacherName(allAssignments[0].teacherName);
                    } else {
                        setTeacherName("No Assignments Found");
                    }
                } catch (e) {
                    console.error("Failed to parse timetable assignments", e);
                }
            } else {
                setTeacherName("No Data");
            }
        };
        loadData();
    }, []);

    const getPeriodForSlot = (timeSlot: string) => {
        return assignments.find(a => a.day === selectedDay && a.timeSlot === timeSlot);
    };

    const isBreakTime = (timeSlot: string) => timeSlot.includes("11:00 - 11:30");

    return (
        <div className="max-w-5xl mx-auto mt-6 sm:mt-12 px-2 sm:px-8 py-4 sm:py-8 bg-[#e7ecef] rounded-2xl shadow-2xl border-2 border-[#a3cef1]">
            <h2 className="text-[#274c77] font-extrabold text-2xl sm:text-4xl mb-2 tracking-wide text-center">Teacher Timetable</h2>
            <div className="mb-4 sm:mb-6 text-base sm:text-lg text-[#8b8c89] text-center">
                <span className="font-bold text-[#274c77]">Name:</span> {teacherName}<br />
                <span className="font-bold text-[#274c77]">Role:</span> Class Teacher
            </div>
            <div className="flex gap-2 mb-6 sm:mb-8 border-b-2 border-[#a3cef1] justify-center overflow-x-auto scrollbar-thin scrollbar-thumb-[#a3cef1] scrollbar-track-[#e7ecef] pb-2">
                {WEEK_DAYS.map((day) => (
                    <button
                        key={day}
                        className={`px-3 sm:px-6 py-2 rounded-t-lg font-semibold transition-all duration-200 focus:outline-none whitespace-nowrap text-xs sm:text-base
        ${selectedDay === day
                                ? 'bg-[#a3cef1] text-[#274c77] border-b-4 border-[#6096ba] shadow-md'
                                : 'bg-[#e7ecef] text-[#8b8c89] hover:bg-[#a3cef1]/60'}`}
                        onClick={() => setSelectedDay(day)}
                    >
                        {day}
                    </button>
                ))}
            </div>

            <h3 className="text-[#6096ba] font-bold text-lg sm:text-2xl mb-2 sm:mb-4 text-center">{selectedDay} Periods</h3>
            <div className="overflow-x-auto w-full">
                <table className="min-w-[340px] w-full rounded-xl overflow-hidden shadow-lg bg-[#e7ecef] text-xs sm:text-base">
                    <thead>
                        <tr>
                            <th className="bg-[#6096ba] text-[#e7ecef] px-2 sm:px-6 py-2 sm:py-3 border border-[#a3cef1] font-bold text-xs sm:text-lg">Time</th>
                            <th className="bg-[#6096ba] text-[#e7ecef] px-2 sm:px-6 py-2 sm:py-3 border border-[#a3cef1] font-bold text-xs sm:text-lg">Subject</th>
                            <th className="bg-[#6096ba] text-[#e7ecef] px-2 sm:px-6 py-2 sm:py-3 border border-[#a3cef1] font-bold text-xs sm:text-lg">Class</th>
                        </tr>
                    </thead>
                    <tbody>
                        {TIME_SLOTS.map((slot, idx) => {
                            const isBreak = isBreakTime(slot);
                            const period = getPeriodForSlot(slot);

                            if (isBreak) {
                                return (
                                    <tr key={idx} className="bg-gray-200">
                                        <td className="border border-[#a3cef1] px-2 sm:px-6 py-2 sm:py-3 text-[#274c77] text-xs sm:text-base font-bold">{slot}</td>
                                        <td colSpan={2} className="border border-[#a3cef1] px-2 sm:px-6 py-2 sm:py-3 text-center text-gray-500 font-bold uppercase tracking-widest">
                                            Break
                                        </td>
                                    </tr>
                                );
                            }

                            return (
                                <tr key={idx} className="hover:bg-[#a3cef1]/30 transition">
                                    <td className="border border-[#a3cef1] px-2 sm:px-6 py-2 sm:py-3 text-[#274c77] text-xs sm:text-base">{slot}</td>
                                    <td className="border border-[#a3cef1] px-2 sm:px-6 py-2 sm:py-3 text-[#274c77] text-xs sm:text-base">
                                        {period ? period.subject : <span className="text-gray-400 italic">Free Period</span>}
                                    </td>
                                    <td className="border border-[#a3cef1] px-2 sm:px-6 py-2 sm:py-3 text-[#274c77] text-xs sm:text-base">
                                        {period ? `${period.grade} - ${period.section}` : "-"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {selectedDay === "Friday" && (
                <div className="mt-3 sm:mt-5 text-[#6096ba] font-bold text-xs sm:text-base text-center">
                    Note: <span className="text-[#274c77]">Friday is a half day. School closes at 12:30pm.</span>
                </div>
            )}
            {selectedDay !== "Friday" && (
                <div className="mt-3 sm:mt-5 text-[#8b8c89] font-bold text-xs sm:text-base text-center">
                    Note: <span className="text-[#274c77]">School closes at 1:30pm.</span>
                </div>
            )}
        </div>
    );
};

export default TeacherTimetablePage;
