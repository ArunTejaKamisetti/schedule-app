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
function overlaps(a: Course, b: Course): boolean {
  const as = timeMin(a.start_time), ae = timeMin(a.end_time), bs = timeMin(b.start_time), be = timeMin(b.end_time)
  return as < be && bs < ae
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
  const clashIds = useMemo(() => {
    const s = new Set<string>()
    for (const a of myDay) for (const b of theirDay) if (overlaps(a, b)) { s.add(a.id); s.add(b.id) }
    return s
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
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 py-2.5 border-b border-border">
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

      <div className="flex-1 overflow-y-auto">
        {clashIds.size > 0 && (
          <p className="text-xs text-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 py-1.5">
            ⚠ {clashIds.size / 2 | 0} time clash{clashIds.size > 2 ? 'es' : ''} on this day
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 p-3">
          <ColumnHeader label="You" />
          <ColumnHeader label={friendName} />
          <Column list={myDay} clashIds={clashIds} side="me" />
          <Column list={theirDay} clashIds={clashIds} side="friend" />
        </div>
      </div>
    </div>
  )
}

function ColumnHeader({ label }: { label: string }) {
  return <div className="text-xs font-bold text-foreground text-center pb-1 truncate">{label}</div>
}

function Column({ list, clashIds, side }: { list: Course[]; clashIds: Set<string>; side: 'me' | 'friend' }) {
  if (list.length === 0) {
    return <div className="text-[11px] text-muted-foreground text-center py-6">— free —</div>
  }
  return (
    <div className="space-y-2">
      {list.map((c) => {
        const clash = clashIds.has(c.id)
        return (
          <div key={c.id} className={cn(
            'rounded-lg border p-2',
            clash ? 'bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-800'
              : side === 'me' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800'
              : 'bg-card border-border'
          )}>
            <p className="text-[10px] font-mono font-bold text-muted-foreground">{c.start_time}–{c.end_time}</p>
            <p className={cn('text-xs font-semibold truncate', clash ? 'text-red-600' : 'text-foreground')}>{c.course_code}</p>
            <p className="text-[11px] text-muted-foreground truncate">{c.course_name}</p>
            {c.room && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin size={8} />Class {c.room}</p>}
          </div>
        )
      })}
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
