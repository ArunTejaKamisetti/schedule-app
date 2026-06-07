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
