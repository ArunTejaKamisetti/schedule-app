import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const errorParam = req.nextUrl.searchParams.get('error')
  const errorDesc = req.nextUrl.searchParams.get('error_description')
  if (!code) {
    const html = `<!DOCTYPE html><html><body style="font-family:monospace;background:#0f0f0f;color:#f00;padding:40px">
      <h2>❌ OAuth Error</h2>
      <p><b>Google error:</b> ${errorParam ?? 'none'}</p>
      <p><b>Description:</b> ${errorDesc ?? 'none'}</p>
      <p><b>Full callback URL:</b><br><code style="word-break:break-all;color:#ff0">${req.url}</code></p>
    </body></html>`
    return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const { tokens } = await oauth2Client.getToken(code)

  const html = `
<!DOCTYPE html>
<html>
<head><title>OAuth Setup</title>
<style>body{font-family:monospace;max-width:700px;margin:40px auto;padding:20px;background:#0f0f0f;color:#0f0;}</style>
</head>
<body>
<h2>✅ Google OAuth Success</h2>
<p>Copy this refresh token and add it to your Vercel environment variables as <strong>GOOGLE_REFRESH_TOKEN</strong>:</p>
<textarea readonly rows="4" style="width:100%;background:#1a1a1a;color:#0f0;border:1px solid #0f0;padding:10px;font-size:12px;">${tokens.refresh_token ?? 'No refresh token — re-run with prompt=consent'}</textarea>
<p style="color:#ff0">⚠️ Keep this token secret. Add it to Vercel env vars, not to your code.</p>
<p>Access token (expires): <code>${tokens.access_token?.substring(0, 30)}...</code></p>
<p><a href="/admin/preview" style="color:#0ff">→ Preview Sheet Data</a></p>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
