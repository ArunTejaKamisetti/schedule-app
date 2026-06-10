# KampusSchedule

KampusSchedule is a public web app for IIM-K students to track classes, attendance, transport, and friends' schedules in one place.

## Public Availability

- The app is intended to be publicly accessible over the web.
- Students can open it directly and start using core features without mandatory sign-in.
- Host it on your own domain or on Vercel to share it with your campus.

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

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` from `.env.example` and fill required values.
3. Run the app:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`.

## Deployment

Deploy on Vercel:

```bash
npm run build
vercel --prod
```

Set all environment variables in your host (see `.env.example` and `SETUP.md`).

## Setup Docs

For full production setup (Supabase schema, Google OAuth, sync cron, and push notifications), see:

- `SETUP.md`
