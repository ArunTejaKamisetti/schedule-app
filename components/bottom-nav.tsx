'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CalendarDays, CalendarRange, Users, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const MOBILE_NAV = [
  { href: '/today', icon: CalendarDays, label: 'Home' },
  { href: '/schedule', icon: CalendarRange, label: 'Schedule' },
  { href: '/courses', icon: BookOpen, label: 'Courses' },
  { href: '/friends', icon: Users, label: 'Friends' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="shrink-0 z-50 bg-card border-t border-border safe-b">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {MOBILE_NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium transition-colors relative',
                active ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
