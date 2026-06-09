'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, MapPin, CalendarDays } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import type { Course } from '@/lib/types'

function timeMin(t: string | null): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function CompareContent() {
  const { userId } = useSession()
  const params = useSearchParams()
  const friendId = params.get('friendId')
  const [mine, setMine] = useState<Course[]>([])
  const [theirs, setTheirs] = useState<Course[]>([])
  const [friendName, setFriendName] = useState('Friend')
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState('')

  useEffect(() => {
    if (!userId || !friendId) return
    Promise.all([
      fetch(`/api/courses/user?userId=${userId}`).then((r) => r.json()),
      fetch(`/api/courses/user?userId=${friendId}`).then((r) => r.json()),
      fetch(`/api/friends?userId=${userId}`).then((r) => r.json()),
    ]).then(([m, t, friends]: [{ courses: Course }[], { courses: Course }[], { friend_id: string; friend: { display_name: string } }[]]) => {
      setMine((m ?? []).map((d) => d.courses).filter(Boolean))
      setTheirs((t ?? []).map((d) => d.courses).filter(Boolean))
      const f = friends?.find((fr) => fr.friend_id === friendId)
      if (f?.friend?.display_name) setFriendName(f.friend.display_name)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [userId, friendId])

  const dates = useMemo(() => {
    const set = new Set<string>()
    for (const c of [...mine, ...theirs]) if (c.session_date) set.add(c.session_date)
    return [...set].sort()
  }, [mine, theirs])

  // Default to today if present, else the first date with data.
  useEffect(() => {
    if (selectedDate || dates.length === 0) return
    const today = format(new Date(), 'yyyy-MM-dd')
    setSelectedDate(dates.includes(today) ? today : dates[0])
  }, [dates, selectedDate])

  const myDay = useMemo(
    () => mine.filter((c) => c.session_date === selectedDate).sort((a, b) => timeMin(a.start_time) - timeMin(b.start_time)),
    [mine, selectedDate]
  )
  const theirDay = useMemo(
    () => theirs.filter((c) => c.session_date === selectedDate).sort((a, b) => timeMin(a.start_time) - timeMin(b.start_time)),
    [theirs, selectedDate]
  )
  // Shared time axis (union of both people's slots), so rows line up by time.
  const slots = useMemo(() => {
    const set = new Set<string>()
    for (const c of [...myDay, ...theirDay]) if (c.start_time) set.add(c.start_time)
    return [...set].sort((a, b) => timeMin(a) - timeMin(b))
  }, [myDay, theirDay])

  if (loading) {
    return <div className="px-4 py-6 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
  }

  if (dates.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground px-4">
        <p className="text-sm">No classes to compare yet</p>
        <p className="text-xs mt-1">Make sure both of you have picked courses</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Date strip */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 py-2.5 border-b border-border shrink-0">
        {dates.map((iso) => {
          const active = iso === selectedDate
          const d = parseISO(iso)
          return (
            <button key={iso} onClick={() => setSelectedDate(iso)}
              className={cn('shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors min-w-[46px]',
                active ? 'bg-indigo-600 text-white' : 'bg-muted text-foreground')}>
              <span className="text-[10px]">{format(d, 'EEE').toUpperCase()}</span>
              <span>{format(d, 'd MMM')}</span>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-3 text-[10px] text-muted-foreground py-1.5 border-b border-border shrink-0">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> Same class</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> Clash</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/40 inline-block" /> One only</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No classes on this day for either of you.</p>
        ) : (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: '46px 1fr 1fr' }}>
            <div />
            <div className="text-xs font-bold text-foreground text-center pb-1 truncate">You</div>
            <div className="text-xs font-bold text-foreground text-center pb-1 truncate">{friendName}</div>
            {slots.map((slot) => {
              const myC = myDay.find((c) => c.start_time === slot)
              const frC = theirDay.find((c) => c.start_time === slot)
              // A cancelled class isn't a real clash and can't be "same".
              const myActive = !!myC && !myC.is_cancelled
              const frActive = !!frC && !frC.is_cancelled
              const both = myActive && frActive
              const same = both && myC!.course_code === frC!.course_code
              const state: CellState = same ? 'same' : both ? 'clash' : 'one'
              return (
                <div key={slot} className="contents">
                  <div className="text-[10px] font-mono text-muted-foreground text-right pr-1 pt-2 leading-tight">{slot}</div>
                  <Cell course={myC} state={state} />
                  <Cell course={frC} state={state} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

type CellState = 'same' | 'clash' | 'one'

function Cell({ course, state }: { course?: Course; state: CellState }) {
  if (!course) return <div className="rounded-lg border border-dashed border-border min-h-[2.5rem] flex items-center justify-center text-[11px] text-muted-foreground">—</div>
  const cancelled = course.is_cancelled
  return (
    <div className={cn('rounded-lg border p-2 min-h-[2.5rem]',
      cancelled ? 'bg-muted/50 border-border opacity-70'
        : state === 'same' ? 'bg-green-50 border-green-300 dark:bg-green-950/40 dark:border-green-800'
        : state === 'clash' ? 'bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-800'
        : 'bg-card border-border')}>
      <p className={cn('text-xs font-semibold truncate',
        cancelled ? 'text-muted-foreground line-through'
          : state === 'same' ? 'text-green-700 dark:text-green-400' : state === 'clash' ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
        {course.course_code}
      </p>
      {cancelled ? (
        <p className="text-[10px] font-semibold text-red-500">CANCELLED</p>
      ) : (
        <p className="text-[11px] text-muted-foreground truncate">{course.course_name}</p>
      )}
      {!cancelled && course.room && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin size={8} />Class {course.room}</p>}
    </div>
  )
}

export default function ComparePage() {
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-3 shadow-sm">
        <Link href="/friends" className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 mb-2">
          <ArrowLeft size={16} /> Friends
        </Link>
        <div className="flex items-center gap-2">
          <CalendarDays className="text-indigo-600 dark:text-indigo-400" size={20} />
          <h1 className="text-xl font-bold text-foreground">Compare (by date)</h1>
        </div>
      </div>
      <Suspense fallback={<div className="px-4 py-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>}>
        <CompareContent />
      </Suspense>
    </div>
  )
}
