'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ALLOWED_EMAIL_DOMAIN, INSTITUTION_SHORT_NAME } from '@/lib/branding'

const ERRORS: Record<string, string> = {
  domain: `Please sign in with your @${ALLOWED_EMAIL_DOMAIN} college account.`,
  not_enrolled: 'Your account isn’t on the current student roster. If you think this is a mistake, contact your admin.',
  auth: 'Sign-in failed. Please try again.',
  missing_code: 'Sign-in was interrupted. Please try again.',
}

export default function SignInPage() {
  const [loading, setLoading] = useState(false)
  const errorCode =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('error')
      : null
  const errorMsg = errorCode ? (ERRORS[errorCode] ?? 'Something went wrong.') : null

  async function signIn() {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // `hd` nudges Google to the college domain; the server re-checks it.
        queryParams: { hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' },
      },
    })
    if (error) setLoading(false)
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-background text-foreground">
      <div className="w-full max-w-sm text-center space-y-6">
        <div>
          <h1 className="text-2xl font-bold">KampusSchedule</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your {INSTITUTION_SHORT_NAME} schedule, mess, bus, attendance &amp; friends — in one place.
          </p>
        </div>

        {errorMsg && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
            {errorMsg}
          </p>
        )}

        <button
          onClick={signIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 h-12 rounded-xl border border-border bg-card font-medium shadow-sm hover:bg-muted disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <p className="text-xs text-muted-foreground">
          Sign in with your <b>@{ALLOWED_EMAIL_DOMAIN}</b> account.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  )
}
