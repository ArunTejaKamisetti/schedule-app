'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { Search, BookOpen, Plus, Check, AlertTriangle, MapPin, User, ChevronDown, X, Pencil, GraduationCap, DownloadCloud } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/components/session-provider'
import { setSessionId, setSessionCode } from '@/lib/session'
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

interface CourseStat {
  code: string; name: string; area: string | null; instructor: string | null; room: string | null; credits: string | null
  total: number; held: number; present: number; absent: number; left: number; expected: number
}

export default function CoursesPage() {
  const { userId } = useSession()
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importCode, setImportCode] = useState('')
  const [importingProfile, setImportingProfile] = useState(false)
  const [summary, setSummary] = useState<CourseStat[]>([])
  const [, startTransition] = useTransition()

  async function importProfile() {
    const code = importCode.trim().toUpperCase()
    if (!code) return
    setImportingProfile(true)
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
      setImportingProfile(false)
    }
  }

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

  // Attendance stats for the static "My Courses" view (refreshed when leaving edit mode).
  useEffect(() => {
    if (!userId || editing) return
    fetch(`/api/attendance/summary?userId=${userId}`)
      .then((r) => r.json())
      .then((d: CourseStat[]) => setSummary(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [userId, editing])

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

  // Once a user has picks, show them as a static list with an Edit button.
  const showPicker = editing || (!loading && selectedGroups.length === 0)

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="text-indigo-600 dark:text-indigo-400" size={22} />
            <h1 className="text-xl font-bold text-foreground">{showPicker ? 'Pick Courses' : 'My Courses'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setImportOpen((s) => !s)} title="Import profile" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <DownloadCloud size={15} /> Import
            </button>
            {showPicker ? (
              selectedGroups.length > 0 && editing ? (
                <button onClick={() => setEditing(false)} className="text-sm font-semibold text-white bg-indigo-600 px-3.5 py-1.5 rounded-lg">Done</button>
              ) : (
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-full">{selectedGroups.length} selected</span>
              )
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-lg">
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
        </div>
        {importOpen && (
          <div className="mb-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 p-3">
            <p className="text-xs text-muted-foreground mb-2">Enter your <b className="text-foreground">profile code</b> (from Settings on your other device) to load all your courses here.</p>
            <div className="flex gap-2">
              <Input value={importCode} onChange={(e) => setImportCode(e.target.value.toUpperCase())} placeholder="e.g. AB12CD34" maxLength={8} className="font-mono tracking-wider text-sm" onKeyDown={(e) => e.key === 'Enter' && importProfile()} />
              <Button onClick={importProfile} disabled={!importCode.trim() || importingProfile} size="sm">Import</Button>
            </div>
          </div>
        )}
        {showPicker && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, or faculty…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted border-border text-sm"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
        ) : !showPicker ? (
          <StaticList groups={selectedGroups} summary={summary} />
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
        {showPicker && selectedGroups.length > 0 && <div className="h-24" />}
      </div>

      {/* Overview bar — only while editing */}
      {showPicker && selectedGroups.length > 0 && (
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

// Read-only summary of the user's picked courses with attendance stats.
function StaticList({ groups, summary }: { groups: CourseGroup[]; summary: CourseStat[] }) {
  // Prefer the stats from the summary endpoint; fall back to catalog meta while it loads.
  const byCode = new Map(summary.map((s) => [s.code, s]))
  const items: CourseStat[] = groups.map((g) => byCode.get(g.code) ?? {
    code: g.code, name: g.name, area: g.area, instructor: g.instructor, room: g.room, credits: g.credits,
    total: 0, held: 0, present: 0, absent: 0, left: 0, expected: (parseInt(g.credits ?? '') || 0) * 8,
  })
  const ordered = items.sort((a, b) =>
    (AREA_ORDER.indexOf(a.area || 'Other') - AREA_ORDER.indexOf(b.area || 'Other')) || a.code.localeCompare(b.code)
  )

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">{groups.length} course{groups.length !== 1 ? 's' : ''} · mark attendance on Today/Week · tap <b className="text-foreground">Edit</b> to change</p>
      {ordered.map((s) => {
        const pct = s.held > 0 ? Math.round((s.present / s.held) * 100) : null
        const mismatch = s.expected > 0 && s.total > 0 && s.expected !== s.total
        return (
          <div key={s.code} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                <GraduationCap size={18} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">{s.code}</span>
                  {s.area && <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{s.area}</span>}
                  {s.credits && <span className="text-xs text-muted-foreground">{s.credits} cr</span>}
                </div>
                <p className="mt-0.5 text-sm font-semibold text-foreground leading-tight">{s.name}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {s.room && <span className="flex items-center gap-1"><MapPin size={10} />Class {s.room}</span>}
                  {s.instructor && <span className="flex items-center gap-1"><User size={10} />{s.instructor}</span>}
                </div>
              </div>
            </div>

            {/* Attendance stats */}
            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
              <Stat label="Present" value={`${s.present}/${s.total}`} tone="green" />
              <Stat label="Absent" value={`${s.absent}`} tone="red" />
              <Stat label="Attendance" value={pct === null ? '—' : `${pct}%`} tone={pct !== null && pct < 75 ? 'red' : 'indigo'} />
              <Stat label="Left" value={`${s.left}`} tone="muted" />
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground flex items-center gap-1">
              {s.total} scheduled (from sheet){mismatch && <span title={`Credits suggest ${s.expected} classes (${s.credits} cr × 8)`} className="text-amber-600 dark:text-amber-400">· credits expect {s.expected} ⓘ</span>}
            </p>
          </div>
        )
      })}
      <a href="/schedule" className="block text-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 py-2">View full schedule →</a>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'indigo' | 'muted' }) {
  const c = {
    green: 'text-green-700 dark:text-green-400', red: 'text-red-600 dark:text-red-400',
    indigo: 'text-indigo-700 dark:text-indigo-300', muted: 'text-foreground',
  }[tone]
  return (
    <div className="rounded-lg bg-muted/50 py-1.5">
      <p className={cn('text-sm font-bold', c)}>{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  )
}
