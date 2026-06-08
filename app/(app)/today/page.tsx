'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { User, AlertTriangle, DoorOpen, GraduationCap, CalendarDays, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import type { Course } from '@/lib/types'

const STRIP_DAYS = 21
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

export default function TodayPage() {
  const { userId } = useSession()
  const [mySessions, setMySessions] = useState<Course[]>([])
  const [commonEvents, setCommonEvents] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const todayISO = localISO(new Date())
  const [selectedDate, setSelectedDate] = useState(todayISO)

  useEffect(() => {
    if (!userId) return
    Promise.all([
      fetch(`/api/courses/user?userId=${userId}`).then((r) => r.json()),
      fetch(`/api/courses?common=1`).then((r) => r.json()),
    ])
      .then(([userRows, common]: [{ courses: Course }[], Course[]]) => {
        setMySessions((userRows ?? []).map((d) => d.courses).filter(Boolean))
        setCommonEvents(Array.isArray(common) ? common : [])
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

  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => localISO(addDays(new Date(), i)))
  const selDate = parseISO(selectedDate)

  function openDatePicker() {
    const el = dateInputRef.current
    if (el?.showPicker) el.showPicker()
    else el?.focus()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground mb-1">
              {selectedDate === todayISO ? 'Today' : format(selDate, 'EEEE')}
            </h1>
            <p className="text-sm text-muted-foreground">{format(selDate, 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="relative">
            <button
              onClick={openDatePicker}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1.5 rounded-lg"
            >
              <CalendarDays size={14} /> Pick date
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
            />
          </div>
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto pb-1 no-scrollbar">
          {strip.map((iso) => {
            const d = parseISO(iso)
            const isToday = iso === todayISO
            const isActive = iso === selectedDate
            const count = countByDate[iso] ?? 0
            return (
              <button
                key={iso}
                onClick={() => setSelectedDate(iso)}
                className={cn(
                  'flex flex-col items-center px-3 py-2 rounded-xl transition-all shrink-0 min-w-[52px]',
                  isActive ? 'bg-indigo-600 text-white'
                    : isToday ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <span className="text-[10px] font-medium">{format(d, 'EEE').toUpperCase()}</span>
                <span className="text-base font-bold leading-tight">{format(d, 'd')}</span>
                <span className={cn('w-1.5 h-1.5 rounded-full mt-0.5', count > 0 ? (isActive ? 'bg-white/60' : 'bg-indigo-400') : 'bg-transparent')} />
              </button>
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
            {allForDate.map((course) => <ClassCard key={course.id} course={course} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function ClassCard({ course }: { course: Course }) {
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
    </div>
  )
}
