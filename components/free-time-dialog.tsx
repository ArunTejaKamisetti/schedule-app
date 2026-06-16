'use client'

import { useState, useEffect, useMemo } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { CalendarClock, ChevronLeft, ChevronRight, Check, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CANONICAL_SLOTS, SLOT_END } from '@/lib/free-time'

interface Person { id: string; name: string; busyByDate: Record<string, string[]> }
interface FreeTimeData { dates: string[]; people: Person[] }

const isoOf = (d: Date) => format(d, 'yyyy-MM-dd')

export function FreeTimeDialog({
  userId, open, onOpenChange,
}: { userId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [data, setData] = useState<FreeTimeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set()) // friend ids (You is always in)
  const [selectedDate, setSelectedDate] = useState(isoOf(new Date()))
  const [weekStart, setWeekStart] = useState<Date>(new Date())

  // Fetch once when first opened.
  useEffect(() => {
    if (!open || data || !userId) return
    setLoading(true)
    fetch(`/api/friends/free-time?userId=${userId}`)
      .then((r) => r.json())
      .then((d: FreeTimeData) => setData(d?.people ? d : { dates: [], people: [] }))
      .catch(() => setData({ dates: [], people: [] }))
      .finally(() => setLoading(false))
  }, [open, data, userId])

  const me = data?.people[0]
  const friends = useMemo(() => data?.people.slice(1) ?? [], [data])

  // You + the selected friends.
  const participants = useMemo(
    () => (me ? [me, ...friends.filter((f) => selected.has(f.id))] : []),
    [me, friends, selected]
  )

  const isBusy = (p: Person, date: string, slot: string) => (p.busyByDate[date] ?? []).includes(slot)
  const freeSlotsOn = (date: string) =>
    CANONICAL_SLOTS.filter((slot) => participants.every((p) => !isBusy(p, date, slot)))

  // 7-day window for the summary (also the date navigation).
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => isoOf(addDays(weekStart, i))),
    [weekStart]
  )
  const freeCountByDay = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of weekDays) m[d] = freeSlotsOn(d).length
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDays, participants])
  const bestCount = Math.max(0, ...Object.values(freeCountByDay))

  const dayFree = freeSlotsOn(selectedDate)

  function toggleFriend(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const allSelected = friends.length > 0 && selected.size === friends.length
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(friends.map((f) => f.id))) }

  function shiftWeek(delta: number) {
    const next = addDays(weekStart, delta * 7)
    setWeekStart(next)
    setSelectedDate(isoOf(next))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full max-h-[85vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <CalendarClock size={18} className="text-indigo-600 dark:text-indigo-400" />
          Free Time Analysis
        </DialogTitle>

        {loading ? (
          <div className="space-y-3 pt-1">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
        ) : !me ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Couldn&apos;t load schedules. Try again.</p>
        ) : (
          <div className="space-y-4">
            {/* Who to compare */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Users size={12} /> Who&apos;s meeting
                </p>
                {friends.length > 0 && (
                  <button onClick={toggleAll} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {allSelected ? 'Clear' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-600 text-white">You</span>
                {friends.length === 0 ? (
                  <span className="text-xs text-muted-foreground self-center">Add friends to compare</span>
                ) : friends.map((f) => {
                  const on = selected.has(f.id)
                  return (
                    <button key={f.id} onClick={() => toggleFriend(f.id)}
                      className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1',
                        on ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-700 dark:text-indigo-300'
                           : 'bg-card border-border text-muted-foreground')}>
                      {on && <Check size={11} />}{f.name}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Showing time when <b className="text-foreground">all {participants.length}</b> of you are free (classes &amp; exams count as busy).
              </p>
            </div>

            {/* Week summary */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This week</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => shiftWeek(-1)} className="p-1 rounded-md hover:bg-muted" title="Previous week"><ChevronLeft size={14} /></button>
                  <button onClick={() => shiftWeek(1)} className="p-1 rounded-md hover:bg-muted" title="Next week"><ChevronRight size={14} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((d) => {
                  const n = freeCountByDay[d] ?? 0
                  const active = d === selectedDate
                  const best = n > 0 && n === bestCount
                  return (
                    <button key={d} onClick={() => setSelectedDate(d)}
                      className={cn('flex flex-col items-center py-1.5 rounded-lg border text-center transition-colors',
                        active ? 'border-indigo-500 bg-indigo-600 text-white'
                          : best ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                          : 'border-border bg-card text-foreground')}>
                      <span className="text-[9px] opacity-70">{format(parseISO(d), 'EEE').toUpperCase()}</span>
                      <span className="text-xs font-bold">{format(parseISO(d), 'd')}</span>
                      <span className={cn('text-[9px]', active ? 'text-white/80' : 'text-muted-foreground')}>{n} free</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Day view */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-bold text-foreground">{format(parseISO(selectedDate), 'EEEE, d MMM')}</p>
                <span className="text-xs text-muted-foreground">{dayFree.length} / {CANONICAL_SLOTS.length} slots free</span>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {CANONICAL_SLOTS.map((slot) => {
                  const busy = participants.filter((p) => isBusy(p, selectedDate, slot))
                  const allFree = busy.length === 0
                  return (
                    <div key={slot} className={cn('flex items-center gap-2 px-2.5 py-2',
                      allFree && 'bg-emerald-50 dark:bg-emerald-950/30')}>
                      <div className="w-[68px] shrink-0 leading-tight">
                        <p className="text-xs font-mono font-semibold text-foreground">{slot}</p>
                        {SLOT_END[slot] && <p className="text-[9px] font-mono text-muted-foreground">{SLOT_END[slot]}</p>}
                      </div>
                      {allFree ? (
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <Check size={13} /> Everyone free
                        </span>
                      ) : (
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {busy.length} busy · <span className="text-foreground/70">{busy.map((p) => p.name).join(', ')}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">{participants.length - busy.length} of {participants.length} free</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-xs mt-2 text-muted-foreground">
                {dayFree.length === 0
                  ? 'No slot works for everyone on this day.'
                  : <>Everyone free at <b className="text-emerald-700 dark:text-emerald-400">{dayFree.join(', ')}</b>.</>}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
