import type { Course, ScheduleClash } from './types'

function timeToMinutes(t: string): number {
  const [h, m] = (t ?? '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

function doTimesOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  return s1 < e2 && s2 < e1
}

export interface ComparisonResult {
  clashes: ScheduleClash[]
  commonCourses: { myCourse: Course; friendCourse: Course }[]
  myUniqueCount: number
  friendUniqueCount: number
}

export function compareSchedules(myCourses: Course[], friendCourses: Course[]): ComparisonResult {
  const clashes: ScheduleClash[] = []
  const commonCourses: { myCourse: Course; friendCourse: Course }[] = []
  const matchedMyIds = new Set<string>()
  const matchedFriendIds = new Set<string>()

  for (const mine of myCourses) {
    for (const theirs of friendCourses) {
      // Same course (identical code)
      if (mine.course_code === theirs.course_code) {
        commonCourses.push({ myCourse: mine, friendCourse: theirs })
        matchedMyIds.add(mine.id)
        matchedFriendIds.add(theirs.id)
        continue
      }

      // Time overlap on same day
      if (
        mine.day_of_week &&
        theirs.day_of_week &&
        mine.day_of_week === theirs.day_of_week &&
        mine.start_time && mine.end_time &&
        theirs.start_time && theirs.end_time &&
        doTimesOverlap(mine.start_time, mine.end_time, theirs.start_time, theirs.end_time)
      ) {
        clashes.push({
          type: 'time_overlap',
          myCourse: mine,
          friendCourse: theirs,
          day: mine.day_of_week,
          timeRange: `${mine.start_time}–${mine.end_time}`,
        })
        matchedMyIds.add(mine.id)
        matchedFriendIds.add(theirs.id)
      }
    }
  }

  return {
    clashes,
    commonCourses,
    myUniqueCount: myCourses.filter((c) => !matchedMyIds.has(c.id)).length,
    friendUniqueCount: friendCourses.filter((c) => !matchedFriendIds.has(c.id)).length,
  }
}

export function groupCoursesByDay(courses: Course[]): Map<string, Course[]> {
  const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const map = new Map<string, Course[]>()
  for (const day of DAY_ORDER) map.set(day, [])

  for (const course of courses) {
    const day = course.day_of_week?.toUpperCase()
    if (day && map.has(day)) {
      map.get(day)!.push(course)
    }
  }

  // Sort each day by start time
  for (const [, dayCourses] of map) {
    dayCourses.sort((a, b) =>
      timeToMinutes(a.start_time ?? '00:00') - timeToMinutes(b.start_time ?? '00:00')
    )
  }

  return map
}
