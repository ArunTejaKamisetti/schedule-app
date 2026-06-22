'use client'

import { SWRConfig } from 'swr'
import { SWR_DEFAULTS } from '@/lib/hooks'

// Global SWR defaults for the app shell: one shared `fetcher`, no refetch-on-focus (the single
// biggest source of redundant serverless calls), and a 60s dedup window so rapid navigation
// between tabs reuses in-flight/cached data instead of refetching.
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={SWR_DEFAULTS}>{children}</SWRConfig>
}
