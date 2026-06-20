// Runs once when a server instance boots (Next `register` hook). We validate the full required
// env set in the Node.js runtime only — the Edge runtime (proxy/middleware) neither has nor needs
// the server-only secrets (service-role key, Google refresh token, CRON_SECRET).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertServerEnv } = await import('./lib/env')
    assertServerEnv()
  }
}
