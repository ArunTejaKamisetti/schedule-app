'use client'

import { Clock, MapPin, User, Check, Plus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Course } from '@/lib/types'

interface CourseCardProps {
  course: Course
  selected: boolean
  onToggle: (courseId: string) => void
  pending?: boolean
}

const DAY_COLORS: Record<string, string> = {
  MON: 'bg-blue-50 text-blue-700 border-blue-200',
  TUE: 'bg-purple-50 text-purple-700 border-purple-200',
  WED: 'bg-green-50 text-green-700 border-green-200',
  THU: 'bg-orange-50 text-orange-700 border-orange-200',
  FRI: 'bg-pink-50 text-pink-700 border-pink-200',
  SAT: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}

export function CourseCard({ course, selected, onToggle, pending }: CourseCardProps) {
  const dayColor = DAY_COLORS[course.day_of_week?.toUpperCase() ?? ''] ?? 'bg-gray-50 text-gray-600 border-gray-200'

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-xl border p-4 transition-all duration-150',
        selected
          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300',
        course.is_cancelled && 'opacity-60'
      )}
    >
      {/* Left color bar */}
      <div className={cn('w-1 self-stretch rounded-full shrink-0', selected ? 'bg-indigo-400' : 'bg-gray-200')} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                {course.course_code}
              </span>
              {course.is_cancelled && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle size={10} /> CANCELLED
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-semibold text-gray-900 leading-tight">
              {course.course_name}
            </p>
          </div>

          <button
            onClick={() => !pending && onToggle(course.id)}
            disabled={pending}
            className={cn(
              'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all',
              selected
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'border-2 border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500',
              pending && 'opacity-50 cursor-wait'
            )}
            aria-label={selected ? 'Remove course' : 'Add course'}
          >
            {selected ? <Check size={16} strokeWidth={2.5} /> : <Plus size={16} strokeWidth={2} />}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
          {course.day_of_week && course.start_time && (
            <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium', dayColor)}>
              <Clock size={10} />
              {course.day_of_week} · {course.start_time}{course.end_time ? `–${course.end_time}` : ''}
            </span>
          )}
          {course.room && (
            <span className="flex items-center gap-1">
              <MapPin size={10} /> {course.room}
            </span>
          )}
          {course.instructor && (
            <span className="flex items-center gap-1">
              <User size={10} /> {course.instructor}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
