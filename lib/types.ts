export interface Course {
  id: string
  course_code: string
  course_name: string
  instructor: string | null
  day_of_week: string | null
  session_date: string | null   // ISO date (YYYY-MM-DD) from the sheet — source of truth
  start_time: string | null
  end_time: string | null
  room: string | null
  credits: string | null
  area: string | null
  sheet_tab: string
  sheet_row_index: number | null
  year?: number | null          // 1 or 2 (defaults to 2 in the DB)
  source_key?: string | null    // which sheet this row came from ('y2', 'y1-AH', …)
  is_cancelled: boolean
  is_common: boolean
  event_kind: 'class' | 'exam' | 'common' | 'event'
  change_kind: string | null
  change_note: string | null
  last_changed_at: string | null
  last_synced_at: string
}

export interface User {
  id: string
  email?: string | null         // college email (from Supabase Auth)
  role?: 'student' | 'admin'    // access level
  share_code: string
  import_code?: string
  display_name: string | null
  year?: number | null         // 1 or 2 (null = unset → 2nd-year electives)
  section?: string | null      // 1st-year section (A–H/LSM/FIN)
  push_subscription: PushSubscriptionJSON | null
  notify_push: boolean
  notify_cancelled?: boolean
  notify_rescheduled?: boolean
  notify_room?: boolean
  notify_daily_summary?: boolean
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
  type: 'cancelled' | 'rescheduled' | 'room_change' | 'added' | 'removed' | 'schedule_update' | 'class_reminder'
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

export interface CellFormat {
  bgColor: string | null   // hex e.g. "#ff0000"; null = white/default
  strikethrough: boolean
}

// A merged cell region (0-based, end-exclusive) — used to span grouped events across dates.
export interface SheetMerge {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}

export interface RawSheetData {
  sheet1: string[][]
  sheet2: string[][]
  sheet1_format?: CellFormat[][]
  merges?: SheetMerge[]
  layout?: 'division' | 'section'   // how to parse the section header (per source)
  year?: 1 | 2
  fetched_at: string
}

export interface CourseChange {
  type: 'added' | 'removed' | 'cancelled' | 'rescheduled' | 'room_change' | 'schedule_update'
  old?: Partial<Course>
  new?: Partial<Course>
  course_code: string
  course_name: string
  note?: string
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
