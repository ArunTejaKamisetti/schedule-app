'use client'

import { cn } from '@/lib/utils'

// Admin-only 1st/2nd year toggle, shared by Today / Schedule / Courses so the control looks and
// behaves identically everywhere. Students never render this (they only see their own year).
export function AdminYearSwitch({ year, onChange, className }: {
  year: 1 | 2
  onChange: (y: 1 | 2) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-1 bg-muted rounded-xl p-1', className)}>
      {([2, 1] as const).map((y) => (
        <button
          key={y}
          onClick={() => onChange(y)}
          className={cn('flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
            year === y ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
        >
          {y === 2 ? '2nd Year' : '1st Year'}
        </button>
      ))}
    </div>
  )
}
