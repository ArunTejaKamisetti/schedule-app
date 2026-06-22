import { google } from 'googleapis'
import { createServiceClient } from './supabase/server'

// Google integration config lives in the DB (`google_integration`, migration 019), not env — so the
// app's OAuth client (set once at handover) and the admin's stored sheet refresh token (captured at
// the admin's one-time Google authorization) drive sheet reads for both on-demand and cron sync,
// with NO Google vars in the deploy env.
//
// Env is still consulted as a FALLBACK so an existing `.env.local` (dev) keeps working without a DB
// row, and so the first authorization can bootstrap before the row exists.

export interface GoogleConfig {
  clientId?: string
  clientSecret?: string
  redirectUri: string
  refreshToken?: string
  authorizedEmail?: string
}

type Row = {
  client_id: string | null
  client_secret: string | null
  redirect_uri: string | null
  sheet_refresh_token: string | null
  authorized_email: string | null
}

function defaultRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
  return `${base}/api/admin/oauth/callback`
}

// Read the merged Google config (DB row wins; env fills any gap). Never throws — callers decide
// what's required (the connect flow needs client id/secret; reading a sheet also needs the token).
export async function getGoogleConfig(): Promise<GoogleConfig> {
  let row: Row | null = null
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('google_integration')
      .select('client_id, client_secret, redirect_uri, sheet_refresh_token, authorized_email')
      .eq('id', true)
      .maybeSingle()
    row = (data as Row) ?? null
  } catch {
    // No DB / table yet — fall back to env entirely.
  }
  return {
    clientId: row?.client_id || process.env.GOOGLE_CLIENT_ID || undefined,
    clientSecret: row?.client_secret || process.env.GOOGLE_CLIENT_SECRET || undefined,
    redirectUri: row?.redirect_uri || process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri(),
    refreshToken: row?.sheet_refresh_token || process.env.GOOGLE_REFRESH_TOKEN || undefined,
    authorizedEmail: row?.authorized_email || undefined,
  }
}

// An OAuth2 client configured to MINT the consent URL / exchange a code (no credentials set yet).
// Throws a clear error if the app's Google client isn't configured anywhere.
export async function getOAuthClient() {
  const cfg = await getGoogleConfig()
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error(
      'Google integration is not configured — set client_id/client_secret in the google_integration row (or GOOGLE_CLIENT_ID/SECRET in dev).'
    )
  }
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri)
}

// An OAuth2 client ready to READ sheets (refresh token set; googleapis auto-refreshes access
// tokens). Throws if Google isn't configured OR no admin has authorized sheet access yet.
export async function getSheetsOAuthClient() {
  const cfg = await getGoogleConfig()
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error(
      'Google integration is not configured — set client_id/client_secret in the google_integration row.'
    )
  }
  if (!cfg.refreshToken) {
    throw new Error('Google Sheets access is not authorized — an admin must connect Google once (Admin → Schedule → Authorize Google).')
  }
  const client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri)
  client.setCredentials({ refresh_token: cfg.refreshToken })
  return client
}

// Whether an admin has authorized sheet access (used to gate the auto-redirect and the UI status).
export async function isSheetAuthorized(): Promise<boolean> {
  const cfg = await getGoogleConfig()
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken)
}

// Persist the refresh token captured at the admin's one-time consent (upsert the singleton row).
export async function storeSheetRefreshToken(refreshToken: string, email: string | null): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('google_integration')
    .upsert(
      { id: true, sheet_refresh_token: refreshToken, authorized_email: email, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )
  if (error) throw new Error(`Failed to store Google refresh token: ${error.message}`)
}
