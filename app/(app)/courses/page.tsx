'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { Search, BookOpen, Plus, Check, AlertTriangle, MapPin, User, ChevronDown, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/components/session-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Course } from '@/lib/types'

// Order areas logically
const AREA_ORDER = ['ECO', 'FAC', 'HLAM', 'IS', 'DSOM', 'MM', 'OBHR', 'SM', 'FIN Core', 'LSM Core', 'FIN Elective', 'LSM Elective', 'Other']

interface CourseGroup {
  code: string
  name: string
  area: string | null
  instructor: string | null
  credits: string | null
  room: string | null
  is_cancelled: boolean
}

export default function CoursesPage() {
  const { userId } = useSession()
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    // Catalog = one representative row per course (complete, no 1000-row cap).
    fetch('/api/courses?catalog=1')
      .then((r) => r.json())
      .then((courses: Course[]) => {
        setAllCourses(Array.isArray(courses) ? courses : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!userId) return
    fetch(`/api/courses/user?userId=${userId}`)
      .then((r) => r.json())
      .then((data: { courses: Course }[]) => {
        setSelectedCodes(new Set(data.map((d) => d.courses?.course_code).filter(Boolean)))
      })
      .catch(console.error)
  }, [userId])

  // One card per unique course (GT-A, GT-B are distinct courses).
  const courseGroups = useMemo<CourseGroup[]>(() => {
    const map = new Map<string, CourseGroup>()
    for (const c of allCourses) {
      if (c.is_common) continue
      if (map.has(c.course_code)) continue
      map.set(c.course_code, {
        code: c.course_code,
        name: c.course_name,
        area: c.area,
        instructor: c.instructor,
        credits: c.credits,
        room: c.room,
        is_cancelled: c.is_cancelled,
      })
    }
    return [...map.values()]
  }, [allCourses])

  const filtered = useMemo(() => {
    if (!search.trim()) return courseGroups
    const q = search.toLowerCase()
    return courseGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.code.toLowerCase().includes(q) ||
        (g.instructor ?? '').toLowerCase().includes(q)
    )
  }, [courseGroups, search])

  // Group filtered courses by area, ordered.
  const byArea = useMemo(() => {
    const map = new Map<string, CourseGroup[]>()
    for (const g of filtered) {
      const area = g.area || 'Other'
      if (!map.has(area)) map.set(area, [])
      map.get(area)!.push(g)
    }
    const orderedKeys = [
      ...AREA_ORDER.filter((a) => map.has(a)),
      ...[...map.keys()].filter((a) => !AREA_ORDER.includes(a)),
    ]
    return orderedKeys.map((area) => ({ area, groups: map.get(area)! }))
  }, [filtered])

  const searching = search.trim().length > 0

  function toggleArea(area: string) {
    setOpenAreas((prev) => {
      const next = new Set(prev)
      if (next.has(area)) next.delete(area)
      else next.add(area)
      return next
    })
  }

  async function setGroupSelected(group: CourseGroup, select: boolean) {
    if (!userId) { toast.error('Session not ready, please wait.'); return }
    setPendingCode(group.code)
    // Optimistic update
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (select) next.add(group.code); else next.delete(group.code)
      return next
    })
    startTransition(async () => {
      try {
        await fetch('/api/courses/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, courseCode: group.code, action: select ? 'add' : 'remove' }),
        })
      } catch {
        toast.error('Could not update. Try again.')
        setSelectedCodes((prev) => {
          const next = new Set(prev)
          if (select) next.delete(group.code); else next.add(group.code)
          return next
        })
      } finally {
        setPendingCode(null)
      }
    })
  }

  const selectedGroups = useMemo(
    () => courseGroups.filter((g) => selectedCodes.has(g.code)),
    [courseGroups, selectedCodes]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="text-indigo-600 dark:text-indigo-400" size={22} />
            <h1 className="text-xl font-bold text-foreground">Course Picker</h1>
          </div>
          {selectedGroups.length > 0 && (
            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-full">
              {selectedGroups.length} selected
            </span>
          )}
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, code, or faculty…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted border-border text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
        ) : byArea.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <BookOpen size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">{search ? 'No courses match your search' : 'No courses available yet'}</p>
          </div>
        ) : (
          byArea.map(({ area, groups }) => {
            const open = searching || openAreas.has(area)
            const selectedInArea = groups.filter((g) => selectedCodes.has(g.code)).length
            return (
              <Collapsible key={area} open={open} onOpenChange={() => !searching && toggleArea(area)}>
                <CollapsibleTrigger className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors">
                  <span className="text-sm font-bold text-foreground">{area}</span>
                  <span className="text-xs text-muted-foreground">({groups.length})</span>
                  {selectedInArea > 0 && (
                    <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded-full">
                      {selectedInArea} picked
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className={cn('ml-auto text-muted-foreground transition-transform', open && 'rotate-180')}
                  />
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <div className="space-y-2 pt-2 pb-1">
                    {groups.map((group) => (
                      <CourseCard
                        key={group.code}
                        group={group}
                        selected={selectedCodes.has(group.code)}
                        pending={pendingCode === group.code}
                        onToggle={(sel) => setGroupSelected(group, sel)}
                      />
                    ))}
                  </div>
                </CollapsiblePanel>
              </Collapsible>
            )
          })
        )}
        {selectedGroups.length > 0 && <div className="h-24" />}
      </div>

      {/* Overview bar — floats just above the bottom nav */}
      {selectedGroups.length > 0 && (
        <div className="fixed inset-x-0 bottom-[72px] z-40 px-3">
          <div className="max-w-lg mx-auto bg-card/95 backdrop-blur border border-border rounded-2xl px-4 pt-2.5 pb-3 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {selectedGroups.length} selected
              </span>
              <a href="/today" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">View Today →</a>
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {selectedGroups.map((g) => (
                <button
                  key={g.code}
                  onClick={() => setGroupSelected(g, false)}
                  disabled={pendingCode === g.code}
                  className="shrink-0 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full disabled:opacity-50"
                >
                  {g.code}
                  <X size={12} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CourseCard({
  group,
  selected,
  pending,
  onToggle,
}: {
  group: CourseGroup
  selected: boolean
  pending: boolean
  onToggle: (select: boolean) => void
}) {
  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-xl border p-4 transition-all duration-150',
        selected ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40 shadow-sm' : 'border-border bg-card hover:border-muted-foreground/30',
        group.is_cancelled && 'opacity-60'
      )}
    >
      <div className={cn('w-1 self-stretch rounded-full shrink-0', selected ? 'bg-indigo-400' : 'bg-border')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">{group.code}</span>
              {group.credits && <span className="text-xs text-muted-foreground">{group.credits} cr</span>}
              {group.is_cancelled && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle size={10} /> CANCELLED
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-semibold text-foreground leading-tight">{group.name}</p>
          </div>
          <button
            onClick={() => !pending && onToggle(!selected)}
            disabled={pending}
            className={cn(
              'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all',
              selected ? 'bg-indigo-600 text-white shadow-sm' : 'border-2 border-border text-muted-foreground hover:border-indigo-400 hover:text-indigo-500',
              pending && 'opacity-50 cursor-wait'
            )}
          >
            {selected ? <Check size={16} strokeWidth={2.5} /> : <Plus size={16} strokeWidth={2} />}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {group.room && (
            <span className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full">
              <MapPin size={10} />Class {group.room}
            </span>
          )}
          {group.instructor && (
            <span className="flex items-center gap-1">
              <User size={10} />{group.instructor}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
