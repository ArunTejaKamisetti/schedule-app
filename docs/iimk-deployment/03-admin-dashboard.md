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

---

## Status / progress — roster upload DONE

Roster-driven enrollment is built and is now *the* enrollment mechanism (students no longer self-pick). Confirmed shape with Arun: **two separate `.xlsx` uploads** (not one CSV).

- **`roster` table + `apply_roster_to_user(uid, email)` RPC** → `supabase/migrations/015_roster.sql`. One row per email; `apply` sets year/section (year-1) or replaces `enrollments` with the elective codes (year-2). RLS: admin/service only.
- **Parser** `lib/roster-parse.ts` (pure, 10 tests): tolerant — locates the email column by content, works with/without a header row, and for year-2 accepts either one comma-separated electives column or several code columns. Year-2 codes **must match the schedule sheet codes** (e.g. `GT-A`, `FC (FIN)`).
- **Upload route** `POST /api/admin/roster` (multipart `type=year1|year2`, `file`): reads the `.xlsx` with **exceljs**, stores the roster, and applies it to already-signed-in students. **Admin-gated** via new `lib/admin.ts#requireAdmin` (reads the signed-in user from the cookie client — can't be spoofed by a body param).
- **Apply on sign-in** `lib/user.ts#getOrCreateUser` → `lib/roster.ts#applyRosterOnSignIn`, so upload-before-signin and signin-before-upload both auto-fill. Emails are normalized (lowercased) on user creation so matching is reliable.
- **Admin UI** `app/admin/roster/page.tsx` — two file inputs with a result summary.
- **Picker hidden** behind `ROSTER_MANAGED` in `app/(app)/courses/page.tsx`: no Edit button, no first-time picker, the 1st-year section chooser is read-only.

### Known gaps (follow-ups)
- **`/admin/**` page gating:** the proxy only requires *auth*, not the *admin role* — the page is reachable by any signed-in user (the API route is the real boundary, returns 403). Add admin-role gating in the proxy (Phase 5). Same applies to the still-unauthenticated `/api/admin/preview`, `/api/admin/oauth`, and the `CRON_SECRET`-only `/api/sync` — port them onto `requireAdmin`.
- **exceljs advisory:** exceljs pulls a transitive old `uuid` (npm audit: 1 high). Low real-world risk here (admin-only, trusted institutional input, server-side, uuid not used security-sensitively). `npm audit fix` would *downgrade* exceljs — don't. If we want it gone, pin via a package.json `overrides` for `uuid`, or swap to a minimal reader.

### Apply order (Supabase SQL Editor)
After `013`/`014`: run `015_roster.sql`. Then upload the two rosters at `/admin/roster` while signed in as an `ADMIN_EMAILS` account.
