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
import { Plus, Edit, Trash2, GraduationCap, ArrowRight } from "lucide-react"
import { getGrades, createGrade, updateGrade, deleteGrade, getLevels, getUserCampusId } from "@/lib/api"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

interface GradeManagementProps {
  campusId?: number
}

const GRADE_OPTIONS_BY_LEVEL = {
  'Pre-Primary': ['Nursery', 'KG-I', 'KG-II'],
  'Primary': ['Grade-1', 'Grade-2', 'Grade-3', 'Grade-4', 'Grade-5'],
  'Secondary': ['Grade-6', 'Grade-7', 'Grade-8', 'Grade-9', 'Grade-10'],
};

export default function GradeManagement({ campusId }: GradeManagementProps) {
  const [grades, setGrades] = useState<any[]>([])
  const [levels, setLevels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingGrade, setEditingGrade] = useState<any>(null)
  const [formData, setFormData] = useState({ name: '', level: '' })
  const [saving, setSaving] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState<string>('all')
  const [mobileOpen, setMobileOpen] = useState(false)
  
  // Get campus ID from localStorage if not provided
  const userCampusId = campusId || getUserCampusId()

  useEffect(() => {
    fetchData()
  }, [userCampusId, selectedLevel])

  async function fetchData() {
    setLoading(true)
    try {
      const levelId = selectedLevel !== 'all' ? parseInt(selectedLevel) : undefined
      
      const [gradesData, levelsData] = await Promise.all([
        getGrades(levelId, userCampusId || undefined),
        getLevels(userCampusId || undefined)
      ])
      // Handle paginated responses
      const gradesArray = (gradesData as any)?.results || (Array.isArray(gradesData) ? gradesData : [])
      const levelsArray = (levelsData as any)?.results || (Array.isArray(levelsData) ? levelsData : [])
      
      setGrades(gradesArray)
      setLevels(levelsArray)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleCreate() {
    setEditingGrade(null)
    setFormData({ name: '', level: levels.length > 0 ? levels[0].id.toString() : '' })
    setIsDialogOpen(true)
  }

  function handleEdit(grade: any) {
    setEditingGrade(grade)
    setFormData({ name: grade.name, level: grade.level.toString() })
    setIsDialogOpen(true)
  }

  async function handleSave() {
    if (!formData.name.trim() || !formData.level) {
      alert('Please enter grade name and select a level')
      return
    }

    setSaving(true)
    try {
      if (editingGrade) {
        await updateGrade(editingGrade.id, formData)
      } else {
        await createGrade(formData)
      }
      
      setIsDialogOpen(false)
      fetchData()
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to save grade. Please try again.'
      
      
      alert(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(grade: any) {
    if (!confirm(`Are you sure you want to delete ${grade.name}?`)) {
      return
    }

    try {
      await deleteGrade(grade.id)
      fetchData()
    } catch (error) {
      alert('Failed to delete grade. It may have associated classrooms.')
    }
  }

  if (loading) {
    return <LoadingSpinner message="Loading grades..." />
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start sm:items-center gap-3 flex-col sm:flex-row">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold" style={{ color: '#1976D2' }}>Manage Grades</h2>
          <p className="text-xs sm:text-sm text-gray-600">
            Create and manage grades for each level
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button 
            onClick={handleCreate} 
            className="w-full sm:w-auto flex items-center justify-center gap-2"
            style={{ backgroundColor: '#2196F3', color: 'white' }}
          >
            <Plus className="h-4 w-4" />
            Create Grade
          </Button>
        </div>
      </div>

      {/* Mobile collapse toggle */}
      <div className="sm:hidden">
        <Button variant="outline" onClick={() => setMobileOpen(!mobileOpen)} className="w-full">
          {mobileOpen ? 'Hide List' : 'Show List'}
        </Button>
      </div>

      {/* Level Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-gray-50 p-3 sm:p-4 rounded-lg">
        <Label className="font-semibold text-sm">Filter by Level:</Label>
        <Select value={selectedLevel} onValueChange={setSelectedLevel}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {levels.map((level) => (
              <SelectItem key={level.id} value={level.id.toString()}>
                {level.name} ({String(level.shift || '').replace(/\b\w/g, (c: string) => c.toUpperCase())}) ({grades.filter(g => String(g.level) === String(level.id)).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="sm:ml-2 inline-flex items-center">
          <span className="px-3 py-1 rounded-full text-xs sm:text-sm font-medium" style={{ backgroundColor: '#E3F2FD', color: '#1976D2' }}>
            Total: {grades.length}
          </span>
        </div>
        
        {levels.length === 0 && (
          <p className="text-sm text-amber-600">
            No levels found. Create a level first to add grades.
          </p>
        )}
      </div>

      {grades.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <GraduationCap className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">
            {selectedLevel !== 'all' 
              ? 'No grades found for this level'
              : 'No grades found for your campus'}
          </p>
          {levels.length > 0 && (
            <Button onClick={handleCreate} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Grade
            </Button>
          )}
        </div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className={(mobileOpen ? 'grid' : 'hidden') + ' sm:hidden grid-cols-1 gap-3'}>
          {grades.map((grade) => (
            <div key={grade.id} className="rounded-lg border p-4 shadow-sm bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-base font-semibold">{grade.name}</div>
                  <div className="text-xs text-gray-500">{grade.level_name}</div>
                </div>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">{grade.code}</span>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleEdit(grade)} className="text-gray-700 hover:text-gray-900">
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(grade)} className="text-red-600 hover:text-red-800">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0">
        <Table className="min-w-[640px] sm:min-w-full">
          <TableHeader>
            <TableRow style={{ backgroundColor: '#1976D2' }}>
              <TableHead className="text-white font-semibold">Grade Name</TableHead>
              <TableHead className="text-white font-semibold">Code</TableHead>
              <TableHead className="text-white font-semibold">Level</TableHead>
              <TableHead className="text-right text-white font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grades.map((grade) => (
              <TableRow key={grade.id}>
                <TableCell className="font-medium">{grade.name}</TableCell>
                <TableCell>
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs sm:text-sm font-mono">
                    {grade.code}
                  </span>
                </TableCell>
                <TableCell>{grade.level_name}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(grade)}
                      className="text-gray-700 hover:text-gray-900"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(grade)}
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

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingGrade ? 'Edit Grade' : 'Create New Grade'}
            </DialogTitle>
            <DialogDescription>
              {editingGrade
                ? 'Update the grade information. Code cannot be changed.'
                : 'Enter the grade details. Code will be generated automatically.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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
                  onValueChange={(value) => setFormData({ ...formData, level: value })}
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
              <Label htmlFor="name">Grade Name *</Label>
              <Select value={formData.name} onValueChange={(value) => setFormData({ ...formData, name: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a grade" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const selectedLevelObj = levels.find((l: any) => l.id === parseInt(formData.level));
                    const availableGrades = selectedLevelObj 
                      ? GRADE_OPTIONS_BY_LEVEL[selectedLevelObj.name as keyof typeof GRADE_OPTIONS_BY_LEVEL] || []
                      : [];
                    return availableGrades.map((grade: string) => (
                      <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>

            {editingGrade && (
              <div className="space-y-2">
                <Label>Grade Code</Label>
                <Input
                  value={editingGrade.code}
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
              disabled={saving || levels.length === 0}
              style={{ backgroundColor: '#365486', color: 'white' }}
            >
              {saving ? 'Saving...' : editingGrade ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

