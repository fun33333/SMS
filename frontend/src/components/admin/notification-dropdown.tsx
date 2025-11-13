"use client"

import { useState } from "react"
import { Bell, Check, CheckCheck, X, Clock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications"
import type { Notification } from "@/types/notification"
import { formatDistanceToNow } from "date-fns"

// Helper function to format time
function formatTime(timestamp: string) {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
  } catch {
    return "Just now"
  }
}

export function NotificationDropdown() {
  const { notifications, unreadCount, isConnected, markAsRead, markAllAsRead, refetch } = useWebSocketNotifications()
  const [open, setOpen] = useState(false)

  // Filter to show only unread notifications
  const unreadNotifications = notifications.filter(n => n.unread === true)

  const handleMarkAsRead = async (notificationId: number) => {
    await markAsRead(notificationId)
    // Notification will be automatically removed from list since it's now read
  }

  const handleMarkAllAsRead = async () => {
    await markAllAsRead()
    // Close dropdown after marking all as read
    setTimeout(() => {
      setOpen(false)
    }, 300) // Small delay for smooth animation
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-full transition-all hover:scale-110 active:scale-95 p-2 sm:p-1.5 touch-manipulation"
          aria-label="Notifications"
          style={{ minWidth: 44, minHeight: 44 }}
          title={isConnected ? "Notifications connected" : "Notifications disconnected"}
        >
          <Bell className={`w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-gray-700 ${unreadCount > 0 ? 'animate-shake-interval' : ''} ${!isConnected ? 'opacity-50' : ''}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 flex items-center justify-center">
              <span className="absolute inline-flex w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-red-500/70 animate-ping"></span>
              <span className="relative inline-flex w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-red-500 border border-white sm:border-2 text-[9px] sm:text-[10px] font-semibold items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:w-80 sm:max-w-80 md:w-96 md:max-w-96 p-0 mx-2 sm:mx-0 shadow-xl border-0 overflow-hidden" 
        align="end"
        sideOffset={8}
        alignOffset={-8}
        side="bottom"
        avoidCollisions={true}
        collisionPadding={8}
      >
        {/* Header with gradient background */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 p-4 sm:p-5 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg">Notifications</h3>
                {unreadCount > 0 && (
                  <p className="text-xs sm:text-sm text-blue-100 mt-0.5">
                    {unreadCount} {unreadCount === 1 ? 'unread' : 'unread'}
                  </p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 sm:h-8 text-[10px] sm:text-xs w-full sm:w-auto justify-center bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm transition-all duration-200 shadow-md hover:shadow-lg font-medium px-2.5 sm:px-3"
                onClick={handleMarkAllAsRead}
              >
                <CheckCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                <span className="hidden sm:inline">Mark all read</span>
                <span className="sm:hidden">Mark all read</span>
              </Button>
            )}
          </div>
        </div>

        <div className="h-[60vh] sm:h-[400px] max-h-[500px] bg-gray-50/30">
          <ScrollArea className="h-full">
          {!unreadNotifications || !Array.isArray(unreadNotifications) || unreadNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center">
              <div className="p-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full mb-4">
                <Bell className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500" />
              </div>
              <p className="text-base sm:text-lg font-semibold text-gray-700 mb-1">All caught up!</p>
              <p className="text-xs sm:text-sm text-gray-500">No new notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200/60">
              {unreadNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                />
              ))}
            </div>
          )}
          </ScrollArea>
        </div>

        {!isConnected && (
          <div className="p-3 sm:p-4 border-t bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200">
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
              <p className="text-xs sm:text-sm text-yellow-800 font-medium text-center">
                Using polling mode - notifications may be delayed
              </p>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function NotificationItem({
  notification,
  onMarkAsRead,
}: {
  notification: Notification
  onMarkAsRead: (id: number) => void
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={`group relative p-4 sm:p-5 transition-all duration-200 cursor-pointer touch-manipulation ${
        notification.unread
          ? 'bg-gradient-to-r from-blue-50/80 via-blue-50/60 to-white hover:from-blue-100/90 hover:via-blue-50/80 hover:to-white active:from-blue-200 active:via-blue-100 active:to-white border-l-4 border-l-blue-500 shadow-sm'
          : 'bg-white hover:bg-gray-50/80 active:bg-gray-100/80 border-l-4 border-l-transparent hover:border-l-gray-200'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onClick={() => {
        if (notification.unread) {
          onMarkAsRead(notification.id)
        }
      }}
    >
      {/* Unread indicator dot */}
      {notification.unread && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2">
          <div className="w-3 h-3 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50 animate-pulse"></div>
        </div>
      )}
      
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Icon/Avatar circle */}
        <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
          notification.unread 
            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/30' 
            : 'bg-gradient-to-br from-gray-200 to-gray-300'
        }`}>
          <Bell className={`w-5 h-5 sm:w-6 sm:h-6 ${notification.unread ? 'text-white' : 'text-gray-500'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className={`text-sm sm:text-base leading-snug ${notification.unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'} break-words`}>
              {notification.verb}
            </p>
          </div>
          
          {notification.target_text && (
            <p className="text-xs sm:text-sm text-gray-600 mt-1.5 break-words leading-relaxed">
              {notification.target_text}
            </p>
          )}
          
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {notification.actor_name && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">
                  {notification.actor_name}
                </p>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-gray-400">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="text-xs sm:text-sm truncate">{formatTime(notification.timestamp)}</span>
            </div>
          </div>
        </div>

        {/* Mark as read button */}
        {notification.unread && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkAsRead(notification.id)
            }}
            className={`flex-shrink-0 p-2 rounded-lg transition-all duration-200 touch-manipulation ${
              isHovered || notification.unread
                ? 'opacity-100 translate-x-0 bg-blue-100 hover:bg-blue-200 active:bg-blue-300 shadow-sm hover:shadow-md'
                : 'opacity-0 translate-x-2'
            }`}
            title="Mark as read"
            aria-label="Mark as read"
          >
            <Check className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
          </button>
        )}
      </div>

      {/* Hover effect overlay */}
      <div className={`absolute inset-0 rounded-lg transition-opacity duration-200 pointer-events-none ${
        isHovered ? 'opacity-100' : 'opacity-0'
      } ${notification.unread ? 'bg-blue-500/5' : 'bg-gray-500/5'}`}></div>
    </div>
  )
}

