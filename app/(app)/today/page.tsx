'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { User, AlertTriangle, DoorOpen, GraduationCap, CalendarCheck, Clock, Check, X, StickyNote, BookOpen, UtensilsCrossed, Bus, ArrowRight, DownloadCloud, Bell, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { setSessionId, setSessionCode } from '@/lib/session'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { InstallPrompt } from '@/components/install-prompt'
import { AlertsPanel } from '@/components/alerts-panel'
import { toast } from 'sonner'
import type { Course } from '@/lib/types'
import { MESS, MESS_NOTE, type Meal } from '@/lib/mess'
import { BUS, BUS_NOTE, BUS_STOPS } from '@/lib/bus'

const WD_CODE = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
type HomeTab = 'courses' | 'mess' | 'bus'

// Full term window — every day is selectable on the scroll rail.
const TERM_START = '2026-06-08'
const TERM_END = '2026-08-31'
const CHANGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // highlight a change for 3 days after the edit

const CHANGE_LABEL: Record<string, string> = {
  added: 'New', moved: 'Moved', updated: 'Updated',
  rescheduled: 'Rescheduled', room_change: 'Class changed', cancelled: 'Cancelled',
}

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function recentlyChanged(c: Course): boolean {
  if (!c.last_changed_at || !c.change_kind) return false
  return Date.now() - new Date(c.last_changed_at).getTime() < CHANGE_WINDOW_MS
}

// All ISO dates across the term, in order.
const TERM_DATES: string[] = (() => {
  const out: string[] = []
  let d = parseISO(TERM_START)
  const end = parseISO(TERM_END)
  while (d <= end) { out.push(localISO(d)); d = addDays(d, 1) }
  return out
})()

