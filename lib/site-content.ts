import { createServiceClient } from './supabase/server'
import type { BusTrip } from './bus'
import type { DayMenu } from './mess'

// Bus/mess are admin-editable (paste-import → `site_content`). These readers return the stored blob
// when present, else EMPTY — there is intentionally no built-in fallback, so a fresh deployment (or a
// fork for another institution) shows an "ask your admin to upload" empty state rather than IIM-K's
// data. The Today UI consumes the same shapes either way.

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
    return { note: (d?.note as string) ?? '', stops: (d?.stops as string[]) ?? [], trips }
  }
  return { note: '', stops: [], trips: [] }
}

export async function getMessContent(): Promise<MessContent> {
  const d = await readBlob('mess').catch(() => null)
  const menu = d?.menu as Record<string, DayMenu> | undefined
  if (menu && Object.keys(menu).length > 0) {
    return { note: (d?.note as string) ?? '', menu }
  }
  return { note: '', menu: {} }
}

export async function saveContent(key: 'bus' | 'mess', data: unknown): Promise<void> {
  const { error } = await createServiceClient()
    .from('site_content')
    .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}
