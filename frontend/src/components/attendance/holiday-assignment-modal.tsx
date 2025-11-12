'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, AlertCircle } from 'lucide-react'
import { createHoliday, updateHoliday, getHolidays } from '@/lib/api'
import { toast } from 'sonner'

interface Holiday {
  id: number
  date: string
  reason: string
  level_id: number
  level_name: string
  created_by: string
}

interface Level {
  id: number
  name: string
}

interface HolidayAssignmentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  levels: Level[]
  editingHoliday?: Holiday | null
  onSuccess?: () => void
}

export default function HolidayAssignmentModal({
  open,
  onOpenChange,
  levels,
  editingHoliday,
  onSuccess
}: HolidayAssignmentModalProps) {
  const [formData, setFormData] = useState({
    date: '',
    reason: '',
    level_id: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showPastDateWarning, setShowPastDateWarning] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (editingHoliday) {
      setFormData({
        date: editingHoliday.date,
        reason: editingHoliday.reason,
        level_id: String(editingHoliday.level_id)
      })
    } else {
      setFormData({
        date: '',
        reason: '',
        level_id: levels.length === 1 ? String(levels[0].id) : ''
      })
    }
  }, [editingHoliday, levels, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.date || !formData.reason.trim() || !formData.level_id) {
      toast.error('Please fill in all fields')
      return
    }

    // Check if date is in the past
    const selectedDate = new Date(formData.date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (selectedDate < today && !editingHoliday) {
      setShowPastDateWarning(true)
      return
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
      setShowPastDateWarning(false)
      setConfirmText('')
      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (error: any) {
      toast.error(error.message || `Failed to ${editingHoliday ? 'update' : 'create'} holiday`)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePastDateConfirm = () => {
    if (confirmText === 'CONFIRM') {
      submitHoliday()
    } else {
      toast.error('Please type "CONFIRM" to proceed')
    }
  }

  const handleClose = () => {
    setFormData({ date: '', reason: '', level_id: levels.length === 1 ? String(levels[0].id) : '' })
    setShowPastDateWarning(false)
    setConfirmText('')
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {editingHoliday ? 'Edit Holiday' : 'Create New Holiday'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (editingHoliday ? 'Updating...' : 'Creating...') : (editingHoliday ? 'Update Holiday' : 'Create Holiday')}
              </Button>
            </DialogFooter>
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
    </>
  )
}

