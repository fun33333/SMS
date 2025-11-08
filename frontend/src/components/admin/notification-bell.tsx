"use client"

import { useState, useRef, useEffect } from "react"
import { Bell, CheckCircle } from "lucide-react"
import { getApiBaseUrl } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const [readNotifications, setReadNotifications] = useState<number[]>([])
  const [notifications, setNotifications] = useState<{
    id: number
    verb: string
    target_text: string
    timestamp: string
    actor_name: string
    unread: boolean
    data: any
  }[]>([])
  const [loading, setLoading] = useState(false)
  
  const popupRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('sis_access_token') // Using the correct token key
      if (!token) {
        console.log('No authentication token found')
        setNotifications([])
        return
      }

      console.log('Fetching notifications with token:', token)
      const apiUrl = `${getApiBaseUrl()}/api/notifications/unread/`
      console.log('Fetching from URL:', apiUrl)

      const response = await fetch(apiUrl, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // Only read the body once!
        const errorText = await response.text()
        console.error('Error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        })
        setNotifications([])
        return
      }

      // Only read the body once!
      const data = await response.json()
      console.log('Received notifications:', data)
      setNotifications(data)
    } catch (error) {
      console.error('Error fetching notifications:', error)
      setNotifications([]) // Clear notifications on error
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id: number) => {
    try {
      const token = localStorage.getItem('auth_access_token')
      if (!token) {
        console.log('No authentication token found')
        return
      }
      
      const response = await fetch(`${getApiBaseUrl()}/api/notifications/${id}/mark_read/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      
      if (response.status === 401) {
        // Handle unauthorized
        return
      }
      
      if (response.ok) {
        setReadNotifications([...readNotifications, id])
        // Remove from notifications list
        setNotifications(notifications.filter(n => n.id !== id))
      } else {
        console.error('Failed to mark notification as read:', await response.text())
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  useEffect(() => {
    fetchNotifications()
    // Fetch notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])
  
  // Close popup when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'info':
        return 'bg-blue-100 text-blue-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
      case 'success':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Count unread notifications
  const unreadCount = notifications.filter(n => !readNotifications.includes(n.id)).length

  // Mark all as read handler
  const handleMarkAllAsRead = () => {
    const token = localStorage.getItem('sis_access_token')
    if (!token) return
    fetch(`${getApiBaseUrl()}/api/notifications/delete_all/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(res => {
        if (res.ok) {
          setNotifications([])
          setReadNotifications([])
        }
      })
  }

  return (
  <div className="relative" ref={popupRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-full transition-all hover:scale-110 p-2 sm:p-1"
        aria-label="Notifications"
        style={{ minWidth: 40 }}
      >
        <Bell className={`w-6 h-6 sm:w-7 sm:h-7 text-gray-700 ${notifications.length > 0 ? 'animate-shake-interval' : ''}`} />

        {/* Show notification count only if there are unread notifications */}
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 sm:-top-1 sm:-right-1 flex items-center justify-center">
            <span className="absolute inline-flex w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-red-500/70 animate-ping"></span>
            <span className="relative inline-flex w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-red-500 border border-white sm:border-2 text-[10px] items-center justify-center">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          </span>
        )}
      </button>

      {/* Notification Popup */}
      {isOpen && (
        <div
          className="fixed sm:absolute left-1/2 sm:left-auto right-auto sm:right-0 top-20 sm:top-auto mt-2 w-full sm:w-[98vw] max-w-[95vw] sm:max-w-sm md:max-w-md lg:max-w-lg bg-white rounded-lg shadow-2xl border-2 border-gray-300 z-50 animate-fade-in flex flex-col max-h-[80vh] sm:max-h-96"
          style={{ transform: 'translateX(-50%)', minWidth: 0 }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between flex-shrink-0 rounded-t-lg gap-2">
            <h3 className="font-semibold text-xs sm:text-sm md:text-base flex items-center gap-1.5 sm:gap-2 whitespace-nowrap flex-shrink-0">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span>Notifications</span>
            </h3>
            <Badge className="bg-white/20 text-white border-white/30 text-xs sm:text-sm px-2 py-1 flex-shrink-0">
              {unreadCount}
            </Badge>
          </div>

          {/* Notifications List - Scrollable */}
          <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400" style={{ maxHeight: '50vh' }}>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((notification) => {
                const isRead = !notification.unread
                return (
                  <div
                    key={notification.id}
                    className={`p-2 sm:p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${isRead ? 'opacity-60' : ''}`}
                    onClick={() => markAsRead(notification.id)}
                    style={{ wordBreak: 'break-word' }}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                      <div className="flex flex-row items-center gap-2">
                        {!isRead ? (
                          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 bg-blue-500" />
                        ) : (
                          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                        )}
                        <h4 className={`text-xs sm:text-sm ${isRead ? 'text-gray-500' : 'font-medium text-gray-900'} break-words`}>
                          {notification.actor_name || 'System'}
                        </h4>
                        <Badge className="bg-blue-100 text-blue-800 text-[10px] sm:text-xs flex-shrink-0 ml-2">
                          {notification.verb}
                        </Badge>
                      </div>
                      <div className="flex flex-col w-full">
                        <p className="text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-2 break-words">
                          {notification.target_text}
                        </p>
                        <p className="text-[9px] sm:text-xs text-gray-400">
                          {new Date(notification.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="p-4 sm:p-6 text-center">
                <Bell className="w-8 h-8 sm:w-10 sm:h-10 text-gray-300 mx-auto mb-2 sm:mb-3" />
                <p className="text-xs sm:text-sm text-gray-500">No notifications</p>
              </div>
            )}
          </div>

          {/* Footer - Fixed at bottom */}
          {unreadCount > 0 && (
            <div className="border-t bg-gray-50 px-2 py-2 sm:px-3 sm:py-3 flex-shrink-0 rounded-b-lg">
              <Button
                variant="ghost"
                onClick={handleMarkAllAsRead}
                className="w-full text-xs sm:text-sm text-green-600 hover:text-green-700 hover:bg-green-50 py-1 sm:py-2"
              >
                Mark All as Read
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

