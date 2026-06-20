import { NextResponse } from 'next/server'
import { createClient } from './supabase/server'

// Server-side identity for API routes. The signed-in user is resolved from the Supabase session
// COOKIE — the ONLY trusted source of identity. API routes must NEVER read a `userId` from the
// request body/query: that was the old impersonation hole (any client could pass any id). The
// returned `supabase` is the cookie-aware RLS client, so queries run AS the signed-in user and
// migration-014 row-level security enforces ownership at the database as a second layer.

export type RlsClient = Awaited<ReturnType<typeof createClient>>

export interface AuthedSession {
  supabase: RlsClient
  userId: string
  email: string | null
}

// Resolve the authenticated session, or null if the caller isn't signed in.
export async function getAuthedSession(): Promise<AuthedSession | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id, email: user.email ?? null }
}

// Standard 401 for unauthenticated API access.
export function unauthorized() {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
}
