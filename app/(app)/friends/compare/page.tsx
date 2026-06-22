'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, MapPin, CalendarDays } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { useUserSessions, useCommonEvents, useFriends } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { CANONICAL_SLOTS, isBusyAt } from '@/lib/free-time'
import type { Course } from '@/lib/types'

function timeMin(t: string | null): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function CompareContent() {
  const { userId, user } = useSession()
  const params = useSearchParams()
  const friendId = params.get('friendId')
  const [selectedDate, setSelectedDate] = useState('')

  // Shared, deduped data — both schedules and the common events come straight from the SWR cache.
  const year = user?.year === 1 ? 1 : 2
  const { courses: mine, isLoading: loadingMine } = useUserSessions(userId)
  const { courses: theirs, isLoading: loadingTheirs } = useUserSessions(friendId)
  const { events: common } = useCommonEvents(userId ? year : null)
  const { friends } = useFriends(userId)

  const friendName =
    friends.find((fr) => fr.friend_id === friendId)?.friend?.display_name ?? 'Friend'
  const loading = !userId || !friendId || loadingMine || loadingTheirs

  // Include common events (mid/end-term exams) so the strip covers the whole term to 31 Aug —
  // both friends "share" those days. Enrolled classes alone stop in mid-August.
  const dates = useMemo(() => {
    const set = new Set<string>()
    for (const c of [...mine, ...theirs, ...common]) if (c.session_date) set.add(c.session_date)
    return [...set].sort()
  }, [mine, theirs, common])

  // Default to today if present, else the first date with data.
  useEffect(() => {
    if (selectedDate || dates.length === 0) return
    const today = format(new Date(), 'yyyy-MM-dd')
    setSelectedDate(dates.includes(today) ? today : dates[0])
  }, [dates, selectedDate])

  // Common events (exams) belong to both people's day.
  const myDay = useMemo(
    () => [...mine, ...common].filter((c) => c.session_date === selectedDate).sort((a, b) => timeMin(a.start_time) - timeMin(b.start_time)),
    [mine, common, selectedDate]
  )
  const theirDay = useMemo(
    () => [...theirs, ...common].filter((c) => c.session_date === selectedDate).sort((a, b) => timeMin(a.start_time) - timeMin(b.start_time)),
    [theirs, common, selectedDate]
  )
  // Shared time axis: the canonical periods (so EMPTY/free slots show too) plus any oddly-timed
  // sessions present that day (e.g. an all-day exam at 09:00), so nothing is hidden.
  const slots = useMemo(() => {
    const set = new Set<string>(CANONICAL_SLOTS)
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
      <div className="flex justify-center flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground py-1.5 border-b border-border shrink-0">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> Both free</span>
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
              // Busy = a class/exam actually overlaps this slot (so a multi-hour exam counts even
              // where it doesn't start). Cancelled classes don't count as busy.
              const myBusy = isBusyAt(myDay, slot)
              const frBusy = isBusyAt(theirDay, slot)
              const both = myBusy && frBusy
              const same = both && !!myC && !!frC && myC.course_code === frC.course_code
              const state: CellState = same ? 'same' : both ? 'clash' : (myBusy || frBusy) ? 'one' : 'free'
              return (
                <div key={slot} className="contents">
                  <div className={cn('text-[10px] font-mono text-right pr-1 pt-2 leading-tight',
                    state === 'free' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground')}>{slot}</div>
                  <Cell course={myC} busy={myBusy} state={state} />
                  <Cell course={frC} busy={frBusy} state={state} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

type CellState = 'same' | 'clash' | 'one' | 'free'

function Cell({ course, busy, state }: { course?: Course; busy?: boolean; state: CellState }) {
  if (!course) {
    // No class starts here. If a multi-slot event still covers it, mark "busy"; else it's free.
    if (busy) return <div className="rounded-lg border border-border bg-muted/40 min-h-[2.5rem] flex items-center justify-center text-[10px] text-muted-foreground">busy</div>
    return (
      <div className={cn('rounded-lg border min-h-[2.5rem] flex items-center justify-center text-[11px]',
        state === 'free'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400'
          : 'border-dashed border-border text-muted-foreground')}>
        {state === 'free' ? 'Free' : '—'}
      </div>
    )
  }
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
      <div className="shrink-0 bg-card border-b border-border px-4 pt-12 pb-3 shadow-sm">
        <Link href="/friends" className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 mb-2">
          <ArrowLeft size={16} /> Friends
        </Link>
        <div className="flex items-center gap-2">
          <CalendarDays className="text-indigo-600 dark:text-indigo-400" size={20} />
          <h1 className="text-xl font-bold text-foreground">Compare (by date)</h1>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="px-4 py-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>}>
          <CompareContent />
        </Suspense>
      </div>
    </div>
  )
}
