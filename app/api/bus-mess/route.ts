import { NextResponse } from 'next/server'
import { getBusContent, getMessContent } from '@/lib/site-content'

// GET /api/bus-mess — the bus schedule + mess menu for the Today page. Shared and changes rarely,
// so it's edge-cached (same egress reasoning as /api/courses). Falls back to the built-in
// constants when no admin upload exists.
export async function GET() {
  const [bus, mess] = await Promise.all([getBusContent(), getMessContent()])
  return NextResponse.json(
    { bus, mess },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } }
  )
}
