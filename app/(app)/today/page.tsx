'use client'

import { useState, useEffect, useMemo } from 'react'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { Clock, MapPin, User, AlertTriangle, ArrowLeftRight, DoorOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import type { Course } from '@/lib/types'

const DAYS: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }
const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function todayKey(): string {
  return DAY_ABBR[new Date().getDay()]
}

export default function TodayPage() {
  const { userId } = useSession()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(todayKey())

  useEffect(() => {
    if (!userId) return
    fetch(`/api/courses/user?userId=${userId}`)
      .then((r) => r.json())
      .then((data: { courses: Course }[]) => {
        const c = data.map((d) => d.courses).filter(Boolean)
        setCourses(c)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId])

  const daySchedule = useMemo(() => {
    return courses
      .filter((c) => c.day_of_week?.toUpperCase() === selectedDay)
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  }, [courses, selectedDay])

  // Build 7-day strip anchored to today
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday

  const dayCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of courses) {
      const d = c.day_of_week?.toUpperCase()
      if (d) map[d] = (map[d] ?? 0) + 1
    }
    return map
  }, [courses])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-12 pb-3 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {selectedDay === todayKey() ? 'Today' : DAY_ABBR[DAYS[selectedDay] ?? 0]}
        </h1>
        <p className="text-sm text-gray-500">{format(today, 'EEEE, MMMM d')}</p>

        {/* Day strip */}
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1 no-scrollbar">
          {Array.from({ length: 6 }).map((_, i) => {
            const d = addDays(weekStart, i)
            const key = DAY_ABBR[d.getDay()]
            const isToday = isSameDay(d, today)
            const isActive = key === selectedDay
            const count = dayCounts[key] ?? 0

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                className={cn(
                  'flex flex-col items-center px-3 py-2 rounded-xl transition-all shrink-0 min-w-[52px]',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isToday
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <span className="text-[10px] font-medium">{key}</span>
                <span className="text-base font-bold leading-tight">{format(d, 'd')}</span>
                {count > 0 && (
                  <span className={cn('w-1.5 h-1.5 rounded-full mt-0.5', isActive ? 'bg-white/60' : 'bg-indigo-400')} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : daySchedule.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-4xl">🎉</span>
            <p className="mt-3 text-sm font-medium">No classes on {selectedDay === todayKey() ? 'today' : selectedDay}</p>
            <p className="text-xs mt-1 text-gray-300">Enjoy your free day</p>
          </div>
        ) : (
          <div className="space-y-3 relative">
            {/* Vertical line */}
            <div className="absolute left-[27px] top-4 bottom-4 w-px bg-gray-100" />

            {daySchedule.map((course) => (
              <ClassCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ClassCard({ course }: { course: Course }) {
  const isCancelled = course.is_cancelled

  return (
    <div className={cn(
      'flex gap-3 items-start',
    )}>
      {/* Time bubble */}
      <div className="shrink-0 flex flex-col items-center z-10">
        <div className={cn(
          'w-12 text-center rounded-full px-1 py-1 text-[10px] font-bold leading-tight',
          isCancelled ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700'
        )}>
          {course.start_time}
        </div>
      </div>

      {/* Card */}
      <div className={cn(
        'flex-1 rounded-xl border p-3 shadow-sm',
        isCancelled ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-indigo-600">{course.course_code}</span>
              {isCancelled && (
                <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle size={8} /> CANCELLED
                </span>
              )}
            </div>
            <p className={cn('text-sm font-semibold mt-0.5', isCancelled && 'line-through text-red-500')}>
              {course.course_name}
            </p>
          </div>
          {course.start_time && course.end_time && (
            <span className="text-xs text-gray-400 shrink-0">
              {course.start_time}–{course.end_time}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
          {course.room && (
            <span className="flex items-center gap-1">
              <DoorOpen size={11} /> {course.room}
            </span>
          )}
          {course.instructor && (
            <span className="flex items-center gap-1">
              <User size={11} /> {course.instructor}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
