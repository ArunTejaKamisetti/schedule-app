import { redirect } from 'next/navigation'

// Alerts now live in a panel on Home (bell, top-right) — not a separate page.
export default function NotificationsPage() {
  redirect('/today?alerts=1')
}
