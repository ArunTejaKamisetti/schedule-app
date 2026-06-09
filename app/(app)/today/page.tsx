'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { User, AlertTriangle, DoorOpen, GraduationCap, CalendarCheck, Clock, Check, X, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import type { Course } from '@/lib/types'

// Full term window — every day is selectable on the scroll rail.
const TERM_START = '2026-06-08'
const TERM_END = '2026-08-31'
const CHANGE_WINDOW_MS = 10 * 24 * 60 * 60 * 1000 // highlight changes for 10 days

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
  const { userId } = useSession()
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
          {selectedDate !== todayISO && TERM_DATES.includes(todayISO) && (
            <button
              onClick={jumpToday}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1.5 rounded-lg"
            >
              <CalendarCheck size={14} /> Today
            </button>
          )}
        </div>

        {/* Full-term scroll rail — every day Jun 8 → Aug 31 is selectable */}
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
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
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
              aria-label="Present"
              className={cn('flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-all',
                status === 'present' ? 'bg-green-500 text-white shadow-sm scale-105' : 'text-green-700 dark:text-green-400')}>
              <Check size={14} strokeWidth={3} /> P
            </button>
            <button
              onClick={() => onMark(course.id, status === 'absent' ? null : 'absent')}
              aria-label="Absent"
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