export default function TodayPage() {
  const { userId, unreadCount } = useSession()
  const [mySessions, setMySessions] = useState<Course[]>([])
  const [commonEvents, setCommonEvents] = useState<Course[]>([])
  const [attendance, setAttendance] = useState<Record<string, string>>({})
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const railRef = useRef<HTMLDivElement>(null)

  async function markAttendance(courseId: string, status: 'present' | 'absent' | null) {
    setAttendance((prev) => {
      const next = { ...prev }
      if (status === null) delete next[courseId]
      else next[courseId] = status
      return next
    })
    await fetch('/api/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, courseId, status }),
    }).catch(() => {})
  }

  const todayISO = localISO(new Date())
  const initialDate = TERM_DATES.includes(todayISO) ? todayISO : TERM_DATES[0]
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [tab, setTab] = useState<HomeTab>('courses')
  const [importOpen, setImportOpen] = useState(false)
  const [importCode, setImportCode] = useState('')
  const [importing, setImporting] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)

  // Push notifications deep-link here with ?alerts=1 → open the panel.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('alerts')) {
      setAlertsOpen(true)
      window.history.replaceState({}, '', '/today')
    }
  }, [])

  async function importProfile() {
    const code = importCode.trim().toUpperCase()
    if (!code) return
    setImporting(true)
    try {
      const res = await fetch(`/api/user/resolve?code=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Invalid code'); return }
      setSessionId(data.userId)
      setSessionCode(data.shareCode)
      toast.success('Profile imported — reloading…')
      setTimeout(() => window.location.reload(), 600)
    } catch {
      toast.error('Could not import. Try again.')
    } finally {
      setImporting(false)
    }
  }

  function scrollToDate(iso: string, smooth: boolean) {
    railRef.current?.querySelector(`[data-iso="${iso}"]`)?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto', block: 'nearest', inline: 'center',
    })
  }
  // Center the selected day on first paint.
  useEffect(() => { scrollToDate(initialDate, false) }, [initialDate])

  function jumpToday() { setSelectedDate(initialDate); scrollToDate(initialDate, true) }

  useEffect(() => {
    if (!userId) return
    Promise.all([
      fetch(`/api/courses/user?userId=${userId}`).then((r) => r.json()),
      fetch(`/api/courses?common=1`).then((r) => r.json()),
      fetch(`/api/attendance?userId=${userId}`).then((r) => r.json()),
      fetch(`/api/notes?userId=${userId}`).then((r) => r.json()),
    ])
      .then(([userRows, common, att, notes]: [{ courses: Course }[], Course[], { course_id: string; status: string }[], { course_id: string; body: string }[]]) => {
        setMySessions((userRows ?? []).map((d) => d.courses).filter(Boolean))
        setCommonEvents(Array.isArray(common) ? common : [])
        const map: Record<string, string> = {}
        for (const a of att ?? []) map[a.course_id] = a.status
        setAttendance(map)
        setNoteMap(Object.fromEntries((notes ?? []).map((n) => [n.course_id, n.body])))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId])

  const allForDate = useMemo(() => {
    const merged = [...mySessions, ...commonEvents].filter((c) => c.session_date === selectedDate)
    const byId = new Map(merged.map((c) => [c.id, c]))
    return [...byId.values()].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  }, [mySessions, commonEvents, selectedDate])

  const countByDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of [...mySessions, ...commonEvents]) {
      if (c.session_date) map[c.session_date] = (map[c.session_date] ?? 0) + 1
    }
    return map
  }, [mySessions, commonEvents])

  const changedDates = useMemo(() => {
    const s = new Set<string>()
    for (const c of [...mySessions, ...commonEvents]) {
      if (c.session_date && recentlyChanged(c)) s.add(c.session_date)
    }
    return s
  }, [mySessions, commonEvents])

  const selDate = parseISO(selectedDate)

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground mb-1">
              {selectedDate === todayISO ? 'Today' : format(selDate, 'EEEE')}
            </h1>
            <p className="text-sm text-muted-foreground">{format(selDate, 'MMMM d, yyyy')}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={() => setImportOpen((s) => !s)} title="Import your profile from another device"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <DownloadCloud size={15} /> Import Profile
            </button>
            {selectedDate !== todayISO && TERM_DATES.includes(todayISO) && (
              <button onClick={jumpToday} title="Jump back to today"
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1.5 rounded-lg">
                <CalendarCheck size={14} /> Today
              </button>
            )}
            <button onClick={() => setAlertsOpen(true)} title="Schedule change alerts" className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {importOpen && (
          <div className="mt-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 p-3">
            <p className="text-xs text-muted-foreground mb-2">Enter your <b className="text-foreground">profile code</b> (Settings → Profile Code on your other device) to load your courses, attendance & notes here.</p>
            <div className="flex gap-2">
              <Input value={importCode} onChange={(e) => setImportCode(e.target.value.toUpperCase())} placeholder="e.g. ZRKBWEE8" maxLength={8} className="font-mono tracking-wider text-sm" onKeyDown={(e) => e.key === 'Enter' && importProfile()} />
              <Button onClick={importProfile} disabled={!importCode.trim() || importing} size="sm">Import</Button>
            </div>
          </div>
        )}

        {/* Tabs: Courses · Mess · Bus */}
        <div className="mt-3 flex gap-1 bg-muted rounded-xl p-0.5">
          {([['courses', 'Courses', BookOpen, 'Your classes for the selected day'], ['mess', 'Mess', UtensilsCrossed, 'Mess menu for this weekday'], ['bus', 'Bus', Bus, 'Campus bus timings (same every day)']] as const).map(([id, label, Icon, tip]) => (
            <button key={id} onClick={() => setTab(id)} title={tip}
              className={cn('flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                tab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* Date rail — drives Courses (classes) and Mess (weekday). Bus is the same daily. */}
        {tab !== 'bus' && (
        <div ref={railRef} className="mt-3 flex gap-1 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
          {TERM_DATES.map((iso, i) => {
            const d = parseISO(iso)
            const isToday = iso === todayISO
            const isActive = iso === selectedDate
            const count = countByDate[iso] ?? 0
            const hasChange = changedDates.has(iso)
            const newMonth = i === 0 || parseISO(TERM_DATES[i - 1]).getMonth() !== d.getMonth()
            return (
              <div key={iso} className="flex items-stretch shrink-0">
                {newMonth && (
                  <div className="flex items-center px-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase [writing-mode:vertical-rl] rotate-180 tracking-wider">
                      {format(d, 'MMM')}
                    </span>
                  </div>
                )}
                <button
                  data-iso={iso}
                  onClick={() => setSelectedDate(iso)}
                  className={cn(
                    'flex flex-col items-center px-2.5 py-2 rounded-xl transition-colors min-w-[48px]',
                    isActive ? 'bg-indigo-600 text-white'
                      : isToday ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  <span className="text-[10px] font-medium">{format(d, 'EEE').toUpperCase()}</span>
                  <span className="text-base font-bold leading-tight">{format(d, 'd')}</span>
                  <span className={cn('w-1.5 h-1.5 rounded-full mt-0.5',
                    hasChange ? (isActive ? 'bg-amber-300' : 'bg-amber-500 ring-2 ring-amber-200 dark:ring-amber-900')
                      : count > 0 ? (isActive ? 'bg-white/70' : 'bg-indigo-400')
                      : 'bg-transparent')} />
                </button>
              </div>
            )
          })}
        </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <InstallPrompt />
        <Disclaimer />
        {tab === 'mess' ? (
          <MessView weekday={WD_CODE[selDate.getDay()]} dateLabel={format(selDate, 'EEEE')} />
        ) : tab === 'bus' ? (
          <BusView />
        ) : loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        ) : mySessions.length === 0 ? (
          <>
            <Onboarding onImport={() => { setImportOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
            {allForDate.length > 0 && (
              <div className="space-y-2.5 mt-3">
                {allForDate.map((course) => (
                  <ClassCard key={course.id} course={course} status={attendance[course.id]} note={noteMap[course.id]} onMark={markAttendance} />
                ))}
              </div>
            )}
          </>
        ) : allForDate.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <span className="text-4xl">🎉</span>
            <p className="mt-3 text-sm font-medium">No classes on {format(selDate, 'MMM d')}</p>
            <p className="text-xs mt-1 opacity-70">Enjoy the free day</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {allForDate.map((course) => (
              <ClassCard key={course.id} course={course} status={attendance[course.id]} note={noteMap[course.id]} onMark={markAttendance} />
            ))}
          </div>
        )}
      </div>

      <AlertsPanel open={alertsOpen} onOpenChange={setAlertsOpen} />
    </div>
  )
}

function ClassCard({ course, status, note, onMark }: {
  course: Course
  status?: string
  note?: string
  onMark: (courseId: string, status: 'present' | 'absent' | null) => void
}) {
  const cancelled = course.is_cancelled
  const common = course.is_common
  const changed = recentlyChanged(course)
  return (
    <div className={cn(
      'rounded-xl border p-3.5 shadow-sm',
      cancelled ? 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900'
        : common ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900'
        : 'bg-card border-border',
      changed && !cancelled && 'ring-1 ring-indigo-300 dark:ring-indigo-700'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {common ? (
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <GraduationCap size={14} /> {course.course_name}
              </span>
            ) : (
              <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">{course.course_code}</span>
            )}
            {cancelled && (
              <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle size={8} /> CANCELLED
              </span>
            )}
            {changed && !cancelled && (
              <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900 px-1.5 py-0.5 rounded">
                {CHANGE_LABEL[course.change_kind ?? ''] ?? 'Changed'}
              </span>
            )}
          </div>
          {!common && (
            <p className={cn('text-sm font-semibold mt-0.5 text-foreground', cancelled && 'line-through text-red-500')}>
              {course.course_name}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('text-sm font-bold', cancelled ? 'text-red-500 line-through' : 'text-foreground')}>{course.start_time}</p>
          {course.end_time && <p className="text-[11px] text-muted-foreground">{course.end_time}</p>}
        </div>
      </div>

      {!common && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock size={11} /> {course.start_time}–{course.end_time}</span>
          {course.room && <span className="flex items-center gap-1"><DoorOpen size={11} /> Class {course.room}</span>}
          {course.instructor && <span className="flex items-center gap-1"><User size={11} /> {course.instructor}</span>}
        </div>
      )}
      {changed && course.change_note && (
        <p className="mt-1.5 text-[11px] text-indigo-700 dark:text-indigo-300">↻ {course.change_note}</p>
      )}

      {/* Reminder note */}
      {!common && note && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2 py-1.5">
          <StickyNote size={12} className="mt-px shrink-0" /> <span>{note}</span>
        </div>
      )}

      {/* Attendance — cool segmented toggle */}
      {!common && !cancelled && (
        <div className="mt-2.5 flex items-center gap-2.5 border-t border-border pt-2.5">
          <span className="text-[11px] font-medium text-muted-foreground mr-auto">
            {status === 'present' ? '✓ Marked present' : status === 'absent' ? '✗ Marked absent' : 'Mark attendance'}
          </span>
          <div className="flex items-center rounded-full bg-muted p-0.5">
            <button
              onClick={() => onMark(course.id, status === 'present' ? null : 'present')}
              aria-label="Present" title="Mark present (tap again to clear)"
              className={cn('flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-all',
                status === 'present' ? 'bg-green-500 text-white shadow-sm scale-105' : 'text-green-700 dark:text-green-400')}>
              <Check size={14} strokeWidth={3} /> P
            </button>
            <button
              onClick={() => onMark(course.id, status === 'absent' ? null : 'absent')}
              aria-label="Absent" title="Mark absent (tap again to clear)"
              className={cn('flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-all',
                status === 'absent' ? 'bg-red-500 text-white shadow-sm scale-105' : 'text-red-600 dark:text-red-400')}>
              <X size={14} strokeWidth={3} /> A
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// A gentle, positive heads-up that the app mirrors the official sheet but shouldn't be the
// only source of truth. Tap the "i" to expand.
function Disclaimer() {
  const [open, setOpen] = useState(false)
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="w-full flex items-start gap-2 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2 mb-3 text-left"
      title="About KampusSchedule"
    >
      <Info size={14} className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
      <p className="text-[11px] leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground">Disclaimer: </span>
        <span className="font-semibold text-foreground">KampusSchedule keeps your day in sync</span> with the official sheet automatically 💜
        {open ? (
          <span> It&apos;s built to make student life easier, but it can occasionally be out of date — so for anything important, do cross-check the official schedule too. Thanks for using it!</span>
        ) : (
          <span className="text-indigo-600 dark:text-indigo-400"> — tap to learn more.</span>
        )}
      </p>
    </button>
  )
}

// ─── New-user onboarding (cool branded landing) ───────────────────────────────
function Onboarding({ onImport }: { onImport: () => void }) {
  const features = [
    { icon: GraduationCap, label: 'Classes' },
    { icon: Check, label: 'Attendance' },
    { icon: UtensilsCrossed, label: 'Mess' },
    { icon: Bus, label: 'Bus' },
  ]
  return (
    <div className="rounded-3xl overflow-hidden border border-indigo-200 dark:border-indigo-800 shadow-sm">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 pt-7 pb-6 text-center text-white">
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
        <div className="relative inline-flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/30">
          <span className="text-lg font-extrabold leading-none">IIMK</span>
          <span className="text-[9px] font-bold tracking-[0.2em] text-amber-200 leading-none mt-0.5">— S —</span>
        </div>
        <h2 className="relative mt-3 text-xl font-extrabold">Welcome to KampusSchedule</h2>
        <p className="relative mt-1 text-sm text-white/85">Your IIM-K campus, organised — schedule, attendance, mess, bus &amp; friends.</p>
      </div>
      {/* Body */}
      <div className="bg-card px-5 py-4">
        <div className="grid grid-cols-4 gap-2 mb-4">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-muted/60 py-2.5">
              <Icon size={18} className="text-indigo-600 dark:text-indigo-400" />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        <ol className="text-left text-xs text-muted-foreground space-y-1.5 mb-4">
          <li><b className="text-foreground">1.</b> Open <b className="text-foreground">Courses</b> → pick your electives.</li>
          <li><b className="text-foreground">2.</b> Your day appears here on <b className="text-foreground">Home</b> — mark attendance, add reminders.</li>
          <li><b className="text-foreground">3.</b> Already set up elsewhere? Tap <b className="text-foreground">Import</b> (top-right) with your profile code.</li>
        </ol>
        <div className="flex items-center gap-2">
          <a href="/courses" className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-3 rounded-xl">
            <BookOpen size={16} /> Add your courses
          </a>
          <span className="text-muted-foreground text-sm font-bold">/</span>
          <button onClick={onImport} className="flex-1 flex items-center justify-center gap-1.5 border-2 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 text-sm font-bold px-4 py-2.5 rounded-xl">
            <DownloadCloud size={16} /> Import Profile
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mess menu (day-wise) ─────────────────────────────────────────────────────
function MessView({ weekday, dateLabel }: { weekday: string; dateLabel: string }) {
  const menu = MESS[weekday]
  if (!menu) return <p className="text-sm text-muted-foreground text-center py-10">No menu.</p>
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Mess menu · <b className="text-foreground">{dateLabel}</b></p>
      <MealCard title="Breakfast" emoji="🍳" meal={menu.breakfast} />
      <MealCard title="Lunch" emoji="🍛" meal={menu.lunch} />
      <MealCard title="Dinner" emoji="🍽️" meal={menu.dinner} />
      <p className="text-[11px] text-muted-foreground text-center pt-1">{MESS_NOTE}</p>
    </div>
  )
}

function MealCard({ title, emoji, meal }: { title: string; emoji: string; meal: Meal }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-bold text-foreground mb-2">{emoji} {title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {meal.veg.map((v) => (
          <span key={v} className="text-xs text-foreground bg-muted px-2 py-1 rounded-lg">{v}</span>
        ))}
      </div>
      {meal.special && meal.special.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {meal.special.map((v) => (
            <span key={v} className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 px-2 py-1 rounded-lg">{v}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bus schedule ─────────────────────────────────────────────────────────────
function BusView() {
  const [from, setFrom] = useState('All')
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const nowMin = ist.getUTCHours() * 60 + ist.getUTCMinutes()

  const trips = from === 'All' ? BUS : BUS.filter((t) => t.from === from)
  const nextIdx = trips.findIndex((t) => t.min >= nowMin)

  // Jump straight to the next bus when the tab opens (or the filter changes).
  const nextRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    nextRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' })
  }, [from, nextIdx])

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {['All', ...BUS_STOPS].map((s) => (
          <button key={s} onClick={() => setFrom(s)}
            className={cn('shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors',
              from === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-border text-muted-foreground bg-card')}>
            {s === 'All' ? 'All buses' : s}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {trips.map((t, i) => {
          const isNext = i === nextIdx
          return (
            <div key={`${t.time}-${i}`} ref={isNext ? nextRef : undefined} className={cn('flex items-center gap-3 rounded-xl border p-3 scroll-mt-4',
              isNext ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-300 dark:ring-indigo-700' : 'border-border bg-card')}>
              <div className="shrink-0 w-16 text-center">
                <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{t.time.replace(' ', '')}</p>
                {isNext && <span className="text-[9px] font-bold text-white bg-indigo-600 px-1.5 py-0.5 rounded-full">NEXT</span>}
              </div>
              <div className="w-px self-stretch bg-border" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap text-xs">
                  <span className="font-semibold text-foreground">{t.from}</span>
                  {t.to.map((s, j) => (
                    <span key={j} className="flex items-center gap-1 text-muted-foreground">
                      <ArrowRight size={10} /> {s}
                    </span>
                  ))}
                </div>
              </div>
              {t.maingate && <span className="shrink-0 text-[9px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950 px-1.5 py-0.5 rounded">→ MAIN GATE</span>}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground text-center pt-1">{BUS_NOTE}</p>
    </div>
  )
}
