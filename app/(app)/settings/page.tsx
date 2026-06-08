'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Copy, Check, Bell, BellOff, Calendar, ExternalLink,
  Download, Sheet, Info, Link2, Sun, Moon, Monitor, Pencil, ChevronDown, Apple, CalendarCheck, Unplug,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useSession } from '@/components/session-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type PrefKey = 'notify_cancelled' | 'notify_rescheduled' | 'notify_room' | 'notify_daily_summary'
const PREF_LABELS: { key: PrefKey; label: string }[] = [
  { key: 'notify_cancelled', label: 'Class cancelled' },
  { key: 'notify_rescheduled', label: 'Class rescheduled (time change)' },
  { key: 'notify_room', label: 'Room changed' },
  { key: 'notify_daily_summary', label: 'Daily morning summary' },
]

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID ?? '13-v2m0g3dr3UVo09i3qHLsMqZRyy_6zXf21AtDUtSOQ'

export default function SettingsPage() {
  const { userId, shareCode, user } = useSession()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    notify_cancelled: true, notify_rescheduled: true, notify_room: true, notify_daily_summary: true,
  })
  const [showManual, setShowManual] = useState(false)
  const [gcalConnected, setGcalConnected] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!userId) return
    fetch(`/api/calendar/google/status?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => setGcalConnected(!!d.connected))
      .catch(() => {})

    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'connected') {
      toast.success('Google Calendar connected!')
      setGcalConnected(true)
      window.history.replaceState({}, '', '/settings')
    } else if (params.get('gcal') === 'error') {
      const reason = params.get('reason')
      toast.error(reason ? `Google Calendar: ${reason}` : 'Could not connect Google Calendar', { duration: 8000 })
      window.history.replaceState({}, '', '/settings')
    }
  }, [userId])

  useEffect(() => {
    if (user?.display_name) setDisplayName(user.display_name)
    if (user) {
      setPrefs({
        notify_cancelled: user.notify_cancelled ?? true,
        notify_rescheduled: user.notify_rescheduled ?? true,
        notify_room: user.notify_room ?? true,
        notify_daily_summary: user.notify_daily_summary ?? true,
      })
    }
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true)
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => setPushEnabled(!!sub))
      })
    }
  }, [user])


  const copy = useCallback((text: string, key: string, msg: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    toast.success(msg)
    setTimeout(() => setCopied(null), 2000)
  }, [])

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
      const sub = await reg.pushManager.getSubscription()
      await sub?.unsubscribe()
      await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subscription: null }),
      })
      setPushEnabled(false)
      toast.success('Notifications turned off')
    } else {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { toast.error('Notification permission denied'); return }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
      })
      await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subscription: sub.toJSON() }),
      })
      setPushEnabled(true)
      toast.success('Push notifications enabled!')
    }
  }

  async function togglePref(key: PrefKey) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    await fetch('/api/user/prefs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, prefs: { [key]: next[key] } }),
    }).catch(() => toast.error('Could not save preference'))
  }

  const origin = mounted ? window.location.origin : ''
  const host = mounted ? window.location.host : ''
  const webcalUrl = `webcal://${host}/api/calendar?userId=${userId}`
  const httpsFeedUrl = `${origin}/api/calendar?userId=${userId}`
  const recoveryLink = `${origin}/?t=${userId}`

  function subscribeCalendar() { window.location.href = webcalUrl }
  function addToGoogle() {
    // Reliable path: copy the feed URL and open Google Calendar's "add by URL" page.
    navigator.clipboard.writeText(httpsFeedUrl).catch(() => {})
    toast.success('Feed URL copied — paste it under "From URL"', { duration: 6000 })
    window.open('https://calendar.google.com/calendar/u/0/r/settings/addbyurl', '_blank')
  }
  function downloadICS() { window.open(`/api/calendar?userId=${userId}`, '_blank') }
  function connectGoogle() { window.location.href = `/api/calendar/google/connect?userId=${userId}` }
  async function disconnectGoogle() {
    await fetch('/api/calendar/google/disconnect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setGcalConnected(false)
    toast.success('Google Calendar disconnected')
  }
  function openSheet() { window.open(`https://docs.google.com/spreadsheets/d/${SHEET_ID}`, '_blank') }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Settings className="text-indigo-600 dark:text-indigo-400" size={22} />
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* Appearance */}
        <Section title="Appearance">
          <div className="inline-flex bg-muted rounded-xl p-1 w-full">
            {[
              { v: 'light', icon: Sun, label: 'Light' },
              { v: 'dark', icon: Moon, label: 'Dark' },
              { v: 'system', icon: Monitor, label: 'System' },
            ].map(({ v, icon: Icon, label }) => (
              <button
                key={v}
                onClick={() => setTheme(v)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors',
                  mounted && theme === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Display name */}
        <Section title="Your Name">
          <div className="flex gap-2">
            <Input
              placeholder="Enter your name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="text-sm"
            />
            <Button onClick={saveName} disabled={!displayName.trim() || savingName} size="sm" variant="outline">Save</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Shown to friends when you compare schedules</p>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          {pushSupported ? (
            <button
              onClick={togglePush}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl border p-4 transition-all',
                pushEnabled ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800' : 'bg-muted border-border'
              )}
            >
              {pushEnabled ? <Bell size={20} className="text-indigo-600 dark:text-indigo-400" /> : <BellOff size={20} className="text-muted-foreground" />}
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">Push notifications {pushEnabled ? 'ON' : 'OFF'}</p>
                <p className="text-xs text-muted-foreground">{pushEnabled ? 'Tap to disable' : 'Enable notifications on this device'}</p>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-xl p-4">
              <Info size={16} />
              <p>Install this app to your home screen (iOS) or use Chrome/Edge on Android to enable notifications.</p>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-border divide-y divide-border">
            {PREF_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                <Checkbox checked={prefs[key]} onCheckedChange={() => togglePref(key)} />
                <span className="text-sm text-foreground">{label}</span>
              </label>
            ))}
          </div>
        </Section>

        {/* Calendar — subscription feed (auto-updating) */}
        <Section title="Calendar (subscribe)">
          <p className="text-xs text-muted-foreground mb-2">
            Subscribe once and your calendar stays updated automatically.
            <br /><b className="text-foreground">iPhone:</b> tap “Subscribe”. <b className="text-foreground">Android:</b> easiest is “Connect Google Calendar” below — or “Add to Google Calendar” once on a <b className="text-foreground">computer</b> (the “From URL” option isn’t in the phone app).
          </p>
          <div className="space-y-2">
            <Button onClick={subscribeCalendar} className="w-full justify-start gap-3 h-12">
              <Apple size={18} />
              <div className="text-left"><p className="text-sm font-medium">Subscribe — iPhone / Apple Calendar</p>
                <p className="text-xs opacity-80">Opens Apple Calendar (iPhone/Mac only)</p></div>
              <ExternalLink size={14} className="ml-auto opacity-60" />
            </Button>
            <Button onClick={addToGoogle} variant="outline" className="w-full justify-start gap-3 h-12">
              <Calendar size={18} className="text-indigo-500" />
              <div className="text-left"><p className="text-sm font-medium">Add to Google Calendar (by URL)</p>
                <p className="text-xs text-muted-foreground">Copies the feed URL → paste under “From URL”</p></div>
            </Button>
            <Button onClick={downloadICS} variant="outline" className="w-full justify-start gap-3 h-12">
              <Download size={18} className="text-muted-foreground" />
              <div className="text-left"><p className="text-sm font-medium">Download .ics (snapshot)</p>
                <p className="text-xs text-muted-foreground">One-time, never updates</p></div>
            </Button>
          </div>

          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">Calendar feed URL</p>
            <CopyField value={httpsFeedUrl} copied={copied === 'feed'} onCopy={() => copy(httpsFeedUrl, 'feed', 'Feed URL copied')} />
            <button onClick={() => setShowManual((s) => !s)} className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              <ChevronDown size={13} className={cn('transition-transform', showManual && 'rotate-180')} />
              How to add by URL in Google Calendar
            </button>
            {showManual && (
              <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-5 space-y-1">
                <li>On a <b>computer</b>, open <b>calendar.google.com</b> (or phone browser → Desktop site).</li>
                <li><b>Other calendars</b> (＋) → <b>From URL</b> → paste the feed URL above → <b>Add calendar</b>.</li>
                <li>It then appears in Google Calendar on all your devices. Google refreshes it every few hours (not instant).</li>
              </ol>
            )}
          </div>
        </Section>

        {/* Google Calendar sync (API write — needs an Internal @iimk OAuth app) */}
        <Section title="Google Calendar sync (Android)">
          <p className="text-xs text-muted-foreground mb-2">
            <b className="text-foreground">Best on Android.</b> Sign in with your <b className="text-foreground">@iimk.ac.in</b> account to auto-sync your schedule straight into Google Calendar — updates within minutes, no manual refresh.
          </p>
          {gcalConnected ? (
            <div className="flex items-center gap-3 rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 p-4">
              <CalendarCheck size={20} className="text-green-600 dark:text-green-400" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Connected</p>
                <p className="text-xs text-muted-foreground">Your calendar updates automatically</p>
              </div>
              <Button onClick={disconnectGoogle} variant="outline" size="sm" className="gap-1">
                <Unplug size={14} /> Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={connectGoogle} className="w-full justify-center gap-2 h-12">
              <Calendar size={18} /> Connect Google Calendar
            </Button>
          )}
        </Section>

        {/* Your courses */}
        <Section title="Your courses">
          <Button onClick={() => (window.location.href = '/courses')} variant="outline" className="w-full justify-start gap-3 h-12">
            <Pencil size={16} className="text-indigo-500" />
            <p className="text-sm font-medium">Edit / re-pick courses</p>
            <ExternalLink size={14} className="ml-auto text-muted-foreground" />
          </Button>
        </Section>

        {/* Share code */}
        <Section title="Your Share Code">
          <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl px-4 py-3">
            <span className="text-2xl font-mono font-bold tracking-widest text-indigo-900 dark:text-indigo-100 flex-1">
              {shareCode || '——————'}
            </span>
            <button onClick={() => copy(shareCode, 'share', 'Code copied!')} className="p-2 rounded-lg bg-card border border-indigo-200 dark:border-indigo-800">
              {copied === 'share' ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-indigo-500" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Share with friends so they can add you</p>
        </Section>

        {/* Save your access */}
        <Section title="Save your access">
          <p className="text-xs text-muted-foreground mb-2">
            No login. Bookmark this link to restore your schedule on any device.
            <span className="text-amber-600 dark:text-amber-400"> Anyone with it can see your schedule — keep it private.</span>
          </p>
          <CopyField value={recoveryLink} copied={copied === 'recovery'} onCopy={() => copy(recoveryLink, 'recovery', 'Recovery link copied')} icon={<Link2 size={14} />} />
        </Section>

        {/* Source */}
        <Section title="Source Schedule">
          <Button onClick={openSheet} variant="outline" className="w-full justify-start gap-3 h-12">
            <Sheet size={18} className="text-green-600" />
            <div className="text-left">
              <p className="text-sm font-medium">View Original Google Sheet</p>
              <p className="text-xs text-muted-foreground">Requires college Google login</p>
            </div>
            <ExternalLink size={14} className="ml-auto text-muted-foreground" />
          </Button>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="text-xs text-muted-foreground space-y-1 bg-muted rounded-xl p-3">
            <p><span className="font-medium text-foreground">Schedule syncs</span>: on every sheet change + every 15 minutes</p>
            <p><span className="font-medium text-foreground">Your data</span>: stored on device + cloud, no sign-in needed</p>
            <p className="font-mono text-[10px] opacity-60 pt-1">User ID: {userId?.slice(0, 8)}…</p>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{title}</h2>
      {children}
    </div>
  )
}

function CopyField({ value, copied, onCopy, icon }: { value: string; copied: boolean; onCopy: () => void; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-2">
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      <span className="text-xs font-mono text-foreground truncate flex-1">{value}</span>
      <button onClick={onCopy} className="shrink-0 p-1.5 rounded-md bg-card border border-border">
        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-muted-foreground" />}
      </button>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)))
}
