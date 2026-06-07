'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, AlertCircle, CheckCircle2, Clock, MapPin, User } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/session-provider'
import { Skeleton } from '@/components/ui/skeleton'
import type { Course, ScheduleClash } from '@/lib/types'

interface CompareResult {
  clashes: ScheduleClash[]
  commonCourses: { myCourse: Course; friendCourse: Course }[]
  myCourses: Course[]
  friendCourses: Course[]
  myUniqueCount: number
  friendUniqueCount: number
}

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function CompareContent() {
  const { userId } = useSession()
  const params = useSearchParams()
  const friendId = params.get('friendId')
  const [result, setResult] = useState<CompareResult | null>(null)
  const [friendName, setFriendName] = useState('Friend')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId || !friendId) return

    Promise.all([
      fetch(`/api/friends/compare?userId=${userId}&friendId=${friendId}`).then((r) => r.json()),
      fetch(`/api/friends?userId=${userId}`).then((r) => r.json()),
    ]).then(([compareData, friendsData]) => {
      setResult(compareData)
      const f = friendsData.find((fr: { friend_id: string; friend: { display_name: string } }) => fr.friend_id === friendId)
      if (f?.friend?.display_name) setFriendName(f.friend.display_name)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [userId, friendId])

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    )
  }

  if (!result) {
    return <div className="px-4 py-10 text-center text-gray-400">Could not load comparison</div>
  }

  // Build merged view by day
  const allCoursesByDay: Record<string, { course: Course; owner: 'me' | 'friend' | 'both' | 'clash' }[]> = {}
  for (const day of DAY_ORDER) allCoursesByDay[day] = []

  const clashPairs = new Set(
    result.clashes.map((c) => `${c.myCourse.id}::${c.friendCourse.id}`)
  )
  const commonMineIds = new Set(result.commonCourses.map((c) => c.myCourse.id))
  const commonFriendIds = new Set(result.commonCourses.map((c) => c.friendCourse.id))

  for (const c of result.myCourses) {
    const day = c.day_of_week?.toUpperCase()
    if (!day || !allCoursesByDay[day]) continue
    const isClash = result.clashes.some((cl) => cl.myCourse.id === c.id)
    const isCommon = commonMineIds.has(c.id)
    allCoursesByDay[day].push({ course: c, owner: isCommon ? 'both' : isClash ? 'clash' : 'me' })
  }
  for (const c of result.friendCourses) {
    const day = c.day_of_week?.toUpperCase()
    if (!day || !allCoursesByDay[day]) continue
    if (commonFriendIds.has(c.id)) continue // already added above
    const isClash = result.clashes.some((cl) => cl.friendCourse.id === c.id)
    allCoursesByDay[day].push({ course: c, owner: isClash ? 'clash' : 'friend' })
  }

  // Sort each day by start_time
  for (const day of DAY_ORDER) {
    allCoursesByDay[day].sort((a, b) =>
      (a.course.start_time ?? '').localeCompare(b.course.start_time ?? '')
    )
  }

  const activeDays = DAY_ORDER.filter((d) => allCoursesByDay[d].length > 0)

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      {/* Summary pills */}
      <div className="flex gap-2 flex-wrap mb-4">
        <span className="flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-full font-medium">
          <AlertCircle size={12} /> {result.clashes.length} Clash{result.clashes.length !== 1 ? 'es' : ''}
        </span>
        <span className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full font-medium">
          <CheckCircle2 size={12} /> {result.commonCourses.length} Common
        </span>
        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full font-medium">
          {result.myUniqueCount} Only yours
        </span>
        <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-full font-medium">
          {result.friendUniqueCount} Only theirs
        </span>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-[10px] text-gray-500 mb-3 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-200 inline-block" /> Clash</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-200 inline-block" /> Common</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-100 inline-block" /> Yours only</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-100 inline-block" /> Theirs only</span>
      </div>

      {activeDays.map((day) => (
        <div key={day} className="mb-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{day}</h3>
          <div className="space-y-2">
            {allCoursesByDay[day].map((entry, i) => (
              <CompareRow key={`${entry.course.id}-${i}`} course={entry.course} owner={entry.owner} friendName={friendName} />
            ))}
          </div>
        </div>
      ))}

      {activeDays.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No classes to compare yet</p>
          <p className="text-xs mt-1">Make sure both of you have selected electives</p>
        </div>
      )}
    </div>
  )
}

function CompareRow({ course, owner, friendName }: {
  course: Course
  owner: 'me' | 'friend' | 'both' | 'clash'
  friendName: string
}) {
  const colorMap = {
    clash: 'bg-red-50 border-red-200',
    both: 'bg-green-50 border-green-200',
    me: 'bg-blue-50 border-blue-100',
    friend: 'bg-gray-50 border-gray-200',
  }
  const ownerLabel = {
    clash: <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">CLASH</span>,
    both: <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">COMMON</span>,
    me: <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Yours</span>,
    friend: <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{friendName}&apos;s</span>,
  }

  return (
    <div className={cn('flex gap-3 items-center rounded-xl border p-3', colorMap[owner])}>
      <div className="shrink-0 text-center w-14">
        <p className="text-xs font-bold text-gray-700">{course.start_time}</p>
        {course.end_time && <p className="text-[10px] text-gray-400">{course.end_time}</p>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono text-indigo-600 font-semibold">{course.course_code}</span>
          {ownerLabel[owner]}
        </div>
        <p className="text-sm font-medium truncate text-gray-800">{course.course_name}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
          {course.room && <span className="flex items-center gap-0.5"><MapPin size={9} />{course.room}</span>}
          {course.instructor && <span className="flex items-center gap-0.5"><User size={9} />{course.instructor}</span>}
        </div>
      </div>
    </div>
  )
}

export default function ComparePage() {
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-12 pb-4 shadow-sm">
        <Link href="/friends" className="flex items-center gap-1.5 text-sm text-indigo-600 mb-2">
          <ArrowLeft size={16} /> Friends
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Schedule Comparison</h1>
      </div>
      <Suspense fallback={<div className="px-4 py-6 space-y-3">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-20 rounded-xl"/>)}</div>}>
        <CompareContent />
      </Suspense>
    </div>
  )
}
