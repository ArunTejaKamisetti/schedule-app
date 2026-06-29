'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { Search, BookOpen, Plus, Check, MapPin, User, ChevronDown, X, Pencil, GraduationCap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/components/session-provider'
import { useUserSessions, useAttendanceStats } from '@/lib/hooks'
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

// Admin can browse either year via the year switch; students only ever see their own courses, so
// the switch (and this flag) are admin-only now.
const YEAR1_ENABLED = false

// Enrollment is roster-driven: the admin uploads each student's section / electives, so students
// no longer self-pick. The picker and the section chooser become read-only. Flip to false to
// restore self-service picking.
const ROSTER_MANAGED = true

export default function CoursesPage() {
  const { userId, user } = useSession()
  const isAdmin = user?.role === 'admin'
  const [yearTab, setYearTab] = useState<1 | 2>(2)
  const [yearTabDecided, setYearTabDecided] = useState(false)
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false) // first-time picker, stays open until "Done"
  const [userLoaded, setUserLoaded] = useState(false)
  const [decided, setDecided] = useState(false)
  const [, startTransition] = useTransition()

  // Shared, deduped per-user data (see lib/hooks.ts). Catalog stays a plain fetch below — it's the
  // shared, edge-cached route and varies by admin/year.
  const { codes: serverCodes, rows: sessionRows, mutate: mutateSessions } = useUserSessions(userId)
  // The signed-in user's own courses + attendance stats, resolved from their sessions (section for
  // 1st-years, electives for 2nd-years) — so the "My Courses" tracker works the same for every year.
  const { summary, isLoading: loadingStats } = useAttendanceStats(userId, !editing)

  useEffect(() => {
    // Catalog = one representative row per course (complete, no 1000-row cap). Students always see
    // the 2nd-year elective catalog; an admin (poweruser) browses the selected year's full catalog.
    setLoading(true)
    const url = isAdmin ? `/api/courses?catalog=1&year=${yearTab}` : '/api/courses?catalog=1'
    fetch(url)
      .then((r) => r.json())
      .then((courses: Course[]) => {
        setAllCourses(Array.isArray(courses) ? courses : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [isAdmin, yearTab])

  // Default the active tab to the user's year once known (1st-years open straight into sections).
  useEffect(() => {
    if (yearTabDecided || !user) return
    setYearTab(user.year === 1 && YEAR1_ENABLED ? 1 : 2)
    setYearTabDecided(true)
  }, [yearTabDecided, user])

  // Seed the editable selection ONCE from the server (optimistic toggles below own it afterward).
  useEffect(() => {
    if (sessionRows === undefined || userLoaded) return
    setSelectedCodes(new Set(serverCodes))
    setUserLoaded(true)
  }, [sessionRows, serverCodes, userLoaded])

  // Decide the initial view ONCE, after the user's existing picks are known: a brand-new
  // user (no picks) opens straight into the picker and stays there until they tap "Done"
  // — adding the first course must NOT bounce them out to the static list.
  useEffect(() => {
    if (decided || loading || !userLoaded) return
    setPicking(!ROSTER_MANAGED && selectedCodes.size === 0)
    setDecided(true)
  }, [decided, loading, userLoaded, selectedCodes])

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
        mutateSessions()
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

  function finishPicking() { setEditing(false); setPicking(false) }

  // Show the picker while editing or during first-time picking; otherwise the static list.
  const showPicker = editing || picking

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-12 pb-3 shadow-sm">
        {/* Year switch — admin only (students just see their own courses). */}
        {isAdmin && (
          <div className="flex gap-1 mb-3 bg-muted rounded-xl p-1">
            {([2, 1] as const).map((y) => (
              <button
                key={y}
                onClick={() => { setYearTab(y); setYearTabDecided(true) }}
                className={cn(
                  'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                  yearTab === y ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                {y === 2 ? '2nd Year' : '1st Year'}
              </button>
            ))}
          </div>
        )}

        {isAdmin ? (
          <div className="flex items-center gap-2">
            <BookOpen className="text-indigo-600 dark:text-indigo-400" size={22} />
            <h1 className="text-xl font-bold text-foreground">All Courses · {yearTab === 1 ? '1st' : '2nd'} Year</h1>
            <span className="ml-auto text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full">Admin</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="text-indigo-600 dark:text-indigo-400" size={22} />
                <h1 className="text-xl font-bold text-foreground">{showPicker ? 'Pick Courses' : 'My Courses'}</h1>
              </div>
              {showPicker ? (
                selectedGroups.length > 0 ? (
                  <button onClick={finishPicking} title="Save and view my courses" className="text-sm font-semibold text-white bg-indigo-600 px-3.5 py-1.5 rounded-lg">Done</button>
                ) : (
                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-full">{selectedGroups.length} selected</span>
                )
              ) : ROSTER_MANAGED ? null : (
                <button onClick={() => setEditing(true)} title="Add or remove your courses" className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-lg">
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>
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
          </>
        )}
      </div>

      {isAdmin ? (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <AdminCourseList byArea={byArea} loading={loading} />
        </div>
      ) : (
      <>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {!showPicker ? (
          loadingStats ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : (
            <StaticList summary={summary} />
          )
        ) : loading ? (
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
                <CollapsibleTrigger title={`Show/hide ${area} courses`} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors">
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
      </>
      )}
    </div>
  )
}

// Admin (poweruser) view: every course of the selected year, read-only, grouped by area. Admins
// are enrolled in everything (the user_sessions RPC returns all for them), so this is a browse/
// reference list — no picking.
function AdminCourseList({ byArea, loading }: { byArea: { area: string; groups: CourseGroup[] }[]; loading: boolean }) {
  if (loading) {
    return <div className="space-y-2.5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
  }
  if (byArea.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <BookOpen size={40} strokeWidth={1} />
        <p className="mt-3 text-sm">No courses for this year yet.</p>
      </div>
    )
  }
  const total = byArea.reduce((n, a) => n + a.groups.length, 0)
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{total} course{total !== 1 ? 's' : ''} · you&apos;re enrolled in all of them (admin)</p>
      {byArea.map(({ area, groups }) => (
        <div key={area} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{area}</span>
            <span className="text-xs text-muted-foreground">({groups.length})</span>
          </div>
          {groups.map((g) => (
            <div key={g.code} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">{g.code}</span>
                {g.credits && <span className="text-xs text-muted-foreground">{g.credits} cr</span>}
              </div>
              <p className="mt-0.5 text-sm font-semibold text-foreground leading-tight">{g.name}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {g.room && <span className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full"><MapPin size={10} />Class {g.room}</span>}
                {g.instructor && <span className="flex items-center gap-1"><User size={10} />{g.instructor}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
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
        selected ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40 shadow-sm' : 'border-border bg-card hover:border-muted-foreground/30'
      )}
    >
      <div className={cn('w-1 self-stretch rounded-full shrink-0', selected ? 'bg-indigo-400' : 'bg-border')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">{group.code}</span>
              {group.credits && <span className="text-xs text-muted-foreground">{group.credits} cr</span>}
            </div>
            <p className="mt-0.5 text-sm font-semibold text-foreground leading-tight">{group.name}</p>
          </div>
          <button
            onClick={() => !pending && onToggle(!selected)}
            disabled={pending}
            title={selected ? 'Remove from my courses' : 'Add to my courses'}
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

// Read-only summary of the signed-in user's courses with attendance stats. Driven by their resolved
// sessions (`summary`): a 1st-year's section timetable or a 2nd-year's electives — so the attendance
// tracker works identically for every year.
function StaticList({ summary }: { summary: CourseStat[] }) {
  const ordered = [...summary].sort((a, b) =>
    (AREA_ORDER.indexOf(a.area || 'Other') - AREA_ORDER.indexOf(b.area || 'Other')) || a.code.localeCompare(b.code)
  )

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <GraduationCap size={40} strokeWidth={1} />
        <p className="mt-3 text-sm">No courses yet</p>
        <p className="text-xs mt-1">Your classes appear here once your section / electives are loaded.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">{ordered.length} course{ordered.length !== 1 ? 's' : ''} · mark attendance in Home/Schedule{ROSTER_MANAGED ? ' · set from the official roster' : <> · tap <b className="text-foreground">Edit</b> to change</>}</p>
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
