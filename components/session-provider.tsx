'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getOrCreateSessionId, setSessionCode, applyRecoveryTokenFromUrl, getCachedUser, setCachedUser } from '@/lib/session'
import type { User } from '@/lib/types'

interface SessionContextValue {
  userId: string
  user: User | null
  shareCode: string
  unreadCount: number
  refreshUnreadCount: () => void
}

const SessionContext = createContext<SessionContextValue>({
  userId: '',
  user: null,
  shareCode: '',
  unreadCount: 0,
  refreshUnreadCount: () => {},
})

export function useSession() {
  return useContext(SessionContext)
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [shareCode, setShareCodeState] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshUnreadCount = useCallback(async () => {
    const id = getOrCreateSessionId()
    if (!id) return
    const res = await fetch(`/api/notifications?userId=${id}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    setUnreadCount(data.filter((n: { read: boolean }) => !n.read).length)
  }, [])

  useEffect(() => {
    // Client-only mount init: the session id, cached user and share code come from the URL /
    // localStorage, which don't exist during SSR. They must be applied after mount (not during
    // render) to avoid a hydration mismatch, so setState-in-effect is correct here by design.
    /* eslint-disable react-hooks/set-state-in-effect */
    // Apply a recovery link (?t=<userId>) before resolving the session id.
    applyRecoveryTokenFromUrl()
    const id = getOrCreateSessionId()
    setUserId(id)

    // Render instantly from the locally cached user record, and only hit /api/user when there's no
    // fresh cache — this used to POST on every single app open just to read the same record back.
    const cached = getCachedUser(id)
    if (cached) {
      setUser(cached)
      setShareCodeState(cached.share_code)
      setSessionCode(cached.share_code)
    } else {
      fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      })
        .then((r) => r.json())
        .then((u: User) => {
          setUser(u)
          setShareCodeState(u.share_code)
          setSessionCode(u.share_code)
          setCachedUser(u)
        })
        .catch(console.error)
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }

    refreshUnreadCount()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refreshUnreadCount])

  return (
    <SessionContext.Provider value={{ userId, user, shareCode, unreadCount, refreshUnreadCount }}>
      {children}
    </SessionContext.Provider>
  )
}
