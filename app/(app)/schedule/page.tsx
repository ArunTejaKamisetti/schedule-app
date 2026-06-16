'use client'

import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { CalendarRange, Sheet as SheetIcon, MapPin, User, AlertTriangle, GraduationCap, ChevronLeft, ChevronRight, Check, X, StickyNote, Clock } from 'lucide-react'
import { format, addDays, parseISO, startOfWeek } from 'date-fns'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Course } from '@/lib/types'

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID ?? '13-v2m0g3dr3UVo09i3qHLsMqZRyy_6zXf21AtDUtSOQ'

// Avoids threading attendance/notes/open through every nested grid component.
const DetailCtx = createContext<{
  att: Record<string, string>
  notes: Record<string, string>
  onOpen: (c: Course) => void
}>({ att: {}, notes: {}, onOpen: () => {} })

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Week runs Sunday → Saturday.
function weekStartISO(d: Date): string {
  return localISO(startOfWeek(d, { weekStartsOn: 0 }))
}
function timeMin(t: string | null): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

const CHANGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // highlight a change for 3 days after the edit
const CHANGE_LABEL: Record<string, string> = {
  added: 'New', moved: 'Moved', updated: 'Updated',
  rescheduled: 'Rescheduled', room_change: 'Class changed', cancelled: 'Cancelled',
}

// Canonical timetable slots from the sheet — always shown (even if empty that week)
// so the weekly grid is uniform like the Excel sheet.
const CANONICAL_SLOTS = ['09:15', '10:45', '12:15', '14:30', '16:00', '17:30', '19:00', '20:30']
const SLOT_END: Record<string, string> = {
  '09:15': '10:30', '10:45': '12:00', '12:15': '13:30', '14:30': '15:45',
  '16:00': '17:15', '17:30': '18:45', '19:00': '20:15', '20:30': '21:45', '22:00': '23:15',
}
function recentlyChanged(c: Course): boolean {
  if (!c.last_changed_at || !c.change_kind) return false
  return Date.now() - new Date(c.last_changed_at).getTime() < CHANGE_WINDOW_MS
}

