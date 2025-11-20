"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  RefreshCw,
  Search,
  Inbox,
  WifiOff,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications"
import type { Notification } from "@/types/notification"
import { Button } from "@/components/ui/button"

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
    clearAllLocal,
  } = useWebSocketNotifications()
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"unread" | "all">("unread")
  const [selectedIds, setSelectedIds] = useState<number[]>([])

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
    removeNotificationsLocal(selectedIds)
    setSelectedIds([])
  }

  const handleDeleteAllVisible = () => {
    const ids = filtered.map(n => n.id)
    if (ids.length === 0) return
    removeNotificationsLocal(ids)
    setSelectedIds([])
  }

  return (
    <div className="space-y-6 py-4 sm:py-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button 
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-[#274c77] via-[#356c9b] to-[#6096ba] text-white p-6 shadow-2xl border border-white/10">
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
        <div className="flex flex-wrap gap-6 mt-6">
          <StatCard label="Unread" value={unreadCount} highlight />
          <StatCard label="Showing" value={filtered.length} />
          <StatCard label="Connection" value={isConnected ? "Realtime" : "Polling"} subtle={!isConnected} />
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white rounded-3xl shadow-xl border border-[#d7e3ef] overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 sm:p-6 border-b border-[#d7e3ef] gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">News & Alerts</h2>
              <p className="text-sm text-gray-500">
                Filter and manage all your unread notifications in one place.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full bg-[#e7ecef] p-1">
                {(["unread", "all"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setView(option)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      view === option
                        ? "bg-white shadow text-[#274c77]"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {option === "unread" ? "Unread" : "All"}
                  </button>
                ))}
              </div>
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
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.length === 0}
                    className="whitespace-nowrap border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Delete selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteAllVisible}
                    className="whitespace-nowrap text-gray-500 hover:text-gray-700"
                  >
                    Clear this list
                  </Button>
                </div>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="All caught up!"
              description="You have no unread notifications."
              icon={<Inbox className="w-12 h-12 text-blue-500" />}
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  selected={selectedIds.includes(notification.id)}
                  onToggleSelect={toggleSelect}
                  onMarkAsRead={(id) => markAsRead(id)}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <div className="bg-white rounded-3xl shadow-xl border border-[#d7e3ef] p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Links & Tips</h3>
            <ul className="space-y-4 text-sm text-gray-600">
              <li>
                <p className="font-semibold text-gray-800">Beware of spoofed emails</p>
                <p className="text-gray-500">We never ask for passwords via notifications.</p>
              </li>
              <li>
                <p className="font-semibold text-gray-800">Keep your courses synced</p>
                <p className="text-gray-500">Mark notifications read to keep the badge accurate.</p>
              </li>
              <li>
                <p className="font-semibold text-gray-800">Need older alerts?</p>
                <p className="text-gray-500">Visit the reports module to export history.</p>
              </li>
            </ul>
          </div>

          {!isConnected && (
            <div className="bg-[#fef7ed] border border-[#f4c195] rounded-2xl p-5 flex items-start gap-3 shadow-inner">
              <WifiOff className="w-5 h-5 text-[#d97706] mt-0.5" />
              <div>
                <p className="text-[#b45309] font-semibold">Realtime channel offline</p>
                <p className="text-[#b45309] text-sm">
                  We switched to safe polling mode. Please ensure the websocket server is running for instant
                  delivery.
                </p>
              </div>
            </div>
          )}
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
}: {
  notification: Notification
  selected: boolean
  onToggleSelect: (id: number) => void
  onMarkAsRead: (id: number) => void
}) {
  return (
    <li className="p-4 sm:p-5 hover:bg-gray-50 transition flex gap-4 items-start">
      <button
        type="button"
        onClick={() => onToggleSelect(notification.id)}
        className={`mt-2 w-4 h-4 rounded border flex-shrink-0 mr-1 ${
          selected ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"
        }`}
        aria-label={selected ? "Deselect notification" : "Select notification"}
      >
        {selected && <Check className="w-3 h-3 text-white mx-auto" />}
      </button>
      <div
        className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
          notification.unread
            ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg"
            : "bg-gray-200 text-gray-600"
        }`}
      >
        <Bell className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className={`text-base font-semibold ${notification.unread ? "text-gray-900" : "text-gray-700"}`}>
          {notification.verb}
        </p>
        {notification.target_text && <p className="text-sm text-gray-600">{notification.target_text}</p>}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {notification.actor_name && <span>{notification.actor_name}</span>}
          <span>{formatRelative(notification.timestamp)}</span>
        </div>
      </div>
      {notification.unread && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onMarkAsRead(notification.id)}
          className="text-blue-600 hover:text-blue-800"
        >
          <Check className="w-5 h-5" />
        </Button>
      )}
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

