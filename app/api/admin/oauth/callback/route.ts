import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireAdmin } from '@/lib/admin'

export async function GET(req: NextRequest) {
  // Admin only — this callback exchanges an auth code for the institutional sheet token.
  // Without this gate ANYONE hitting the URL with a code could mint and read a refresh token.
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const code = req.nextUrl.searchParams.get('code')
  const errorParam = req.nextUrl.searchParams.get('error')
  const errorDesc = req.nextUrl.searchParams.get('error_description')
  if (!code) {
    // Don't echo req.url back — it can carry the auth `code`/secrets in the query string.
    const html = `<!DOCTYPE html><html><body style="font-family:monospace;background:#0f0f0f;color:#f00;padding:40px">
      <h2>❌ OAuth Error</h2>
      <p><b>Google error:</b> ${errorParam ?? 'none'}</p>
      <p><b>Description:</b> ${errorDesc ?? 'none'}</p>
    </body></html>`
    return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const { tokens } = await oauth2Client.getToken(code)

  // NEVER render the refresh token into the page (it would land in browser history, proxies,
  // screenshots). Write it to the SERVER log only — the admin copies it from the deploy logs
  // (Vercel → Logs, or the local terminal) into the GOOGLE_REFRESH_TOKEN env var.
  const gotToken = Boolean(tokens.refresh_token)
  if (gotToken) {
    console.log('[admin/oauth] GOOGLE_REFRESH_TOKEN (copy into env, then revoke this log):', tokens.refresh_token)
  } else {
    console.warn('[admin/oauth] No refresh_token returned — re-run the consent flow with prompt=consent.')
  }

  const html = `
<!DOCTYPE html>
<html>
<head><title>OAuth Setup</title>
<style>body{font-family:monospace;max-width:700px;margin:40px auto;padding:20px;background:#0f0f0f;color:#0f0;}</style>
</head>
<body>
<h2>${gotToken ? '✅ Google OAuth Success' : '⚠️ No refresh token returned'}</h2>
${gotToken
  ? `<p>The refresh token was written to the <strong>server logs</strong> (Vercel → Logs, or your local terminal). Copy it from there into the <strong>GOOGLE_REFRESH_TOKEN</strong> environment variable — it is intentionally <em>not</em> shown here.</p>
<p style="color:#ff0">⚠️ Treat it as a secret: store it in env vars only, then clear the log line.</p>`
  : `<p>Google did not return a refresh token. Re-run the connect flow forcing consent (<code>prompt=consent&access_type=offline</code>).</p>`}
<p><a href="/admin/preview" style="color:#0ff">→ Preview Sheet Data</a></p>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
