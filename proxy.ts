import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16 renamed Middleware to Proxy. This gates the app behind a signed-in
// Supabase session and keeps the auth cookies fresh on every request.
const PUBLIC_PREFIXES = ['/sign-in', '/auth']

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // API routes enforce their own auth and must return JSON, not a redirect.
  // Their session cookies were still refreshed by updateSession above.
  if (pathname.startsWith('/api')) return response

  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/sign-in') {
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
