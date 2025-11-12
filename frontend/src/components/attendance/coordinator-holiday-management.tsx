'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  createHoliday, 
  getHolidays,
  updateHoliday,
  deleteHoliday
} from '@/lib/api'
import { 
  Calendar, 
  Plus, 
  Trash2, 
  Edit,
  AlertCircle,
  CheckCircle,
  X
} from 'lucide-react'
import { toast } from 'sonner'

interface Holiday {
  id: number
  date: string
  reason: string
  level_id: number
  level_name: string
  created_by?: string
}

interface Level {
  id: number
  name: string
}

interface CoordinatorHolidayManagementProps {
  levels: Level[]
  onSuccess?: () => void
}

export default function CoordinatorHolidayManagement({ levels, onSuccess }: CoordinatorHolidayManagementProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingHolidayId, setDeletingHolidayId] = useState<number | null>(null)
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'all'>('all')
  const [showPastDateWarning, setShowPastDateWarning] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [formData, setFormData] = useState({
    date: '',
    reason: '',
    level_id: levels.length === 1 ? String(levels[0].id) : ''
  })

  useEffect(() => {
    if (levels.length > 0) {
      fetchAllHolidays()
    }
  }, [levels, selectedLevelId])

  // Auto-refresh holidays every minute to remove past holidays
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllHolidays()
    }, 60000) // Refresh every minute

    return () => clearInterval(interval)
  }, [levels, selectedLevelId])

  const fetchAllHolidays = async () => {
    setIsLoading(true)
    try {
      const allHolidays: Holiday[] = []
      
      if (selectedLevelId === 'all') {
        // Fetch holidays for all levels
        for (const level of levels) {
          try {
            const data = await getHolidays(level.id)
            const levelHolidays = Array.isArray(data) ? data : []
            allHolidays.push(...levelHolidays.map((h: any) => ({
              ...h,
              level_id: level.id,
              level_name: level.name
            })))
          } catch (error) {
            console.error(`Failed to fetch holidays for level ${level.id}:`, error)
          }
        }
      } else {
        // Fetch holidays for selected level
        const data = await getHolidays(selectedLevelId)
        const levelHolidays = Array.isArray(data) ? data : []
        const level = levels.find(l => l.id === selectedLevelId)
        allHolidays.push(...levelHolidays.map((h: any) => ({
          ...h,
          level_id: selectedLevelId,
          level_name: level?.name || ''
        })))
      }
      
      setHolidays(allHolidays)
    } catch (error) {
      console.error('Failed to fetch holidays:', error)
      toast.error('Failed to load holidays')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.date || !formData.reason.trim() || !formData.level_id) {
      toast.error('Please fill in all fields')
      return
    }

    // Check if date is in the past (only for new holidays)
    if (!editingHoliday) {
      const selectedDate = new Date(formData.date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      if (selectedDate < today) {
        setShowPastDateWarning(true)
        return
      }
    }

    await submitHoliday()
  }

  const submitHoliday = async () => {
    setIsLoading(true)
    try {
      const data = {
        date: formData.date,
        reason: formData.reason.trim(),
        level_id: parseInt(formData.level_id)
      }

      if (editingHoliday) {
        await updateHoliday(editingHoliday.id, data)
        toast.success('Holiday updated successfully')
      } else {
        await createHoliday(data)
        toast.success('Holiday created successfully')
      }

      setFormData({ date: '', reason: '', level_id: levels.length === 1 ? String(levels[0].id) : '' })
      setEditingHoliday(null)
      setShowCreateDialog(false)
      setShowEditDialog(false)
      setShowPastDateWarning(false)
      setConfirmText('')
      fetchAllHolidays()
      if (onSuccess) onSuccess()
    } catch (error: any) {
      toast.error(error.message || `Failed to ${editingHoliday ? 'update' : 'create'} holiday`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteHoliday = async () => {
    if (!deletingHolidayId) return
    
    setIsLoading(true)
    try {
      await deleteHoliday(deletingHolidayId, false)
      toast.success('Holiday deleted successfully')
      setShowDeleteConfirm(false)
      setDeletingHolidayId(null)
      fetchAllHolidays()
      if (onSuccess) onSuccess()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete holiday')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditClick = (holiday: Holiday) => {
    setEditingHoliday(holiday)
    setFormData({
      date: holiday.date,
      reason: holiday.reason,
      level_id: String(holiday.level_id)
    })
    setShowEditDialog(true)
  }

  const handlePastDateConfirm = () => {
    if (confirmText === 'CONFIRM') {
      submitHoliday()
    } else {
      toast.error('Please type "CONFIRM" to proceed')
    }
  }

  const isHolidayToday = (date: string) => {
    const today = new Date().toISOString().split('T')[0]
    return date === today
  }

  const isHolidayPast = (date: string) => {
    const today = new Date().toISOString().split('T')[0]
    return date < today
  }

  const isHolidayUpcoming = (date: string) => {
    const today = new Date().toISOString().split('T')[0]
    return date > today
  }

  const getHolidayStatus = (date: string) => {
    if (isHolidayToday(date)) {
      return { label: 'Today', color: 'bg-blue-100 text-blue-800 border-blue-200' }
    } else if (isHolidayPast(date)) {
      return { label: 'Past', color: 'bg-gray-100 text-gray-800 border-gray-200' }
    } else {
      return { label: 'Upcoming', color: 'bg-green-100 text-green-800 border-green-200' }
    }
  }

  // Filter to show only upcoming holidays (date > today, excluding today and past)
  const today = new Date().toISOString().split('T')[0]
  const filteredHolidays = holidays
    .filter(h => h.date > today) // Only future holidays (exclude today and past)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="flex flex-col h-full space-y-4 overflow-hidden">
      {/* Header with filters and create button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          {levels.length > 1 && (
            <Select value={String(selectedLevelId)} onValueChange={(value) => setSelectedLevelId(value === 'all' ? 'all' : parseInt(value))}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {levels.map((level) => (
                  <SelectItem key={level.id} value={String(level.id)}>
                    {level.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="text-sm text-gray-600">
            {filteredHolidays.length} {filteredHolidays.length === 1 ? 'holiday' : 'holidays'}
          </div>
        </div>
        <Button
          onClick={() => {
            setEditingHoliday(null)
            setFormData({
              date: '',
              reason: '',
              level_id: levels.length === 1 ? String(levels[0].id) : ''
            })
            setShowCreateDialog(true)
          }}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Holiday
        </Button>
      </div>

      {/* Summary Stats - Only Upcoming */}
      <div className="flex-shrink-0">
        <Card className="text-center p-3 sm:p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200">
          <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-1">
            {filteredHolidays.length}
          </div>
          <div className="text-xs sm:text-sm font-semibold text-green-700">Upcoming Holidays</div>
        </Card>
      </div>

      {/* Holidays Table - No scroll, fits in card */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredHolidays.length === 0 ? (
          <Card className="p-8 text-center border-2">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-600 font-semibold mb-1">No Upcoming Holidays</p>
            <p className="text-xs text-gray-400">Click "Add Holiday" to create a new holiday</p>
          </Card>
        ) : (
          <div className="border-2 rounded-lg overflow-hidden shadow-md">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold text-sm py-2">Date</TableHead>
                  <TableHead className="font-semibold text-sm py-2">Reason</TableHead>
                  {levels.length > 1 && <TableHead className="font-semibold text-sm py-2">Level</TableHead>}
                  <TableHead className="font-semibold text-sm py-2">Status</TableHead>
                  <TableHead className="font-semibold text-sm py-2">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHolidays.map((holiday) => {
                  const status = getHolidayStatus(holiday.date)
                  return (
                    <TableRow key={holiday.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium text-sm py-2">
                        {new Date(holiday.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="max-w-xs py-2">
                        <div className="text-sm" title={holiday.reason}>
                          {holiday.reason}
                        </div>
                      </TableCell>
                      {levels.length > 1 && (
                        <TableCell className="text-sm text-gray-600 py-2">
                          {holiday.level_name}
                        </TableCell>
                      )}
                      <TableCell className="py-2">
                        <Badge className={`${status.color} text-xs px-2 py-0.5`}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 w-8 p-0"
                            onClick={() => handleEditClick(holiday)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                            onClick={() => {
                              setDeletingHolidayId(holiday.id)
                              setShowDeleteConfirm(true)
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false)
          setShowEditDialog(false)
          setEditingHoliday(null)
          setFormData({ date: '', reason: '', level_id: levels.length === 1 ? String(levels[0].id) : '' })
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {editingHoliday ? 'Edit Holiday' : 'Create New Holiday'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateHoliday} className="space-y-4">
            {levels.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="level_id">Level</Label>
                <Select
                  value={formData.level_id}
                  onValueChange={(value) => setFormData({ ...formData, level_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((level) => (
                      <SelectItem key={level.id} value={String(level.id)}>
                        {level.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for holiday..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowCreateDialog(false)
                  setShowEditDialog(false)
                  setEditingHoliday(null)
                  setFormData({ date: '', reason: '', level_id: levels.length === 1 ? String(levels[0].id) : '' })
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (editingHoliday ? 'Updating...' : 'Creating...') : (editingHoliday ? 'Update Holiday' : 'Create Holiday')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Past Date Warning Dialog */}
      <Dialog open={showPastDateWarning} onOpenChange={setShowPastDateWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Warning: Past Date Selected
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium mb-2">
                ⚠️ This will replace existing attendance with Holiday status.
              </p>
              <p className="text-sm text-red-700">
                This action cannot be undone. Existing attendance will be archived.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmText">
                Type "CONFIRM" to proceed:
              </Label>
              <Input
                id="confirmText"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type CONFIRM here"
                className="font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowPastDateWarning(false)
                  setConfirmText('')
                }}
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={handlePastDateConfirm}
                disabled={confirmText !== 'CONFIRM'}
                className="bg-red-600 hover:bg-red-700"
              >
                Confirm & Create Holiday
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Confirm Delete
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Are you sure you want to delete this holiday? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeletingHolidayId(null)
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={handleDeleteHoliday}
                disabled={isLoading}
                className="bg-red-600 hover:bg-red-700"
              >
                {isLoading ? 'Deleting...' : 'Delete Holiday'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

