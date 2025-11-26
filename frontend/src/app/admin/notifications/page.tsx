"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  RefreshCw,
  Inbox,
  WifiOff,
  Search,
  Trash2,
  XCircle,
  FileX,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications"
import type { Notification, DeleteLog } from "@/types/notification"
import { Button } from "@/components/ui/button"
import { getDeleteLogs } from "@/lib/api"

function formatRelative(timestamp: string) {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
  } catch {
    return "Just now"
  }
}

export default function NotificationsPage() {
  const router = useRouter()
  const {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    refetch,
    removeNotificationsLocal,
  } = useWebSocketNotifications()
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"unread" | "all">("unread")
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [deletingIds, setDeletingIds] = useState<number[]>([])

  // Delete logs state
  const [deleteLogs, setDeleteLogs] = useState<DeleteLog[]>([])
  const [deleteLogsLoading, setDeleteLogsLoading] = useState(false)
  const [deleteLogsQuery, setDeleteLogsQuery] = useState("")
  const [deleteLogsFeature, setDeleteLogsFeature] = useState<string>("")
  const [isDeleteLogsOpen, setIsDeleteLogsOpen] = useState(false)
  const [deleteLogsLastSeen, setDeleteLogsLastSeen] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!Array.isArray(notifications)) return []
    const q = query.toLowerCase().trim()
    return notifications.filter((notification) => {
      const matchesQuery =
        !q ||
        notification.verb?.toLowerCase().includes(q) ||
        notification.target_text?.toLowerCase().includes(q) ||
        notification.actor_name?.toLowerCase().includes(q)

      const matchesView = view === "all" ? true : notification.unread
      return matchesQuery && matchesView
    })
  }, [notifications, query, view])

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return
    setDeletingIds(selectedIds)
    // Wait for exit animation then remove from list
    setTimeout(() => {
      removeNotificationsLocal(selectedIds)
      setSelectedIds([])
      setDeletingIds([])
    }, 220)
  }

  const handleDeleteAllVisible = () => {
    const ids = filtered.map(n => n.id)
    if (ids.length === 0) return
    setDeletingIds(ids)
    setTimeout(() => {
      removeNotificationsLocal(ids)
      setSelectedIds([])
      setDeletingIds([])
    }, 220)
  }

  // Load delete logs last seen timestamp from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastSeen = localStorage.getItem('delete_logs_last_seen')
      if (lastSeen) {
        setDeleteLogsLastSeen(lastSeen)
      }
    }
  }, [])

  // Fetch delete logs
  useEffect(() => {
    async function fetchDeleteLogs() {
      setDeleteLogsLoading(true)
      try {
        const response = await getDeleteLogs(deleteLogsFeature || undefined, 50)
        setDeleteLogs(response.results || [])
      } catch (error) {
        console.error('Failed to fetch delete logs:', error)
        setDeleteLogs([])
      } finally {
        setDeleteLogsLoading(false)
      }
    }
    fetchDeleteLogs()
    
    // Poll for new delete logs every 10 seconds for real-time updates
    const interval = setInterval(fetchDeleteLogs, 10000)
    return () => clearInterval(interval)
  }, [deleteLogsFeature])

  // Calculate unread delete logs count
  const deleteLogsUnreadCount = useMemo(() => {
    // If section is open, count should be 0 (all logs are seen)
    if (isDeleteLogsOpen) {
      return 0
    }
    
    if (!Array.isArray(deleteLogs) || deleteLogs.length === 0) return 0
    
    // If no last seen timestamp, all logs are unread
    if (!deleteLogsLastSeen) {
      return deleteLogs.length
    }
    
    // Count logs after last seen timestamp
    const lastSeenDate = new Date(deleteLogsLastSeen)
    return deleteLogs.filter(log => {
      const logDate = new Date(log.timestamp)
      return logDate > lastSeenDate
    }).length
  }, [deleteLogs, deleteLogsLastSeen, isDeleteLogsOpen])

  // Mark delete logs as seen when section is opened
  useEffect(() => {
    if (isDeleteLogsOpen && deleteLogs.length > 0) {
      // Update last seen timestamp immediately when section opens
      const now = new Date().toISOString()
      setDeleteLogsLastSeen(now)
      if (typeof window !== 'undefined') {
        localStorage.setItem('delete_logs_last_seen', now)
      }
    }
  }, [isDeleteLogsOpen, deleteLogs])

  // Filter delete logs
  const filteredDeleteLogs = useMemo(() => {
    if (!Array.isArray(deleteLogs)) return []
    const q = deleteLogsQuery.toLowerCase().trim()
    return deleteLogs.filter((log) => {
      const matchesQuery =
        !q ||
        log.entity_type?.toLowerCase().includes(q) ||
        log.user_name?.toLowerCase().includes(q) ||
        log.feature_display?.toLowerCase().includes(q) ||
        log.reason?.toLowerCase().includes(q)
      return matchesQuery
    })
  }, [deleteLogs, deleteLogsQuery])

  return (
    <div className="space-y-6 py-4 sm:py-6 max-w-6xl mx-auto px-2 sm:px-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-[#274c77] via-[#356c9b] to-[#6096ba] text-white p-6 sm:p-7 shadow-2xl border border-white/10 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 rounded-2xl shadow-lg shadow-black/10">
              <Bell className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-wide text-white/80">Notification Center</p>
              <h1 className="text-2xl md:text-3xl font-bold mt-1">Stay updated in real-time</h1>
              <p className="text-white/80 text-sm md:text-base mt-1">
                {isConnected
                  ? "Live websocket connection active"
                  : "Realtime channel offline – falling back to polling"}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <Button
              variant="secondary"
              className="bg-white text-[#274c77] hover:bg-white/90 shadow-lg"
              onClick={() => refetch()}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 sm:gap-6 mt-6">
          <StatCard label="Unread" value={unreadCount} highlight />
          <StatCard label="Showing" value={filtered.length} />
          <StatCard label="Connection" value={isConnected ? "Realtime" : "Polling"} subtle={!isConnected} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <section className="lg:col-span-2 bg-white rounded-3xl shadow-xl border border-[#d7e3ef] overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 sm:p-6 border-b border-[#d7e3ef] gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-gray-900">News & Alerts</h2>
              <p className="text-sm text-gray-500">
                Filter and manage all your unread notifications in one place.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full md:w-auto">
              <div className="flex-1 min-w-[160px]">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search notifications..."
                    className="w-full pl-9 pr-3 py-2 rounded-full border border-[#d7e3ef] text-sm focus:outline-none focus:ring-2 focus:ring-[#6096ba]/40"
                  />
                </div>
              </div>
              <div className="inline-flex rounded-full bg-[#e7ecef] p-1 self-start sm:self-auto">
                {(["unread", "all"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setView(option)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${view === option
                        ? "bg-white shadow text-[#274c77]"
                        : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    {option === "unread" ? "Unread" : "All"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 self-start sm:self-auto">
                {unreadCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={markAllAsRead}
                    className="whitespace-nowrap border-[#a3cef1] text-[#274c77] hover:bg-[#f2f6fa]"
                  >
                    <CheckCheck className="w-4 h-4 mr-2" />
                    Mark all read
                  </Button>
                )}
                {filtered.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleDeleteSelected}
                      disabled={selectedIds.length === 0}
                      className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="sr-only">Delete selected notifications</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDeleteAllVisible}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <XCircle className="w-4 h-4" />
                      <span className="sr-only">Clear visible notifications</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="All caught up!"
              description="You have no unread notifications."
              icon={<Inbox className="w-12 h-12 text-blue-500" />}
            />
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[560px] overflow-y-auto">
              {filtered.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  selected={selectedIds.includes(notification.id)}
                  onToggleSelect={toggleSelect}
                  onMarkAsRead={(id) => markAsRead(id)}
                  isDeleting={deletingIds.includes(notification.id)}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4 sm:space-y-6">
          {!isConnected && (
            <div className="bg-[#fef7ed] border border-[#f4c195] rounded-2xl p-4 sm:p-5 flex items-start gap-3 shadow-inner">
              <WifiOff className="w-4 h-4 sm:w-5 sm:h-5 text-[#d97706] mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[#b45309] font-semibold text-sm sm:text-base">Realtime channel offline</p>
                <p className="text-[#b45309] text-xs sm:text-sm mt-1">
                  We switched to safe polling mode. Please ensure the websocket server is running for instant
                  delivery.
                </p>
              </div>
            </div>
          )}

          {/* Delete Logs Section */}
          <section className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-[#d7e3ef] overflow-hidden">
            <button
              onClick={() => setIsDeleteLogsOpen(!isDeleteLogsOpen)}
              className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 md:p-6 border-b border-[#d7e3ef] gap-3 sm:gap-4 hover:bg-gray-50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <div className="p-2 sm:p-3 bg-red-50 rounded-xl flex-shrink-0">
                  <FileX className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                </div>
                <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 truncate">Delete Logs</h2>
                    {deleteLogsUnreadCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 sm:px-2 rounded-full bg-red-500 text-white text-[10px] sm:text-xs font-semibold">
                        {deleteLogsUnreadCount > 9 ? "9+" : deleteLogsUnreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 line-clamp-2">
                    Audit trail of all deletion actions in the system.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-500 self-end sm:self-auto flex-shrink-0">
                {isDeleteLogsOpen ? (
                  <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300" />
                ) : (
                  <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300" />
                )}
              </div>
            </button>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${isDeleteLogsOpen ? 'max-h-[500px] sm:max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                }`}
            >
              <div className="p-3 sm:p-2 md:p-4 border-b border-[#d7e3ef] gap-3 sm:gap-4 bg-gray-50">
                <div className="flex flex-col gap-2 sm:gap-3 w-full">
                  <div className="w-full">
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <select
                      value={deleteLogsFeature}
                      onChange={(e) => setDeleteLogsFeature(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-full border border-[#d7e3ef] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                    >
                      <option value="">All Features</option>
                      <option value="attendance">Attendance</option>
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="coordinator">Coordinator</option>
                      <option value="principal">Principal</option>
                      <option value="classroom">Classroom</option>
                      <option value="grade">Grade</option>
                      <option value="level">Level</option>
                      <option value="campus">Campus</option>
                      <option value="user">User</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDeleteLogsFeature("")
                        setDeleteLogsQuery("")
                      }}
                      className="whitespace-nowrap border-[#d7e3ef] text-gray-700 hover:bg-gray-50 text-xs sm:text-sm px-3 sm:px-4"
                    >
                      <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>

              {deleteLogsLoading ? (
                <div className="py-8 sm:py-12 px-4 sm:px-6 text-center text-gray-500">
                  <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm sm:text-base">Loading delete logs...</p>
                </div>
              ) : filteredDeleteLogs.length === 0 ? (
                <EmptyState
                  title="No delete logs found"
                  description="There are no deletion records matching your filters."
                  icon={<FileX className="w-10 h-10 sm:w-12 sm:h-12 text-red-500" />}
                />
              ) : (
                <ul className="divide-y divide-gray-100 max-h-[300px] sm:max-h-[350px] md:max-h-[400px] overflow-y-auto">
                  {filteredDeleteLogs.map((log) => (
                    <DeleteLogRow key={log.id} log={log} />
                  ))}
                </ul>
              )}
            </div>

            {/* Placeholder card when closed */}
            {!isDeleteLogsOpen && (
              <div className="p-6 sm:p-8 md:p-10 border-t border-[#d7e3ef] bg-gray-50/50 min-h-[150px] sm:min-h-[200px] md:min-h-[250px] flex items-center justify-center">
                <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-gray-400 w-full">
                  <div className="p-3 sm:p-4 bg-gray-100 rounded-xl flex-shrink-0">
                    <FileX className="w-5 h-5 sm:w-6 sm:h-6 text-gray-300" />
                  </div>
                  <p className="text-sm sm:text-base italic text-gray-500 text-center sm:text-left">Click to view delete logs or filters to help you find what you need.</p>


                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight,
  subtle,
}: {
  label: string
  value: string | number
  highlight?: boolean
  subtle?: boolean
}) {
  const base = "px-4 py-3 rounded-2xl border bg-white/10 shadow-lg shadow-black/5"
  const highlightClass = highlight ? "text-2xl font-bold" : "text-xl font-semibold"

  return (
    <div className={`${base} ${subtle ? "border-white/20 text-white/80" : "border-white/50 text-white"}`}>
      <p className="text-sm uppercase tracking-wide">{label}</p>
      <p className={`${highlightClass} mt-1`}>{value}</p>
    </div>
  )
}

function NotificationRow({
  notification,
  selected,
  onToggleSelect,
  onMarkAsRead,
  isDeleting = false,
}: {
  notification: Notification
  selected: boolean
  onToggleSelect: (id: number) => void
  onMarkAsRead: (id: number) => void
  isDeleting?: boolean
}) {
  const isUnread = notification.unread

  return (
    <li className="px-3 sm:px-4 py-3 sm:py-3.5">
      <div
        className={`rounded-2xl border flex gap-4 items-start p-3 sm:p-4 shadow-sm hover:shadow-md bg-white transform transition-all duration-200 ease-out ${isUnread ? "border-blue-100 bg-blue-50/40" : "border-gray-100"
          } ${isDeleting
            ? "opacity-0 translate-x-4 scale-[0.97] blur-[1px] pointer-events-none"
            : "opacity-100 translate-x-0 scale-100"
          }`}
      >
        <button
          type="button"
          onClick={() => onToggleSelect(notification.id)}
          className={`mt-2 w-4 h-4 rounded border flex-shrink-0 mr-1 ${selected ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"
            }`}
          aria-label={selected ? "Deselect notification" : "Select notification"}
        >
          {selected && <Check className="w-3 h-3 text-white mx-auto" />}
        </button>
        <div
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${isUnread
              ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg"
              : "bg-gray-200 text-gray-600"
            }`}
        >
          <Bell className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className={`text-sm sm:text-base font-semibold line-clamp-2 ${isUnread ? "text-gray-900" : "text-gray-700"
                  }`}
              >
                {notification.verb}
              </p>
              {notification.target_text && (
                <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">{notification.target_text}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-gray-500 mt-1.5">
                {notification.actor_name && <span className="font-medium">{notification.actor_name}</span>}
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-gray-300" />
                  {formatRelative(notification.timestamp)}
                </span>
                {isUnread && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                    New
                  </span>
                )}
              </div>
            </div>
            {isUnread && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onMarkAsRead(notification.id)}
                className="text-blue-600 hover:text-blue-800 flex-shrink-0"
              >
                <Check className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

function DeleteLogRow({ log }: { log: DeleteLog }) {
  return (
    <li className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-3.5">
      <div className="rounded-xl sm:rounded-2xl border border-red-100 bg-red-50/40 flex gap-2 sm:gap-3 md:gap-4 items-start p-2 sm:p-3 md:p-4 shadow-sm hover:shadow-md transform transition-all duration-200 ease-out">
        <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg">
          <FileX className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-1 sm:space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm md:text-base font-semibold line-clamp-2 text-gray-900">
                {log.feature_display} - {log.entity_name || `${log.entity_type} (ID: ${log.entity_id})`}
              </p>
              {log.reason && (
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 line-clamp-2 mt-0.5 sm:mt-1">{log.reason}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] md:text-xs text-gray-500 mt-1 sm:mt-1.5">
                <span className="font-medium truncate max-w-[120px] sm:max-w-none">{log.user_name}</span>
                <span className="inline-flex items-center gap-1 flex-shrink-0">
                  <span className="h-0.5 w-0.5 sm:h-1 sm:w-1 rounded-full bg-gray-300" />
                  <span className="whitespace-nowrap">{formatRelative(log.timestamp)}</span>
                </span>
                {log.ip_address && (
                  <span className="inline-flex items-center gap-1 flex-shrink-0">
                    <span className="h-0.5 w-0.5 sm:h-1 sm:w-1 rounded-full bg-gray-300" />
                    <span className="hidden sm:inline">{log.ip_address}</span>
                    <span className="sm:hidden text-[9px]">IP</span>
                  </span>
                )}
                <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-red-100 text-red-700 border border-red-200 flex-shrink-0">
                  {log.action_display}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

function EmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="py-12 px-6 text-center text-gray-500 flex flex-col items-center gap-4">
      <div className="p-4 bg-blue-50 rounded-full">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
  )
}
