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

Only these 7 are required (see `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

ALLOWED_EMAIL_DOMAIN=iimk.ac.in
ADMIN_EMAILS=you@iimk.ac.in

CRON_SECRET=some-random-secret-string-here

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

VAPID (push) is optional — add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`
to enable it, or leave them out (push toggle hides, everything else works).

**Google is NOT set via env.** The app's Google OAuth client lives in the `google_integration` DB row
(migration 019) and in Supabase Auth → Google provider; the sheet refresh token is captured at the
admin's one-time sign-in consent. For local dev you *may* drop `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`
into `.env.local` as a fallback (see the commented block in `.env.example`).

## 5. Configure Google + authorize sheets (one-time)

1. In Google Cloud, create a Web OAuth client; redirect `http://localhost:3000/api/admin/oauth/callback` (and the Vercel URL for prod).
2. Put its `client_id`/`client_secret` into the `google_integration` row (Supabase → SQL Editor), e.g.
   `INSERT INTO google_integration (id, client_id, client_secret) VALUES (true, '…', '…') ON CONFLICT (id) DO UPDATE SET client_id = EXCLUDED.client_id, client_secret = EXCLUDED.client_secret;`
   — and the same client into Supabase Auth → Google provider (for login).
3. Run the app (`npm run dev`), sign in with your **college Google account** (the one that can see the sheets). The one-time "read my sheets" consent fires automatically; the refresh token is stored in the DB.

## 6. Paste the term's sheet link + verify

Open `/admin/schedule`, paste the Google Sheet link for each source, then open `/admin/preview` —
you should see the sheet columns and sample rows.

If column names differ from expected, the parser auto-detects them. Check the "parsed_sample" output — if `course_name`, `start_time`, etc. are blank, update the column aliases in `lib/sheets.ts` → `findCol()`.

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

Add the **7 required** env vars in Vercel dashboard (Settings → Environment Variables) — no Google
vars. In the prod Supabase, set the `google_integration` row's `redirect_uri` (or rely on the
`${NEXT_PUBLIC_APP_URL}/api/admin/oauth/callback` default) and add that redirect to the Google OAuth
client. Then sign in once as an admin on the production URL to capture the prod sheet token.

## 9. Sync trigger — ONE poll (simple + reliable)

**Just one thing:** a **cron-job.org job → `/api/sync` every 2 minutes** (POST, header
`Authorization: Bearer YOUR_CRON_SECRET`). That's the whole sync mechanism.

This replaces the previous three overlapping triggers (Apps Script `onChange`, a frequent
cron, and a daily Vercel cron). Polling is *inherently reliable* — it never depends on
`onChange` choosing to fire (the flakiness that let a cancellation sit undetected). A 2-min
worst-case latency is fine for a schedule, and a single mechanism is far easier to reason about.

Is it safe for 500 students? **Yes.** `/api/sync` runs **once per tick, server-side,
regardless of user count** — its cost is the sheet size (~1,700 rows), not the students.
~720 short runs/day.

> Removed: the Apps Script `onChange` trigger (delete it in Apps Script → Triggers) and the
> daily Vercel cron (`vercel.json`). The instant `onChange` path is optional — if you want
> near-instant updates you can keep it, since notifications are DB-deduped (migration 009)
> and can't double-send — but it is **not required** and is no longer the safety net.

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
