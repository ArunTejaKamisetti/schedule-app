'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CalendarDays, Users, Bell, Settings } from 'lucide-react'
import { useSession } from './session-provider'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', icon: BookOpen, label: 'Courses' },
  { href: '/today', icon: CalendarDays, label: 'Today' },
  { href: '/schedule', icon: CalendarDays, label: 'Schedule', hideOnMobile: true },
  { href: '/friends', icon: Users, label: 'Friends' },
  { href: '/notifications', icon: Bell, label: 'Alerts' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

const MOBILE_NAV = [
  { href: '/courses', icon: BookOpen, label: 'Courses' },
  { href: '/today', icon: CalendarDays, label: 'Today' },
  { href: '/friends', icon: Users, label: 'Friends' },
  { href: '/notifications', icon: Bell, label: 'Alerts' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const pathname = usePathname()
  const { unreadCount } = useSession()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-b">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {MOBILE_NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const isAlerts = href === '/notifications'
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors relative',
                active ? 'text-indigo-600' : 'text-gray-500'
              )}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                {isAlerts && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
