import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserSessions } from '@/lib/enrollment'
import { busySlots } from '@/lib/free-time'
import { getAuthedSession, unauthorized } from '@/lib/api-auth'
import type { Course } from '@/lib/types'

// Free Time Analysis data for the popup: You + every accepted friend, each as a compact
// `busyByDate` map (the canonical slots they're busy in, per date). The client intersects any
// selected subset locally, so toggling friends never needs a refetch. The signed-in user is the
// pivot; only THEIR accepted friends are analysed, so no cross-user leak is possible.
//   GET /api/friends/free-time
//   → { dates: string[], people: [{ id, name, busyByDate: { [iso]: string[] } }] }  (people[0] = You)
export async function GET() {
  const session = await getAuthedSession()
  if (!session) return unauthorized()
  const userId = session.userId
  const supabase = createServiceClient()

  // Accepted friends → the set of people to analyse (You first).
  const { data: fr } = await supabase
    .from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted')
  const friendRows = (fr ?? []) as { friend_id: string }[]
  const friendIds = [...new Set(friendRows.map((r) => r.friend_id))]
  const allIds = [userId, ...friendIds]

  // Names + year (year selects which common events block each person).
  const { data: usersData } = await supabase
    .from('users').select('id, display_name, year').in('id', allIds)
  const users = (usersData ?? []) as { id: string; display_name: string | null; year: number | null }[]
  const userMap = new Map(users.map((u) => [u.id, u] as const))

  // All common events once; attach each person's by their year.
  const { data: commonAll } = await supabase.from('courses').select('*').eq('is_common', true)
  const commons = (commonAll ?? []) as Course[]

  // Each person's live sessions in parallel.
  const sessionsById = new Map<string, Course[]>()
  await Promise.all(allIds.map(async (id) => { sessionsById.set(id, await getUserSessions(supabase, id)) }))

  const dates = new Set<string>()
  const people = allIds.map((id) => {
    const u = userMap.get(id)
    const year = u?.year === 1 ? 1 : 2
    const own = sessionsById.get(id) ?? []
    const mine = [...own, ...commons.filter((c) => (c.year ?? 2) === year)]

    const byDate = new Map<string, Course[]>()
    for (const s of mine) {
      if (!s.session_date) continue
      dates.add(s.session_date)
      if (!byDate.has(s.session_date)) byDate.set(s.session_date, [])
      byDate.get(s.session_date)!.push(s)
    }
    const busyByDate: Record<string, string[]> = {}
    for (const [d, sess] of byDate) {
      const set = busySlots(sess)
      if (set.size) busyByDate[d] = [...set]
    }
    return { id, name: id === userId ? 'You' : (u?.display_name || 'Anonymous'), busyByDate }
  })

  return NextResponse.json({ dates: [...dates].sort(), people })
}
