# Phase 3 — Admin dashboard

New `app/(admin)/admin/**` route group, gated to `role = 'admin'` in `middleware.ts`. Consolidates everything the developer does manually today.

## Schedule source — paste a Google Sheet link per term

**The schedule sheet is a brand-new sheet EVERY term (Y1 and Y2).** So the source id is NOT in env/code — the admin pastes each term's link and the app reads it via the admin's own Google login:

- **One-time per admin:** sign in with Google → a single "allow read my sheets" consent (auto-triggered at sign-in for admins who haven't done it). The refresh token is stored **server-side in `google_integration`** (migration 019) — never in env, never rendered to HTML/logs.
- **Per term:** Admin → Schedule → paste the new Google Sheet link for each source → **Sync now** (calls `/api/sync`, admin-auth or `CRON_SECRET`). The pasted id is stored in `schedule_sources`; `resolveSheetSources` merges it onto the registry. Tab names are auto-detected, so a renamed term tab needs no change.
- The app's Google OAuth client (`client_id/secret/redirect`) lives once in the `google_integration` row (seeded at handover) — **no Google vars in Vercel.** The sheet must be viewable by the authorizing admin's Google account.
- `.xlsx` upload remains as an offline fallback. `/api/admin/oauth` + `/admin/preview` are admin-gated.

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

---

## Status / progress — roster upload DONE

Roster-driven enrollment is built and is now *the* enrollment mechanism (students no longer self-pick). Confirmed shape with Arun: **two separate `.xlsx` uploads** (not one CSV).

- **`roster` table + `apply_roster_to_user(uid, email)` RPC** → `supabase/migrations/015_roster.sql`. One row per email; `apply` sets year/section (year-1) or replaces `enrollments` with the elective codes (year-2). RLS: admin/service only.
- **Parser** `lib/roster-parse.ts` (pure, 10 tests): tolerant — locates the email column by content, works with/without a header row, and for year-2 accepts either one comma-separated electives column or several code columns. Year-2 codes **must match the schedule sheet codes** (e.g. `GT-A`, `FC (FIN)`).
- **Upload route** `POST /api/admin/roster` (multipart `type=year1|year2`, `file`): reads the `.xlsx` with **exceljs**, stores the roster, and applies it to already-signed-in students. **Admin-gated** via new `lib/admin.ts#requireAdmin` (reads the signed-in user from the cookie client — can't be spoofed by a body param).
- **Apply on sign-in** `lib/user.ts#getOrCreateUser` → `lib/roster.ts#applyRosterOnSignIn`, so upload-before-signin and signin-before-upload both auto-fill. Emails are normalized (lowercased) on user creation so matching is reliable.
- **Admin UI** `app/admin/roster/page.tsx` — two file inputs with a result summary.
- **Picker hidden** behind `ROSTER_MANAGED` in `app/(app)/courses/page.tsx`: no Edit button, no first-time picker, the 1st-year section chooser is read-only.

### Admin access hardening — DONE
- **`/admin/**` pages role-gated in the proxy:** a signed-in non-admin is bounced to `/today` (pure `authRouteAction(path, isAuthed, isAdmin)` + `isAdminPath`, unit-tested; proxy computes `isAdmin` from `ADMIN_EMAILS`).
- **Admin API routes now require an admin session** via `lib/admin.ts#requireAdmin`: `/api/admin/roster`, `/api/admin/preview`, `/api/admin/oauth`, `/api/admin/oauth/callback`. The OAuth callback was **unauthenticated and rendered the refresh token into HTML** (anyone with a code could mint/read one) — now admin-only, and it no longer echoes `req.url` (which can carry the auth code) on error.
- **`/api/sync`** accepts the `CRON_SECRET` bearer (cron) **or** an admin session (UI/browser trigger).

### Bus & Mess — DONE (paste-import, shapes preserved)
- **`site_content` table** (`migration 016`): one JSONB row per key (`bus` / `mess`), RLS admin-write / authenticated-read.
- **Shapes kept exactly** (`BusTrip {time,min,from,to[],maingate}`, mess `DayMenu`/`Meal`) — `lib/bus.ts`/`lib/mess.ts` stay as the **built-in fallback**, so the Today UI is byte-identical with or without an upload.
- **Admin UI** `app/admin/bus-mess/page.tsx`: a **Copy prompt** button (the prompt pins the exact JSON schema) + a paste box per source; `POST /api/admin/bus-mess` validates with the pure, unit-tested `parseBusPayload`/`parseMessPayload` (10 tests; auto-derives `min` from the time when omitted) and saves. Admin-gated.
- **Read path** `GET /api/bus-mess` (edge-cached `s-maxage=600`); the Today page fetches it with the constants as the default (no loading flash) via a shared `useBusMess()` hook.

### Admin dashboard — DONE
- **`/admin` dashboard home** (`app/admin/page.tsx`) + shared nav (`app/admin/layout.tsx`, links Dashboard / Roster / Sheet preview). Shows row counts (courses sessions, students, enrollments, roster), the **latest sync per source** (status / time / +~− counts), and a **Sync now** button (POSTs `/api/sync` via the admin session). Backed by `GET /api/admin/status` (admin-gated) with a pure, unit-tested `latestSyncPerSource` helper.
- Still to wire into the dashboard later: user/role management, and the bus/mess paste-import (next roadmap item).

### Known gaps (follow-ups)
- **Refresh token still shown to the admin in HTML** on the OAuth callback (now admin-only, so no longer a public leak). Full fix per spec: store the institutional token **server-side** (DB) and have `lib/sheets.ts` read it from there instead of `process.env.GOOGLE_REFRESH_TOKEN`.
- **exceljs advisory:** exceljs pulls a transitive old `uuid` (npm audit: 1 high). Low real-world risk here (admin-only, trusted institutional input, server-side, uuid not used security-sensitively). `npm audit fix` would *downgrade* exceljs — don't. If we want it gone, pin via a package.json `overrides` for `uuid`, or swap to a minimal reader.

### Apply order (Supabase SQL Editor)
After `013`/`014`: run `015_roster.sql`. Then upload the two rosters at `/admin/roster` while signed in as an `ADMIN_EMAILS` account.
