"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface GeneralInfoStepProps {
  formData: any
  invalidFields: string[]
  onInputChange: (field: string, value: any) => void
}

export function GeneralInfoStep({ formData, invalidFields, onInputChange }: GeneralInfoStepProps) {
  const shiftAvailable = formData.shift_available || "morning"
  const isBothShift = shiftAvailable === "both"
  const isSingleShift = shiftAvailable === "morning" || shiftAvailable === "afternoon"

  // Auto-calculate totals based on shift selection
  useEffect(() => {
    if (isBothShift) {
      const morningTotalStudents = (parseInt(formData.morning_male_students) || 0) + (parseInt(formData.morning_female_students) || 0)
      const afternoonTotalStudents = (parseInt(formData.afternoon_male_students) || 0) + (parseInt(formData.afternoon_female_students) || 0)
      const totalStudents = morningTotalStudents + afternoonTotalStudents
      
      const morningTotalTeachers = (parseInt(formData.morning_male_teachers) || 0) + (parseInt(formData.morning_female_teachers) || 0)
      const afternoonTotalTeachers = (parseInt(formData.afternoon_male_teachers) || 0) + (parseInt(formData.afternoon_female_teachers) || 0)
      const totalTeachers = morningTotalTeachers + afternoonTotalTeachers

      onInputChange("morning_total_students", morningTotalStudents.toString())
      onInputChange("afternoon_total_students", afternoonTotalStudents.toString())
      onInputChange("total_students", totalStudents.toString())
      onInputChange("morning_total_teachers", morningTotalTeachers.toString())
      onInputChange("afternoon_total_teachers", afternoonTotalTeachers.toString())
      onInputChange("total_teachers", totalTeachers.toString())
    } else {
      const totalStudents = (parseInt(formData.male_students) || 0) + (parseInt(formData.female_students) || 0)
      const totalTeachers = (parseInt(formData.male_teachers) || 0) + (parseInt(formData.female_teachers) || 0)
      
      onInputChange("total_students", totalStudents.toString())
      onInputChange("total_teachers", totalTeachers.toString())
    }

    const totalTeachers = parseInt(formData.total_teachers) || 0
    const totalNonTeachingStaff = parseInt(formData.total_non_teaching_staff) || 0
    onInputChange("total_staff_members", (totalTeachers + totalNonTeachingStaff).toString())
  }, [
    isBothShift, formData.morning_male_students, formData.morning_female_students,
    formData.afternoon_male_students, formData.afternoon_female_students,
    formData.morning_male_teachers, formData.morning_female_teachers,
    formData.afternoon_male_teachers, formData.afternoon_female_teachers,
    formData.male_students, formData.female_students,
    formData.male_teachers, formData.female_teachers,
    formData.total_non_teaching_staff, formData.total_teachers
  ])

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle>Campus Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label>Campus Photo (Optional)</Label>
          <UploadArea existing={formData.campus_photo} onFile={(dataUrl: string | null) => onInputChange("campus_photo", dataUrl || "")} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="campus_name">Campus Name *</Label>
            <select
              id="campus_name"
              value={formData.campus_name || ""}
              onChange={e => onInputChange("campus_name", e.target.value)}
              className={`w-full border rounded px-3 py-2 ${invalidFields.includes('campus_name') ? 'border-red-500' : ''}`}
            >
              <option value="">Select Campus</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                <option key={num} value={`Campus ${num}`}>Campus {num}</option>
              ))}
            </select>
            {invalidFields.includes("campus_name") && (
              <p className="text-sm text-red-600 mt-1">Campus name is required</p>
            )}
          </div>

          <div>
            <Label htmlFor="campus_code">Campus Code</Label>
            <Input
              id="campus_code"
              value={formData.campus_code || ""}
              onChange={e => onInputChange("campus_code", e.target.value)}
              placeholder="e.g. C001"
            />
          </div>

          <div>
            <Label htmlFor="city">City *</Label>
            <Input id="city" value={formData.city || ""} onChange={e => onInputChange("city", e.target.value)} className={invalidFields.includes('city') ? 'border-red-500' : ''} />
            {invalidFields.includes("city") && <p className="text-sm text-red-600 mt-1">City is required</p>}
          </div>

          <div>
            <Label htmlFor="postal_code">Postal Code *</Label>
            <Input id="postal_code" value={formData.postal_code || ""} onChange={e => onInputChange("postal_code", e.target.value)} className={invalidFields.includes('postal_code') ? 'border-red-500' : ''} />
            {invalidFields.includes("postal_code") && <p className="text-sm text-red-600 mt-1">Postal code is required</p>}
          </div>

          <div>
            <Label htmlFor="district">District</Label>
            <Input id="district" value={formData.district || ""} onChange={e => onInputChange("district", e.target.value)} placeholder="e.g. East" />
          </div>

          <div>
            <Label htmlFor="status">Status *</Label>
            <select id="status" value={formData.status || ""} onChange={e => onInputChange("status", e.target.value)} className={`w-full border rounded px-3 py-2 ${invalidFields.includes('status') ? 'border-red-500' : ''}`}>
              <option value="">Select Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="under_construction">Under Construction</option>
            </select>
            {invalidFields.includes("status") && <p className="text-sm text-red-600 mt-1">Status is required</p>}
          </div>

          <div>
            <Label htmlFor="governing_body">Governing Body</Label>
            <Input id="governing_body" value={formData.governing_body || ""} onChange={e => onInputChange("governing_body", e.target.value)} placeholder="e.g. AIT Education Foundation" />
          </div>

          <div>
            <Label htmlFor="registration_number">Registration Number</Label>
            <Input id="registration_number" value={formData.registration_number || ""} onChange={e => onInputChange("registration_number", e.target.value)} />
          </div>

          <div>
            <Label htmlFor="established_year">Established Year</Label>
            <Input id="established_year" type="number" value={formData.established_year || ""} onChange={e => onInputChange("established_year", e.target.value)} placeholder="e.g. ectl>2020" />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="address_full">Campus Full Address *</Label>
            <Textarea id="address_full" value={formData.address_full || ""} onChange={e => onInputChange("address_full", e.target.value)} className={`min-h-[60px] ${invalidFields.includes('address_full') ? 'border-red-500' : ''}`} placeholder="Complete address of the campus" />
            {invalidFields.includes("address_full") && <p className="text-sm text-red-600 mt-1">Address is required</p>}
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="grades_offered">Grades Offered</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              {(() => {
                const selectedGrades = formData.grades_offered || ""
                const selectedGradesList = selectedGrades ? selectedGrades.split(",").map((g: string) => g.trim()) : []
                const toggle = (grade: string, checked: boolean) => {
                  let newList = checked ? [...selectedGradesList, grade] : selectedGradesList.filter((g: string) => g !== grade)
                  onInputChange("grades_offered", newList.join(", "))
                }
                return ["Nursery", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10 (Matric)", "Special Class"].map((grade) => (
                      <label key={grade} className="flex items-center space-x-2">
                    <input type="checkbox" value={grade} checked={selectedGradesList.includes(grade)} onChange={(e) => toggle(grade, e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                        <span className="text-sm">{grade}</span>
                      </label>
                ))
              })()}
            </div>
          </div>

          <div>
            <Label htmlFor="instruction_language">Language of Instruction</Label>
            <select id="instruction_language" value={formData.instruction_language || ""} onChange={e => onInputChange("instruction_language", e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">Select Language</option>
              <option value="Urdu">Urdu</option>
              <option value="English">English</option>
              <option value="Urdu + English">Urdu + English</option>
            </select>
          </div>

          <div>
            <Label htmlFor="academic_year_start_month">Academic Year Start Month</Label>
            <select id="academic_year_start_month" value={formData.academic_year_start_month || ""} onChange={e => onInputChange("academic_year_start_month", e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">Select Month</option>
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month) => (<option key={month} value={month}>{month}</option>))}
            </select>
          </div>

          <div>
            <Label htmlFor="academic_year_end_month">Academic Year End Month</Label>
            <select id="academic_year_end_month" value={formData.academic_year_end_month || ""} onChange={e => onInputChange("academic_year_end_month", e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">Select Month</option>
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month) => (<option key={month} value={month}>{month}</option>))}
            </select>
          </div>
          </div>
          
        {/* Shift Selection - Before Conditional Sections */}
        <div className="p-4 bg-yellow-50 rounded-lg border-2 border-yellow-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
              <Label htmlFor="shift_available">Shift Available *</Label>
              <select id="shift_available" value={shiftAvailable} onChange={e => onInputChange("shift_available", e.target.value)} className={`w-full border rounded px-3 py-2 ${invalidFields.includes('shift_available') ? 'border-red-500' : ''}`}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="both">Both</option>
              </select>
              {invalidFields.includes("shift_available") && <p className="text-sm text-red-600 mt-1">Shift selection is required</p>}
          </div>

            {shiftAvailable && (
              <div className="flex items-center">
                <p className="text-sm text-gray-600">
                  Selected: <span className="font-semibold text-[#274C77]">{shiftAvailable.charAt(0).toUpperCase() + shiftAvailable.slice(1)} Shift</span>
                  {isBothShift && <span className="block mt-1 text-xs">You'll need to enter data for both morning and afternoon shifts</span>}
                </p>
              </div>
            )}
          </div>
          </div>

        {isBothShift ? (
          <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-lg">Students - Both Shifts</h3>
            <div className="space-y-2 p-3 bg-white rounded-lg">
              <h4 className="font-medium">Morning Shift Students</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label htmlFor="morning_male_students">Male Students</Label><Input id="morning_male_students" type="number" value={formData.morning_male_students || ""} onChange={e => onInputChange("morning_male_students", e.target.value)} /></div>
                <div><Label htmlFor="morning_female_students">Female Students</Label><Input id="morning_female_students" type="number" value={formData.morning_female_students || ""} onChange={e => onInputChange("morning_female_students", e.target.value)} /></div>
                <div><Label htmlFor="morning_total_students">Total Morning Students</Label><Input id="morning_total_students" type="number" value={formData.morning_total_students || ""} readOnly className="bg-gray-100 font-semibold" /></div>
              </div>
            </div>  
            <div className="space-y-2 p-3 bg-white rounded-lg">
              <h4 className="font-medium">Afternoon Shift Students</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label htmlFor="afternoon_male_students">Male Students</Label><Input id="afternoon_male_students" type="number" value={formData.afternoon_male_students || ""} onChange={e => onInputChange("afternoon_male_students", e.target.value)} /></div>
                <div><Label htmlFor="afternoon_female_students">Female Students</Label><Input id="afternoon_female_students" type="number" value={formData.afternoon_female_students || ""} onChange={e => onInputChange("afternoon_female_students", e.target.value)} /></div>
                <div><Label htmlFor="afternoon_total_students">Total Afternoon Students</Label><Input id="afternoon_total_students" type="number" value={formData.afternoon_total_students || ""} readOnly className="bg-gray-100 font-semibold" /></div>
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Label htmlFor="total_students">Total Students in Campus</Label>
              <Input id="total_students" type="number" value={formData.total_students || ""} readOnly className="bg-green-100 font-bold" />
            </div>
          </div>
        ) : null}

        {isSingleShift ? (
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-lg">Students - {shiftAvailable.charAt(0).toUpperCase() + shiftAvailable.slice(1)} Shift</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label htmlFor="male_students">Male Students</Label><Input id="male_students" type="number" value={formData.male_students || ""} onChange={e => onInputChange("male_students", e.target.value)} /></div>
              <div><Label htmlFor="female_students">Female Students</Label><Input id="female_students" type="number" value={formData.female_students || ""} onChange={e => onInputChange("female_students", e.target.value)} /></div>
              <div><Label htmlFor="total_students">Total Students</Label><Input id="total_students" type="number" value={formData.total_students || ""} readOnly className="bg-gray-100" /></div>
            </div>
          </div>
        ) : null}

        {isBothShift ? (
          <div className="space-y-4 p-4 bg-purple-50 rounded-lg">
            <h3 className="font-semibold text-lg">Teachers - Both Shifts</h3>
            <div className="space-y-2 p-3 bg-white rounded-lg">
              <h4 className="font-medium">Morning Shift Teachers</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label htmlFor="morning_male_teachers">Male Teachers</Label><Input id="morning_male_teachers" type="number" value={formData.morning_male_teachers || ""} onChange={e => onInputChange("morning_male_teachers", e.target.value)} /></div>
                <div><Label htmlFor="morning_female_teachers">Female Teachers</Label><Input id="morning_female_teachers" type="number" value={formData.morning_female_teachers || ""} onChange={e => onInputChange("morning_female_teachers", e.target.value)} /></div>
                <div><Label htmlFor="morning_total_teachers">Total Morning Teachers</Label><Input id="morning_total_teachers" type="number" value={formData.morning_total_teachers || ""} readOnly className="bg-gray-100 font-semibold" /></div>
              </div>
            </div>
            <div className="space-y-2 p-3 bg-white rounded-lg">
              <h4 className="font-medium">Afternoon Shift Teachers</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label htmlFor="afternoon_male_teachers">Male Teachers</Label><Input id="afternoon_male_teachers" type="number" value={formData.afternoon_male_teachers || ""} onChange={e => onInputChange("afternoon_male_teachers", e.target.value)} /></div>
                <div><Label htmlFor="afternoon_female_teachers">Female Teachers</Label><Input id="afternoon_female_teachers" type="number" value={formData.afternoon_female_teachers || ""} onChange={e => onInputChange("afternoon_female_teachers", e.target.value)} /></div>
                <div><Label htmlFor="afternoon_total_teachers">Total Afternoon Teachers</Label><Input id="afternoon_total_teachers" type="number" value={formData.afternoon_total_teachers || ""} readOnly className="bg-gray-100 font-semibold" /></div>
              </div>
          </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Label htmlFor="total_teachers">Total Teachers in Campus</Label>
              <Input id="total_teachers" type="number" value={formData.total_teachers || ""} readOnly className="bg-green-100 font-bold" />
          </div>
          </div>
        ) : null}

        {isSingleShift ? (
          <div className="p-4 bg-purple-50 rounded-lg">
            <h3 className="font-semibold text-lg">Teachers - {shiftAvailable.charAt(0).toUpperCase() + shiftAvailable.slice(1)} Shift</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label htmlFor="male_teachers">Male Teachers</Label><Input id="male_teachers" type="number" value={formData.male_teachers || ""} onChange={e => onInputChange("male_teachers", e.target.value)} /></div>
              <div><Label htmlFor="female_teachers">Female Teachers</Label><Input id="female_teachers" type="number" value={formData.female_teachers || ""} onChange={e => onInputChange("female_teachers", e.target.value)} /></div>
              <div><Label htmlFor="total_teachers">Total Teachers</Label><Input id="total_teachers" type="number" value={formData.total_teachers || ""} readOnly className="bg-gray-100" /></div>
          </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="avg_class_size">Average Class Size</Label>
            <Input id="avg_class_size" type="number" value={formData.avg_class_size || ""} onChange={e => onInputChange("avg_class_size", e.target.value)} placeholder="e.g. 25" />
          </div>
          <div>
            <Label htmlFor="total_non_teaching_staff">Total Non-Teaching Staff</Label>
            <Input id="total_non_teaching_staff" type="number" value={formData.total_non_teaching_staff || ""} onChange={e => onInputChange("total_non_teaching_staff", e.target.value)} placeholder="e.g. 10" />
          </div>
          </div>

        <div className="p-3 bg-indigo-50 rounded-lg">
          <Label htmlFor="total_staff_members">Total Staff (Teachers + Non-Teaching Staff)</Label>
          <Input id="total_staff_members" type="number" value={formData.total_staff_members || ""} readOnly className="bg-indigo-100 font-bold" />
        </div>
      </CardContent>
    </Card>
  )
}

function UploadArea({ existing, onFile }: { existing?: string | null, onFile: (dataUrl: string | null) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const openFilePicker = useCallback(() => { inputRef.current?.click() }, [])
  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return onFile(null)
    const reader = new FileReader()
    reader.onload = () => onFile(String(reader.result || null))
    reader.readAsDataURL(file)
  }, [onFile])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onFile(String(reader.result || null))
    reader.readAsDataURL(file)
  }, [onFile])

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />
      <div
        onClick={openFilePicker}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFilePicker() }}
        className={`w-full rounded-md border-2 border-dashed p-6 text-center cursor-pointer ${isDragging ? 'border-sky-500 bg-sky-50' : 'border-gray-200 bg-white'}`}
      >
        {existing ? (
          <div className="flex items-center justify-center gap-4">
            <img src={existing} alt="preview" className="h-28 w-auto rounded-md border" />
            <div className="text-left">
              <p className="font-medium">Change campus photo</p>
              <p className="text-sm text-muted-foreground">Click or drop a file to replace the image</p>
            </div>
          </div>
        ) : (
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V8a2 2 0 012-2h6a2 2 0 012 2v8m-6-4l-3 3m6-3l3 3" />
            </svg>
            <p className="mt-2 font-medium">Upload campus photo</p>
            <p className="mt-1 text-sm text-gray-500">PNG, JPG or GIF. Click to choose or drag and drop here.</p>
          </div>
        )}
      </div>

      {existing && (
        <div className="mt-2 flex gap-2">
          <button type="button" className="px-3 py-1 rounded bg-red-50 text-red-700 border" onClick={() => onFile(null)}>Remove</button>
        </div>
      )}
    </div>
  )
}
