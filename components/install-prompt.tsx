'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BIPEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Android/Chrome "Add to Home screen" prompt. Fires `beforeinstallprompt`, which we
// capture and surface as a friendly banner. (iOS doesn't fire it — handled via Settings.)
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Already installed (standalone) or dismissed before → don't nag.
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem('install_dismissed') === '1') return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BIPEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setShow(false))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!show || !deferred) return null

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setShow(false)
  }
  function dismiss() {
    localStorage.setItem('install_dismissed', '1')
    setShow(false)
  }

  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 p-3">
      <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
        <Download size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Install KampusSchedule</p>
        <p className="text-xs text-muted-foreground">Add to your home screen for instant access + alerts.</p>
      </div>
      <button onClick={install} className="shrink-0 text-xs font-semibold text-white bg-indigo-600 px-3 py-1.5 rounded-lg">Install</button>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted-foreground p-1"><X size={16} /></button>
    </div>
  )
}
