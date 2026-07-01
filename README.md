# KampusSchedule

KampusSchedule is a web app for a college's students to track classes, attendance,
transport, mess, and friends' schedules in one place. It's built to be **forked once
per college** — the name, email domain, courses, sections, and colours are all
configuration, so standing it up for a new campus is setup, not a rewrite.

## Availability

- Hosted on Vercel (free tier) and shared via a single URL.
- Students sign in with their college Google account; the roster auto-fills their
  schedule. Non-college accounts are rejected.
- Runs at ₹0 for ~2,000+ students on free tiers.

## Key Features

- Daily and weekly class schedule view
- Course picker with synced course data
- Attendance and notes tracking
- Friends schedule comparison
- Push notifications for schedule changes
- Optional Google Calendar sync

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Supabase (data/storage)
- Google Sheets API (course source sync)
- VAPID Web Push notifications

## Quick start

Full, step-by-step instructions (accounts, database, Google login, deploy) are in
**[SETUP.md](SETUP.md)** — the plug-and-play guide for a new college. In short:

1. `npm install`
2. Create a Supabase project and run **[`supabase/setup.sql`](supabase/setup.sql)**
   (the entire database, one paste).
3. Create a Google OAuth client and enable Google login in Supabase.
4. `cp .env.example .env.local` and fill it in.
5. `npm run dev` → open `http://localhost:3000` and sign in (an `ADMIN_EMAILS`
   account becomes admin automatically).
6. Deploy with `npx vercel --prod --yes` and set the same env vars in Vercel.

## Setup Docs

- **[SETUP.md](SETUP.md)** — complete plug-and-play setup for a new deployment.
- `docs/iimk-deployment/` — the design/decision record behind the architecture.
