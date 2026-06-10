import { describe, it, expect } from 'vitest'
import { compareSchedules, groupCoursesByDay } from '@/lib/clashes'
import { makeCourse } from './helpers'

describe('compareSchedules — friends comparison', () => {
  it('flags an identical course as a common course, not a clash', () => {
    const mine = [makeCourse({ id: 'a', course_code: 'GT-A', day_of_week: 'TUE', start_time: '09:15', end_time: '10:30' })]
    const theirs = [makeCourse({ id: 'b', course_code: 'GT-A', day_of_week: 'TUE', start_time: '09:15', end_time: '10:30' })]
    const r = compareSchedules(mine, theirs)
    expect(r.commonCourses).toHaveLength(1)
    expect(r.clashes).toHaveLength(0)
    expect(r.myUniqueCount).toBe(0)
    expect(r.friendUniqueCount).toBe(0)
  })

  it('flags different courses overlapping in time on the same day as a clash', () => {
    const mine = [makeCourse({ id: 'a', course_code: 'GT-A', day_of_week: 'TUE', start_time: '09:15', end_time: '10:30' })]
    const theirs = [makeCourse({ id: 'b', course_code: 'CB', day_of_week: 'TUE', start_time: '10:00', end_time: '11:30' })]
    const r = compareSchedules(mine, theirs)
    expect(r.clashes).toHaveLength(1)
    expect(r.clashes[0].type).toBe('time_overlap')
    expect(r.clashes[0].day).toBe('TUE')
  })

  it('does not clash across different days', () => {
    const mine = [makeCourse({ id: 'a', course_code: 'GT-A', day_of_week: 'TUE', start_time: '09:15', end_time: '10:30' })]
    const theirs = [makeCourse({ id: 'b', course_code: 'CB', day_of_week: 'WED', start_time: '09:15', end_time: '10:30' })]
    const r = compareSchedules(mine, theirs)
    expect(r.clashes).toHaveLength(0)
    expect(r.myUniqueCount).toBe(1)
    expect(r.friendUniqueCount).toBe(1)
  })

  it('does not clash when times are adjacent but non-overlapping', () => {
    const mine = [makeCourse({ id: 'a', course_code: 'GT-A', day_of_week: 'TUE', start_time: '09:15', end_time: '10:30' })]
    const theirs = [makeCourse({ id: 'b', course_code: 'CB', day_of_week: 'TUE', start_time: '10:30', end_time: '11:45' })]
    expect(compareSchedules(mine, theirs).clashes).toHaveLength(0)
  })
})

describe('groupCoursesByDay', () => {
  it('buckets by weekday and sorts each day by start time', () => {
    const courses = [
      makeCourse({ id: '1', day_of_week: 'TUE', start_time: '14:30' }),
      makeCourse({ id: '2', day_of_week: 'TUE', start_time: '09:15' }),
      makeCourse({ id: '3', day_of_week: 'MON', start_time: '12:15' }),
    ]
    const byDay = groupCoursesByDay(courses)
    expect(byDay.get('TUE')!.map((c) => c.start_time)).toEqual(['09:15', '14:30'])
    expect(byDay.get('MON')!.map((c) => c.id)).toEqual(['3'])
    expect(byDay.get('WED')).toEqual([])
  })
})
