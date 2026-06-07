'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { Search, BookOpen, Plus, Check, AlertTriangle, Clock, MapPin, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/components/session-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Course } from '@/lib/types'

const DAY_COLORS: Record<string, string> = {
  MON: 'bg-blue-50 text-blue-700 border-blue-200',
  TUE: 'bg-purple-50 text-purple-700 border-purple-200',
  WED: 'bg-green-50 text-green-700 border-green-200',
  THU: 'bg-orange-50 text-orange-700 border-orange-200',
  FRI: 'bg-pink-50 text-pink-700 border-pink-200',
  SAT: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}

export default function CoursesPage() {
  const { userId } = useSession()
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    fetch('/api/courses')
      .then((r) => r.json())
      .then((courses: Course[]) => {
        setAllCourses(courses)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!userId) return
    fetch(`/api/courses/user?userId=${userId}`)
      .then((r) => r.json())
      .then((data: { course_id: string }[]) => {
        setSelectedIds(new Set(data.map((d) => d.course_id)))
      })
      .catch(console.error)
  }, [userId])

  const tabs = useMemo(() => {
    return [...new Set(allCourses.map((c) => c.sheet_tab))].sort()
  }, [allCourses])

  const filtered = useMemo(() => {
    let list = allCourses
    if (activeTab !== 'all') list = list.filter((c) => c.sheet_tab === activeTab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.course_name.toLowerCase().includes(q) ||
          c.course_code.toLowerCase().includes(q) ||
          (c.instructor ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [allCourses, activeTab, search])

  async function handleToggle(courseId: string) {
    if (!userId) { toast.error('Session not ready, please wait.'); return }
    const isSelected = selectedIds.has(courseId)
    setPendingId(courseId)
    startTransition(async () => {
      try {
        const res = await fetch('/api/courses/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, courseId, action: isSelected ? 'remove' : 'add' }),
        })
        if (!res.ok) throw new Error('Failed')
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (isSelected) next.delete(courseId)
          else next.add(courseId)
          return next
        })
      } catch {
        toast.error('Could not update. Try again.')
      } finally {
        setPendingId(null)
      }
    })
  }

  const selectedCount = selectedIds.size

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="text-indigo-600" size={22} />
            <h1 className="text-xl font-bold text-gray-900">Course Picker</h1>
          </div>
          {selectedCount > 0 && (
            <span className="text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
              {selectedCount} selected
            </span>
          )}
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by name, code, or instructor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-gray-50 border-gray-200 text-sm"
          />
        </div>
        {tabs.length > 0 && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
            <TabsList className="w-full bg-gray-100">
              <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
              {tabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="flex-1 text-xs">{tab}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BookOpen size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">{search ? 'No courses match your search' : 'No courses available yet'}</p>
            {!search && <p className="text-xs mt-1">The schedule will appear once synced from the sheet</p>}
          </div>
        ) : (
          filtered.map((course) => {
            const dayColor = DAY_COLORS[course.day_of_week?.toUpperCase() ?? ''] ?? 'bg-gray-50 text-gray-600 border-gray-200'
            const selected = selectedIds.has(course.id)
            const pending = pendingId === course.id && isPending
            return (
              <div
                key={course.id}
                className={cn(
                  'relative flex items-start gap-3 rounded-xl border p-4 transition-all duration-150',
                  selected ? 'border-indigo-300 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300',
                  course.is_cancelled && 'opacity-60'
                )}
              >
                <div className={cn('w-1 self-stretch rounded-full shrink-0', selected ? 'bg-indigo-400' : 'bg-gray-200')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{course.course_code}</span>
                        {course.is_cancelled && (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <AlertTriangle size={10} /> CANCELLED
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm font-semibold text-gray-900 leading-tight">{course.course_name}</p>
                    </div>
                    <button
                      onClick={() => !pending && handleToggle(course.id)}
                      disabled={pending}
                      className={cn(
                        'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all',
                        selected ? 'bg-indigo-600 text-white shadow-sm' : 'border-2 border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500',
                        pending && 'opacity-50 cursor-wait'
                      )}
                    >
                      {selected ? <Check size={16} strokeWidth={2.5} /> : <Plus size={16} strokeWidth={2} />}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    {course.day_of_week && course.start_time && (
                      <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium', dayColor)}>
                        <Clock size={10} />{course.day_of_week} · {course.start_time}{course.end_time ? `–${course.end_time}` : ''}
                      </span>
                    )}
                    {course.room && <span className="flex items-center gap-1"><MapPin size={10} />{course.room}</span>}
                    {course.instructor && <span className="flex items-center gap-1"><User size={10} />{course.instructor}</span>}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {selectedCount > 0 && (
        <div className="sticky bottom-20 mx-4 mb-2 bg-indigo-600 text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium">{selectedCount} course{selectedCount > 1 ? 's' : ''} selected</span>
          <a href="/today" className="text-xs font-semibold underline-offset-2 underline opacity-90">View Today →</a>
        </div>
      )}
    </div>
  )
}
