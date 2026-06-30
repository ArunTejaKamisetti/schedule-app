import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateUser } from '@/lib/user'
import { NotEnrolledError } from '@/lib/access'

// Identity now comes from the authenticated Supabase session (cookie), not a
// client-supplied userId. Returns/creates the app user for the signed-in person.
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const user = await getOrCreateUser(authUser.id, authUser.email ?? null)
    return NextResponse.json(user)
  } catch (err: unknown) {
    // Not on the roster (and not an admin) → 403 with a code the client uses to sign them out.
    if (err instanceof NotEnrolledError) {
      return NextResponse.json({ error: 'not_enrolled', code: 'not_enrolled' }, { status: 403 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
