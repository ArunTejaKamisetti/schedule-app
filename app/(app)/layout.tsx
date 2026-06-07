import { SessionProvider } from '@/components/session-provider'
import { BottomNav } from '@/components/bottom-nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-full pb-20">
        {children}
      </div>
      <BottomNav />
    </SessionProvider>
  )
}
