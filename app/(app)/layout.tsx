import { SessionProvider } from '@/components/session-provider'
import { BottomNav } from '@/components/bottom-nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // App-shell: viewport-height column with the nav in normal flow at the bottom.
  // Each page scrolls inside its own flex-1 area, so a page's sticky header never
  // overlaps the list and content always clears the nav.
  return (
    <SessionProvider>
      <div className="h-dvh flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0">{children}</div>
        <BottomNav />
      </div>
    </SessionProvider>
  )
}
