"use client"
import { useEffect, useState, useCallback } from "react"
import type { Notification } from "@/types/notification"

export function useNotifications(pollInterval = 15000) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    try {
      console.log('Fetching notifications...');
      const res = await fetch('/api/notifications/unread/', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1] || ''
        }
      })
      console.log('Fetch response:', res.status, res.statusText);
      if (!res.ok) {
        console.error('Failed to fetch notifications:', res.status, res.statusText);
        return;
      }
      const data = await res.json();
      console.log('Notifications received:', data);
      setNotifications(data);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const id = setInterval(fetchNotifications, pollInterval)
    return () => clearInterval(id)
  }, [fetchNotifications, pollInterval])

  const markRead = useCallback(async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/mark_read/`, { method: 'POST', credentials: 'include' })
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, [])

  return { notifications, loading, markRead, refetch: fetchNotifications }
}
