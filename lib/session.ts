'use client'

import { v4 as uuidv4 } from 'uuid'

const SESSION_KEY = 'schedule_app_user_id'
const SESSION_CODE_KEY = 'schedule_app_share_code'

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
  }
}
