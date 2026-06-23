'use client'

import { useEffect, useState } from 'react'
import { useSession } from './session-provider'
import { useUserSessions, useCommonEvents } from '@/lib/hooks'
import { reminderText, toMinutes } from '@/lib/reminders'

// Per-user class reminders WITHOUT any server cron: while the app is open, the browser
// schedules a local notification ~14 min before each of today's classes. Opt-out is a simple
// device-local toggle (Settings). Limitation by design: only fires while the app is open in
// the background (no server = no delivery when fully closed).
export const REMINDERS_OFF_KEY = 'class_reminders_off'
const LEAD_MIN = 14
const HORIZON_MS = 18 * 60 * 60 * 1000 // only arm timers for classes within ~18h

function istNowParts() {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const todayISO = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes()
  return { todayISO, nowMin }
}

function safeParse(s: string | null): string[] {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

export function ClassReminders() {
  const { userId, user } = useSession()

  // Whether reminders are on for this device (notifications granted + not opted out). Computed once
  // on the client; gates the data hooks below so non-notification users add ZERO fetches.
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setEnabled(
      'Notification' in window &&
      Notification.permission === 'granted' &&
      localStorage.getItem(REMINDERS_OFF_KEY) !== '1'
    )
  }, [])

  // Pull today's classes from the SHARED SWR cache. When Today (or any course page) is open these
  // keys are already loaded, so this adds no extra request — and crucially it no longer re-fetches
  // on every window focus/visibilitychange, which was the main driver of redundant API calls.
  const year = user?.year === 1 ? 1 : 2
  const { courses: mine } = useUserSessions(enabled ? userId : null)
  const { events: common } = useCommonEvents(enabled ? year : null)

  useEffect(() => {
    if (!enabled || !userId || typeof window === 'undefined') return

    let timers: ReturnType<typeof setTimeout>[] = []
    let active = true

    async function schedule() {
      timers.forEach(clearTimeout)
      timers = []
      const { todayISO, nowMin } = istNowParts()
      const todays = [...mine, ...common].filter((c) => c.session_date === todayISO)

      const firedKey = `reminded_${todayISO}`
      const fired = new Set<string>(safeParse(localStorage.getItem(firedKey)))
      const reg = await navigator.serviceWorker?.ready.catch(() => null)
      if (!active) return

      for (const c of todays) {
        if (c.is_cancelled || !c.start_time) continue
        const occ = `${c.start_time}::${c.course_code}`
        if (fired.has(occ)) continue
        const delayMin = toMinutes(c.start_time) - LEAD_MIN - nowMin
        if (delayMin <= 0) continue                 // the 14-min mark already passed today
        const delayMs = delayMin * 60000
        if (delayMs > HORIZON_MS) continue          // too far out; re-armed on a later refresh
        const t = setTimeout(() => {
          const { title, body } = reminderText(c, LEAD_MIN)
          try {
            if (reg) reg.showNotification(title, { body, icon: '/icon-192', tag: occ, data: { url: '/today' } })
            else new Notification(title, { body, icon: '/icon-192' })
          } catch { /* ignore */ }
          fired.add(occ)
          localStorage.setItem(firedKey, JSON.stringify([...fired]))
        }, delayMs)
        timers.push(t)
      }
    }

    schedule()
    // Re-arm on focus (new day, etc.) from the already-loaded data — no network call here anymore.
    const onFocus = () => { if (active) schedule() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      active = false
      timers.forEach(clearTimeout)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [enabled, userId, mine, common])

  return null
}
