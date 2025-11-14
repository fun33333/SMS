"use client"

import Link from "next/link"
import { Bell } from "lucide-react"
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications"

export function NotificationBell() {
  const { unreadCount, isConnected } = useWebSocketNotifications()

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
          unreadCount > 0 ? "animate-shake-interval" : ""
        } ${!isConnected ? "opacity-50" : ""}`}
      />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 flex items-center justify-center">
          <span className="absolute inline-flex w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-red-500/70 animate-ping"></span>
          <span className="relative inline-flex w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-red-500 border border-white sm:border-2 text-[9px] sm:text-[10px] font-semibold items-center justify-center text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        </span>
      )}
    </Link>
  )
}

