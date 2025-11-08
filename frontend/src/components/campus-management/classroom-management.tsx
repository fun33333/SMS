"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Edit, Trash2, Users, UserPlus, Clock } from "lucide-react"
import { 
  getClassrooms, 
  createClassroom, 
  updateClassroom, 
  deleteClassroom,
  getGrades,
  getLevels,
  getAvailableTeachers,
  assignTeacherToClassroom,
  unassignTeacherFromClassroom,
  getUserCampusId
} from "@/lib/api"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

interface ClassroomManagementProps {
  campusId?: number
}

export default function ClassroomManagement({ campusId }: ClassroomManagementProps) {
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [grades, setGrades] = useState<any[]>([])
  const [levels, setLevels] = useState<any[]>([])
  const [availableTeachers, setAvailableTeachers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isTeacherDialogOpen, setIsTeacherDialogOpen] = useState(false)
  const [editingClassroom, setEditingClassroom] = useState<any>(null)
  const [selectedClassroom, setSelectedClassroom] = useState<any>(null)
  const [formData, setFormData] = useState({
    level: '',
    grade: '',
    section: 'A',
    capacity: '30',
    shift: 'morning'
  })
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedGrade, setSelectedGrade] = useState<string>('all')
  const [mobileOpen, setMobileOpen] = useState(false)
  
  // Get campus ID from localStorage if not provided
  const userCampusId = campusId || getUserCampusId()

  useEffect(() => {
    fetchData()
  }, [userCampusId, selectedGrade])

  async function fetchData() {
    setLoading(true)
    try {
      const gradeId = selectedGrade !== 'all' ? parseInt(selectedGrade) : undefined
      
      const [classroomsData, gradesData, levelsData, teachersData] = await Promise.all([
        getClassrooms(
          gradeId,
          undefined,
          userCampusId || undefined
        ),
        getGrades(undefined, userCampusId || undefined),
        getLevels(userCampusId || undefined),
        getAvailableTeachers(userCampusId || undefined)
      ])
      // Handle paginated responses
      const classroomsArray = (classroomsData as any)?.results || (Array.isArray(classroomsData) ? classroomsData : [])
      const gradesArray = (gradesData as any)?.results || (Array.isArray(gradesData) ? gradesData : [])
      const levelsArray = (levelsData as any)?.results || (Array.isArray(levelsData) ? levelsData : [])
      const teachersArray = (teachersData as any)?.results || (Array.isArray(teachersData) ? teachersData : [])
      
      setClassrooms(classroomsArray)
      setGrades(gradesArray)
      setLevels(levelsArray)
      setAvailableTeachers(teachersArray)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleCreate() {
    setEditingClassroom(null)
    const defaultLevelId = levels.length > 0 ? levels[0].id.toString() : ''
    const defaultShift = levels.length > 0 ? (levels[0].shift || 'morning') : 'morning'
    const firstGradeForLevel = defaultLevelId ? grades.find((g: any) => String(g.level) === defaultLevelId) : undefined
    setFormData({
      level: defaultLevelId,
      grade: firstGradeForLevel ? firstGradeForLevel.id.toString() : '',
      section: 'A',
      capacity: '30',
      shift: defaultShift
    })
    setIsDialogOpen(true)
  }

  function handleEdit(classroom: any) {
    setEditingClassroom(classroom)
    const gradeObj = grades.find((g: any) => String(g.id) === String(classroom.grade))
    const levelId = gradeObj ? String(gradeObj.level) : ''
    setFormData({
      level: levelId,
      grade: classroom.grade.toString(),
      section: classroom.section,
      capacity: classroom.capacity.toString(),
      shift: classroom.shift || 'morning'
    })
    setIsDialogOpen(true)
  }

  async function handleSave() {
    // Block edits if a teacher is assigned to this classroom
    if (editingClassroom && (editingClassroom.class_teacher || editingClassroom.class_teacher_name)) {
      alert('Please unassign the current class teacher before updating this classroom.')
      return
    }

    if (!formData.level || !formData.grade || !formData.section) {
      alert('Please select level, grade and section')
      return
    }

    setSaving(true)
    try {
      const data = {
        grade: parseInt(formData.grade),
        section: formData.section,
        capacity: parseInt(formData.capacity),
        shift: formData.shift
      }
      
      if (editingClassroom) {
        await updateClassroom(editingClassroom.id, data)
      } else {
        await createClassroom(data)
      }
      
      setIsDialogOpen(false)
      fetchData()
    } catch (error: any) {
      console.error('Failed to save classroom:', error)
      const errorMessage = error?.message || 'Failed to save classroom. Please try again.'
      alert(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(classroom: any) {
    if (!confirm(`Are you sure you want to delete ${classroom.grade_name} - ${classroom.section}?`)) {
      return
    }

    try {
      await deleteClassroom(classroom.id)
      fetchData()
    } catch (error: any) {
      console.error('Failed to delete classroom:', error)
      const errorMessage = error?.message || 'Failed to delete classroom. It may have assigned students.'
      alert(errorMessage)
    }
  }

  async function handleAssignTeacher(classroom: any) {
    setSelectedClassroom(classroom)
    setSelectedTeacher(classroom.class_teacher?.toString() || '')
    // Load filtered teachers from backend by shift
    try {
      const shift = (classroom.shift || '').toString()
      const teachersData = await getAvailableTeachers(userCampusId || undefined, shift)
      const teachersArray = (teachersData as any)?.results || (Array.isArray(teachersData) ? teachersData : [])
      setAvailableTeachers(teachersArray)
    } catch (e) {
      console.error('Failed to load available teachers by shift', e)
    }
    setIsTeacherDialogOpen(true)
  }

  async function handleSaveTeacherAssignment() {
    if (!selectedTeacher || !selectedClassroom) {
      alert('Please select a teacher')
      return
    }

    setSaving(true)
    try {
      await assignTeacherToClassroom(selectedClassroom.id, parseInt(selectedTeacher))
      
      // Close modal
      setIsTeacherDialogOpen(false)
      
      // Show success message
      const teacherName = availableTeachers.find(t => t.id === parseInt(selectedTeacher))?.full_name || 'Teacher'
      const classroomName = `${selectedClassroom.grade_name}-${selectedClassroom.section}`
      alert(`${teacherName} assigned to ${classroomName} successfully!`)
      
      // Auto-refresh classroom list
      await fetchData()
      // Reset available teachers to full list after refresh
      try {
        const teachersData = await getAvailableTeachers(userCampusId || undefined)
        const teachersArray = (teachersData as any)?.results || (Array.isArray(teachersData) ? teachersData : [])
        setAvailableTeachers(teachersArray)
      } catch {}
      
    } catch (error: any) {
      // The handleApiError function now properly extracts the specific error message
      const errorMessage = error?.message || 'Failed to assign teacher. Please try again.'
      
      // Only log as error if it's not a validation error (400 status)
      if (error?.status !== 400) {
        console.error('Failed to assign teacher:', error)
      } else {
        console.warn('Teacher assignment validation:', errorMessage)
      }
      
      alert(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingSpinner message="Loading classrooms..." />
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start sm:items-center gap-3 flex-col sm:flex-row">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold" style={{ color: '#1976D2' }}>Manage Classrooms</h2>
          <p className="text-xs sm:text-sm text-gray-600">
            Create classrooms and assign teachers
          </p>
        </div>
        <Button 
          onClick={handleCreate} 
          className="w-full sm:w-auto flex items-center justify-center gap-2"
          style={{ backgroundColor: '#2196F3', color: 'white' }}
        >
          <Plus className="h-4 w-4" />
          Create Classroom
        </Button>
      </div>

      {/* Mobile collapse toggle */}
      <div className="sm:hidden">
        <Button variant="outline" onClick={() => setMobileOpen(!mobileOpen)} className="w-full">
          {mobileOpen ? 'Hide List' : 'Show List'}
        </Button>
      </div>

      {/* Grade Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-gray-50 p-3 sm:p-4 rounded-lg">
        <Label className="font-semibold text-sm">Filter by Grade:</Label>
        <Select value={selectedGrade} onValueChange={setSelectedGrade}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {grades.map((grade) => (
              <SelectItem key={grade.id} value={grade.id.toString()}>
                {grade.name} ({classrooms.filter(c => String(c.grade) === String(grade.id)).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="sm:ml-2 inline-flex items-center">
          <span className="px-3 py-1 rounded-full text-xs sm:text-sm font-medium" style={{ backgroundColor: '#E3F2FD', color: '#1976D2' }}>
            Total: {classrooms.length}
          </span>
        </div>
        
        {grades.length === 0 && (
          <p className="text-sm text-amber-600">
            No grades found. Create a grade first to add classrooms.
          </p>
        )}
      </div>

      {classrooms.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">
            {selectedGrade !== 'all' 
              ? 'No classrooms found for this grade'
              : 'No classrooms found for your campus'}
          </p>
          {grades.length > 0 && (
            <Button onClick={handleCreate} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Classroom
            </Button>
          )}
        </div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className={(mobileOpen ? 'grid' : 'hidden') + ' sm:hidden grid-cols-1 gap-3'}>
          {classrooms.map((classroom) => (
            <div key={classroom.id} className="rounded-lg border p-4 shadow-sm bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-base font-semibold">{classroom.grade_name} - {classroom.section}</div>
                  <div className="text-xs text-gray-500">Capacity: {classroom.capacity}</div>
                </div>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">{classroom.code}</span>
              </div>
              <div className="mt-2 text-xs text-gray-700">
                {classroom.class_teacher_name ? (
                  <div>Teacher: <span className="font-medium">{classroom.class_teacher_name}</span> ({classroom.class_teacher_code})</div>
                ) : (
                  <div className="text-gray-500">Teacher: Not Assigned</div>
                )}
                {classroom.assigned_by_name && (
                  <div className="text-[10px] text-gray-500 mt-1">By {classroom.assigned_by_name}{classroom.assigned_at ? ` on ${new Date(classroom.assigned_at).toLocaleDateString()}` : ''}</div>
                )}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleAssignTeacher(classroom)} title="Assign Teacher">
                  <UserPlus className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleEdit(classroom)} className="text-gray-700 hover:text-gray-900">
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(classroom)} className="text-red-600 hover:text-red-800">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className={(mobileOpen ? 'hidden' : 'hidden') + ' sm:block overflow-x-auto -mx-4 sm:mx-0'}>
        <Table className="min-w-[880px] sm:min-w-0">
          <TableHeader>
            <TableRow style={{ backgroundColor: '#1976D2' }}>
              <TableHead className="text-white font-semibold">Classroom</TableHead>
              <TableHead className="text-white font-semibold">Code</TableHead>
              <TableHead className="text-white font-semibold">Grade</TableHead>
              <TableHead className="text-white font-semibold">Section</TableHead>
              <TableHead className="text-white font-semibold">Capacity</TableHead>
              <TableHead className="text-white font-semibold">Class Teacher</TableHead>
              <TableHead className="text-white font-semibold">Assigned By</TableHead>
              <TableHead className="text-right text-white font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {classrooms.map((classroom) => (
              <TableRow key={classroom.id}>
                <TableCell className="font-medium">
                  {classroom.grade_name} - {classroom.section}
                </TableCell>
                <TableCell>
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs sm:text-sm font-mono">
                    {classroom.code}
                  </span>
                </TableCell>
                <TableCell>{classroom.grade_name}</TableCell>
                <TableCell>{classroom.section}</TableCell>
                <TableCell>{classroom.capacity}</TableCell>
                <TableCell>
                  {classroom.class_teacher_name ? (
                    <div>
                      <div className="text-sm sm:font-medium">{classroom.class_teacher_name}</div>
                      <div className="text-[10px] sm:text-xs text-gray-500">
                        {classroom.class_teacher_code}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400">Not Assigned</span>
                  )}
                </TableCell>
                <TableCell>
                  {classroom.assigned_by_name ? (
                    <div>
                      <div className="text-xs sm:text-sm">{classroom.assigned_by_name}</div>
                      {classroom.assigned_at && (
                        <div className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(classroom.assigned_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAssignTeacher(classroom)}
                      title="Assign Teacher"
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(classroom)}
                      className="text-gray-700 hover:text-gray-900"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(classroom)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        </>
      )}

      {/* Create/Edit Classroom Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingClassroom ? 'Edit Classroom' : 'Create New Classroom'}
            </DialogTitle>
            <DialogDescription>
              {editingClassroom
                ? 'Update the classroom information. Code cannot be changed.'
                : 'Enter the classroom details. Code will be generated automatically.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {editingClassroom?.class_teacher && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-800">
                  A teacher is currently assigned to this classroom. Please unassign the teacher before making changes.
                </p>
              </div>
            )}
            <div className="space-y-2">
            <Label htmlFor="level">Level *</Label>
            {levels.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                  No levels available. Please create a level first.
                  </p>
                </div>
              ) : (
                <Select
                value={formData.level}
                onValueChange={(value) => {
                  const firstGrade = grades.find((g: any) => String(g.level) === value)
                  const levelObj = levels.find((l: any) => String(l.id) === String(value))
                  const levelShift = levelObj?.shift || 'morning'
                  setFormData({ 
                    ...formData, 
                    level: value, 
                    grade: firstGrade ? firstGrade.id.toString() : '',
                    shift: levelShift
                  })
                }}
                >
                  <SelectTrigger>
                  <SelectValue placeholder="Select a level" />
                  </SelectTrigger>
                  <SelectContent>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id.toString()}>
                      {level.name} ({String(level.shift || '').replace(/\b\w/g, (c: string) => c.toUpperCase())})
                    </SelectItem>
                  ))}
                  </SelectContent>
                </Select>
              )}
            </div>

          <div className="space-y-2">
            <Label htmlFor="grade">Grade *</Label>
            {grades.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-800">
                  No grades available. Please create a grade first.
                </p>
              </div>
            ) : (
              <Select
                value={formData.grade}
                onValueChange={(value) => setFormData({ ...formData, grade: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a grade" />
                </SelectTrigger>
                <SelectContent>
                  {grades
                    .filter((g: any) => !formData.level || String(g.level) === String(formData.level))
                    .map((grade) => (
                      <SelectItem key={grade.id} value={grade.id.toString()}>
                        {grade.name} ({grade.level_name})
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

            <div className="space-y-2">
              <Label htmlFor="section">Section *</Label>
              <Select
                value={formData.section}
                onValueChange={(value) => setFormData({ ...formData, section: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['A', 'B', 'C', 'D', 'E'].map((section) => (
                    <SelectItem key={section} value={section}>
                      Section {section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shift">Shift</Label>
              <Select
                value={formData.shift}
                onValueChange={(value) => setFormData({ ...formData, shift: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const levelObj = levels.find((l: any) => String(l.id) === String(formData.level))
                    const levelShift = (levelObj?.shift || '').toString()
                    if (levelShift === 'afternoon') {
                      return (<>
                        <SelectItem value="afternoon">Afternoon</SelectItem>
                      </>)
                    }
                    if (levelShift === 'morning') {
                      return (<>
                        <SelectItem value="morning">Morning</SelectItem>
                      </>)
                    }
                    // fallback when no level selected
                    return (<>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="afternoon">Afternoon</SelectItem>
                    </>)
                  })()}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity *</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              />
            </div>

            {editingClassroom && (
              <div className="space-y-2">
                <Label>Classroom Code</Label>
                <Input
                  value={editingClassroom.code}
                  disabled
                  className="bg-gray-100"
                />
                <p className="text-xs text-gray-500">
                  System-generated code cannot be modified
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={saving}
              className="text-gray-700 hover:text-gray-900"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || grades.length === 0}
              style={{ backgroundColor: '#2196F3', color: 'white' }}
            >
              {saving ? 'Saving...' : editingClassroom ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Teacher Dialog */}
      <Dialog open={isTeacherDialogOpen} onOpenChange={setIsTeacherDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Class Teacher</DialogTitle>
            <DialogDescription>
              Assign a teacher to {selectedClassroom?.grade_name} - {selectedClassroom?.section}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedClassroom?.class_teacher_name && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800 font-medium">Current Teacher:</p>
                <p className="text-sm">{selectedClassroom.class_teacher_name}</p>
                <p className="text-xs text-gray-600">{selectedClassroom.class_teacher_code}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="teacher">Select Teacher *</Label>
              {availableTeachers.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    No available teachers. All teachers are already assigned.
                  </p>
                </div>
              ) : (
                <Select
                  value={selectedTeacher}
                  onValueChange={setSelectedTeacher}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id.toString()}>
                        {teacher.full_name} ({teacher.employee_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            {selectedClassroom?.class_teacher && (
              <div className="flex justify-between items-center pt-2">
                <div className="text-xs text-gray-600">
                  Currently assigned: {selectedClassroom.class_teacher_name || 'Unknown'}
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!confirm('Unassign current class teacher from this classroom?')) return
                    setSaving(true)
                    try {
                      await unassignTeacherFromClassroom(selectedClassroom.id)
                      setIsTeacherDialogOpen(false)
                      await fetchData()
                    } catch (e: any) {
                      alert(e?.message || 'Failed to unassign teacher')
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  Unassign
                </Button>
              </div>
            )}
            </div>

            {selectedClassroom?.assigned_by_name && (
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="text-xs text-gray-600">Last Assignment:</p>
                <p className="text-sm">By: {selectedClassroom.assigned_by_name}</p>
                {selectedClassroom.assigned_at && (
                  <p className="text-xs text-gray-500">
                    On: {new Date(selectedClassroom.assigned_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsTeacherDialogOpen(false)}
              disabled={saving}
              className="text-gray-700 hover:text-gray-900"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveTeacherAssignment} 
              disabled={saving || !selectedTeacher || availableTeachers.length === 0}
              style={{ backgroundColor: '#2196F3', color: 'white' }}
            >
              {saving ? 'Assigning...' : 'Assign Teacher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

