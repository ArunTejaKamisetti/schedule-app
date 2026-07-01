# Setup Guide — KampusSchedule (plug & play for any college)

This app is built to be **forked once per college**. Nothing about a specific
institution is hard-coded — the name, email domain, courses, sections, colours,
bus and mess data are all configuration. To stand it up for your campus you only
need to:

1. Create **3 free accounts** (Supabase, Google Cloud, Vercel).
2. Paste **one SQL file** into Supabase (the whole database).
3. Fill in **one `.env.local` file**.
4. Sign in — you're the admin — and load your data from the built-in **Admin** pages.

No paid services. Free tier is enough for ~2,000+ students.

---

## The whole setup at a glance

| # | Step | Where | Time |
|---|------|-------|------|
| 1 | Install Node.js + get the code | your computer | 5 min |
| 2 | Create the database (1 paste) | Supabase | 5 min |
| 3 | Create a Google sign-in client | Google Cloud | 10 min |
| 4 | Turn on Google login | Supabase | 2 min |
| 5 | Fill in `.env.local` | your computer | 5 min |
| 6 | Run it locally | your computer | 1 min |
| 7 | Become admin + load data | the app | 15 min |
| 8 | Deploy to the web | Vercel | 15 min |
| 9 | Turn on auto-sync (cron) | cron-job.org | 5 min |
| 10 | Turn on push notifications | your computer + Vercel | 5 min |
| 11 | Schedule the notification jobs (cron) | cron-job.org | 5 min |

Steps 1–7 get you a fully working app on `localhost`. Steps 8–11 put it online
with live schedule sync and push notifications.

> **Accounts tip:** create **one dedicated Google account** for the project and
> use it to own the Supabase project, the Google Cloud project, and the schedule
> sheet. That keeps a future handover to a college-owned account a simple config
> swap. Use a real `@yourcollege.edu` account only as the **first admin / to test
> login**, not as the owner.

---

## Step 1 — Get the code running

1. Install **Node.js 20+** from https://nodejs.org (LTS).
2. Get this project onto your machine and install dependencies:
   ```bash
   git clone <this-repo-url> schedule-app
   cd schedule-app
   npm install
   ```

That's it for now — we'll run it in Step 6, once it's configured.

---

## Step 2 — Create the database (one paste)

1. Go to https://supabase.com → sign in → **New project** (free tier is fine).
   Pick a strong database password and a region near your campus.
2. Wait ~2 minutes for it to provision.
3. Open **SQL Editor** (left sidebar) → **New query**.
4. Open the file [`supabase/setup.sql`](supabase/setup.sql) from this repo,
   **copy the entire contents**, paste into the query box, and click **Run**.
   - This one file *is* the whole database — every table, security policy, and
     function. It's safe to re-run if you ever need to.
   - ✅ You should see "Success. No rows returned."
5. Now grab your keys: **Project Settings → API**. Copy these three (you'll paste
   them into `.env.local` in Step 5):
   - **Project URL** — e.g. `https://abcd1234.supabase.co`
   - **anon public** key
   - **service_role** key (keep this secret — server-side only)

> Note your project's **reference id** too (the `abcd1234` part of the URL) —
> you'll need it in Step 3.

---

## Step 3 — Create a Google sign-in client

Students log in with their college Google account, and the admin uses the same
Google login to let the app read the schedule Google Sheet.

1. Go to https://console.cloud.google.com → create a **New Project** (name it
   e.g. "KampusSchedule").
