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

export async function getOrCreateUser(userId: string): Promise<User> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (existing) {
    await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId)
    return existing as User
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
    .insert({ id: userId, share_code: shareCode })
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
