import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateUser } from '@/lib/user'

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'iimk.ac.in').toLowerCase()

// Google → Supabase → here. Exchanges the OAuth code for a session, enforces the
// college email domain server-side, then ensures the app user row exists.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/today'

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=auth`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const email = (user?.email ?? '').toLowerCase()

  // Domain gate — defense beyond the Google `hd` hint (which is spoofable).
  if (!user || !email.endsWith('@' + ALLOWED_DOMAIN)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/sign-in?error=domain`)
  }

  await getOrCreateUser(user.id, email)
  return NextResponse.redirect(`${origin}${next}`)
}
