"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Plus, Edit, Trash2, School, UserPlus } from "lucide-react"
import { 
  getLevels, createLevel, updateLevel, deleteLevel, getUserCampusId,
  assignCoordinatorToLevel, getAvailableCoordinators
} from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

interface LevelManagementProps {
  campusId?: number
}

const LEVEL_OPTIONS = [
  { value: 'Pre-Primary', label: 'Pre-Primary (Nursery, KG-I, KG-II)' },
  { value: 'Primary', label: 'Primary (Grade 1-5)' },
  { value: 'Secondary', label: 'Secondary (Grade 6-10)' },
];

export default function LevelManagement({ campusId }: LevelManagementProps) {
  const [levels, setLevels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingLevel, setEditingLevel] = useState<any>(null)
  const [formData, setFormData] = useState({ name: '', shift: 'morning' })
  const [saving, setSaving] = useState(false)
  
  // Coordinator assignment state
  const [coordinatorModalOpen, setCoordinatorModalOpen] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState<any>(null)
  const [availableCoordinators, setAvailableCoordinators] = useState<any[]>([])
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [loadingCoordinators, setLoadingCoordinators] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  
  const userCampusId = campusId || getUserCampusId()

  useEffect(() => {
    fetchLevels()
  }, [userCampusId])

  async function fetchLevels() {
    setLoading(true)
    try {
      const data = await getLevels(userCampusId || undefined)
      // Handle paginated response
      const levelsArray = (data as any)?.results || (Array.isArray(data) ? data : [])
      setLevels(levelsArray)
    } catch (error) {
      console.error('Failed to fetch levels:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleCreate() {
    setEditingLevel(null)
    setFormData({ name: '', shift: 'morning' })
    setIsDialogOpen(true)
  }

  function handleEdit(level: any) {
    setEditingLevel(level)
    setFormData({ name: level.name, shift: level.shift || 'morning' })
    setIsDialogOpen(true)
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      alert('Please enter a level name')
      return
    }
    if (!formData.shift) {
      alert('Please select a shift')
      return
    }

    if (!userCampusId && !editingLevel) {
      alert('Campus information not found. Please log in again.')
      return
    }

    setSaving(true)
    try {
      if (editingLevel) {
        await updateLevel(editingLevel.id, formData)
      } else {
        // Include campus field for new level
        const dataWithCampus = {
          ...formData,
          campus: userCampusId
        }
        await createLevel(dataWithCampus)
      }
      
      setIsDialogOpen(false)
      fetchLevels()
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to save level. Please try again.'
      
      
      alert(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(level: any) {
    if (!confirm(`Are you sure you want to delete ${level.name}?`)) {
      return
    }

    try {
      await deleteLevel(level.id)
      fetchLevels()
    } catch (error) {
      alert('Failed to delete level. It may have associated grades.')
    }
  }

  async function openCoordinatorModal(level: any) {
    setSelectedLevel(level)
    setSelectedCoordinatorId('')
    setCoordinatorModalOpen(true)
    setLoadingCoordinators(true)
    setAvailableCoordinators([]) // Reset coordinators
    
    try {
      const coordinators = await getAvailableCoordinators(userCampusId || undefined)
      
      // Ensure coordinators is always an array
      if (Array.isArray(coordinators)) {
        setAvailableCoordinators(coordinators)
      } else {
        setAvailableCoordinators([])
      }
    } catch (error) {
      setAvailableCoordinators([]) // Set empty array on error
      alert('Failed to load coordinators')
    } finally {
      setLoadingCoordinators(false)
    }
  }

  async function handleCoordinatorAssignment() {
    if (!selectedCoordinatorId || !selectedLevel) return

    setAssigning(true)
    try {
      await assignCoordinatorToLevel(selectedLevel.id, parseInt(selectedCoordinatorId))
      setCoordinatorModalOpen(false)
      alert('Coordinator assigned successfully!')
      fetchLevels() // Refresh the list
    } catch (error) {
      alert('Failed to assign coordinator. Please try again.')
    } finally {
      setAssigning(false)
    }
  }

  if (loading) {
    return <LoadingSpinner message="Loading levels..." />
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start sm:items-center gap-3 flex-col sm:flex-row">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold" style={{ color: '#1976D2' }}>Manage Levels</h2>
          <p className="text-xs sm:text-sm text-gray-600">
            Create and manage educational levels for your campus
          </p>
        </div>
        <Button 
          onClick={handleCreate} 
          className="w-full sm:w-auto flex items-center justify-center gap-2"
          style={{ backgroundColor: '#2196F3', color: 'white' }}
        >
          <Plus className="h-4 w-4" />
          Create Level
        </Button>
      </div>

      {/* Mobile collapse toggle */}
      <div className="sm:hidden">
        <Button variant="outline" onClick={() => setMobileOpen(!mobileOpen)} className="w-full">
          {mobileOpen ? 'Hide List' : 'Show List'}
        </Button>
      </div>

      {levels.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <School className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No levels found for your campus</p>
          <Button onClick={handleCreate} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Level
          </Button>
        </div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className={(mobileOpen ? 'grid' : 'hidden') + ' sm:hidden grid-cols-1 gap-3'}>
          {levels.map((level) => (
            <div key={level.id} className="rounded-lg border p-4 shadow-sm bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-base font-semibold">{level.name}</div>
                  <div className="text-xs text-gray-500 capitalize">{level.shift}</div>
                </div>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">{level.code}</span>
              </div>
              <div className="mt-2">
                {level.coordinator_name ? (
                  <div className="text-xs text-gray-700">
                    Coordinator: <span className="font-medium">{level.coordinator_name}</span>
                    <span className="text-gray-500"> ({level.coordinator_code})</span>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => openCoordinatorModal(level)}>
                    <UserPlus className="h-4 w-4 mr-1" /> Assign Coordinator
                  </Button>
                )}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleEdit(level)} className="text-gray-700 hover:text-gray-900">
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(level)} className="text-red-600 hover:text-red-800">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0">
        <Table className="min-w-[720px] sm:min-w-full">
          <TableHeader>
            <TableRow style={{ backgroundColor: '#1976D2' }}>
              <TableHead className="text-white font-semibold">Name</TableHead>
              <TableHead className="text-white font-semibold">Shift</TableHead>
              <TableHead className="text-white font-semibold">Code</TableHead>
              <TableHead className="text-white font-semibold">Coordinator</TableHead>
              <TableHead className="text-right text-white font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {levels.map((level) => (
              <TableRow key={level.id}>
                <TableCell className="font-medium">{level.name}</TableCell>
                <TableCell className="capitalize">{level.shift}</TableCell>
                <TableCell>
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs sm:text-sm font-mono">
                    {level.code}
                  </span>
                </TableCell>
                <TableCell>
                  {level.coordinator_name ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm">{level.coordinator_name}</span>
                      <span className="text-[10px] sm:text-xs text-gray-500">({level.coordinator_code})</span>
                    </div>
                  ) : (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => openCoordinatorModal(level)}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Assign Coordinator
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(level)}
                      className="text-gray-700 hover:text-gray-900"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(level)}
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
              {editingLevel ? 'Edit Level' : 'Create New Level'}
            </DialogTitle>
            <DialogDescription>
              {editingLevel
                ? 'Update the level information. Code cannot be changed.'
                : 'Enter the level name. Code will be generated automatically.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Level Name *</Label>
              <Select value={formData.name} onValueChange={(value) => setFormData({ ...formData, name: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a level" />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shift">Shift *</Label>
              <Select value={formData.shift} onValueChange={(value) => setFormData({ ...formData, shift: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editingLevel && (
              <div className="space-y-2">
                <Label>Level Code</Label>
                <Input
                  value={editingLevel.code}
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
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingLevel ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coordinator Assignment Modal */}
      <Dialog open={coordinatorModalOpen} onOpenChange={setCoordinatorModalOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-full sm:max-w-lg p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Assign Coordinator to {selectedLevel?.name}</DialogTitle>
            <DialogDescription>
              Select a coordinator to assign to this level. Only coordinators from the same campus are available.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Available Coordinators</Label>
              {loadingCoordinators ? (
                <div className="flex items-center gap-2 p-3 border rounded-md">
                  <LoadingSpinner />
                  <span className="text-sm text-gray-600">Loading coordinators...</span>
                </div>
              ) : (
                <Select value={selectedCoordinatorId} onValueChange={setSelectedCoordinatorId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a coordinator" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(availableCoordinators) && availableCoordinators.length > 0 ? (
                      availableCoordinators.map(coord => (
                        <SelectItem key={coord.id} value={coord.id.toString()}>
                          {coord.full_name} ({coord.employee_code})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-coordinators" disabled>
                        No available coordinators
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setCoordinatorModalOpen(false)}
              disabled={assigning}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCoordinatorAssignment} 
              disabled={assigning || !selectedCoordinatorId}
              className="w-full sm:w-auto"
            >
              {assigning ? 'Assigning...' : 'Assign Coordinator'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

