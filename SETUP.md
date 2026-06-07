# Setup Guide — College Schedule App

## 1. Create a Supabase Project

1. Go to https://supabase.com → New project (free tier)
2. Copy your **Project URL** and **anon key** (Settings → API)
3. Copy the **service_role key** (Settings → API → Project API keys)
4. Run the schema: Supabase dashboard → SQL editor → paste the contents of `supabase/migrations/001_initial_schema.sql` → Run

## 2. Create a Google Cloud Project (for Sheets access)

1. Go to https://console.cloud.google.com → New project
2. Enable **Google Sheets API** (APIs & Services → Enable APIs → search "Sheets")
3. Create OAuth 2.0 credentials (APIs & Services → Credentials → Create → OAuth client ID → Web application)
4. Set Authorized redirect URI to: `http://localhost:3000/api/admin/oauth/callback` (for local) and `https://YOUR_VERCEL_URL/api/admin/oauth/callback` (for production)
5. Copy **Client ID** and **Client Secret**

## 3. Generate VAPID keys (for push notifications)

```bash
npx web-push generate-vapid-keys
```

Copy the public and private keys.

## 4. Fill in .env.local

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/admin/oauth/callback

GOOGLE_SHEET_ID=13-v2m0g3dr3UVo09i3qHLsMqZRyy_6zXf21AtDUtSOQ
GOOGLE_REFRESH_TOKEN=  ← fill after step 5

CRON_SECRET=some-random-secret-string-here

NEXT_PUBLIC_VAPID_PUBLIC_KEY=BF...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:your@email.com

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 5. Get the Google Refresh Token (one-time)

1. Run the app locally: `npm run dev`
2. Open http://localhost:3000/api/admin/oauth
3. Sign in with your **college Google account** (the one that can see the sheet)
4. Copy the refresh token shown on the success page
5. Paste it into `.env.local` as `GOOGLE_REFRESH_TOKEN`

## 6. Verify sheet access

Open http://localhost:3000/admin/preview — you should see your sheet columns and sample rows.

If column names are different from expected, the parser auto-detects them. Check the "parsed_sample" output — if `course_name`, `start_time`, etc. are blank, update the column aliases in `lib/sheets.ts` → `findCol()`.

## 7. Run first sync

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Courses will now appear in the app's Course Picker.

## 8. Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Add all env vars in Vercel dashboard (Settings → Environment Variables).

**Update GOOGLE_REDIRECT_URI** to use your Vercel URL:
```
https://YOUR_APP.vercel.app/api/admin/oauth/callback
```

Re-run the OAuth flow on the production URL to get a production refresh token.

## 9. Set up 15-minute cron (cron-job.org)

1. Go to https://cron-job.org → Create cronjob
2. URL: `https://YOUR_APP.vercel.app/api/sync`
3. Method: POST
4. Add header: `Authorization: Bearer YOUR_CRON_SECRET`
5. Schedule: Every 15 minutes

> The `vercel.json` includes a daily Vercel cron as a fallback, but cron-job.org gives you the 15-minute interval for free.

## 10. Add app icons

Replace `public/icon-192.png` and `public/icon-512.png` with your actual app icons (PNG).

A simple way: use https://favicon.io/favicon-generator/ — set background indigo (#6366f1), text "S", download and resize.

## 11. Share with friends

Send them: `https://YOUR_APP.vercel.app`

No sign-in required. They open the app, pick their electives, and their share code appears in Settings → Share Code.
