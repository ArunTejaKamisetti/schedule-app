'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { User } from '@/lib/types'

interface SessionContextValue {
  userId: string
  user: User | null
  shareCode: string
  role: 'student' | 'admin' | null
  unreadCount: number
  refreshUnreadCount: () => void
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue>({
  userId: '',
  user: null,
  shareCode: '',
  role: null,
  unreadCount: 0,
  refreshUnreadCount: () => {},
  signOut: async () => {},
})

export function useSession() {
  return useContext(SessionContext)
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [shareCode, setShareCode] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const userIdRef = useRef('')

  const refreshUnreadCount = useCallback(async () => {
    const id = userIdRef.current
    if (!id) return
    const res = await fetch(`/api/notifications?userId=${id}`)
    if (!res.ok) return
    const data = await res.json()
    setUnreadCount(data.filter((n: { read: boolean }) => !n.read).length)
  }, [])

  useEffect(() => {
    // Identity comes from the authenticated Supabase session (set by the
    // /auth/callback route). The API derives the user from that session cookie.
    fetch('/api/user', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: User | null) => {
        if (!u) return
        setUser(u)
        setUserId(u.id)
        userIdRef.current = u.id
        setShareCode(u.share_code)
        refreshUnreadCount()
      })
      .catch(console.error)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }
  }, [refreshUnreadCount])

  const signOut = useCallback(async () => {
    try {
      await fetch('/auth/signout', { method: 'POST' })
    } finally {
      window.location.assign('/sign-in')
    }
  }, [])

  return (
    <SessionContext.Provider
      value={{
        userId,
        user,
        shareCode,
        role: (user?.role as 'student' | 'admin') ?? null,
        unreadCount,
        refreshUnreadCount,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}