2. **APIs & Services → Enabled APIs & services → + Enable APIs and Services**,
   search for and enable:
   - **Google Sheets API** (required — reads the timetable)
   - **Google Calendar API** (only if you want the optional "add to my Google
     Calendar" feature)
3. **APIs & Services → OAuth consent screen**:
   - User type **External** → Create.
   - Fill app name, support email, developer email. Save.
   - (You can leave it in **Testing** mode for now and add your admin emails as
     "Test users". See the [production note](#publish-the-google-app-stops-weekly-logouts)
     before a wide rollout.)
4. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Under **Authorized redirect URIs**, add these (replace the placeholders):

     ```
     https://<YOUR_SUPABASE_REF>.supabase.co/auth/v1/callback
     http://localhost:3000/api/admin/oauth/callback
     https://<YOUR_APP>.vercel.app/api/admin/oauth/callback
     ```

     - The **first** one is for student/admin *login* (Supabase handles it) — use
       your Supabase reference id from Step 2.
     - The **2nd/3rd** are for the admin's one-time *"read my sheets"* authorization
       (localhost for dev, your Vercel URL for production).
     - *(Optional, only if you enabled Calendar API)* also add
       `http://localhost:3000/api/calendar/google/callback` and the `https://…vercel.app`
       equivalent.
   - Click **Create** and copy the **Client ID** and **Client Secret**.

---

## Step 4 — Turn on Google login in Supabase

1. In Supabase: **Authentication → Sign In / Providers → Google** → toggle **Enable**.
2. Paste the **Client ID** and **Client Secret** from Step 3. Save.
   - This page also shows the exact **Callback URL** — confirm it matches the
     first redirect URI you added in Google (the `…supabase.co/auth/v1/callback` one).
3. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` for now (change to your Vercel URL after Step 8).
   - **Redirect URLs**: add both
     ```
     http://localhost:3000/**
     https://<YOUR_APP>.vercel.app/**
     ```

---

## Step 4b — Let the app read your schedule sheet (one-time)

Login is now working, but reading a **private** Google Sheet for the timetable
needs the app to hold your Google client once (so background/cron sync can keep
reading it without you present). Use the **same Client ID and Secret** from Step 3
— no new client, and **no Google keys in env**.

In Supabase → **SQL Editor**, run this once:

```sql
insert into google_integration (id, client_id, client_secret)
values (true, 'YOUR_GOOGLE_CLIENT_ID', 'YOUR_GOOGLE_CLIENT_SECRET')
on conflict (id) do update
  set client_id = excluded.client_id,
      client_secret = excluded.client_secret;
```

That's the only time you touch these values. From here on the admin just **signs in
and pastes the sheet link** — the app reads the sheet through the admin's own Google
login (Step 7b). Nothing else to configure per term.

> The redirect URL is derived automatically from `NEXT_PUBLIC_APP_URL`, so you don't
> set it here — just make sure `…/api/admin/oauth/callback` is in your Google client's
> redirect URIs (Step 3), which it is.

---

## Step 5 — Fill in `.env.local`

Copy the template and edit it:

```bash
cp .env.example .env.local
```

Fill in `.env.local` like this (the app **refuses to start** if any *required*
value is missing, and tells you which):

```env
# ── Supabase (from Step 2) ─────────────────────────────── REQUIRED
NEXT_PUBLIC_SUPABASE_URL=https://<YOUR_SUPABASE_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...            # anon public key
SUPABASE_SERVICE_ROLE_KEY=eyJ...                # service_role key (secret)

# ── Who can sign in / who's admin ──────────────────────── REQUIRED
ALLOWED_EMAIL_DOMAIN=yourcollege.edu            # only this domain may log in
ADMIN_EMAILS=you@yourcollege.edu                # comma-separated; these become admins on first login

# ── App identity (shown in the UI) ─────────────────────── REQUIRED for correct branding
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=yourcollege.edu   # keep IDENTICAL to ALLOWED_EMAIL_DOMAIN above
NEXT_PUBLIC_INSTITUTION_NAME=Your College Name
NEXT_PUBLIC_INSTITUTION_SHORT_NAME=YCN

# ── Misc ───────────────────────────────────────────────── REQUIRED
CRON_SECRET=<paste-a-long-random-string>        # protects the sync + cron endpoints
NEXT_PUBLIC_APP_URL=http://localhost:3000       # change to your Vercel URL after Step 8
```

**No Google keys go in this file.** Sheet access is set up once in the database
(Step 4b) and read through the admin's Google login — see Step 7b.

Notes:

- **`ADMIN_EMAILS`** is how you become admin: the first time an email in this list
  signs in, it's granted the admin role automatically. No database editing needed.
- Generate `CRON_SECRET` any way you like, e.g. `openssl rand -hex 32`.
- **Only the 7 vars marked `REQUIRED` (top group + CRON + APP_URL)** are enforced
  at startup. The `NEXT_PUBLIC_INSTITUTION_*` vars aren't enforced but without
  them the UI shows a neutral "Your Institution / Campus" placeholder — set them.
- **Google is not configured here.** The app reads your sheet through the admin's
  Google login — you seeded the app's Google client into the database in Step 4b, and
  the sheet token is captured at admin sign-in (Step 7b). (A dev-only
  `GOOGLE_CLIENT_ID/SECRET` env fallback exists, but prefer the database row.)
- **Push notifications (VAPID)** are optional but recommended — set them up in
  [Step 10](#step-10--push-notifications-vapid--recommended). Without them the app
  still works; the push toggle just hides.

---

## Step 6 — Run it locally

```bash
npm run dev
```

Open **http://localhost:3000**. You'll be redirected to the sign-in page. Click
**Continue with Google** and log in with an email that is in `ADMIN_EMAILS`.

- ✅ You land on the **Today** page → login + database + branding all work.
- ❌ "Please sign in with your @… account" → the email domain doesn't match
  `ALLOWED_EMAIL_DOMAIN` (that's the gate working).

---

## Step 7 — Become admin & load your data

Because your email is in `ADMIN_EMAILS`, you now have an **Admin** area. Visit
**http://localhost:3000/admin**. Load data in this order:

### 7a. Institution Profile (optional — has sensible defaults)
**Admin → Institution Profile.** This is where a *different* college customises the
schedule vocabulary: the colour → meaning map (e.g. red = cancelled), the course
catalog / areas, the section layout, venue special-cases, and lunch/exam keywords.
Out of the box it uses the built-in defaults, so you can skip this and come back
later — the app works fine unconfigured.

### 7b. Connect Google + load the schedule
**Admin → Schedule:**
1. Click **Authorize Google** and complete the one-time "allow read my sheets"
   consent with the Google account that can see your timetable sheet. The app
   stores the resulting token **server-side in the database** (never in env).
2. **Paste the Google Sheet link** for each source (year/section) into its box.
3. Click **Sync now**. Courses now appear in the app.
   - Use **Admin → Sheet preview** to check the columns parsed correctly.

### 7c. Upload the student roster (this gates access)
**Admin → Roster:** upload your **Year-1** and **Year-2** rosters (`.xlsx`:
email → section / electives).
- The roster is the source of truth for "who is a current student." A signed-in
  non-admin whose email is in **no** roster is blocked from the app.
- **Important:** upload *both* years before relying on the gate. Until both are
  present, everyone in your domain is allowed in (so you don't lock out students
  whose roster isn't uploaded yet). Admins are always allowed regardless of roster.

### 7d. Bus & Mess (optional)
**Admin → Bus & Mess:** click **Copy prompt**, paste it into any free chat tool
(Claude, ChatGPT, Gemini) along with your transport/mess PDF or image, copy the
JSON it returns, paste it into the box, and **Save**. No API, no cost.

---

## Step 8 — Deploy to the web (Vercel)

This puts the app on a public URL. Vercel builds the Next.js app and hosts it free.

### 8.1 — Install the CLI and log in
```bash
npm install -g vercel      # or use `npx vercel` in each command below
vercel login               # opens the browser; sign up/in (GitHub/email both fine)
```

### 8.2 — First deploy (links the project)
From the project folder:
```bash
npx vercel --prod --yes
```
The **first** run creates a new Vercel project linked to this folder. The `--yes`
flag accepts the defaults (new project, root `./`, Next.js auto-detected) so it
doesn't stop to ask. (Run plain `vercel` once if you'd rather answer the prompts
yourself.)

It builds and returns a URL like `https://schedule-app-xxxx.vercel.app`. **Note that
URL** — it's your production address. The first build may fail because env vars aren't
set yet — that's expected; we add them next and redeploy.

### 8.3 — Add environment variables
In the **Vercel dashboard → your project → Settings → Environment Variables**, add
**every variable from your `.env.local`** (the 8 in Step 5), with two changes:
- Set `NEXT_PUBLIC_APP_URL` to your real Vercel URL (from 8.2), **not** localhost.
- Keep `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` = `ALLOWED_EMAIL_DOMAIN` as before.

Set each variable for the **Production** environment (tick Preview/Development too if
you'll use those). No Google keys go here — they're in the database (Step 4b).

> ⚠️ **`NEXT_PUBLIC_*` values are baked in at build time.** They must exist in Vercel
> *before* the build reads them. So after adding them you **must redeploy**:
> ```bash
> npx vercel --prod --yes
> ```

### 8.4 — Point login and Google at the production URL
Update the placeholders you left earlier:
- **Supabase → Authentication → URL Configuration** → set **Site URL** to your Vercel
  URL. Confirm `https://<YOUR_APP>.vercel.app/**` is in **Redirect URLs** (Step 4).
- **Google Cloud → Credentials → your OAuth client** → confirm these redirect URIs
  are present (add any that aren't):
  ```
  https://<YOUR_SUPABASE_REF>.supabase.co/auth/v1/callback
  https://<YOUR_APP>.vercel.app/api/admin/oauth/callback
  ```

### 8.5 — Verify production
1. Open your Vercel URL → you should get the sign-in page.
2. Sign in with an `ADMIN_EMAILS` account → you land on **Today**, and (first time)
   you're sent through the one-time Google sheet consent.
3. Go to **Admin → Schedule → Sync now** → courses load.

> **If production uses a *different* Supabase project than local dev**, re-run
> **Admin → Schedule → Authorize Google** once on production so the sheet token is
> captured in the production database. If it's the same Supabase project, it's already
> there.

---

## Step 9 — Turn on automatic schedule sync (cron)

The app keeps the timetable current by **polling** the sheet on a schedule. This is
the one **required** background job. You'll use https://cron-job.org (free) — any
scheduler that can send an authenticated POST works (GitHub Actions, EasyCron, etc.).

### 9.1 — Create the sync job
1. Sign up at https://cron-job.org → **Create cronjob**.
2. **Title:** `KampusSchedule sync`
3. **URL:** `https://<YOUR_APP>.vercel.app/api/sync`
4. **Schedule:** every **2 minutes** (choose "Every 2 minutes", or a custom pattern).
5. Expand **Advanced / Headers** → add a request header:
   - **Name:** `Authorization`
   - **Value:** `Bearer <YOUR_CRON_SECRET>` — the exact `CRON_SECRET` you set in
     `.env.local` **and** Vercel (they must match).
6. **Request method:** `POST`.
7. Save. Open the job's **history** after a few minutes — you want HTTP **200**
   responses. A **401** means the `Authorization` header/secret is wrong.

### 9.2 — Why this design
- **One poll, not three triggers.** Polling is inherently reliable — it never depends
  on a Google Sheets change-event firing, so a silent cancellation can't sit
  undetected. A ~2-minute worst-case delay is fine for a timetable.
- **Cost is flat.** `/api/sync` runs once per tick server-side (~720 short runs/day),
  reading the sheet regardless of how many students are online — so it scales to
  thousands of students at ₹0.
- **Each source syncs independently** (scoped by `source_key`), so a broken 1st-year
  sheet can't break 2nd-year.
- When the sheet changes (a class cancelled/moved/room-changed), the sync also **fires
  push notifications** to affected students — but only if you've set up VAPID (Step 10).

---

## Step 10 — Push notifications (VAPID) — recommended

Notifications are how students find out a class was **cancelled, rescheduled, or
moved rooms**, plus optional daily/nightly summaries. They're delivered via the Web
Push standard, which needs a free **VAPID** key pair. Without VAPID the app runs fine
but **no push is ever sent** (the send step is skipped and the settings toggle hides),
so the cron jobs in Step 11 would have nothing to deliver.

### 10.1 — Generate a key pair (one time)
```bash
npx web-push generate-vapid-keys
```
It prints a **Public Key** and a **Private Key**.

### 10.2 — Add them to env (local **and** Vercel)
Add these three to `.env.local` and to Vercel → Settings → Environment Variables:
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<the public key>
VAPID_PRIVATE_KEY=<the private key>
VAPID_EMAIL=mailto:you@yourcollege.edu
```
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is a `NEXT_PUBLIC_` build-time var, so after adding it
to Vercel you **must redeploy**:
```bash
npx vercel --prod --yes
```

### 10.3 — How students turn it on
Push is per-device and opt-in:
1. Open the app and, when prompted, **Install** it (PWA) — on iPhone this is
   *Share → Add to Home Screen*, which is **required** for push on iOS.
2. In **Settings → Notifications**, enable push and allow the browser permission.
3. Per-type toggles (cancelled / rescheduled / room / daily summary) live there too.

> **"Class starting soon" reminders are separate and need no server or VAPID** — each
> device schedules them locally ~14 min before a class while the app is open in the
> background. They're a browser feature, not a push send.

---

## Step 11 — Schedule the notification & cleanup jobs (cron)

With VAPID on (Step 10), add these cron-job.org jobs the **same way** as Step 9
(POST + the `Authorization: Bearer <CRON_SECRET>` header) — only the URL and schedule
differ. All are optional but recommended.

| Job | URL (`https://<YOUR_APP>.vercel.app` + path) | When | What it does |
|---|---|---|---|
| Morning summary | `/api/cron/daily-summary` | once daily, ~07:00 | Pushes each student today's classes + any notes. |
| Nightly notes reminder | `/api/cron/reminders` | once daily, ~20:00 | Pushes each student their notes for **tomorrow's** classes. |
| Retention cleanup | `/api/cron/retention` | once weekly | Deletes attendance/notes/notifications older than `RETENTION_DAYS` (default 180) to stay under the free DB limit. |

Notes:
- Every job uses **POST** and the same `Authorization: Bearer <CRON_SECRET>` header —
  reuse the header from Step 9. A wrong/missing header returns **401**.
- **Timezone:** the summary/reminder jobs compute the day boundary in **IST** in the
  code. cron-job.org lets you set the job's timezone, so pick trigger times that land
  in the morning/evening for your campus. If you're far from IST, adjust the date math
  in `app/api/cron/daily-summary/route.ts` and `app/api/cron/reminders/route.ts`.
- To change the retention window, set `RETENTION_DAYS` in Vercel env.

---

## Before you go live

**Publish the Google OAuth app — otherwise sync breaks after ~7 days.** While the
OAuth consent screen is in **Testing** mode, Google expires *every* refresh token
after 7 days — so the stored sheet token dies and sync (and any Calendar connections)
break weekly.

Fix it once: **Google Cloud → APIs & Services → OAuth consent screen → Publish app**
→ confirm. Status becomes **In production** and tokens become long-lived.

- An unverified published app with Sheets/Calendar scopes shows a one-time "Google
  hasn't verified this app" screen (users click **Advanced → Continue**) and is capped
  at **100 connected users**. For a wider rollout, submit for Google verification.
- If your college domain is a **Google Workspace**, you can instead set the OAuth app
  to **Internal** — it auto-restricts to college accounts and skips the warning.

---

## ✅ Done

Share your Vercel URL with students. They sign in with their college Google account
and immediately see their schedule (auto-filled from the roster), plus attendance,
bus, mess, friends, and — with Steps 10–11 — push notifications when classes change.

---

## Optional extras

### Google Calendar write-sync ("Connect Google Calendar")
Lets each student push their classes into their own Google Calendar.
1. Enable **Google Calendar API** (Step 3.2).
2. Add the redirect URI `https://<YOUR_APP>.vercel.app/api/calendar/google/callback`
   to your Google OAuth client.
3. Make sure `NEXT_PUBLIC_APP_URL` is your production URL.

### App icons
Replace `public/icon-192.png` and `public/icon-512.png` with your own PNGs (this is
the icon shown when the app is installed to a home screen). A quick option:
https://favicon.io/favicon-generator/.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App won't start: *"Missing required environment variable(s): …"* | Set the named vars in `.env.local` (Step 5). |
| Redirected to sign-in forever | Google provider not enabled in Supabase (Step 4), or the Supabase callback URL isn't in Google's redirect URIs (Step 3). |
| "Please sign in with your @… account" | The login email's domain ≠ `ALLOWED_EMAIL_DOMAIN`. Expected for non-college accounts. |
| Signed in but no **Admin** menu | Your email isn't in `ADMIN_EMAILS`, or you set it *after* first sign-in — add it and sign out/in. |
| "Google Sheets access is not authorized" on sync | Do **Admin → Schedule → Authorize Google** once (Step 7b). |
| "Google integration is not configured" | Seed the `google_integration` DB row with the client id/secret (Step 4b). |
| Sync worked, then broke ~a week later | Google's **Testing** mode expires tokens after 7 days — publish the OAuth app (see [Before you go live](#before-you-go-live)). |
| Notifications never arrive | VAPID not set (Step 10), or the user hasn't enabled the push toggle / installed the PWA. |
| Students can't get in ("not on the roster") | Upload **both** Year-1 and Year-2 rosters (Step 7c). |
| Branding shows "Your Institution / Campus" | Set the `NEXT_PUBLIC_INSTITUTION_*` vars and (for prod) redeploy so they bake into the build. |

---

## How it fits together (for maintainers)

- **Database:** everything is in [`supabase/setup.sql`](supabase/setup.sql) (the 24
  migrations under `supabase/migrations/` concatenated). Add a new migration file,
  then append it to `setup.sql` so the one-paste install stays complete.
- **Admin role:** derived from `ADMIN_EMAILS` at first sign-in (`lib/user.ts`); the
  database `is_admin()` function reads that role for row-level security.
- **Per-institution config** lives in data, not code: env (`lib/branding.ts`),
  `institution_profile` table (Admin → Institution Profile), `schedule_sources`,
  `roster`, and `site_content` (bus/mess). This is what makes it fork-and-configure.
- **Secrets:** the required set is validated at boot in `lib/env.ts`. The Google
  client **and** sheet token live in the `google_integration` table (migration 019),
  never in env or logs. VAPID keys are the only optional secrets.
- **Scheduled jobs:** all four endpoints (`/api/sync`, `/api/cron/daily-summary`,
  `/api/cron/reminders`, `/api/cron/retention`) authorize on the `CRON_SECRET` bearer
  and are driven by external cron (cron-job.org) — there is no `vercel.json` cron.
  The daily-summary/reminders jobs compute the day boundary in **IST**; a college in
  another timezone should adjust that in the route files.
