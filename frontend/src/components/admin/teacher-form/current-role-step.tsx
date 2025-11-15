"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useEffect, useMemo, useState } from "react"
import { getLevels, getGrades, getClassrooms, getAllCoordinators } from "@/lib/api"
import { toast as sonnerToast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"

interface CurrentRoleStepProps {
  formData: any
  invalidFields: string[]
  onInputChange: (field: string, value: any) => void
}


export function CurrentRoleStep({ formData, invalidFields, onInputChange }: CurrentRoleStepProps) {
  const [levels, setLevels] = useState<any[]>([])
  const [grades, setGrades] = useState<any[]>([])
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [coordinators, setCoordinators] = useState<any[]>([])
  const [loadingLevels, setLoadingLevels] = useState(false)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [loadingClassrooms, setLoadingClassrooms] = useState(false)
  const [loadingCoordinators, setLoadingCoordinators] = useState(false)
  // For BOTH shift workflow
  const [selectedLevels, setSelectedLevels] = useState<number[]>(Array.isArray(formData.assigned_levels) ? formData.assigned_levels : [])
  const [levelGrades, setLevelGrades] = useState<Record<string, string>>({})
  const [levelClassroomsMap, setLevelClassroomsMap] = useState<Record<string, any[]>>({})
  const [perLevelGrades, setPerLevelGrades] = useState<Record<string, any[]>>({})

  // Fetch levels for the selected campus
  useEffect(() => {
    if (formData.current_campus) {
      setLoadingLevels(true)
      getLevels(formData.current_campus)
        .then((data: any) => {
          const levelsList = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []
          setLevels(levelsList)
        })
        .catch(err => console.error('Error fetching levels:', err))
        .finally(() => setLoadingLevels(false))
    }
  }, [formData.current_campus])

  // Fetch coordinators for the selected campus (only for non-class teachers)
  useEffect(() => {
    if (formData.current_campus && !formData.is_class_teacher) {
      setLoadingCoordinators(true)
      getAllCoordinators()
        .then((data: any) => {
          const coordinatorsList = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []
          
          // Filter coordinators by campus first
          let campusCoordinators = coordinatorsList.filter((coord: any) => {
            // Try multiple ways to get campus ID
            const coordCampusId = coord.campus?.id || coord.campus?.pk || coord.campus_id || (typeof coord.campus === 'number' ? coord.campus : null)
            const formCampusId = typeof formData.current_campus === 'number' ? formData.current_campus : parseInt(formData.current_campus)
            
            // Also check campus_name for matching (in case IDs don't match but it's the same campus)
            const coordCampusName = coord.campus?.campus_name || coord.campus_name || ''
            
            // Match by ID first
            const idMatch = coordCampusId && String(coordCampusId) === String(formCampusId)
            
            // Match by name if ID doesn't match (extract number from campus name like "Campus 6" -> 6)
            let nameMatch = false
            if (coordCampusName) {
              const campusNameMatch = coordCampusName.match(/campus\s*(\d+)/i)
              if (campusNameMatch) {
                const campusNumFromName = parseInt(campusNameMatch[1])
                nameMatch = campusNumFromName === formCampusId
              }
            }
            
            return idMatch || nameMatch
          })
          
          // Filter coordinators by teacher's shift
          const teacherShift = (formData.shift || '').toString().toLowerCase()
          if (teacherShift && campusCoordinators.length > 0) {
            campusCoordinators = campusCoordinators.filter((coord: any) => {
              const coordShift = (coord.shift || '').toString().toLowerCase()
              
              // If teacher shift is "both", show all coordinators
              if (teacherShift === 'both') {
                return true // Show all coordinators (morning, afternoon, both)
              }
              
              // If coordinator shift is "both", show for all teacher shifts
              if (coordShift === 'both') {
                return true // Both shift coordinators show for morning, afternoon, and both teachers
              }
              
              // If teacher shift is "morning", show morning coordinators and both coordinators
              if (teacherShift === 'morning') {
                return coordShift === 'morning' || coordShift === 'both'
              }
              
              // If teacher shift is "afternoon", show afternoon coordinators and both coordinators
              if (teacherShift === 'afternoon') {
                return coordShift === 'afternoon' || coordShift === 'both'
              }
              
              // Default: show if shifts match
              return coordShift === teacherShift
            })
          }
          
          setCoordinators(campusCoordinators)
        })
        .catch(err => {
          setCoordinators([])
        })
        .finally(() => setLoadingCoordinators(false))
    } else {
      setCoordinators([])
    }
  }, [formData.current_campus, formData.is_class_teacher, formData.shift])

  // When shift changes, clear level/grade/section if incompatible
  useEffect(() => {
    if (!formData.class_teacher_level) return
    const selected = levels.find((l) => String(l.id) === String(formData.class_teacher_level))
    if (!selected) return
    const selectedShift = (selected.shift || '').toString()
    const currentShift = (formData.shift || '').toString()
    const isCompatible = currentShift === 'both' ? (selectedShift === 'morning' || selectedShift === 'afternoon') : selectedShift === currentShift
    if (!isCompatible) {
      onInputChange("class_teacher_level", "")
      onInputChange("class_teacher_grade", "")
      onInputChange("class_teacher_section", "")
      onInputChange("assigned_classroom", "")
    }
  }, [formData.shift, levels])

  // Filter levels based on selected shift
  const filteredLevels = useMemo(() => {
    const shift = (formData.shift || '').toString()
    if (!shift) return levels
    if (shift === 'both') {
      return levels.filter((l) => (l.shift === 'morning' || l.shift === 'afternoon'))
    }
    return levels.filter((l) => l.shift === shift)
  }, [levels, formData.shift])

  // Fetch grades when level is selected (single-shift flow)
  useEffect(() => {
    if (formData.shift === 'both') return
    if (formData.class_teacher_level) {
      setLoadingGrades(true)
      getGrades(formData.class_teacher_level)
        .then((data: any) => {
          const gradesList = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []
          setGrades(gradesList)
        })
        .catch(err => console.error('Error fetching grades:', err))
        .finally(() => setLoadingGrades(false))
    }
  }, [formData.class_teacher_level, formData.shift])

  // Fetch classrooms when grade is selected (single-shift flow)
  useEffect(() => {
    if (formData.shift === 'both') return
    if (formData.class_teacher_grade) {
      setLoadingClassrooms(true)
      getClassrooms(formData.class_teacher_grade)
        .then((data: any) => {
          const classroomsList = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []
          setClassrooms(classroomsList)
        })
        .catch(err => console.error('Error fetching classrooms:', err))
        .finally(() => setLoadingClassrooms(false))
    }
  }, [formData.class_teacher_grade, formData.shift])

  // Auto-assign classroom when level, grade, and section are selected
  useEffect(() => {
    if (formData.class_teacher_level && formData.class_teacher_grade && formData.class_teacher_section && classrooms.length > 0) {
      const matchingClassroom = classrooms.find(classroom => {
        const gradeMatch = classroom.grade === parseInt(formData.class_teacher_grade) || classroom.grade === formData.class_teacher_grade
        const sectionMatch = classroom.section === formData.class_teacher_section
        return gradeMatch && sectionMatch
      })
      
      if (matchingClassroom && formData.assigned_classroom !== matchingClassroom.id) {
        // Prevent assigning if already occupied
        if (matchingClassroom.class_teacher) {
          sonnerToast.error("Classroom already assigned", {
            description: "This classroom is already assigned to another class teacher. Please choose a different section.",
          })
          return
        }
        // Use setTimeout to ensure the state update happens
        setTimeout(() => {
          onInputChange("assigned_classroom", matchingClassroom.id)
        }, 100)
      }
    }
  }, [formData.class_teacher_level, formData.class_teacher_grade, formData.class_teacher_section, classrooms.length])

  // Helpers for BOTH shift flow
  const handleLevelToggle = (levelId: number, checked: boolean) => {
    const current: number[] = Array.isArray(selectedLevels) ? selectedLevels : []
    if (checked) {
      if (current.length >= 2 && !current.includes(levelId)) {
        sonnerToast.error("You can select at most 2 levels for both shifts")
        return
      }
      const updated = current.includes(levelId) ? current : [...current, levelId]
      setSelectedLevels(updated)
      onInputChange('assigned_levels', updated)
      // load grades for this level
      setLoadingGrades(true)
      getGrades(levelId)
        .then((data: any) => {
          const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []
          setPerLevelGrades(prev => ({ ...prev, [String(levelId)]: list }))
        })
        .catch(err => console.error('Error fetching per-level grades', err))
        .finally(() => setLoadingGrades(false))
    } else {
      const updated = current.filter(id => id !== levelId)
      setSelectedLevels(updated)
      onInputChange('assigned_levels', updated)
      // cleanup per-level selections
      const lg = { ...levelGrades }
      delete lg[String(levelId)]
      setLevelGrades(lg)
      const lm = { ...levelClassroomsMap }
      delete lm[String(levelId)]
      setLevelClassroomsMap(lm)
      const pg = { ...perLevelGrades }
      delete pg[String(levelId)]
      setPerLevelGrades(pg)
    }
  }

  const handleLevelGradeChange = async (levelId: number, gradeId: string) => {
    setLevelGrades(prev => ({ ...prev, [String(levelId)]: gradeId }))
    setLoadingClassrooms(true)
    try {
      const data: any = await getClassrooms(parseInt(gradeId))
      const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []
      setLevelClassroomsMap(prev => ({ ...prev, [String(levelId)]: list }))
    } catch (err) {
      console.error('Error fetching classrooms for level', levelId, err)
    } finally {
      setLoadingClassrooms(false)
    }
  }

  const handleAssignSectionForLevel = (levelId: number, section: string) => {
    const gradeId = levelGrades[String(levelId)]
    const list = levelClassroomsMap[String(levelId)] || []
    const levelObj = levels.find(l => l.id === levelId)
    const desiredShift = (levelObj?.shift || '').toString()
    const classroom = list.find((c: any) => {
      const gradeMatch = c.grade === parseInt(gradeId) || String(c.grade) === String(gradeId)
      const sectionMatch = c.section === section
      const shiftMatch = (c.shift || '').toString() === desiredShift
      return gradeMatch && sectionMatch && shiftMatch
    })
    if (!classroom) return
    if (classroom.class_teacher) {
      sonnerToast.error("Classroom already assigned", { description: "This classroom is already assigned to another class teacher." })
      return
    }
    const current: number[] = Array.isArray(formData.assigned_classrooms) ? formData.assigned_classrooms : []
    if (!current.includes(classroom.id)) {
      onInputChange('assigned_classrooms', [...current, classroom.id])
    }
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle>Current Role</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
            <Label htmlFor="current_subjects">Current Subjects (Optional)</Label>
            <Input 
              id="current_subjects" 
              value={formData.current_subjects || ""} 
              onChange={(e) => onInputChange("current_subjects", e.target.value)}
              placeholder="e.g., Mathematics, Physics, Chemistry"
            />
          </div>
          
          <div className="md:col-span-2">
            <Label htmlFor="current_classes_taught">Current Classes Taught (Optional)</Label>
            <Input 
              id="current_classes_taught" 
              value={formData.current_classes_taught || ""} 
              onChange={(e) => onInputChange("current_classes_taught", e.target.value)}
              placeholder="e.g., Grade 6-8, Grade 9-10"
            />
          </div>
          
          <div className="md:col-span-2">
            <Label htmlFor="current_extra_responsibilities">Current Extra Responsibilities (Optional)</Label>
            <Input 
              id="current_extra_responsibilities" 
              value={formData.current_extra_responsibilities || ""} 
              onChange={(e) => onInputChange("current_extra_responsibilities", e.target.value)}
              placeholder="e.g., Sports Coordinator, Library In-charge"
            />
          </div>
        <div className="md:col-span-2">
            <Label htmlFor="current_role_title">Current Role(Optional)</Label>
            <Input 
              id="current_subjects" 
              value={formData.current_role_title || ""} 
              onChange={(e) => onInputChange("current_role_title", e.target.value)}
              placeholder="e.g., Teacher, Subject-teacher"
            />
          </div>
          <div>
            <Label htmlFor="current_campus">Current Campus *</Label>
            <Select value={formData.current_campus || ""} onValueChange={(v) => onInputChange("current_campus", v)}>
              <SelectTrigger className={`mt-2 border-2 focus:border-primary ${invalidFields.includes("current_campus") ? "border-red-500" : ""}`}>
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">Campus 6</SelectItem>
              </SelectContent>
            </Select>
            {invalidFields.includes("current_campus") && <p className="text-sm text-red-600 mt-1">Current campus is required</p>}
            <p className="text-xs text-gray-500 mt-1">Teachers can only be added to your assigned campus</p>
          </div>
          
          <div>
            <Label htmlFor="joining_date">Joining Date *</Label>
            <Input 
              id="joining_date" 
              type="date" 
              value={formData.joining_date || ""} 
              onChange={(e) => onInputChange("joining_date", e.target.value)}
              className={invalidFields.includes("joining_date") ? "border-red-500" : ""}
              max={new Date().toISOString().split('T')[0]}
            />
            {invalidFields.includes("joining_date") && <p className="text-sm text-red-600 mt-1">Joining date is required</p>}
          </div>
          
          <div>
            <Label htmlFor="shift">Shift *</Label>
            <Select value={formData.shift || ""} onValueChange={(v) => onInputChange("shift", v)}>
              <SelectTrigger className={`mt-2 border-2 focus:border-primary ${invalidFields.includes("shift") ? "border-red-500" : ""}`}>
                <SelectValue placeholder="Select shift" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="afternoon">Afternoon</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
            {invalidFields.includes("shift") && <p className="text-sm text-red-600 mt-1">Shift is required</p>}
          </div>
          
          <div>
            <Label htmlFor="is_currently_active">Is Currently Active</Label>
            <Select value={String(Boolean(formData.is_currently_active))} onValueChange={(v) => onInputChange("is_currently_active", v === "true") }>
              <SelectTrigger className="mt-2 border-2 focus:border-primary">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          
          
          <div>
            <Label htmlFor="is_class_teacher">Is Class Teacher</Label>
            <Select 
              value={String(Boolean(formData.is_class_teacher))} 
              onValueChange={(v) => onInputChange("is_class_teacher", v === "true")}
            >
              <SelectTrigger className="mt-2 border-2 focus:border-primary">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 mt-1">Current value: {String(Boolean(formData.is_class_teacher))}</p>
          </div>
          
          {formData.is_class_teacher && (
            <>
              {formData.shift === 'both' ? (
                <div>
                  <Label htmlFor="class_teacher_level">Class Teacher Levels (max 2) *</Label>
                  <div className={`mt-2 rounded-md border ${invalidFields.includes('assigned_levels') ? 'border-red-500' : 'border-gray-200'}`}>
                    <div className="max-h-52 overflow-auto p-2 space-y-2">
                      {filteredLevels.map((level) => {
                        const isChecked = Array.isArray(selectedLevels) && selectedLevels.includes(level.id)
                        return (
                          <div key={level.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`teacher-level-${level.id}`}
                              checked={!!isChecked}
                              onCheckedChange={(checked) => handleLevelToggle(level.id, !!checked)}
                            />
                            <Label htmlFor={`teacher-level-${level.id}`} className="text-sm">
                              {level.name} • {(level.shift_display || level.shift)}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
              <div>
                  <Label htmlFor="class_teacher_level">Class Teacher Level * </Label>
                <Select 
                  value={formData.class_teacher_level || ""} 
                  onValueChange={(v) => {
                    onInputChange("class_teacher_level", v)
                    // Reset grade and section when level changes
                    onInputChange("class_teacher_grade", "")
                    onInputChange("class_teacher_section", "")
                    onInputChange("assigned_classroom", "")
                  }}
                >
                  <SelectTrigger className={`mt-2 border-2 focus:border-primary ${invalidFields.includes("class_teacher_level") ? "border-red-500" : ""}`}>
                    <SelectValue placeholder={loadingLevels ? "Loading levels..." : "Select level"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredLevels.map((level) => (
                      <SelectItem key={level.id} value={level.id.toString()}>
                        {level.name} - {level.shift_display || level.shift}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {invalidFields.includes("class_teacher_level") && <p className="text-sm text-red-600 mt-1">Class teacher level is required</p>}
              </div>
              )}
              
              {formData.shift === 'both' ? (
                <div className="space-y-4">
                  {selectedLevels.map((levelId) => {
                    const levelObj = levels.find(l => l.id === levelId)
                    const levelGradesList = perLevelGrades[String(levelId)] || []
                    return (
                      <div key={levelId} className="rounded-md border border-gray-200 p-3">
                        <div className="font-medium text-sm mb-2">{levelObj?.name} • {(levelObj?.shift_display || levelObj?.shift)}</div>
                        <div>
                          <Label>Grade *</Label>
                          <Select 
                            value={levelGrades[String(levelId)] || ""}
                            onValueChange={(v) => handleLevelGradeChange(levelId, v)}
                          >
                            <SelectTrigger className="mt-2 border-2 focus:border-primary">
                              <SelectValue placeholder="Select grade" />
                            </SelectTrigger>
                            <SelectContent>
                              {(levelGradesList as any[]).map((grade: any) => (
                                  <SelectItem key={(grade.id||grade)} value={(grade.id||grade).toString()}>
                                    {grade.name || grade.grade_name || grade.name_display || `Grade ${grade.id||grade}`}
                                  </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {levelGrades[String(levelId)] && (
                          <div className="mt-3">
                            <Label>Section *</Label>
                            <Select 
                              value={""}
                              onValueChange={(section) => handleAssignSectionForLevel(levelId, section)}
                              disabled={loadingClassrooms}
                            >
                              <SelectTrigger className="mt-2 border-2 focus:border-primary">
                                <SelectValue placeholder={loadingClassrooms ? "Loading sections..." : "Select section"} />
                              </SelectTrigger>
                              <SelectContent>
                                {(levelClassroomsMap[String(levelId)] || []).
                                  filter((c:any)=> String(c.grade)===String(levelGrades[String(levelId)]) ).
                                  map((classroom:any)=> (
                                    <SelectItem key={classroom.id} value={classroom.section}>
                                      {classroom.section}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 mt-1">Selecting a section will add the classroom to the list below.</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
              <div>
                <Label htmlFor="class_teacher_grade">Class Teacher Grade *</Label>
                <Select 
                  value={formData.class_teacher_grade || ""} 
                  onValueChange={(v) => {
                    onInputChange("class_teacher_grade", v)
                    // Reset section when grade changes
                    onInputChange("class_teacher_section", "")
                    onInputChange("assigned_classroom", "")
                  }}
                  disabled={!formData.class_teacher_level || loadingGrades}
                >
                  <SelectTrigger className={`mt-2 border-2 focus:border-primary ${invalidFields.includes("class_teacher_grade") ? "border-red-500" : ""}`}>
                    <SelectValue placeholder={loadingGrades ? "Loading grades..." : "Select grade"} />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id.toString()}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {invalidFields.includes("class_teacher_grade") && <p className="text-sm text-red-600 mt-1">Class teacher grade is required</p>}
              </div>
              )}
              
              {formData.shift === 'both' ? (
                <div>
                  <Label htmlFor="assigned_classrooms">Class Teacher Classrooms *</Label>
                  {formData.assigned_classrooms && formData.assigned_classrooms.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {formData.assigned_classrooms.map((classroomId: number) => {
                        const allLists = Object.values(levelClassroomsMap).flat()
                        const classroom = (allLists as any[]).find((c: any) => c.id === classroomId) || classrooms.find(c => c.id === classroomId)
                        return classroom ? (
                          <div key={classroomId} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                            <span className="text-sm">{classroom.section} ({classroom.shift})</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = formData.assigned_classrooms.filter((id: number) => id !== classroomId)
                                onInputChange("assigned_classrooms", updated)
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        ) : null
                      })}
                    </div>
                  )}
                  {invalidFields.includes("assigned_classrooms") && <p className="text-sm text-red-600 mt-1">At least one classroom is required for both shifts</p>}
                </div>
              ) : (
                <div>
                  <Label htmlFor="class_teacher_section">Class Teacher Section *</Label>
                  <Select 
                    value={formData.class_teacher_section || ""} 
                    onValueChange={(v) => {
                      onInputChange("class_teacher_section", v)
                      // Auto-assign classroom will be handled by useEffect
                    }}
                    disabled={!formData.class_teacher_grade || loadingClassrooms}
                  >
                    <SelectTrigger className={`mt-2 border-2 focus:border-primary ${invalidFields.includes("class_teacher_section") ? "border-red-500" : ""}`}>
                      <SelectValue placeholder={loadingClassrooms ? "Loading sections..." : "Select section"}>
                        {formData.class_teacher_section || "Select section"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {classrooms.map((classroom) => (
                        <SelectItem key={classroom.id} value={classroom.section}>
                          {classroom.section}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {invalidFields.includes("class_teacher_section") && <p className="text-sm text-red-600 mt-1">Class teacher section is required</p>}
                </div>
              )}
            </>
          )}

          {/* Coordinator Assignment - Only show when NOT a class teacher */}
          {!formData.is_class_teacher && (
            <div className="md:col-span-2">
              <Label htmlFor="assigned_coordinators">Assign Coordinators</Label>
              <Select 
                value="" 
                onValueChange={(coordinatorId) => {
                  const currentCoordinators = Array.isArray(formData.assigned_coordinators) ? formData.assigned_coordinators : []
                  if (!currentCoordinators.includes(parseInt(coordinatorId))) {
                    onInputChange("assigned_coordinators", [...currentCoordinators, parseInt(coordinatorId)])
                  }
                }}
                disabled={loadingCoordinators || !formData.current_campus}
              >
                <SelectTrigger className="mt-2 border-2 focus:border-primary">
                  <SelectValue placeholder={loadingCoordinators ? "Loading coordinators..." : coordinators.length === 0 ? "No coordinators available" : "Select coordinator to assign"} />
                </SelectTrigger>
                <SelectContent>
                  {coordinators.map((coordinator: any) => {
                    const isAlreadyAssigned = Array.isArray(formData.assigned_coordinators) && formData.assigned_coordinators.includes(coordinator.id)
                    return (
                      <SelectItem 
                        key={coordinator.id} 
                        value={coordinator.id.toString()}
                        disabled={isAlreadyAssigned}
                      >
                        {coordinator.full_name || `${coordinator.first_name || ''} ${coordinator.last_name || ''}`.trim() || coordinator.email}
                        {coordinator.level?.name && ` - ${coordinator.level.name}`}
                        {coordinator.shift && ` (${coordinator.shift})`}
                        {isAlreadyAssigned && ' (Already assigned)'}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {!formData.current_campus 
                  ? "Please select a campus first" 
                  : coordinators.length === 0 
                    ? `No coordinators available for Campus ${formData.current_campus}. Make sure coordinators are assigned to this campus.` 
                    : "Select coordinators to assign to this teacher"}
              </p>
              {coordinators.length === 0 && formData.current_campus && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                  <p className="font-medium">💡 Tip:</p>
                  <p>If you have coordinators but they're not showing, they might be assigned to a different campus. Check the coordinator list to update their campus assignment.</p>
                </div>
              )}
              
              {/* Display assigned coordinators */}
              {Array.isArray(formData.assigned_coordinators) && formData.assigned_coordinators.length > 0 && (
                <div className="mt-3 space-y-2">
                  <Label className="text-sm font-medium">Assigned Coordinators:</Label>
                  {formData.assigned_coordinators.map((coordinatorId: number) => {
                    const coordinator = coordinators.find((c: any) => c.id === coordinatorId)
                    return coordinator ? (
                      <div key={coordinatorId} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                        <span className="text-sm">
                          {coordinator.full_name || `${coordinator.first_name || ''} ${coordinator.last_name || ''}`.trim() || coordinator.email}
                          {coordinator.level?.name && ` - ${coordinator.level.name}`}
                          {coordinator.shift && ` (${coordinator.shift})`}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.assigned_coordinators.filter((id: number) => id !== coordinatorId)
                            onInputChange("assigned_coordinators", updated)
                          }}
                          className="text-red-500 hover:text-red-700 text-lg font-bold"
                          title="Remove coordinator"
                        >
                          ×
                        </button>
                      </div>
                    ) : null
                  })}
                </div>
              )}
            </div>
          )}
          
        </div>
      </CardContent>
    </Card>
  )
}

export default CurrentRoleStep
