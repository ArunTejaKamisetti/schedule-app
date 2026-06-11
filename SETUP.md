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

## 9. Sync triggers — frequent cron + instant onChange (recommended)

Run **both**:
1. **cron-job.org → `/api/sync`, every 2–3 minutes** (POST, header `Authorization: Bearer
   YOUR_CRON_SECRET`). This is the reliable backbone: it guarantees every sheet edit
   (cancellation/addition/move) is picked up within a couple of minutes even if `onChange`
   doesn't fire.
2. **Apps Script `onChange` trigger** (section 13) for near-instant updates on top.

Why both, and is it safe at scale? **Yes.** `/api/sync` runs once per tick **server-side,
regardless of how many students use the app** — its cost is the sheet size (~1,700 rows),
not the user count. Notifications are DB-deduped (migration 009), so the cron and `onChange`
overlapping can never double-send. A 2–3 min cron is ~500–700 runs/day, each a few seconds.

> Earlier guidance said to drop the frequent cron in favour of `onChange` alone — **don't**:
> if `onChange` fails to fire, a cancellation can sit undetected until the daily cron. The
> 2–3 min cron is the safety net that prevents that.

## 10. Add app icons

Replace `public/icon-192.png` and `public/icon-512.png` with your actual app icons (PNG).

A simple way: use https://favicon.io/favicon-generator/ — set background indigo (#6366f1), text "S", download and resize.

## 11. Share with friends

Send them: `https://YOUR_APP.vercel.app`

No sign-in required. They open the app, pick their electives, and their share code appears in Settings → Share Code.

---

## 12. Apply the overhaul migration

Run `supabase/migrations/003_overhaul.sql` in the Supabase SQL editor. It adds:
- `courses.is_common` / `courses.event_kind` (common events like mid-terms shown to everyone)
- `users.notify_cancelled / notify_rescheduled / notify_room / notify_daily_summary` (per-type notification toggles)
- `user_calendar_tokens` + `calendar_event_map` (per-user Google Calendar write-sync)

## 13. Instant sync on sheet changes (Apps Script onChange trigger)

Colour changes (red = cancelled, green = added) don't fire `onEdit` — you need `onChange`.
This makes any change (including cell colour/strikethrough) reach the app in seconds instead of waiting up to 15 minutes.

1. In the schedule sheet: **Extensions → Apps Script**, paste:
   ```javascript
   function syncOnChange() {
     UrlFetchApp.fetch('https://YOUR_APP.vercel.app/api/sync', {
       method: 'post',
       headers: { 'Authorization': 'Bearer YOUR_CRON_SECRET' },
       muteHttpExceptions: true
     });
   }
   ```
2. **Triggers** (clock icon) → **Add Trigger** → function `syncOnChange`, event source **From spreadsheet**, event type **On change**.
3. Authorize with the Google account that owns the sheet.

> `onChange` fires for value AND formatting changes (colour, strikethrough, rows/cols). `onEdit` would miss the colour-based cancellations.

## 14. Daily morning summary (optional cron)

Add a second cron-job.org job for the "Daily morning summary" notification:
- URL: `https://YOUR_APP.vercel.app/api/cron/daily-summary`
- Method: POST, header `Authorization: Bearer YOUR_CRON_SECRET`
- Schedule: once daily, ~07:00 IST (01:30 UTC)

## 14b. "Class starting soon" reminders (no cron needed)

These are **device-local** and need no server job: while the app is open, each user's browser
schedules a local notification ~14 min before their classes. Opt-out is a toggle in
Settings → Notifications. (Trade-off: fires only while the app is open in the background.)

## 15. Google Calendar write-sync (the "Connect Google Calendar" button)

The Calendar sync feature writes events straight into a user's Google Calendar.

1. In Google Cloud Console → **Enable APIs** → enable **Google Calendar API**.
2. Add the calendar callback to your OAuth client's Authorized redirect URIs:
   ```
   https://YOUR_APP.vercel.app/api/calendar/google/callback
   ```
3. Set `NEXT_PUBLIC_APP_URL=https://YOUR_APP.vercel.app` in your env (used to build the redirect).

## 16. Publish the OAuth app to production (stops 7-day token expiry)

**Critical for reliability.** In **Testing** publishing status, Google expires *every* refresh token after 7 days — including the Sheets sync token (`GOOGLE_REFRESH_TOKEN`), so the 15-min sync breaks weekly, and every user's Google Calendar connection drops weekly.

Fix it once:
1. Google Cloud Console → **APIs & Services → OAuth consent screen**.
2. Under **Publishing status**, click **Publish app** → confirm. Status becomes **In production**.
3. Refresh tokens are now long-lived (no 7-day expiry).

> Unverified production apps with sensitive scopes (Sheets, Calendar) show a one-time "Google hasn't verified this app" screen (users click **Advanced → Continue**) and are capped at **100 connected users**. For wider rollout, submit for Google verification. The webcal/.ics subscription needs none of this.

> **Reminder:** also add the calendar callback to **OAuth client → Authorized redirect URIs**:
> ```
> https://YOUR_APP.vercel.app/api/calendar/google/callback
> ```
> Without it, "Connect Google Calendar" errors out.