export default function SchedulePage() {
  const { userId, user } = useSession()
  const todayISO = localISO(new Date())
  const [weekStart, setWeekStart] = useState(weekStartISO(new Date()))
  const [windowCourses, setWindowCourses] = useState<Course[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'week' | 'day'>('week')
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const [attMap, setAttMap] = useState<Record<string, string>>({})
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Course | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => localISO(addDays(parseISO(weekStart), i))),
    [weekStart]
  )

  useEffect(() => {
    if (!userId) return
    fetch(`/api/courses/user?userId=${userId}`)
      .then((r) => r.json())
      .then((data: { course_id: string }[]) => setSelectedIds(new Set(data.map((d) => d.course_id))))
      .catch(console.error)
    fetch(`/api/attendance?userId=${userId}`).then((r) => r.json())
      .then((a: { course_id: string; status: string }[]) => setAttMap(Object.fromEntries((a ?? []).map((x) => [x.course_id, x.status])))).catch(() => {})
    fetch(`/api/notes?userId=${userId}`).then((r) => r.json())
      .then((n: { course_id: string; body: string }[]) => setNoteMap(Object.fromEntries((n ?? []).map((x) => [x.course_id, x.body])))).catch(() => {})
  }, [userId])

  function openDetail(c: Course) { setSelected(c); setNoteDraft(noteMap[c.id] ?? '') }

  async function markAttendance(courseId: string, status: 'present' | 'absent' | null) {
    setAttMap((p) => { const n = { ...p }; if (status === null) delete n[courseId]; else n[courseId] = status; return n })
    await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, courseId, status }) }).catch(() => {})
  }

  async function saveNote(course: Course) {
    const body = noteDraft.trim()
    setNoteMap((p) => { const n = { ...p }; if (!body) delete n[course.id]; else n[course.id] = body; return n })
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, courseId: course.id, sessionDate: course.session_date, body }) }).catch(() => {})
    setSelected(null)
  }

  useEffect(() => {
    setLoading(true)
    const from = weekDates[0]
    const to = weekDates[6]
    fetch(`/api/courses?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((c: Course[]) => { setWindowCourses(c ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [weekDates])

  // Courses to display for the week: my picks + common events (exams) for MY year only — the
  // window fetch now returns both years' rows, so scope common events by the viewer's year.
  const myYear = user?.year === 1 ? 1 : 2
  const visible = useMemo(
    () => windowCourses.filter((c) => c.is_common ? (c.year ?? 2) === myYear : selectedIds.has(c.id)),
    [windowCourses, selectedIds, myYear]
  )

  const byDate = useMemo(() => {
    const map = new Map<string, Course[]>()
    for (const iso of weekDates) map.set(iso, [])
    for (const c of visible) if (c.session_date && map.has(c.session_date)) map.get(c.session_date)!.push(c)
    for (const [, list] of map) list.sort((a, b) => timeMin(a.start_time) - timeMin(b.start_time))
    return map
  }, [visible, weekDates])

  function openSheet() { window.open(`https://docs.google.com/spreadsheets/d/${SHEET_ID}`, '_blank') }
  function shiftWeek(delta: number) { setWeekStart(localISO(addDays(parseISO(weekStart), delta * 7))) }

  const monthLabel = `${format(parseISO(weekDates[0]), 'MMM d')} – ${format(parseISO(weekDates[6]), 'MMM d')}`

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarRange className="text-indigo-600 dark:text-indigo-400" size={22} />
            <h1 className="text-xl font-bold text-foreground">Schedule</h1>
          </div>
          <button
            onClick={openSheet} title="Open the official Google Sheet to cross-check"
            className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-2.5 py-1.5 rounded-lg"
          >
            <SheetIcon size={13} /> Sheet
          </button>
        </div>

        {/* Week navigation */}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} title="Previous week" className="p-1.5 rounded-lg bg-muted text-muted-foreground"><ChevronLeft size={16} /></button>
          <button onClick={() => setWeekStart(weekStartISO(new Date()))} title="Back to this week" className="text-sm font-semibold text-foreground flex-1 text-center">
            {monthLabel}
          </button>
          <button onClick={() => shiftWeek(1)} title="Next week" className="p-1.5 rounded-lg bg-muted text-muted-foreground"><ChevronRight size={16} /></button>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="inline-flex bg-muted rounded-lg p-0.5">
            {(['week', 'day'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={v === 'week' ? 'Week grid view' : 'Single-day list view'}
                className={cn('px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors',
                  view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
              >{v}</button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">My schedule + exams</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <DetailCtx.Provider value={{ att: attMap, notes: noteMap, onOpen: openDetail }}>
          {loading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : view === 'week' ? (
            <WeekGrid weekDates={weekDates} byDate={byDate} todayISO={todayISO} selectedIds={selectedIds} />
          ) : (
            <DayView weekDates={weekDates} byDate={byDate} todayISO={todayISO} selectedDate={selectedDate} setSelectedDate={setSelectedDate} selectedIds={selectedIds} />
          )}
        </DetailCtx.Provider>
      </div>

      {/* Detail dialog: info + attendance + reminder note */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <DialogContent>
            <DialogTitle>{selected.is_common ? selected.course_name : selected.course_code}</DialogTitle>
            {!selected.is_common && <p className="text-sm text-muted-foreground -mt-2">{selected.course_name}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock size={12} />{selected.session_date && format(parseISO(selected.session_date), 'EEE, d MMM')} · {selected.start_time}–{selected.end_time}</span>
              {selected.room && <span className="flex items-center gap-1"><MapPin size={12} />Class {selected.room}</span>}
              {selected.instructor && <span className="flex items-center gap-1"><User size={12} />{selected.instructor}</span>}
            </div>
            {selected.is_cancelled && <p className="text-xs font-bold text-red-600">This class is cancelled.</p>}

            {!selected.is_common && !selected.is_cancelled && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Attendance</p>
                <div className="flex gap-2">
                  <button onClick={() => markAttendance(selected.id, attMap[selected.id] === 'present' ? null : 'present')}
                    className={cn('flex-1 flex items-center justify-center gap-1 text-sm font-semibold py-2 rounded-lg border',
                      attMap[selected.id] === 'present' ? 'bg-green-500 border-green-500 text-white' : 'border-green-300 text-green-700 dark:text-green-400')}>
                    <Check size={14} /> Present
                  </button>
                  <button onClick={() => markAttendance(selected.id, attMap[selected.id] === 'absent' ? null : 'absent')}
                    className={cn('flex-1 flex items-center justify-center gap-1 text-sm font-semibold py-2 rounded-lg border',
                      attMap[selected.id] === 'absent' ? 'bg-red-500 border-red-500 text-white' : 'border-red-300 text-red-600 dark:text-red-400')}>
                    <X size={14} /> Absent
                  </button>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Reminder note <span className="font-normal">(you'll get a push at 8 PM the day before)</span></p>
              <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={3} maxLength={500}
                placeholder="e.g. Bring submission, quiz today…"
                className="w-full text-sm rounded-lg border border-border bg-muted/50 p-2 outline-none focus:ring-2 focus:ring-indigo-300" />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Cancel</Button>
                <Button size="sm" onClick={() => saveNote(selected)}>Save</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

function WeekGrid({ weekDates, byDate, todayISO, selectedIds }: {
  weekDates: string[]; byDate: Map<string, Course[]>; todayISO: string; selectedIds: Set<string>
}) {
  // Always show the canonical slots, plus any extra times that appear this week.
  const times = useMemo(() => {
    const set = new Set<string>(CANONICAL_SLOTS)
    for (const iso of weekDates) for (const c of byDate.get(iso) ?? []) if (c.start_time) set.add(c.start_time)
    return [...set].sort((a, b) => timeMin(a) - timeMin(b))
  }, [weekDates, byDate])

  const totalThisWeek = weekDates.reduce((n, iso) => n + (byDate.get(iso)?.length ?? 0), 0)
  if (totalThisWeek === 0) {
    return <div className="p-10 text-center text-sm text-muted-foreground">No classes this week.</div>
  }

  return (
    <div className="overflow-x-auto p-3">
      <div className="grid gap-1.5 min-w-max" style={{ gridTemplateColumns: `52px repeat(7, minmax(92px, 1fr))` }}>
        <div />
        {weekDates.map((iso) => {
          const d = parseISO(iso)
          const isToday = iso === todayISO
          return (
            <div key={iso} className={cn('text-center pb-1', isToday && 'text-indigo-600 dark:text-indigo-400')}>
              <div className="text-[10px] font-medium text-muted-foreground">{format(d, 'EEE').toUpperCase()}</div>
              <div className={cn('text-sm font-bold', isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-foreground')}>{format(d, 'd')}</div>
            </div>
          )
        })}

        {times.map((t) => (
          <Row key={t} time={t} weekDates={weekDates} byDate={byDate} selectedIds={selectedIds} />
        ))}
      </div>
    </div>
  )
}

function Row({ time, weekDates, byDate, selectedIds }: {
  time: string; weekDates: string[]; byDate: Map<string, Course[]>; selectedIds: Set<string>
}) {
  return (
    <>
      <div className="text-right pr-1 pt-1.5 leading-tight">
        <div className="text-[10px] font-mono font-semibold text-foreground">{time}</div>
        {SLOT_END[time] && <div className="text-[9px] font-mono text-muted-foreground">{SLOT_END[time]}</div>}
      </div>
      {weekDates.map((iso) => {
        const cells = (byDate.get(iso) ?? []).filter((c) => c.start_time === time)
        return (
          <div key={iso} className="min-h-[2.25rem] rounded-md bg-muted/30 p-0.5 space-y-1">
            {cells.map((c) => <Block key={c.id} course={c} mine={selectedIds.has(c.id)} />)}
          </div>
        )
      })}
    </>
  )
}

function Block({ course, mine }: { course: Course; mine: boolean }) {
  const { att, notes, onOpen } = useContext(DetailCtx)
  const cancelled = course.is_cancelled
  const common = course.is_common
  const changed = recentlyChanged(course)
  const status = att[course.id]
  const hasNote = !!notes[course.id]
  return (
    <button onClick={() => onOpen(course)} title="Details · attendance · reminder note" className={cn('relative w-full text-left rounded-md px-1.5 py-1 text-[10px] leading-tight border',
      cancelled ? 'bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-900'
        : status === 'present' ? 'bg-green-50 border-green-300 dark:bg-green-950/40 dark:border-green-800'
        : status === 'absent' ? 'bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-800'
        : common ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900'
        : mine ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-800'
        : 'bg-card border-border',
      changed && !cancelled && 'ring-1 ring-indigo-400 dark:ring-indigo-500')}>
      <span className="absolute top-0.5 right-0.5 flex gap-0.5">
        {hasNote && <StickyNote size={9} className="text-amber-500" />}
        {changed && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
      </span>
      <p className={cn('font-semibold truncate',
        cancelled ? 'text-red-600 line-through' : common ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>
        {common ? course.course_name : course.course_code}
      </p>
      {course.end_time && <p className="text-muted-foreground">{course.end_time}</p>}
      {course.room && <p className="text-muted-foreground truncate">Class {course.room}</p>}
    </button>
  )
}

function DayView({ weekDates, byDate, todayISO, selectedDate, setSelectedDate, selectedIds }: {
  weekDates: string[]; byDate: Map<string, Course[]>; todayISO: string
  selectedDate: string; setSelectedDate: (d: string) => void; selectedIds: Set<string>
}) {
  const day = weekDates.includes(selectedDate) ? selectedDate : weekDates[0]
  const list = byDate.get(day) ?? []

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 py-3 border-b border-border">
        {weekDates.map((iso) => {
          const d = parseISO(iso)
          const count = byDate.get(iso)?.length ?? 0
          const active = iso === day
          return (
            <button key={iso} onClick={() => setSelectedDate(iso)}
              className={cn('shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors min-w-[48px]',
                active ? 'bg-indigo-600 text-white' : iso === todayISO ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'bg-muted text-foreground')}>
              <span className="text-[10px]">{format(d, 'EEE').toUpperCase()}</span>
              <span>{format(d, 'd')}</span>
              {count > 0 && <span className={cn('w-1 h-1 rounded-full mt-0.5', active ? 'bg-white/70' : 'bg-indigo-400')} />}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h2 className="text-sm font-bold text-foreground mb-3">{format(parseISO(day), 'EEEE, MMMM d')}</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No classes.</p>
        ) : (
          <div className="space-y-2">{list.map((c) => <DayRow key={c.id} course={c} mine={selectedIds.has(c.id)} />)}</div>
        )}
      </div>
    </div>
  )
}

function DayRow({ course, mine }: { course: Course; mine: boolean }) {
  const { att, notes, onOpen } = useContext(DetailCtx)
  const cancelled = course.is_cancelled
  const common = course.is_common
  const changed = recentlyChanged(course)
  const status = att[course.id]
  const hasNote = !!notes[course.id]
  return (
    <button onClick={() => onOpen(course)} title="Tap for details, attendance & reminder note" className={cn('w-full text-left flex gap-3 items-center rounded-xl border p-3',
      cancelled ? 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900'
        : status === 'present' ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800'
        : status === 'absent' ? 'bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-800'
        : common ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900'
        : 'bg-card border-border',
      changed && !cancelled && 'ring-1 ring-indigo-300 dark:ring-indigo-700')}>
      <div className="shrink-0 text-center w-16">
        <p className={cn('text-xs font-bold', cancelled ? 'text-red-500 line-through' : 'text-indigo-600 dark:text-indigo-400')}>{course.start_time}</p>
        {course.end_time && <p className="text-[10px] text-muted-foreground">{course.end_time}</p>}
      </div>
      <div className={cn('w-px self-stretch', cancelled ? 'bg-red-200' : 'bg-border')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {common ? (
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1"><GraduationCap size={12} /> {course.course_name}</span>
          ) : (
            <>
              <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">{course.course_code}</span>
              {mine && <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1 rounded">MINE</span>}
            </>
          )}
          {status && <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded', status === 'present' ? 'text-green-700 bg-green-100 dark:bg-green-900 dark:text-green-300' : 'text-red-700 bg-red-100 dark:bg-red-900 dark:text-red-300')}>{status === 'present' ? 'PRESENT' : 'ABSENT'}</span>}
          {hasNote && <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded flex items-center gap-0.5"><StickyNote size={8} /> REM</span>}
          {cancelled && <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-900 px-1 py-0.5 rounded flex items-center gap-1"><AlertTriangle size={8} /> CANCELLED</span>}
          {changed && !cancelled && <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900 px-1 py-0.5 rounded">{CHANGE_LABEL[course.change_kind ?? ''] ?? 'Changed'}</span>}
        </div>
        {!common && <p className={cn('text-sm font-medium truncate', cancelled && 'line-through text-red-500')}>{course.course_name}</p>}
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
          {course.room && <span className="flex items-center gap-0.5"><MapPin size={9} />Class {course.room}</span>}
          {course.instructor && <span className="flex items-center gap-0.5"><User size={9} />{course.instructor}</span>}
        </div>
        {changed && course.change_note && <p className="mt-0.5 text-[11px] text-indigo-700 dark:text-indigo-300">↻ {course.change_note}</p>}
      </div>
    </button>
  )
}
