'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, AlertTriangle, ArrowLeftRight, DoorOpen, PlusCircle, MinusCircle, CheckCheck, Trash2, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import type { Notification } from '@/lib/types'

// Card colours match the legend: red = cancelled, green = added, indigo = moved/updated.
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
    bg: 'bg-red-50', border: 'border-red-200', badgeBg: 'bg-red-100', badgeText: 'text-red-700',
    label: 'CANCELLED',
  },
  added: {
    icon: <PlusCircle size={16} className="text-green-600" />,
    bg: 'bg-green-50', border: 'border-green-200', badgeBg: 'bg-green-100', badgeText: 'text-green-700',
    label: 'ADDED',
  },
  rescheduled: {
    icon: <ArrowLeftRight size={16} className="text-indigo-500" />,
    bg: 'bg-indigo-50', border: 'border-indigo-100', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700',
    label: 'MOVED',
  },
  room_change: {
    icon: <DoorOpen size={16} className="text-indigo-500" />,
    bg: 'bg-indigo-50', border: 'border-indigo-100', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700',
    label: 'CLASS CHANGED',
  },
  schedule_update: {
    icon: <Bell size={16} className="text-indigo-500" />,
    bg: 'bg-indigo-50', border: 'border-indigo-100', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700',
    label: 'UPDATED',
  },
  removed: {
    icon: <MinusCircle size={16} className="text-gray-500" />,
    bg: 'bg-gray-50', border: 'border-gray-200', badgeBg: 'bg-gray-100', badgeText: 'text-gray-600',
    label: 'REMOVED',
  },
}

export function AlertsPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { userId, refreshUnreadCount } = useSession()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!userId) return
    fetch(`/api/notifications?userId=${userId}`)
      .then((r) => r.json())
      .then((data: Notification[]) => { setNotifications(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [userId])

  useEffect(() => { if (open) load() }, [open, load])

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, markAll: true }),
    })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    refreshUnreadCount()
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, notificationId: id }),
    })
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    refreshUnreadCount()
  }

  async function deleteNotif(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    await fetch(`/api/notifications?userId=${userId}&id=${id}`, { method: 'DELETE' })
    refreshUnreadCount()
  }

  async function clearAll() {
    setNotifications([])
    await fetch(`/api/notifications?userId=${userId}&all=1`, { method: 'DELETE' })
    refreshUnreadCount()
  }

  const unread = notifications.filter((n) => !n.read).length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92%] sm:max-w-md p-0">
        <div className="flex flex-col h-full">
          <div className="shrink-0 border-b border-border px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 pr-10">
              <Bell className="text-indigo-600 dark:text-indigo-400" size={18} />
              <SheetTitle>Alerts</SheetTitle>
              {unread > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{unread}</span>
              )}
              <div className="ml-auto flex items-center">
                {unread > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllRead} title="Mark all as read" className="text-xs text-muted-foreground gap-1">
                    <CheckCheck size={14} /> Read all
                  </Button>
                )}
                {notifications.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAll} title="Delete all alerts" className="text-xs text-red-500 gap-1">
                    <Trash2 size={14} /> Clear
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              <span className="text-red-500 font-medium">Red = cancelled</span> ·
              <span className="text-green-600 font-medium"> Green = added</span> ·
              <span className="text-indigo-500 font-medium"> Indigo = moved / updated</span>
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Bell size={40} strokeWidth={1} />
                <p className="mt-3 text-sm">No alerts yet</p>
                <p className="text-xs mt-1">You&apos;ll be notified when your schedule changes</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <NotificationCard
                  key={notif.id}
                  notification={notif}
                  onRead={() => !notif.read && markRead(notif.id)}
                  onDelete={() => deleteNotif(notif.id)}
                />
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function NotificationCard({ notification: n, onRead, onDelete }: { notification: Notification; onRead: () => void; onDelete: () => void }) {
  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.removed

  return (
    <div
      className={cn(
        'relative flex gap-3 items-start rounded-xl border p-3.5 transition-all',
        cfg.bg, cfg.border,
        !n.read && 'shadow-sm',
        n.read && 'opacity-70'
      )}
    >
      <button onClick={onRead} className="absolute inset-0" aria-label="Mark read" title="Tap to mark as read" />

      <div className={cn('shrink-0 w-8 h-8 rounded-full flex items-center justify-center z-10', cfg.badgeBg)}>
        {cfg.icon}
      </div>

      <div className="flex-1 min-w-0 z-10 pointer-events-none">
        <div className="flex items-start justify-between gap-2 pr-6">
          <div>
            <span className={cn('text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded mr-1', cfg.badgeBg, cfg.badgeText)}>
              {cfg.label}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-900">{n.title}</span>
          </div>
          {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />}
        </div>
        <p className="text-xs text-gray-600 mt-0.5 leading-snug">{n.body}</p>
        <p className="text-[10px] text-gray-400 mt-1">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </p>
      </div>

      <button
        onClick={onDelete}
        className="absolute top-2 right-2 z-20 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-white/60"
        aria-label="Delete" title="Dismiss this alert"
      >
        <X size={14} />
      </button>
    </div>
  )
}
