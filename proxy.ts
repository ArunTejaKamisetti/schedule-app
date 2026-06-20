import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { authRouteAction } from '@/lib/auth'

// Next.js 16 renamed Middleware to Proxy. This gates the app behind a signed-in
// Supabase session and keeps the auth cookies fresh on every request. The
// allow/redirect decision is the pure `authRouteAction` (unit-tested).
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const action = authRouteAction(request.nextUrl.pathname, !!user)

  if (action === 'to-sign-in') {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  if (action === 'to-home') {
    const url = request.nextUrl.clone()
    url.pathname = '/today'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Run on everything except static assets and the PWA shell files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
