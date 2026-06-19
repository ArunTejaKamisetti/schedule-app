import { createServiceClient } from './supabase/server'
import type { User } from './types'

function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Emails (comma-separated in ADMIN_EMAILS) that get the admin role on first sign-in.
function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(email.toLowerCase())
}

export async function getOrCreateUser(userId: string, email?: string | null): Promise<User> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (existing) {
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() }
    if (email && !existing.email) patch.email = email
    await supabase.from('users').update(patch).eq('id', userId)
    return { ...existing, ...patch } as User
  }

  let shareCode = generateShareCode()
  let attempts = 0
  while (attempts < 5) {
    const { data: conflict } = await supabase
      .from('users')
      .select('id')
      .eq('share_code', shareCode)
      .single()
    if (!conflict) break
    shareCode = generateShareCode()
    attempts++
  }

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      email: email ?? null,
      role: isAdminEmail(email) ? 'admin' : 'student',
      share_code: shareCode,
      import_code: generateShareCode(),
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create user: ${error.message}`)
  return newUser as User
}

export async function getUserByShareCode(shareCode: string): Promise<User | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('share_code', shareCode.toUpperCase())
    .single()
  return data as User | null
}

// Private code used only to import/restore a profile on another device.
export async function getUserByImportCode(importCode: string): Promise<User | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('import_code', importCode.toUpperCase())
    .single()
  return data as User | null
}

export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('users').update({ display_name: name }).eq('id', userId)
}

export async function updatePushSubscription(
  userId: string,
  subscription: object | null
): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from('users')
    .update({ push_subscription: subscription })
    .eq('id', userId)
}
