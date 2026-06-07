export interface Course {
  id: string
  course_code: string
  course_name: string
  instructor: string | null
  day_of_week: string | null
  start_time: string | null
  end_time: string | null
  room: string | null
  credits: string | null
  sheet_tab: string
  sheet_row_index: number | null
  is_cancelled: boolean
  last_synced_at: string
}

export interface User {
  id: string
  share_code: string
  display_name: string | null
  push_subscription: PushSubscriptionJSON | null
  notify_push: boolean
  created_at: string
  last_seen_at: string
}

export interface UserCourse {
  user_id: string
  course_id: string
  added_at: string
  course?: Course
}

export interface Friendship {
  id: string
  user_id: string
  friend_id: string
  status: 'pending' | 'accepted'
  created_at: string
  friend?: User
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  type: 'cancelled' | 'rescheduled' | 'room_change' | 'added' | 'removed'
  course_id: string | null
  read: boolean
  created_at: string
  course?: Course
}

export interface SyncLog {
  id: string
  synced_at: string
  status: 'success' | 'error'
  rows_added: number
  rows_modified: number
  rows_removed: number
  error_message: string | null
  raw_snapshot: RawSheetData | null
}

export interface RawSheetData {
  sheet1: string[][]
  sheet2: string[][]
  fetched_at: string
}

export interface CourseChange {
  type: 'added' | 'removed' | 'cancelled' | 'rescheduled' | 'room_change'
  old?: Partial<Course>
  new?: Partial<Course>
  course_code: string
  course_name: string
}

export interface ScheduleClash {
  type: 'time_overlap' | 'same_course'
  myCourse: Course
  friendCourse: Course
  day: string
  timeRange: string
}

export interface PushSubscriptionJSON {
  endpoint: string
  expirationTime: number | null
  keys: {
    p256dh: string
    auth: string
  }
}
