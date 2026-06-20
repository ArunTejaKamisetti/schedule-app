import { createServiceClient } from './supabase/server'
import { BUS, BUS_NOTE, BUS_STOPS, type BusTrip } from './bus'
import { MESS, MESS_NOTE, type DayMenu } from './mess'

// Bus/mess are admin-editable (paste-import → `site_content`). These readers return the stored
// blob when present, else the built-in constants — so the app always has data even before any
// admin upload, and the Today UI consumes the SAME shapes either way.

export interface BusContent { note: string; stops: string[]; trips: BusTrip[] }
export interface MessContent { note: string; menu: Record<string, DayMenu> }

async function readBlob(key: 'bus' | 'mess'): Promise<Record<string, unknown> | null> {
  const { data } = await createServiceClient().from('site_content').select('data').eq('key', key).maybeSingle()
  return (data?.data as Record<string, unknown> | undefined) ?? null
}

export async function getBusContent(): Promise<BusContent> {
  const d = await readBlob('bus').catch(() => null)
  const trips = d?.trips as BusTrip[] | undefined
  if (trips && trips.length > 0) {
    return { note: (d?.note as string) ?? BUS_NOTE, stops: (d?.stops as string[]) ?? BUS_STOPS, trips }
  }
  return { note: BUS_NOTE, stops: BUS_STOPS, trips: BUS }
}

export async function getMessContent(): Promise<MessContent> {
  const d = await readBlob('mess').catch(() => null)
  const menu = d?.menu as Record<string, DayMenu> | undefined
  if (menu && Object.keys(menu).length > 0) {
    return { note: (d?.note as string) ?? MESS_NOTE, menu }
  }
  return { note: MESS_NOTE, menu: MESS }
}

export async function saveContent(key: 'bus' | 'mess', data: unknown): Promise<void> {
  const { error } = await createServiceClient()
    .from('site_content')
    .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}
