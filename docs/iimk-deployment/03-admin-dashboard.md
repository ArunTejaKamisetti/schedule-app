# Phase 3 — Admin dashboard

New `app/(admin)/admin/**` route group, gated to `role = 'admin'` in `middleware.ts`. Consolidates everything the developer does manually today.

## Schedule source — keep Google Sheets

- The sheet is owned by the **institutional admin Google account**. Admin pastes/stores the Sheet/Drive link, can **preview** (port `app/admin/preview` behind admin auth), and **trigger sync** from the UI (calls existing `/api/sync`, now admin-auth-protected in addition to `CRON_SECRET` for cron).
- Remove the public, unauthenticated `/admin/preview` and `/api/admin/oauth` exposure; **stop rendering the OAuth refresh token into HTML** — store it server-side only.
- A non-developer admin can update the schedule by editing the Google Sheet (no code change), which is why the Sheets pipeline stays.

## Roster upload (auto-fills schedules)

- Admin uploads a CSV/sheet of `email → year/section/electives` → stored in a `roster` table.
- On first sign-in (or on demand), each student is matched by email; `enrollments` + `profiles.section/year` are auto-populated.
- The manual elective picker in `app/(app)/courses/page.tsx` is **hidden** (kept behind an admin/debug flag for fallback). Students just see their schedule.

## Bus & mess — paste from a free chat tool (no API, no per-field typing)

The admin never types data field-by-field. The admin panel shows a ready-to-copy **prompt** and a single **paste box**:

1. The admin has the source as **PDF / Excel / PNG** (whatever the transport / mess office sends).
2. The panel shows a **"Copy prompt"** button. The admin opens any free chat tool (Claude.ai, ChatGPT, Gemini — all have free tiers), pastes the prompt, and attaches the PDF/Excel/PNG.
3. The chat tool returns the data as JSON in the **exact schema the app needs**. The admin **copies it and pastes it into the box**.
4. The app **validates** the pasted JSON (zod), shows a **preview table**, and on confirm **saves** it to the `bus` / `mess` DB tables.

So the admin's only actions are: **copy prompt → paste into chat tool (+attach file) → copy result → paste here → confirm.** Nothing else. No cost, no API key in the app.

- The bundled prompt pins the output schema so the paste always matches: bus rows `{time, min, from, to[], maingate}` (the exact shape `lib/bus.ts` uses today → **next-bus auto-scroll + stop filtering keep working**); mess rows `{day, meal, items[]}`.
- `lib/bus.ts` / `lib/mess.ts` become thin readers of the `bus` / `mess` tables.

> Why this stays free: the AI work happens in the admin's own free chat tool, **outside** the app. The app only parses and stores the text the admin pastes — so there's no API integration and no bill.

## User / role management

Admin can view users, set/revoke admin role (writes `profiles.role` / the `admins` allowlist), and view sync logs.

## Critical files

New `app/(admin)/admin/**`; port of `app/admin/preview`; new `app/api/admin/**` (roster upload, **bus/mess paste → parse → save**, sync trigger, user/role mgmt); a `zod` parser/validator for the pasted JSON; remove unauthenticated `app/api/admin/oauth` exposure + the token-in-HTML callback; `lib/bus.ts`, `lib/mess.ts` → DB-backed; new `bus` / `mess` / `roster` tables.
