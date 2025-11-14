'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  createHoliday, 
  getHolidays,
  updateHoliday,
  deleteHoliday,
  getGrades
} from '@/lib/api'
import { 
  Calendar, 
  Plus, 
  Trash2, 
  Edit,
  AlertCircle,
  X
} from 'lucide-react'
import { toast } from 'sonner'

type Grade = {
  id: number
  name: string
  level: number | { id: number }
  level_id?: number
}

const extractGrades = (data: any): any[] => {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return []
}

const normalizeGrades = (grades: any[]): Grade[] =>
  grades.map((grade: any) => {
    const levelId =
      typeof grade.level === 'object' && grade.level !== null
        ? grade.level.id
        : grade.level_id ?? grade.level
    return {
      id: grade.id,
      name: grade.name,
      level: levelId,
      level_id: levelId,
    }
  })

const filterGradeIdsForLevels = (
  gradeIds: number[],
  levelIds: number[],
  gradeMap: Record<number, Grade[]>
) => {
  const validGradeIds = new Set<number>()
  levelIds.forEach((levelId) => {
    gradeMap[levelId]?.forEach((grade) => validGradeIds.add(grade.id))
  })
  return gradeIds.filter((gradeId) => validGradeIds.has(gradeId))
}

const areArraysEqual = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort((x, y) => x - y)
  const sortedB = [...b].sort((x, y) => x - y)
  return sortedA.every((value, index) => value === sortedB[index])
}

interface Holiday {
  id: number
  date: string
  reason: string
  level_id?: number
  level_name?: string
  level_ids?: number[]
  level_names?: string[]
  grade_ids?: number[]
  grade_names?: string[]
  created_by?: string
  shifts?: string[]
}

interface Level {
  id: number
  name: string
  shift?: string
}

interface CoordinatorHolidayManagementProps {
  levels: Level[]
  onSuccess?: () => void
}

const SHIFT_ORDER = ['both', 'morning', 'afternoon', 'evening', 'night']

const normalizeShiftValue = (shift?: string | null) => {
  if (!shift) return 'morning'
  const raw = shift.toString().trim().toLowerCase()
  if (!raw) return 'morning'

  if (['all', 'both', 'morning+afternoon', 'morning + afternoon'].includes(raw)) {
    return 'both'
  }
  if (raw.startsWith('morn')) return 'morning'
  if (raw.startsWith('after')) return 'afternoon'
  if (raw.startsWith('even')) return 'evening'
  if (raw.startsWith('night')) return 'night'

  return raw
}

const collectShiftOptions = (levels: Level[]) => {
  const unique = new Set<string>()
  levels.forEach((level) => {
    unique.add(normalizeShiftValue(level.shift))
  })

  const ordered = SHIFT_ORDER.filter((shift) => unique.has(shift))
  const extras = Array.from(unique).filter(
    (shift) => !SHIFT_ORDER.includes(shift)
  )

  let options = [...ordered, ...extras]

  if (unique.size > 1 && !options.includes('both')) {
    options = ['both', ...options]
  }

  if (options.length === 0) {
    options = ['morning']
  }

  // Ensure options are unique while preserving order
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option)) return false
    seen.add(option)
    return true
  })
}

const filterLevelsByShift = (levels: Level[], shift: string) => {
  const normalized = normalizeShiftValue(shift)
  if (normalized === 'both') {
    return levels.filter((level) => {
      const value = normalizeShiftValue(level.shift)
      return value === 'morning' || value === 'afternoon'
    })
  }
  return levels.filter((level) => normalizeShiftValue(level.shift) === normalized)
}

