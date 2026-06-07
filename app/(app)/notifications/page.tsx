'use client'

import { useState, useEffect } from 'react'
import { Bell, AlertTriangle, ArrowLeftRight, DoorOpen, PlusCircle, MinusCircle, CheckCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import type { Notification } from '@/lib/types'

const TYPE_CONFIG: Record<Notification['type'], {
  icon: React.ReactNode
  bg: string
  border: string
  badgeBg: string
  badgeText: string
  label: string
}> = {
  cancelled: {
    icon: <AlertTriangle size={16} className="text-red-500" />,
    bg: 'bg-red-50',
    border: 'border-red-200',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    label: 'CANCELLED',
  },
  rescheduled: {
    icon: <ArrowLeftRight size={16} className="text-green-600" />,
    bg: 'bg-green-50',
    border: 'border-green-200',
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-700',
    label: 'RESCHEDULED',
  },
  room_change: {
    icon: <DoorOpen size={16} className="text-orange-500" />,
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-700',
    label: 'ROOM CHANGE',
  },
  added: {
    icon: <PlusCircle size={16} className="text-blue-500" />,
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
    label: 'NEW CLASS',
  },
  removed: {
    icon: <MinusCircle size={16} className="text-gray-500" />,
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-600',
    label: 'REMOVED',
  },
}

export default function NotificationsPage() {
  const { userId, refreshUnreadCount } = useSession()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    fetch(`/api/notifications?userId=${userId}`)
      .then((r) => r.json())
      .then((data: Notification[]) => {
        setNotifications(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId])

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, markAll: true }),
    })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    refreshUnreadCount()
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, notificationId: id }),
    })
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    refreshUnreadCount()
  }

  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="text-indigo-600" size={22} />
            <h1 className="text-xl font-bold text-gray-900">Alerts</h1>
            {unread > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                {unread}
              </span>
            )}
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs text-gray-500 gap-1">
              <CheckCheck size={14} /> Mark all read
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Changes are highlighted:
          <span className="text-red-500 font-medium"> Red = cancelled</span>,
          <span className="text-green-600 font-medium"> Green = rescheduled</span>,
          <span className="text-orange-500 font-medium"> Orange = room change</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Bell size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">No alerts yet</p>
            <p className="text-xs mt-1">You'll be notified when your schedule changes</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <NotificationCard
              key={notif.id}
              notification={notif}
              onRead={() => !notif.read && markRead(notif.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function NotificationCard({ notification: n, onRead }: { notification: Notification; onRead: () => void }) {
  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.removed

  return (
    <button
      onClick={onRead}
      className={cn(
        'w-full text-left flex gap-3 items-start rounded-xl border p-3.5 transition-all',
        cfg.bg, cfg.border,
        !n.read && 'shadow-sm',
        n.read && 'opacity-70'
      )}
    >
      {/* Left icon */}
      <div className={cn('shrink-0 w-8 h-8 rounded-full flex items-center justify-center', cfg.badgeBg)}>
        {cfg.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className={cn('text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded mr-1', cfg.badgeBg, cfg.badgeText)}>
              {cfg.label}
            </span>
            <span className="text-sm font-semibold text-gray-900">{n.title}</span>
          </div>
          {!n.read && (
            <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />
          )}
        </div>
        <p className="text-xs text-gray-600 mt-0.5 leading-snug">{n.body}</p>
        <p className="text-[10px] text-gray-400 mt-1">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </p>
      </div>
    </button>
  )
}
