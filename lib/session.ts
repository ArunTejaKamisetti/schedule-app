'use client'

import { v4 as uuidv4 } from 'uuid'
import type { User } from './types'

const SESSION_KEY = 'schedule_app_user_id'
const SESSION_CODE_KEY = 'schedule_app_share_code'
const USER_CACHE_KEY = 'schedule_app_user'
const USER_TTL_MS = 6 * 60 * 60 * 1000 // re-register/refresh the user record at most every 6h

// The user record (share_code, year, name) changes rarely, but /api/user was POSTed on every app
// open just to read it back. Cache it locally so returning users render instantly AND skip that
// round trip until the cache ages out. `clearCachedUser()` is called after a course pick (which can
// flip `year` server-side) so it never goes stale in a way the UI depends on.
export function getCachedUser(id: string): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    if (!raw) return null
    const { user, at } = JSON.parse(raw) as { user: User; at: number }
    if (!user || user.id !== id || Date.now() - at > USER_TTL_MS) return null
    return user
  } catch { return null }
}

export function setCachedUser(user: User) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ user, at: Date.now() })) } catch {}
}

export function clearCachedUser() {
  if (typeof window !== 'undefined') localStorage.removeItem(USER_CACHE_KEY)
}

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = uuidv4()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_KEY)
}

export function setSessionId(id: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, id)
  }
}

// Recovery link support: ?t=<userId> restores identity on a new device.
// Returns true if a token was applied (and strips it from the URL).
export function applyRecoveryTokenFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const token = params.get('t')
  if (!token) return false
  localStorage.setItem(SESSION_KEY, token)
  params.delete('t')
  const qs = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
  return true
}

export function setSessionCode(code: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_CODE_KEY, code)
  }
}

export function getSessionCode(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_CODE_KEY)
}

export function importSession(userId: string, shareCode: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, userId)
    localStorage.setItem(SESSION_CODE_KEY, shareCode)
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_CODE_KEY)
    localStorage.removeItem(USER_CACHE_KEY)
  }
}
