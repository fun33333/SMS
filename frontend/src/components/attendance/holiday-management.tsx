'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
  CheckCircle
} from 'lucide-react'
import { toast } from 'sonner'

interface Holiday {
  id: number
  date: string
  reason: string
  created_by: string
}

interface HolidayManagementProps {
  levelId: number
  levelName: string
}

export default function HolidayManagement({ levelId, levelName }: HolidayManagementProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showPastDateWarning, setShowPastDateWarning] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingHolidayId, setDeletingHolidayId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    date: '',
    reason: ''
  })

  useEffect(() => {
    fetchHolidays()
  }, [levelId])

  const fetchHolidays = async () => {
    setIsLoading(true)
    try {
      const data = await getHolidays({ levelId })
      setHolidays(data as Holiday[])
    } catch (error) {
      console.error('Failed to fetch holidays:', error)
      toast.error('Failed to load holidays')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.date || !formData.reason.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    // Check if date is in the past (only for new holidays)
    if (!editingHoliday) {
      const selectedDate = new Date(formData.date)
      const today = new Date()
      today.setHours(0, 0, 0, 0) // Reset time to start of day
      
      if (selectedDate < today) {
        setShowPastDateWarning(true)
        return
      }
    }

    await createHolidayDirect()
  }

  const createHolidayDirect = async () => {
    setIsLoading(true)
    try {
      if (editingHoliday) {
        await updateHoliday(editingHoliday.id, {
          date: formData.date,
          reason: formData.reason.trim(),
          level_id: levelId
        })
        toast.success('Holiday updated successfully')
      } else {
        await createHoliday({
          date: formData.date,
          reason: formData.reason.trim(),
          level_id: levelId
        })
        toast.success('Holiday created successfully')
      }
      setFormData({ date: '', reason: '' })
      setEditingHoliday(null)
      setShowCreateDialog(false)
      setShowPastDateWarning(false)
      setConfirmText('')
      fetchHolidays()
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
      fetchHolidays()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete holiday')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePastDateConfirm = () => {
    if (confirmText === 'CONFIRM') {
      createHolidayDirect()
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

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Holidays - {levelName}
          </div>
          <Dialog open={showCreateDialog} onOpenChange={(open) => {
            setShowCreateDialog(open)
            if (!open) {
              setEditingHoliday(null)
              setFormData({ date: '', reason: '' })
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Holiday
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  {editingHoliday ? 'Edit Holiday' : 'Create New Holiday'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateHoliday} className="space-y-4">
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
                    onClick={() => setShowCreateDialog(false)}
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
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : holidays.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No holidays defined for this level</p>
            <p className="text-xs">Click "Add Holiday" to create one</p>
          </div>
        ) : (
          <div className="space-y-3 h-full flex flex-col">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 bg-blue-50 rounded-lg">
                <div className="text-lg font-bold text-blue-600">
                  {holidays.filter(h => isHolidayToday(h.date)).length}
                </div>
                <div className="text-xs text-blue-600">Today</div>
              </div>
              <div className="text-center p-2 bg-green-50 rounded-lg">
                <div className="text-lg font-bold text-green-600">
                  {holidays.filter(h => isHolidayUpcoming(h.date)).length}
                </div>
                <div className="text-xs text-green-600">Upcoming</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-600">
                  {holidays.filter(h => isHolidayPast(h.date)).length}
                </div>
                <div className="text-xs text-gray-600">Past</div>
              </div>
            </div>

            {/* Holidays Table */}
            <div className="flex-1 overflow-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((holiday) => {
                    const status = getHolidayStatus(holiday.date)
                    return (
                      <TableRow key={holiday.id}>
                        <TableCell className="font-medium">
                          {new Date(holiday.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {holiday.reason}
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {holiday.created_by}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => {
                                setEditingHoliday(holiday)
                                setFormData({
                                  date: holiday.date,
                                  reason: holiday.reason
                                })
                                setShowCreateDialog(true)
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
          </div>
        )}
      </CardContent>
    </Card>
  )
}
