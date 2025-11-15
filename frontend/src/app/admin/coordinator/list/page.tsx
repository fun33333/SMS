"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Search, Edit, X, Mail, Calendar, Clock, Award } from "lucide-react"
import { getAllCoordinators, getAllCampuses, getApiBaseUrl } from "@/lib/api"
import { getCurrentUserRole, getCurrentUser } from "@/lib/permissions"
import { DataTable, LoadingState } from "@/components/shared"

interface CoordinatorUser {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  full_name?: string
  role: string
  campus_name?: string
  is_active: boolean
  level?: string
  shift?: string
  joining_date?: string
}

export default function CoordinatorListPage() {
  useEffect(() => {
    document.title = "Coordinator List - Coordinator | IAK SMS"
  }, [])

  const [search, setSearch] = useState("")
  const [shiftFilter, setShiftFilter] = useState("all")  // "all" means show everything
  const [coordinators, setCoordinators] = useState<CoordinatorUser[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>("")
  const [userCampus, setUserCampus] = useState<string>("")
  const [campusIdToName, setCampusIdToName] = useState<Record<string, string>>({})
  const [editingCoordinator, setEditingCoordinator] = useState<CoordinatorUser | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editFormData, setEditFormData] = useState<any>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  // Get user role and campus for principal filtering
  useEffect(() => {
    if (typeof window !== "undefined") {
      const role = getCurrentUserRole()
      console.log('User role:', role)
      setUserRole(role)
      
      const user = getCurrentUser() as any
      console.log('Current user:', user)
      
      // Check different possible campus data structures
      if (user?.campus?.campus_name) {
        console.log('User campus (campus.campus_name):', user.campus.campus_name)
        setUserCampus(user.campus.campus_name)
      } else if (user?.campus_name) {
        console.log('User campus (campus_name):', user.campus_name)
        setUserCampus(user.campus_name)
      } else if (user?.campus) {
        console.log('User campus (campus):', user.campus)
        setUserCampus(user.campus)
      } else {
        console.log('No campus found in user data, checking all user properties:', Object.keys(user || {}))
        // Try to get campus from username pattern (C06-M-24-P-0057)
        if (user?.username) {
          const campusMatch = user.username.match(/C(\d+)/);
          if (campusMatch) {
            const campusNumber = campusMatch[1];
            const campusName = `Campus ${campusNumber}`;
            console.log('Extracted campus from username:', campusName)
            setUserCampus(campusName)
          }
        }
      }
    }
  }, [])

  useEffect(() => {
    let isSubscribed = true;  // For avoiding state updates after unmount
    
    async function load() {
      if (!isSubscribed) return;
      setLoading(true)
      
      try {
        console.log('Loading coordinators - userRole:', userRole, 'userCampus:', userCampus, 'isSubscribed:', isSubscribed)
        let campusMap = campusIdToName // local view (may be replaced after fetching)
        if (Object.keys(campusIdToName).length === 0) {
          try {
            const campuses: any = await getAllCampuses()
            const results = campuses?.results || campuses || []
            const map: Record<string, string> = {}
            results.forEach((c: any) => {
              const id = String(c.id ?? c.campus_id ?? '').trim()
              const name = c.campus_name || c.name || ''
              if (id) map[id] = name
            })
            // update state for future renders
            setCampusIdToName(map)
            campusMap = map // use local map immediately for this run
          } catch (e) {
            console.warn('Failed to load campuses for mapping (optional):', e)
          }
        }

        if (userRole === 'principal' && userCampus) {
          console.log('Loading coordinators for principal from campus:', userCampus)
          const allCoordinators = await getAllCoordinators('') as any  // Load all coordinators without shift filter
          console.log('All coordinators fetched:', allCoordinators)
          
          // Handle API response structure
          const coordinatorsList = allCoordinators?.results || allCoordinators || []
          console.log('Coordinators list:', coordinatorsList)
          
          // Filter coordinators by campus
          const normalize = (val: any): { name: string; num?: string } => {
            if (val === undefined || val === null) return { name: '' }
            // If numeric id, map to name when possible
            if (typeof val === 'number' || /^\d+$/.test(String(val))) {
              const idStr = String(val)
              const mapped = campusMap[idStr]
              return { name: (mapped || idStr).toLowerCase(), num: idStr }
            }
            const s = String(val).toLowerCase()
            const m = s.match(/(\d+)/)
            return { name: s, num: m ? m[1] : undefined }
          }

          const userNorm = normalize(userCampus)
          const campusCoordinators = coordinatorsList.filter((coord: any) => {
            const raw = coord.campus?.campus_name || coord.campus
            const coordNorm = normalize(raw)
            console.log(`Coordinator ${coord.full_name} campus: ${raw}, normalized:`, coordNorm, 'Principal campus:', userCampus, 'normalized:', userNorm)

            // Exact string match
            if (coordNorm.name && coordNorm.name === userNorm.name) return true
            // If both have numbers, compare the numbers
            if (coordNorm.num && userNorm.num && coordNorm.num === userNorm.num) return true
            // If only one has number, allow contains check
            if (coordNorm.num && userNorm.name.includes(coordNorm.num)) return true
            if (userNorm.num && coordNorm.name.includes(userNorm.num)) return true
            return false
          })
          
          console.log('Filtered coordinators for campus:', campusCoordinators)
          
          // Map to CoordinatorUser format
          const mappedCoordinators = campusCoordinators.map((coord: any) => {
            console.log('Coordinator level data:', coord.level)
            return {
              id: coord.id,
              username: coord.email || coord.username || '',
              email: coord.email || '',
              first_name: coord.full_name?.split(' ')[0] || coord.first_name || '',
              last_name: coord.full_name?.split(' ').slice(1).join(' ') || coord.last_name || '',
              role: 'coordinator',
              campus_name: coord.campus?.campus_name || coord.campus || userCampus,
              is_active: coord.is_currently_active !== false,
              level: coord.level?.name || (coord.level ? `Level ${coord.level}` : 'Not Assigned'),
              shift: coord.shift || '',
              joining_date: coord.joining_date || 'Unknown'
            }
          })
          
          console.log('Mapped coordinators:', mappedCoordinators)
          setCoordinators(mappedCoordinators)
        } else {
          // For other roles, always get all coordinators and filter on client side
          const allCoordinators = await getAllCoordinators() as any
          console.log('All coordinators response:', allCoordinators)
          
          // Handle API response structure
          const coordinatorsList = allCoordinators?.results || allCoordinators || []
          console.log('Coordinators list:', coordinatorsList)
          
          const mappedCoordinators = coordinatorsList.map((coord: any) => ({
            id: coord.id,
            username: coord.email || coord.username || '',
            email: coord.email || '',
            first_name: coord.full_name?.split(' ')[0] || coord.first_name || '',
            last_name: coord.full_name?.split(' ').slice(1).join(' ') || coord.last_name || '',
            role: 'coordinator',
            campus_name: coord.campus?.campus_name || coord.campus || 'Unknown',
            is_active: coord.is_currently_active !== false,
            level: coord.level?.name || 'Unknown',
            shift: coord.shift || 'Unknown',
            joining_date: coord.joining_date || 'Unknown'
          }))
          
          if (isSubscribed) {
            console.log('Setting coordinators:', mappedCoordinators)
            setCoordinators(mappedCoordinators)
          }
        }
      } catch (error) {
        console.error('Error loading coordinators:', error)
        if (isSubscribed) {
          setCoordinators([])
        }
      } finally {
        if (isSubscribed) {
          setLoading(false)
        }
      }
    }
    
    load()
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isSubscribed = false;
    }
  }, [userRole, userCampus]) // Removed shiftFilter from dependencies since we want to filter client-side

  const filtered = useMemo(() => {
    console.log('Filtering coordinators:', { 
      totalCoordinators: coordinators.length,
      search: search,
      shiftFilter: shiftFilter
    });
    
    const q = search.trim().toLowerCase()
    let filteredCoordinators = [...coordinators]  // Create a new array to avoid mutations
    
    // Apply search filter
    if (q) {
      filteredCoordinators = filteredCoordinators.filter(u =>
        (u.first_name || "").toLowerCase().includes(q) ||
        (u.last_name || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.joining_date || "").toLowerCase().includes(q)
      )
    }
    
    // Apply shift filter based on coordinator's shift status
    if (shiftFilter !== "all") {  // When "all" is selected, don't filter by shift
      filteredCoordinators = filteredCoordinators.filter(u => {
        const shift = (u.shift || "").toLowerCase();
        
        // If filtering for "both", only show coordinators with both shifts
        if (shiftFilter === "both") {
          return shift === "both";
        }
        
        // For morning/afternoon, show single shift coordinators and those with both shifts
        return shift === shiftFilter.toLowerCase() || shift === "both";
      });
    }
    // For "all", we keep all coordinators
    
    return filteredCoordinators
  }, [search, shiftFilter, coordinators])

  // No need to load campuses and levels since they're removed from edit form

  const handleEdit = async (coordinator: CoordinatorUser) => {
    setEditingCoordinator(coordinator)
    
    // Load full coordinator data from API
    try {
      const baseUrl = getApiBaseUrl()
      const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
      const response = await fetch(`${cleanBaseUrl}/api/coordinators/${coordinator.id}/`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const fullData = await response.json()
        setEditFormData({
          full_name: fullData.full_name || `${coordinator.first_name} ${coordinator.last_name}`.trim(),
          email: fullData.email || coordinator.email,
          dob: fullData.dob || '',
          gender: fullData.gender || '',
          phone: fullData.phone || '',
          permanent_address: fullData.permanent_address || '',
          education_level: fullData.education_level || '',
          institution_name: fullData.institution_name || '',
          year_of_passing: fullData.year_of_passing || '',
          total_experience_years: fullData.total_experience_years || '',
          campus: fullData.campus?.campus_name || coordinator.campus_name,
          level: fullData.level?.name || coordinator.level,
          joining_date: fullData.joining_date || coordinator.joining_date,
          is_currently_active: fullData.is_currently_active !== false,
          can_assign_class_teachers: fullData.can_assign_class_teachers || false
        })
      } else {
        setEditFormData({
          full_name: `${coordinator.first_name} ${coordinator.last_name}`.trim(),
          email: coordinator.email,
          dob: '',
          gender: '',
          phone: '',
          permanent_address: '',
          education_level: '',
          institution_name: '',
          year_of_passing: '',
          total_experience_years: '',
          campus: coordinator.campus_name,
          level: coordinator.level,
          joining_date: coordinator.joining_date,
          is_currently_active: coordinator.is_active,
          can_assign_class_teachers: false
        })
      }
    } catch (error) {
      console.error('Error loading coordinator details:', error)
      // Fallback to basic data
      setEditFormData({
        full_name: `${coordinator.first_name} ${coordinator.last_name}`.trim(),
        email: coordinator.email,
        dob: '',
        gender: '',
        phone: '',
        permanent_address: '',
        education_level: '',
        institution_name: '',
        year_of_passing: '',
        total_experience_years: '',
        campus: coordinator.campus_name,
        level: coordinator.level,
        joining_date: coordinator.joining_date,
        is_currently_active: coordinator.is_active,
        can_assign_class_teachers: false
      })
    }
    
    setShowEditDialog(true)
  }

  const handleEditClose = () => {
    setEditingCoordinator(null)
    setShowEditDialog(false)
    setEditFormData({})
  }

  // Define columns for DataTable
  const columns = [
    {
      key: 'name',
      label: 'Name',
      icon: <Users className="w-4 h-4" />
    },
    {
      key: 'email',
      label: 'Email',
      icon: <Mail className="w-4 h-4" />
    },

    {
      key: 'shift',
      label: 'Shift',
      icon: <Clock className="w-4 h-4" />,
      render: (row: any) => row.shift
    },
    {
      key: 'joining_date',
      label: 'Joining Date',
      icon: <Calendar className="w-4 h-4" />
    },
    {
      key: 'status',
      label: 'Status',
      icon: <Users className="w-4 h-4" />,
      render: (row: any) => row.status
    }
  ]

  const handleEditSubmit = async () => {
    if (!editingCoordinator) return

    setIsSubmitting(true)
    try {
      // Prepare data for update - only send changed fields
      const updateData: any = {}
      
      // Add fields that have values (excluding campus and level)
      if (editFormData.full_name) updateData.full_name = editFormData.full_name
      if (editFormData.email) updateData.email = editFormData.email
      if (editFormData.dob) updateData.dob = editFormData.dob
      if (editFormData.gender) updateData.gender = editFormData.gender.toLowerCase() // Convert to lowercase
      if (editFormData.phone) updateData.phone = editFormData.phone
      if (editFormData.permanent_address) updateData.permanent_address = editFormData.permanent_address
      if (editFormData.education_level) updateData.education_level = editFormData.education_level
      if (editFormData.institution_name) updateData.institution_name = editFormData.institution_name
      if (editFormData.year_of_passing) updateData.year_of_passing = parseInt(editFormData.year_of_passing)
      if (editFormData.total_experience_years) updateData.total_experience_years = parseInt(editFormData.total_experience_years)
      if (editFormData.joining_date) updateData.joining_date = editFormData.joining_date
      
      // Always include boolean fields
      updateData.is_currently_active = editFormData.is_currently_active
      updateData.can_assign_class_teachers = editFormData.can_assign_class_teachers

      console.log('Updating coordinator with data:', updateData)

      // Use the correct API endpoint with proper base URL
      const baseUrl = getApiBaseUrl()
      const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
      const endpoint = `${cleanBase}/api/coordinators/${editingCoordinator.id}/`
      
      console.log(`Updating coordinator at: ${endpoint}`)
      console.log('Update data:', updateData)
      console.log('Token:', localStorage.getItem('sis_access_token') ? 'Present' : 'Missing')
      
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`
        },
        body: JSON.stringify(updateData)
      })
      
      console.log('Response status:', response.status)
      console.log('Response headers:', Object.fromEntries(response.headers.entries()))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error Response:', errorText)
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
      }

      console.log('Update response status:', response.status)

      if (response.ok) {
        const updatedData = await response.json()
        console.log('Coordinator updated successfully:', updatedData)
        
        // Close dialog first
        handleEditClose()
        
        // Show success alert
        const coordinatorName = editFormData.full_name || (editingCoordinator?.first_name + ' ' + editingCoordinator?.last_name) || 'Coordinator'
        alert(`✅ Success! The information of coordinator "${coordinatorName}" has been updated successfully!`)
        
        // Reload coordinators
        window.location.reload()
      } else {
        const errorData = await response.text()
        console.error('Error updating coordinator:', response.status, errorData)
        alert(`❌ Error updating coordinator: ${response.status} - ${errorData}`)
      }
    } catch (error) {
      console.error('Error updating coordinator:', error)
      alert(`Error updating coordinator: ${error}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate" style={{ color: '#274c77' }}>Coordinator List</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            {userRole === 'principal' && userCampus 
              ? `Coordinators from ${userCampus} campus` 
              : 'All coordinators across campuses'
            }
          </p>
        </div>
        <Badge style={{ backgroundColor: '#6096ba', color: 'white' }} className="px-3 py-1 self-start sm:self-auto">
          {filtered.length} Coordinators
        </Badge>
      </div>

      <Card className="w-full max-w-full" style={{ backgroundColor: 'white', borderColor: '#a3cef1' }}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={
                  userRole === 'principal' && userCampus 
                    ? `Search coordinators from ${userCampus}...`
                    : "Search by name or email..."
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                style={{ borderColor: '#a3cef1' }}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select value={shiftFilter} onValueChange={setShiftFilter}>
                <SelectTrigger style={{ borderColor: '#a3cef1' }}>
                  <SelectValue placeholder="All Shifts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-full" style={{ backgroundColor: 'white', borderColor: '#a3cef1' }}>
        <CardHeader className="pb-2">
          <CardTitle style={{ color: '#274c77' }} className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Coordinators
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 break-words">
          {loading ? (
            <LoadingState message={userRole === 'principal' && userCampus 
              ? `Loading coordinators from ${userCampus}...`
              : 'Loading coordinators...'
            } />
          ) : (
            <>
          <div className="overflow-x-auto w-full">
          <DataTable
            data={filtered.map(u => ({
              id: u.id,
              name: (`${u.first_name || ''} ${u.last_name || ''}`).trim() || u.username,
              email: u.email,
              shift: u.shift ? (
                <Badge variant="outline" style={{ borderColor: '#6096ba', color: '#274c77' }}>
                  {u.shift.charAt(0).toUpperCase() + u.shift.slice(1)}
                </Badge>
              ) : '—',
              joining_date: u.joining_date || '—',
              status: (
                <Badge style={{ backgroundColor: u.is_active ? '#6096ba' : '#8b8c89', color: 'white' }}>
                  {u.is_active ? 'Active' : 'Inactive'}
                </Badge>
              )
            }))}
            columns={columns}
            onView={(coordinator) => router.push(`/admin/coordinator/profile/${coordinator.id}`)}
            onEdit={(coordinator) => handleEdit(filtered.find(u => u.id === coordinator.id)!)}
            onDelete={async (coordinator) => {
              if (userRole !== 'principal') return;
              if (!confirm('Are you sure you want to delete this coordinator?')) return;
              try {
                const baseUrl = getApiBaseUrl();
                const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                const res = await fetch(`${cleanBase}/api/coordinators/${coordinator.id}/`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('sis_access_token')}`,
                  }
                });
                if (res.ok || res.status === 204) {
                  alert('Coordinator deleted successfully.');
                  window.location.reload();
                } else {
                  const msg = await res.text();
                  alert(`Failed to delete: ${res.status} ${msg}`);
                }
              } catch (e) {
                console.error('Delete coordinator error:', e);
                alert('Error deleting coordinator');
              }
            }}
            isLoading={loading}
            emptyMessage="No coordinators found"
            allowEdit={userRole !== 'student'}
            allowDelete={userRole === 'principal'}
          />
          </div>
          </>
        )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: '#274c77' }}>
              Edit Coordinator
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    value={editFormData.full_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, full_name: e.target.value})}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                    placeholder="Enter email"
                  />
                </div>
                <div>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={editFormData.dob || ''}
                    onChange={(e) => setEditFormData({...editFormData, dob: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={editFormData.gender || ''} onValueChange={(value) => setEditFormData({...editFormData, gender: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})}
                    placeholder="Enter phone number"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="permanent_address">Permanent Address</Label>
                  <Input
                    id="permanent_address"
                    value={editFormData.permanent_address || ''}
                    onChange={(e) => setEditFormData({...editFormData, permanent_address: e.target.value})}
                    placeholder="Enter permanent address"
                  />
                </div>
              </div>
            </div>

            {/* Educational Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Educational Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="education_level">Education Level</Label>
                  <Input
                    id="education_level"
                    value={editFormData.education_level || ''}
                    onChange={(e) => setEditFormData({...editFormData, education_level: e.target.value})}
                    placeholder="Enter education level"
                  />
                </div>
                <div>
                  <Label htmlFor="institution_name">Institution Name</Label>
                  <Input
                    id="institution_name"
                    value={editFormData.institution_name || ''}
                    onChange={(e) => setEditFormData({...editFormData, institution_name: e.target.value})}
                    placeholder="Enter institution name"
                  />
                </div>
                <div>
                  <Label htmlFor="year_of_passing">Year of Passing</Label>
                  <Input
                    id="year_of_passing"
                    type="number"
                    value={editFormData.year_of_passing || ''}
                    onChange={(e) => setEditFormData({...editFormData, year_of_passing: e.target.value})}
                    placeholder="Enter year of passing"
                  />
                </div>
                <div>
                  <Label htmlFor="total_experience_years">Total Experience (Years)</Label>
                  <Input
                    id="total_experience_years"
                    type="number"
                    value={editFormData.total_experience_years || ''}
                    onChange={(e) => setEditFormData({...editFormData, total_experience_years: e.target.value})}
                    placeholder="Enter experience in years"
                  />
                </div>
              </div>
            </div>

            {/* Work Assignment */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Work Assignment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="joining_date">Joining Date</Label>
                  <Input
                    id="joining_date"
                    type="date"
                    value={editFormData.joining_date || ''}
                    onChange={(e) => setEditFormData({...editFormData, joining_date: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="is_currently_active">Status</Label>
                  <Select value={editFormData.is_currently_active ? 'true' : 'false'} onValueChange={(value) => setEditFormData({...editFormData, is_currently_active: value === 'true'})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="can_assign_class_teachers">Can Assign Class Teachers</Label>
                  <Select value={editFormData.can_assign_class_teachers ? 'true' : 'false'} onValueChange={(value) => setEditFormData({...editFormData, can_assign_class_teachers: value === 'true'})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-6 border-t">
              <Button
                variant="outline"
                onClick={handleEditClose}
                disabled={isSubmitting}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleEditSubmit}
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Updating Coordinator...
                  </>
                ) : (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Update Coordinator
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


