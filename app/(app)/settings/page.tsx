'use client'

import { useState, useEffect } from 'react'
import {
  Settings, Copy, Check, Bell, BellOff, Calendar, ExternalLink,
  Download, Sheet, RefreshCw, Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession } from '@/components/session-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { userId, shareCode, user } = useSession()
  const [copied, setCopied] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)

  useEffect(() => {
    if (user?.display_name) setDisplayName(user.display_name)
    // Check push support and current subscription status
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true)
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub)
        })
      })
    }
  }, [user])

  function copyCode() {
    navigator.clipboard.writeText(shareCode)
    setCopied(true)
    toast.success('Code copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  async function saveName() {
    if (!displayName.trim() || !userId) return
    setSavingName(true)
    await fetch('/api/user/name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name: displayName.trim() }),
    })
    setSavingName(false)
    toast.success('Name saved!')
  }

  async function togglePush() {
    if (!('serviceWorker' in navigator)) return

    const reg = await navigator.serviceWorker.ready

    if (pushEnabled) {
      // Unsubscribe
      const sub = await reg.pushManager.getSubscription()
      await sub?.unsubscribe()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subscription: null }),
      })
      setPushEnabled(false)
      toast.success('Notifications turned off')
    } else {
      // Request permission and subscribe
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Notification permission denied')
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subscription: sub.toJSON() }),
      })
      setPushEnabled(true)
      toast.success('Push notifications enabled!')
    }
  }

  function addToCalendar() {
    window.location.href = `webcal://${window.location.host}/api/calendar?userId=${userId}`
  }

  function downloadICS() {
    window.open(`/api/calendar?userId=${userId}`, '_blank')
  }

  function openSheet() {
    window.open(
      `https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_SHEET_ID ?? '13-v2m0g3dr3UVo09i3qHLsMqZRyy_6zXf21AtDUtSOQ'}`,
      '_blank'
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Settings className="text-indigo-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Display name */}
        <Section title="Your Name">
          <div className="flex gap-2">
            <Input
              placeholder="Enter your name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="text-sm"
            />
            <Button onClick={saveName} disabled={!displayName.trim() || savingName} size="sm" variant="outline">
              Save
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Shown to friends when you compare schedules</p>
        </Section>

        {/* Share code */}
        <Section title="Your Share Code">
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
            <span className="text-2xl font-mono font-bold tracking-widest text-indigo-900 flex-1">
              {shareCode || '——————'}
            </span>
            <button onClick={copyCode} className="p-2 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-50">
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-indigo-500" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Share this with friends to let them add you</p>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          {pushSupported ? (
            <button
              onClick={togglePush}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl border p-4 transition-all',
                pushEnabled ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'
              )}
            >
              {pushEnabled
                ? <Bell size={20} className="text-indigo-600" />
                : <BellOff size={20} className="text-gray-400" />
              }
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">
                  Push notifications {pushEnabled ? 'ON' : 'OFF'}
                </p>
                <p className="text-xs text-gray-500">
                  {pushEnabled ? 'Tap to disable' : 'Tap to enable class change alerts'}
                </p>
              </div>
              <span className={cn(
                'ml-auto w-10 h-6 rounded-full transition-colors relative',
                pushEnabled ? 'bg-indigo-500' : 'bg-gray-300'
              )}>
                <span className={cn(
                  'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  pushEnabled ? 'translate-x-5' : 'translate-x-1'
                )} />
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
              <Info size={16} />
              <p>Push notifications require installing this app to your home screen (iOS) or are available in Chrome/Edge on Android.</p>
            </div>
          )}
        </Section>

        {/* Calendar */}
        <Section title="Calendar Export">
          <div className="space-y-2">
            <Button
              onClick={addToCalendar}
              variant="outline"
              className="w-full justify-start gap-3 h-12"
            >
              <Calendar size={18} className="text-indigo-500" />
              <div className="text-left">
                <p className="text-sm font-medium">Add to Phone Calendar</p>
                <p className="text-xs text-gray-400">Opens iPhone / Android calendar app</p>
              </div>
              <ExternalLink size={14} className="ml-auto text-gray-300" />
            </Button>
            <Button
              onClick={downloadICS}
              variant="outline"
              className="w-full justify-start gap-3 h-12"
            >
              <Download size={18} className="text-gray-500" />
              <div className="text-left">
                <p className="text-sm font-medium">Download .ics file</p>
                <p className="text-xs text-gray-400">For Google Calendar, Outlook, etc.</p>
              </div>
            </Button>
          </div>
        </Section>

        {/* View original sheet */}
        <Section title="Source Schedule">
          <Button
            onClick={openSheet}
            variant="outline"
            className="w-full justify-start gap-3 h-12"
          >
            <Sheet size={18} className="text-green-600" />
            <div className="text-left">
              <p className="text-sm font-medium">View Original Google Sheet</p>
              <p className="text-xs text-gray-400">Opens in browser — requires college Google login</p>
            </div>
            <ExternalLink size={14} className="ml-auto text-gray-300" />
          </Button>
          <p className="text-xs text-gray-400 mt-2">
            The app syncs this sheet every 15 minutes automatically.
          </p>
        </Section>

        {/* App info */}
        <Section title="About">
          <div className="text-xs text-gray-400 space-y-1 bg-gray-50 rounded-xl p-3">
            <p><span className="font-medium text-gray-600">Schedule syncs</span>: every 15 minutes</p>
            <p><span className="font-medium text-gray-600">Your data</span>: stored on device + cloud, no sign-in needed</p>
            <p className="font-mono text-[10px] text-gray-300 pt-1">
              User ID: {userId?.slice(0, 8)}…
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</h2>
      {children}
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)))
}
