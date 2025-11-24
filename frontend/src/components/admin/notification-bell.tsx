"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications"
import { getDeleteLogs } from "@/lib/api"

export function NotificationBell() {
  const { unreadCount, isConnected } = useWebSocketNotifications()
  const [deleteLogs, setDeleteLogs] = useState<any[]>([])
  const [deleteLogsLastSeen, setDeleteLogsLastSeen] = useState<string | null>(null)

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
      try {
        const response = await getDeleteLogs(undefined, 50)
        setDeleteLogs(response.results || [])
      } catch (error) {
        // Silently fail - don't show errors in bell
        setDeleteLogs([])
      }
    }
    fetchDeleteLogs()
    
    // Poll for new delete logs every 10 seconds for real-time updates
    const interval = setInterval(fetchDeleteLogs, 10000)
    return () => clearInterval(interval)
  }, [])

  // Calculate unread delete logs count
  const deleteLogsUnreadCount = useMemo(() => {
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
  }, [deleteLogs, deleteLogsLastSeen])

  // Total unread count (notifications + delete logs)
  const totalUnreadCount = unreadCount + deleteLogsUnreadCount

  return (
    <Link
      href="/admin/notifications"
      className="relative rounded-full transition-all hover:scale-110 active:scale-95 p-2 sm:p-1.5 touch-manipulation"
      aria-label="Open notifications"
      title={isConnected ? "Notifications center" : "Notifications (offline mode)"}
      style={{ minWidth: 44, minHeight: 44 }}
    >
      <Bell
        className={`w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-gray-700 ${
          totalUnreadCount > 0 ? "animate-shake-interval" : ""
        } ${!isConnected ? "opacity-50" : ""}`}
      />
      {totalUnreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 flex items-center justify-center">
          <span className="absolute inline-flex w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-red-500/70 animate-ping"></span>
          <span className="relative inline-flex w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-red-500 border border-white sm:border-2 text-[9px] sm:text-[10px] font-semibold items-center justify-center text-white">
            {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
          </span>
        </span>
      )}
    </Link>
  )
}

