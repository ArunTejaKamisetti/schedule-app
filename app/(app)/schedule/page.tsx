'use client'

import { useState, useEffect, useMemo } from 'react'
import { CalendarDays, Clock, MapPin, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { groupCoursesByDay } from '@/lib/clashes'
import type { Course } from '@/lib/types'

const DAY_LABELS: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
  THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}
const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export default function SchedulePage() {
  const { userId } = useSession()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    fetch(`/api/courses/user?userId=${userId}`)
      .then((r) => r.json())
      .then((data: { courses: Course }[]) => {
        setCourses(data.map((d) => d.courses).filter(Boolean))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId])

  const byDay = useMemo(() => groupCoursesByDay(courses), [courses])

  const activeDays = DAY_ORDER.filter((d) => (byDay.get(d)?.length ?? 0) > 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-indigo-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">My Schedule</h1>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{courses.length} course{courses.length !== 1 ? 's' : ''} selected</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <CalendarDays size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">No courses selected yet</p>
            <a href="/" className="mt-2 text-xs text-indigo-500 underline">Go to Course Picker →</a>
          </div>
        ) : activeDays.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            Selected courses have no scheduled days yet
          </div>
        ) : (
          activeDays.map((day) => {
            const dayCourses = byDay.get(day) ?? []
            return (
              <div key={day}>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-sm font-bold text-gray-700">{DAY_LABELS[day] ?? day}</h2>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400">{dayCourses.length} class{dayCourses.length !== 1 ? 'es' : ''}</span>
                </div>
                <div className="space-y-2">
                  {dayCourses.map((course) => (
                    <ScheduleCourseRow key={course.id} course={course} />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function ScheduleCourseRow({ course }: { course: Course }) {
  return (
    <div className={cn(
      'flex gap-3 items-center rounded-xl border p-3',
      course.is_cancelled ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
    )}>
      {/* Time column */}
      <div className="shrink-0 text-center w-16">
        <p className={cn('text-xs font-bold', course.is_cancelled ? 'text-red-500 line-through' : 'text-indigo-600')}>
          {course.start_time}
        </p>
        {course.end_time && (
          <p className="text-[10px] text-gray-400">{course.end_time}</p>
        )}
      </div>

      {/* Divider */}
      <div className={cn('w-px self-stretch', course.is_cancelled ? 'bg-red-200' : 'bg-indigo-100')} />

      {/* Course info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-semibold text-indigo-600">{course.course_code}</span>
          {course.is_cancelled && (
            <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1 py-0.5 rounded">CANCELLED</span>
          )}
        </div>
        <p className={cn('text-sm font-medium truncate', course.is_cancelled && 'line-through text-red-500')}>
          {course.course_name}
        </p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 flex-wrap">
          {course.room && <span className="flex items-center gap-0.5"><MapPin size={9} />{course.room}</span>}
          {course.instructor && <span className="flex items-center gap-0.5"><User size={9} />{course.instructor}</span>}
        </div>
      </div>
    </div>
  )
}
