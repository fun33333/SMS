"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import type { Notification } from "@/types/notification"
import { getApiBaseUrl } from "@/lib/api"

interface WebSocketNotification {
  id: number
  verb: string
  target_text: string
  actor_name?: string
  timestamp: string
  data: Record<string, any>
  unread: boolean
}

export function useWebSocketNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [usePolling, setUsePolling] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const connectWebSocket = useCallback(() => {
    const token = localStorage.getItem('sis_access_token')
    if (!token) {
      console.log('No authentication token found for WebSocket')
      return
    }

    // Don't reconnect if already connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Get WebSocket URL (convert http/https to ws/wss)
    const apiBaseUrl = getApiBaseUrl()
    let wsUrl: string
    
    if (apiBaseUrl.startsWith('https://')) {
      wsUrl = apiBaseUrl.replace(/^https/, 'wss')
    } else {
      wsUrl = apiBaseUrl.replace(/^http/, 'ws')
    }
    
    // Remove trailing slash if present
    wsUrl = wsUrl.replace(/\/$/, '')
    
    // Add WebSocket path and token
    wsUrl = `${wsUrl}/ws/notifications/?token=${encodeURIComponent(token)}`
    
    console.log('🔌 Connecting to WebSocket:', wsUrl.replace(token, 'TOKEN'))
    console.log('📍 API Base URL:', apiBaseUrl)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully')
        setIsConnected(true)
        // Clear any reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'pong') {
            // Respond to ping
            return
          }

          // Handle notification message
          if (data.id && data.verb) {
            const notification: WebSocketNotification = data
            
            // Add to notifications list (avoid duplicates)
            setNotifications((prev) => {
              const exists = prev.find(n => n.id === notification.id)
              if (exists) return prev
              return [notification as Notification, ...prev]
            })
            setUnreadCount((prev) => prev + 1)

            // Show toast notification
            toast({
              title: notification.actor_name || 'System',
              description: `${notification.verb} ${notification.target_text}`,
              duration: 5000,
            })
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('❌ WebSocket error occurred')
        console.error('Error event:', error)
        console.error('WebSocket readyState:', ws.readyState)
        console.error('WebSocket URL (masked):', wsUrl.replace(token, 'TOKEN'))
        
        // Provide helpful error message
        if (ws.readyState === WebSocket.CLOSED) {
          console.error('💡 Tip: Make sure backend is running with ASGI server (daphne)')
          console.error('💡 Run: daphne -b 0.0.0.0 -p 8000 backend.asgi:application')
        }
        
        setIsConnected(false)
      }

      ws.onclose = (event) => {
        const closeReasons: Record<number, string> = {
          1000: 'Normal closure',
          1001: 'Going away',
          1002: 'Protocol error',
          1003: 'Unsupported data',
          1006: 'Abnormal closure',
          1007: 'Invalid data',
          1008: 'Policy violation',
          1009: 'Message too big',
          1010: 'Extension error',
          1011: 'Internal error',
          4001: 'No token provided',
          4003: 'Authentication failed',
        }
        
        console.log('🔌 WebSocket disconnected', {
          code: event.code,
          reason: event.reason || closeReasons[event.code] || 'Unknown',
          wasClean: event.wasClean,
          readyState: ws.readyState
        })
        
        setIsConnected(false)
        
        // If connection fails multiple times, fallback to polling
        if (event.code === 1006 || event.code === 1002) {
          console.warn('⚠️ WebSocket connection failed - falling back to polling')
          setUsePolling(true)
          return
        }
        
        // Only reconnect if it wasn't a clean close (code 1000) and not manually closed
        // Don't reconnect on authentication errors (4003) or no token (4001)
        if (event.code !== 1000 && event.code !== 4001 && event.code !== 4003 && !reconnectTimeoutRef.current) {
          console.log('🔄 Will attempt to reconnect in 3 seconds...')
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null
            connectWebSocket()
          }, 3000)
        } else if (event.code === 4001 || event.code === 4003) {
          console.error('🚫 Authentication failed - not reconnecting')
        }
      }
    } catch (error) {
      console.error('❌ Error creating WebSocket connection:', error)
      setIsConnected(false)
    }
  }, [])

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  // Send ping to keep connection alive
  useEffect(() => {
    if (!isConnected || !wsRef.current) return

    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000) // Ping every 30 seconds

    return () => clearInterval(pingInterval)
  }, [isConnected])

  // Polling fallback when WebSocket is not available
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }
    
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const token = localStorage.getItem('sis_access_token')
        if (!token) return

        const response = await fetch(`${getApiBaseUrl()}/api/notifications/`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const data = await response.json()
          // Handle paginated response (results array) or direct array
          const notificationsList = Array.isArray(data) ? data : (data.results || [])
          setNotifications(notificationsList)
          setUnreadCount(notificationsList.filter((n: Notification) => n.unread).length)
        }
      } catch (error) {
        console.error('Error polling notifications:', error)
      }
    }, 15000) // Poll every 15 seconds
  }, [])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (usePolling) {
      startPolling()
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    } else {
      connectWebSocket()
      return () => {
        disconnectWebSocket()
      }
    }
  }, [connectWebSocket, disconnectWebSocket, usePolling, startPolling])

  // Fetch all notifications (not just unread)
  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem('sis_access_token')
      if (!token) {
        return
      }

      const response = await fetch(`${getApiBaseUrl()}/api/notifications/`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        // Handle paginated response (results array) or direct array
        const notificationsList = Array.isArray(data) ? data : (data.results || [])
        setNotifications(notificationsList)
        setUnreadCount(notificationsList.filter((n: Notification) => n.unread).length)
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    }
  }, [])

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: number) => {
    try {
      const token = localStorage.getItem('sis_access_token')
      if (!token) {
        return
      }

      const response = await fetch(`${getApiBaseUrl()}/api/notifications/${notificationId}/mark_read/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, unread: false } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }, [])

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      const token = localStorage.getItem('sis_access_token')
      if (!token) {
        return
      }

      const response = await fetch(`${getApiBaseUrl()}/api/notifications/mark_all_read/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        // Update local state
        setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
        setUnreadCount(0)
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  return {
    notifications,
    unreadCount,
    isConnected,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
  }
}

