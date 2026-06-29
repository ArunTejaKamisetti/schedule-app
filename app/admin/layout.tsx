import type { ReactNode } from 'react'
import { INSTITUTION_SHORT_NAME } from '@/lib/branding'

// Shared chrome for the admin area (/admin/**). The proxy already role-gates these paths to
// admins, so this is just presentation. Light theme, consistent with the roster page.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 20px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{INSTITUTION_SHORT_NAME} Admin</span>
        <nav style={{ display: 'flex', gap: 16, fontSize: 14 }}>
          <a href="/admin" style={{ color: '#4f46e5', textDecoration: 'none' }}>Dashboard</a>
          <a href="/admin/roster" style={{ color: '#4f46e5', textDecoration: 'none' }}>Roster</a>
          <a href="/admin/schedule" style={{ color: '#4f46e5', textDecoration: 'none' }}>Schedule upload</a>
          <a href="/admin/profile" style={{ color: '#4f46e5', textDecoration: 'none' }}>Institution Profile</a>
          <a href="/admin/bus-mess" style={{ color: '#4f46e5', textDecoration: 'none' }}>Bus &amp; Mess</a>
          <a href="/admin/preview" style={{ color: '#4f46e5', textDecoration: 'none' }}>Sheet preview</a>
        </nav>
        <a href="/today" style={{ marginLeft: 'auto', color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← Back to app</a>
      </header>
      {children}
    </div>
  )
}