const formatShiftLabel = (shift?: string | null) => {
  const value = normalizeShiftValue(shift)
  if (value === 'both') return 'Morning + Afternoon'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function CoordinatorHolidayManagement({ levels, onSuccess }: CoordinatorHolidayManagementProps) {
  const shiftOptions = useMemo(() => collectShiftOptions(levels), [levels])
  const initialShift = shiftOptions.length > 0 ? shiftOptions[0] : 'morning'
  const initialLevelsForShift = filterLevelsByShift(levels, initialShift)
  const initialLevelSelection = initialLevelsForShift.length === 1 ? [initialLevelsForShift[0].id] : [] as number[]

  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingHolidayId, setDeletingHolidayId] = useState<number | null>(null)
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [selectedShift, setSelectedShift] = useState<string>(initialShift)
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'all'>('all')
  const [showPastDateWarning, setShowPastDateWarning] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [availableGrades, setAvailableGrades] = useState<Record<number, Grade[]>>({})
  const [formState, setFormState] = useState({
    date: '',
    reason: '',
    levelIds: initialLevelSelection,
    gradeIds: [] as number[],
    shift: initialShift,
  })

  const levelsForSelectedShift = useMemo(
    () => filterLevelsByShift(levels, selectedShift),
    [levels, selectedShift]
  )

  const getDefaultLevelIds = useCallback(() => {
    if (levelsForSelectedShift.length === 1) {
      return [levelsForSelectedShift[0].id]
    }
    return [] as number[]
  }, [levelsForSelectedShift])

  useEffect(() => {
    if (!shiftOptions.includes(selectedShift)) {
      setSelectedShift(shiftOptions[0] || 'morning')
    }
  }, [shiftOptions, selectedShift])

  useEffect(() => {
    if (levels.length > 0) {
      fetchAllHolidays()
    }
  }, [levels, selectedLevelId, selectedShift])

  // Auto-refresh holidays every minute to remove past holidays
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllHolidays()
    }, 60000) // Refresh every minute

    return () => clearInterval(interval)
  }, [levels, selectedLevelId, selectedShift])

  useEffect(() => {
    const allowedLevels = levelsForSelectedShift
    const allowedIds = new Set(allowedLevels.map((level) => level.id))

    setFormState((prev) => {
      const filteredLevelIds = prev.levelIds.filter((id) => allowedIds.has(id))
      let adjustedLevelIds = filteredLevelIds
      if (adjustedLevelIds.length === 0 && allowedLevels.length === 1) {
        adjustedLevelIds = [allowedLevels[0].id]
      }
      const adjustedGradeIds = filterGradeIdsForLevels(prev.gradeIds, adjustedLevelIds, availableGrades)

      if (
        areArraysEqual(adjustedLevelIds, prev.levelIds) &&
        areArraysEqual(adjustedGradeIds, prev.gradeIds) &&
        prev.shift === selectedShift
      ) {
        return prev
      }

      return {
        ...prev,
        shift: selectedShift,
        levelIds: adjustedLevelIds,
        gradeIds: adjustedGradeIds,
      }
    })
  }, [levelsForSelectedShift, selectedShift, availableGrades])

  useEffect(() => {
    if (formState.levelIds.length === 0) {
      if (formState.gradeIds.length > 0) {
        setFormState((prev) => ({ ...prev, gradeIds: [] }))
      }
      return
    }

    let isSubscribed = true

    const loadGrades = async () => {
      const gradeMap = await ensureGradesForLevels(formState.levelIds)
      if (!isSubscribed) return
      const filtered = filterGradeIdsForLevels(formState.gradeIds, formState.levelIds, gradeMap)
      if (!areArraysEqual(filtered, formState.gradeIds)) {
        setFormState((prev) => ({ ...prev, gradeIds: filtered }))
      }
    }

    loadGrades()

    return () => {
      isSubscribed = false
    }
  }, [formState.levelIds])

  useEffect(() => {
    const validLevelIds = formState.levelIds.filter((id) => levels.some((level) => level.id === id))
    const defaultLevelIds = getDefaultLevelIds()
    const nextLevelIds = validLevelIds.length > 0 ? validLevelIds : defaultLevelIds

    if (!areArraysEqual(nextLevelIds, formState.levelIds)) {
      setFormState((prev) => ({
        ...prev,
        levelIds: nextLevelIds,
        gradeIds: filterGradeIdsForLevels(prev.gradeIds, nextLevelIds, availableGrades),
      }))
    } else {
      const filteredGrades = filterGradeIdsForLevels(formState.gradeIds, nextLevelIds, availableGrades)
      if (!areArraysEqual(filteredGrades, formState.gradeIds)) {
        setFormState((prev) => ({ ...prev, gradeIds: filteredGrades }))
      }
    }
  }, [levels])

  const fetchAllHolidays = async () => {
    setIsLoading(true)
    try {
      let response: any = []
      if (levels.length === 0) {
        setHolidays([])
        return
      }

      const shiftParam = normalizeShiftValue(selectedShift)

      if (selectedLevelId === 'all') {
        const levelIds = levels.map((level) => level.id)
        response = await getHolidays({
          levelIds,
          shift: shiftParam,
        })
      } else {
        response = await getHolidays({
          levelId: Number(selectedLevelId),
          shift: shiftParam,
        })
      }

      const rawHolidays = Array.isArray(response)
        ? response
        : Array.isArray(response?.results)
          ? response.results
          : []

      const normalizedHolidays: Holiday[] = rawHolidays.map((holiday: any) => ({
        ...holiday,
        level_ids: holiday.level_ids?.length
          ? holiday.level_ids
          : holiday.level_id
            ? [holiday.level_id]
            : [],
        level_names: holiday.level_names?.length
          ? holiday.level_names
          : holiday.level_name
            ? [holiday.level_name]
            : [],
        grade_ids: holiday.grade_ids?.length ? holiday.grade_ids : [],
        grade_names: holiday.grade_names?.length ? holiday.grade_names : [],
        shifts: Array.isArray(holiday.shifts) ? holiday.shifts.map((shift: string) => normalizeShiftValue(shift)) : [],
      }))

      setHolidays(normalizedHolidays)
    } catch (error) {
      console.error('Failed to fetch holidays:', error)
      toast.error('Failed to load holidays')
    } finally {
      setIsLoading(false)
    }
  }

  const ensureGradesForLevels = useCallback(async (levelIds: number[]) => {
    const uniqueLevelIds = Array.from(new Set(levelIds))
    const gradeMap = { ...availableGrades }
    const missingLevels = uniqueLevelIds.filter((levelId) => !gradeMap[levelId])

    if (missingLevels.length === 0) {
      return gradeMap
    }

    try {
      const fetched = await Promise.all(
        missingLevels.map(async (levelId) => {
          const gradeResponse = await getGrades(levelId)
          const normalized = normalizeGrades(extractGrades(gradeResponse))
          return { levelId, grades: normalized }
        })
      )

      const nextGradeMap = { ...gradeMap }
      fetched.forEach(({ levelId, grades }) => {
        nextGradeMap[levelId] = grades
      })

      setAvailableGrades(nextGradeMap)
      return nextGradeMap
    } catch (error) {
      console.error('Failed to fetch grades:', error)
      toast.error('Failed to load grades for selected levels')
      return gradeMap
    }
  }, [availableGrades])

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formState.date || !formState.reason.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    if (formState.levelIds.length === 0) {
      toast.error('Please select at least one level')
      return
    }

    // Check if date is in the past (only for new holidays)
    if (!editingHoliday) {
      const selectedDate = new Date(formState.date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (selectedDate < today) {
        setShowPastDateWarning(true)
        return
      }
    }

    await submitHoliday()
  }

  const resetForm = () => {
    setFormState({
      date: '',
      reason: '',
      levelIds: getDefaultLevelIds(),
      gradeIds: [],
      shift: selectedShift,
    })
    setEditingHoliday(null)
    setShowCreateDialog(false)
    setShowEditDialog(false)
    setShowPastDateWarning(false)
    setConfirmText('')
  }

  const submitHoliday = async () => {
    setIsLoading(true)
    try {
      const payload: any = {
        date: formState.date,
        reason: formState.reason.trim(),
        level_ids: formState.levelIds,
        grade_ids: formState.gradeIds,
      shift: formState.shift,
      }

      if (formState.levelIds.length === 1) {
        payload.level_id = formState.levelIds[0]
      }

      if (editingHoliday) {
        await updateHoliday(editingHoliday.id, payload)
        toast.success('Holiday updated successfully')
      } else {
        await createHoliday(payload)
        toast.success('Holiday created successfully')
      }

      resetForm()
      fetchAllHolidays()
      if (onSuccess) onSuccess()
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${editingHoliday ? 'update' : 'create'} holiday`)
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
    const levelIds = holiday.level_ids?.length
      ? holiday.level_ids
      : holiday.level_id
        ? [holiday.level_id]
        : []
    const gradeIds = holiday.grade_ids?.length ? holiday.grade_ids : []
    const holidayShiftValues = Array.isArray(holiday.shifts) && holiday.shifts.length > 0
      ? holiday.shifts.map((shift) => normalizeShiftValue(shift))
      : []
    const holidayShift = holidayShiftValues.length > 1 ? 'both' : (holidayShiftValues[0] || selectedShift)

    setEditingHoliday(holiday)
    setSelectedShift(holidayShift)
    setFormState({
      date: holiday.date,
      reason: holiday.reason,
      levelIds,
      gradeIds,
      shift: holidayShift,
    })
    ensureGradesForLevels(levelIds)
    setShowEditDialog(true)
  }

  const handleLevelToggle = (levelId: number, checked: boolean) => {
    setFormState((prev) => {
      const level = levels.find((lvl) => lvl.id === levelId)
      if (!level) {
        return prev
      }
      const normalizedSelectedShift = normalizeShiftValue(selectedShift)
      const levelShift = normalizeShiftValue(level.shift)
      if (normalizedSelectedShift !== 'both' && normalizedSelectedShift !== levelShift) {
        return prev
      }

      const nextLevelIds = checked
        ? Array.from(new Set([...prev.levelIds, levelId]))
        : prev.levelIds.filter((id) => id !== levelId)

      if (nextLevelIds.length === 0) {
        return { ...prev, levelIds: [], gradeIds: [] }
      }

      const nextGradeIds = checked
        ? prev.gradeIds
        : prev.gradeIds.filter((gradeId) =>
            nextLevelIds.some((id) => (availableGrades[id] ?? []).some((grade) => grade.id === gradeId))
          )

      return {
        ...prev,
        levelIds: nextLevelIds,
        gradeIds: nextGradeIds,
      }
    })
  }

  const handleGradeToggle = (gradeId: number, checked: boolean) => {
    setFormState((prev) => {
      const nextGradeIds = checked
        ? Array.from(new Set([...prev.gradeIds, gradeId]))
        : prev.gradeIds.filter((id) => id !== gradeId)
      return { ...prev, gradeIds: nextGradeIds }
    })
  }

  const handlePastDateConfirm = () => {
    if (confirmText === 'CONFIRM') {
      setShowPastDateWarning(false)
      setConfirmText('')
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

  // Check if holiday can be edited/deleted (must be at least 12 hours before holiday date)
  const canEditOrDeleteHoliday = (holidayDate: string) => {
    const now = new Date()
    const holidayDateTime = new Date(holidayDate)
    holidayDateTime.setHours(0, 0, 0, 0) // Set to start of holiday date
    
    // Calculate 12 hours before holiday date
    const twelveHoursBefore = new Date(holidayDateTime)
    twelveHoursBefore.setHours(twelveHoursBefore.getHours() - 12)
    
    // Can edit/delete if current time is before 12 hours before holiday date
    return now < twelveHoursBefore
  }

  // Filter to show current and upcoming holidays (date >= today, excluding past)
  const today = new Date().toISOString().split('T')[0]
  const filteredHolidays = holidays
    .filter(h => h.date >= today) // Include today and future holidays (exclude past)
    .filter((holiday) => {
      const normalizedSelectedShift = normalizeShiftValue(selectedShift)
      if (normalizedSelectedShift === 'both') {
        return true
      }
      const holidayShifts = Array.isArray(holiday.shifts) && holiday.shifts.length > 0
        ? holiday.shifts.map((shift) => normalizeShiftValue(shift))
        : []
      if (holidayShifts.length === 0) {
        return true
      }
      return holidayShifts.includes(normalizedSelectedShift)
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const showGradeColumn = filteredHolidays.some((holiday) => (holiday.grade_ids?.length ?? 0) > 0)
  const showLevelColumn = levels.length > 1 || filteredHolidays.some((holiday) => (holiday.level_names?.length ?? 0) > 1)

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
            const defaultLevels = getDefaultLevelIds()
            setFormState({
              date: '',
              reason: '',
              levelIds: defaultLevels,
              gradeIds: [],
              shift: selectedShift,
            })
            if (defaultLevels.length > 0) {
              ensureGradesForLevels(defaultLevels)
            }
            setShowCreateDialog(true)
          }}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Holiday
        </Button>
      </div>

      {/* Summary Stats - Current and Upcoming Separated */}
      <div className="flex-shrink-0 grid grid-cols-2 gap-3">
        <Card className="text-center p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200">
          <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-1">
            {holidays.filter(h => isHolidayToday(h.date)).length}
          </div>
          <div className="text-xs sm:text-sm font-semibold text-blue-700">Current Holidays</div>
        </Card>
        <Card className="text-center p-3 sm:p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200">
          <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-1">
            {holidays.filter(h => isHolidayUpcoming(h.date)).length}
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
                  {showLevelColumn && <TableHead className="font-semibold text-sm py-2">Level(s)</TableHead>}
                  {showGradeColumn && <TableHead className="font-semibold text-sm py-2">Grades</TableHead>}
                  <TableHead className="font-semibold text-sm py-2">Status</TableHead>
                  <TableHead className="font-semibold text-sm py-2">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHolidays.map((holiday) => {
                  const status = getHolidayStatus(holiday.date)
                  const levelNames = holiday.level_names?.length
                    ? holiday.level_names.join(', ')
                    : holiday.level_name || '—'
                  const gradeNames = holiday.grade_names?.length
                    ? holiday.grade_names.join(', ')
                    : 'All Grades'
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
                      {showLevelColumn && (
                        <TableCell className="text-sm text-gray-600 py-2" title={levelNames}>
                          {levelNames}
                        </TableCell>
                      )}
                      {showGradeColumn && (
                        <TableCell className="text-sm text-gray-600 py-2" title={gradeNames}>
                          {holiday.grade_names?.length ? gradeNames : <span className="text-gray-500">All Grades</span>}
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
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 w-8 p-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => handleEditClick(holiday)}
                            disabled={!canEditOrDeleteHoliday(holiday.date)}
                            title={!canEditOrDeleteHoliday(holiday.date) ? 'Cannot edit holiday within 12 hours of the holiday date' : 'Edit holiday'}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => {
                              setDeletingHolidayId(holiday.id)
                              setShowDeleteConfirm(true)
                            }}
                            disabled={!canEditOrDeleteHoliday(holiday.date)}
                            title={!canEditOrDeleteHoliday(holiday.date) ? 'Cannot delete holiday within 12 hours of the holiday date' : 'Delete holiday'}
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
      <Dialog
        open={showCreateDialog || showEditDialog}
        onOpenChange={(open) => {
          if (!open) {
            resetForm()
          }
        }}
      >
        <DialogContent className="w-[min(94vw,900px)] max-w-3xl p-0 sm:p-6 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 sm:px-0 sm:pt-0">
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {editingHoliday ? 'Edit Holiday' : 'Create New Holiday'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateHoliday} className="flex flex-col gap-4">
            <div className="space-y-4 overflow-y-auto px-4 pb-4 sm:px-0 sm:pb-0 max-h-[70vh]">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Shift <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedShift} onValueChange={(value) => setSelectedShift(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {shiftOptions.map((shift) => (
                    <SelectItem key={shift} value={shift}>
                      {formatShiftLabel(shift)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose the shift to target. Levels and grades will be filtered accordingly.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Levels <span className="text-red-500">*</span>
              </Label>
              {levelsForSelectedShift.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">
                  No levels available for the selected shift.
                </div>
              ) : (
                <div className="grid gap-2">
                  {levelsForSelectedShift.map((level) => {
                    const checked = formState.levelIds.includes(level.id)
                    return (
                      <label
                        key={level.id}
                        className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition ${
                          checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => handleLevelToggle(level.id, value === true)}
                        />
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-700">{level.name}</span>
                          <span className="text-xs text-gray-500">{formatShiftLabel(level.shift)}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Select one or more levels. Leave grade selection empty to apply the holiday to every grade within the selected level(s).
              </p>
            </div>

            {formState.levelIds.length > 0 && (
              <div className="space-y-2">
                <Label>Grades (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Choose specific grades to target. If you skip this, the holiday will cover all grades in the selected levels.
                </p>
                <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                  {formState.levelIds.map((levelId) => {
                    const levelName = levels.find((level) => level.id === levelId)?.name || `Level ${levelId}`
                    const grades = availableGrades[levelId]
                    return (
                      <div key={levelId} className="space-y-2">
                        <div className="text-sm font-semibold text-gray-700">{levelName}</div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {grades === undefined ? (
                            <div className="col-span-full text-xs text-gray-500">Loading grades...</div>
                          ) : grades.length === 0 ? (
                            <div className="col-span-full text-xs text-gray-500">No grades found for this level.</div>
                          ) : (
                            grades.map((grade) => {
                              const checked = formState.gradeIds.includes(grade.id)
                              return (
                                <label
                                  key={grade.id}
                                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                                    checked ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'
                                  }`}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(value) => handleGradeToggle(grade.id, value === true)}
                                  />
                                  <span className="text-gray-700">{grade.name}</span>
                                </label>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formState.date}
                onChange={(e) => setFormState((prev) => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for holiday..."
                value={formState.reason}
                onChange={(e) => setFormState((prev) => ({ ...prev, reason: e.target.value }))}
                rows={3}
                required
              />
            </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-4 sm:px-0">
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
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

