# KampusSchedule — Architecture (HLD + LLD)

> Branch: `localdev` (the plug-and-play, admin-configurable build). This document describes the
> system as it actually behaves in code, for a college-wide rollout (~2,400 students at IIM-K).
> For the rollout rationale and phase history see [`iimk-deployment/`](./iimk-deployment/).

---

# Part 1 — High-Level Design (HLD)

## 1.1 What it is

A mobile-first **PWA** that gives every student one place for their **class schedule, attendance,
reminder notes, mess menu, bus timings, friends, schedule-comparison and free-time analysis**. The
timetable is pulled from the institution's **Google Sheets** and kept in sync automatically; every
student sees a personalised view driven by an admin-uploaded **roster** (no self-service picking in
the rollout build).

It is **single-tenant** (one institution), **₹0 to run** at this scale (Supabase free tier + Vercel),
and **plug-and-play**: an admin configures everything at runtime (Google authorization, per-term
sheet links, rosters, bus/mess) with **no code changes and no secrets in code**.

## 1.2 Actors

| Actor | How they're identified | What they can do |
|------|------------------------|------------------|
| **Student (2nd year)** | `@iimk.ac.in` Google sign-in → `users.role = 'student'`, `year = 2` | Full app — their **electives'** sessions, attendance, notes, friends, compare, calendar |
| **Student (1st year)** | same, `year = 1`, `section` set from roster | **Same full app** — their courses are their whole **section** timetable instead of picked electives; every feature (attendance tracker, friends, compare, …) works identically |
| **Admin** | email in `ADMIN_EMAILS` → `users.role = 'admin'` | Everything a student can, **plus** the `/admin` console + the year switch to browse either catalog; treated as enrolled in *all* courses |
| **Cron** | `Authorization: Bearer CRON_SECRET` | Trigger sync / reminders / daily-summary / retention |
| **External calendar app** | unguessable `userId` UUID in an `.ics` URL | Read-only subscription feed (the one documented cookieless exception) |

## 1.3 System context

```
                         ┌─────────────────────────────────────────────┐
                         │                Vercel (bom1)                 │
   Browser PWA  ◄──────► │  Next.js 16 App Router (React 19)            │
   (installable,         │   • Proxy (middleware): auth gate + cookies  │
    service worker)      │   • RSC pages + Route Handlers (API)         │
                         │   • instrumentation.ts: env fail-fast        │
                         └───┬───────────────┬──────────────┬───────────┘
                             │               │              │
              cookie-aware   │  service-role │              │ googleapis
              RLS client     │  client       │              │ (OAuth)
                             ▼               ▼              ▼
                    ┌──────────────────────────┐   ┌──────────────────┐
                    │        Supabase          │   │   Google APIs    │
                    │  • Postgres + RLS        │   │  • Sheets (read) │
                    │  • Auth (Google OAuth)   │   │  • Calendar (rw) │
                    │  • RPCs (SECURITY DEF.)  │   └──────────────────┘
                    └──────────────────────────┘
   Web Push (VAPID) ◄── server ──┐         ▲
   cron-job.org ──── Bearer ─────┘─────────┘ (POST /api/sync, /api/cron/*)
```

## 1.4 Tech stack

- **Next.js 16.2** (App Router, Turbopack, RSC) + **React 19** + **TypeScript** (strict; build now
  type-checks — `ignoreBuildErrors` removed).
- **Supabase**: Postgres (data + RLS), Auth (Google OAuth, domain-restricted), SQL RPCs.
- **Tailwind v4** + a small **shadcn/base-ui** component layer; `next-themes` for dark mode; `sonner` toasts; `lucide-react` icons.
- **SWR** for the client data layer (one shared, deduped cache).
- **googleapis** (Sheets read + per-user Calendar write), **ical-generator** (.ics feed), **web-push** (VAPID), **exceljs** (admin roster `.xlsx` upload).
- **Vitest** + an in-process **pglite** harness that runs the real SQL migrations for DB/RLS/RPC tests.

## 1.5 Key architectural decisions

1. **Mandatory, domain-restricted identity.** Every page/route is gated behind a Supabase Google
   session; the `@iimk.ac.in` domain is re-checked **server-side** (the Google `hd` hint is
   spoofable). Identity is **always** the session cookie — API routes never trust a client `userId`.
2. **Two Supabase clients, deliberately.**
   - **Cookie-aware RLS client** (`createClient`) for a user's *own* data — runs as `auth.uid()`, so
     migration-014 **Row-Level Security** enforces ownership at the database as a second layer.
   - **Service-role client** (`createServiceClient`) for sync / cron / admin / cross-user reads
     (friend schedules) — bypasses RLS by design, with authorization enforced in code.
3. **Normalized, code-keyed enrollment.** `enrollments` stores **one row per (user, course_code)**
   (not per session — a ~10× row reduction). Sessions are resolved live **by course code**, so
   classes added/moved in the sheet after a pick still belong to the user.
4. **Date-based schedule (not weekly recurrence).** `courses.session_date` (ISO `YYYY-MM-DD`) is the
   source of truth; every sheet session is its own dated row. All time math is **IST (UTC+5:30)**.
5. **Egress-first cost control.** The expensive thing at 2,400 users is everyone reading the *same*
   schedule. Shared reads (`/api/courses*`, `/api/bus-mess`) are **edge-cached** (`s-maxage` +
   `stale-while-revalidate`) and **browser-cached** (`max-age`); per-user reads are never cached.
6. **Runtime configuration, no hardcoded data.** Google client + token, per-term sheet links, rosters
   and bus/mess all live in the **DB** (set via the admin console), so a new term/institution needs
   no code or env change. Env carries only infra secrets (Supabase, `CRON_SECRET`, optional VAPID).
7. **One ingest path for every sync.** Manual "Sync now" and the scheduled cron funnel through the
   same `ingestSheetData` (diff → upsert/reconcile → highlight/clear → snapshot → notify). The
   schedule is read **only** from the admin-pasted Google Sheet link — there is no `.xlsx` schedule
   upload (it was removed; the online sheet is the single source of truth). Rosters still upload as
   `.xlsx`.

## 1.6 The three core data flows

**(A) Sync / ingest** (admin "Sync now" or cron):
```
Google Sheet ──fetch(values+formatting+merges)──► RawSheetData
   ──diff vs last snapshot (per source_key)──► added / removed / moved / cancelled / updated / reverted
   ──upsert into `courses` (+ enrich from Course Details) ──► reconcile stale rows
   ──write 3-day change highlights, clear reverted + aged-out ones──► save snapshot to `sync_log`
   ──notify affected users (push + alert rows) ──► sync connected Google Calendars
```

**(B) Personalised read** (Today / Schedule / Courses):
```
SWR hook ──GET /api/courses/user (session) ──► user_sessions(uid) RPC
   (1st-yr: whole section · 2nd-yr: picks by code · admin: everything)
   + GET /api/courses?... (shared, edge-cached: catalog / common events / date window)
```

**(C) Notification:** sheet change → `notifyAffectedUsers` resolves recipients (2nd-yr by enrolled
code, 1st-yr by section), writes deduped `notifications` rows, sends one batched Web Push per user.
Two daily crons additionally push tomorrow's reminder notes and a morning class summary.

## 1.7 Runtime / deployment

- One Next.js app on **Vercel**, region **bom1** (Mumbai, close to users and the Supabase project).
- **Proxy (middleware)** runs on every non-asset request: refreshes the Supabase session cookie and
  applies the allow/redirect decision.
- **instrumentation.ts** validates the required env set **once at server boot** (Node runtime only) —
  a misconfigured deploy fails fast with a clear message instead of a 500 mid-request.
- **Scheduling is external** (e.g. cron-job.org) hitting `POST /api/sync` and `/api/cron/*` with the
  `CRON_SECRET` bearer. There is no `vercel.json` cron block; only `regions` is pinned.

---

# Part 2 — Low-Level Design (LLD)

## 2.1 Repository map

```
app/
  (app)/                 Authenticated student shell (bottom-nav pages)
    today/  schedule/  courses/  friends/[compare]/  settings/  notifications/
    layout.tsx           SessionProvider → SwrProvider → BottomNav
  admin/                 Admin console (role-gated by proxy); plain inline-styled pages
    page · roster · schedule · bus-mess · preview
  api/                   Route Handlers (see §2.4)
  auth/callback · auth/signout · sign-in/    Auth entry/exit
  layout.tsx · globals.css · icon*/manifest  App shell + PWA assets
proxy.ts                 Next 16 "middleware": session refresh + route gate
instrumentation.ts       Boot-time env validation
lib/                     All business logic (pure where possible → unit-tested)
components/              Client UI (session/swr providers, nav, panels, dialogs, ui/*)
supabase/migrations/     001–019 SQL (schema, normalize, RLS, RPCs, roster, google)
tests/                   Vitest unit + pglite DB/RLS/RPC integration tests
docs/                    This file + iimk-deployment/ spec
```

## 2.2 Identity & authorization (the security spine)

| Concern | Implementation |
|--------|----------------|
| Sign-in | `app/sign-in` → Supabase Google OAuth (`hd=iimk.ac.in`, `prompt=select_account`) |
| Callback | `app/auth/callback` exchanges code, **re-checks `emailDomainAllowed` server-side**, `getOrCreateUser`, applies roster, one-time admin Google-authorize redirect |
| Route gate | `proxy.ts` → `authRouteAction(path, isAuthed, isAdmin)` (pure, unit-tested): public `/sign-in` `/auth`; APIs self-enforce; `/admin/**` pages require admin role |
| Own-data API identity | `getAuthedSession()` (`lib/api-auth.ts`) → `{ supabase: RLS client, userId, email }` from the **cookie**; client `userId` is ignored (cache-key only) |
| Admin API gate | `requireAdmin()` (`lib/admin.ts`) → signed-in email ∈ `ADMIN_EMAILS` (or `null`) |
| DB enforcement | Migration **014 RLS**: `users` self/admin; reference data read-by-authenticated, write-by-admin; user-owned tables `auth.uid() = user_id`; `friendships` readable by either endpoint |
| Cross-user reads | Friend compare / free-time use the **service client** but take the caller from the session and **verify an accepted friendship** before returning the other person's schedule |
| Removed impersonation vectors | `?t=<userId>` recovery gone; `/api/user/resolve` returns **410**; import-code device transfer removed; `.ics` `userId` is the one documented capability-token exception |

**Two-client rule (most important invariant):** if a route reads/writes the caller's *own* rows, it
must use the cookie-aware client from `getAuthedSession()`. If it must touch *other* users' rows
(friends) or run privileged jobs (sync/cron/admin), it uses the service client **and** enforces
authorization in code.

## 2.3 Data model (Postgres)

Core tables (see `supabase/migrations/` for exact DDL; `bootstrap_dev_schema.sql` for a fresh dev DB):

- **`users`** `id = auth.uid()`, `email`, `role` (`student|admin`), `share_code` (public, for friends),
  `display_name`, `year` (1|2, null⇒2), `section` (1st-yr), `push_subscription`, notify prefs.
- **`courses`** — **one row per session**: `id`, `course_code`, `course_name`, `instructor`, `day_of_week`,
  `session_date`, `start_time`, `end_time`, `room`, `credits`, `sheet_tab`, `year`,
  `source_key`, `is_cancelled`, `is_common`, `event_kind` (`class|exam|common|event`),
  `change_kind`/`change_note`/`last_changed_at` (3-day highlight, cleared on revert/age-out), `last_synced_at`.
  Unique key `(course_code, sheet_tab, session_date, start_time)`. *(The `area` column still exists in
  the DB but is vestigial — no longer written or read; course grouping by area was removed.)*
- **`enrollments`** — `(user_id, course_code, year)`, PK `(user_id, course_code)`. The normalized pick.
- **`attendance`** `(user_id, course_id, status, marked_at)`, PK `(user_id, course_id)`.
- **`notes`** `(user_id, course_id, session_date, body)`, PK `(user_id, course_id)`.
- **`notifications`** `(user_id, title, body, type, course_id, read, dedup_key, created_at)` —
  partial unique `(user_id, dedup_key) where dedup_key is not null` (migration 009).
- **`friendships`** `(user_id, friend_id, status)` — stored **both directions**, always `accepted`
  (no request/accept flow; `status` is vestigial).
- **`sync_log`** `(source_key, status, rows_*, raw_snapshot jsonb, synced_at)` — the per-source diff baseline.
- **`roster`** `(email, year, section, codes[])` — admin source of truth for who's a current student.
- **`site_content`** `(key 'bus'|'mess', data jsonb)` — admin paste-import.
- **`schedule_sources`** `(source_key, sheet_id, sheet_url, updated_*)` — admin-pasted per-term links.
- **`google_integration`** singleton `(client_id, client_secret, redirect_uri, sheet_refresh_token, authorized_email)` — runtime Google config, no env needed.
- **`user_calendar_tokens`** / **`calendar_event_map`** — per-user Google Calendar OAuth tokens + `course_id → gcal_event_id`.
- *(dormant)* `user_courses` — legacy per-session enrollment, kept for rollback.

### RLS model (migration 014)
- `is_admin()` is `SECURITY DEFINER` (avoids policy recursion when read inside a `users` policy).
- Reference data (`courses`, `sync_log` read=admin) readable by any authenticated user; writes admin/service only.
- All user-owned tables: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
- A friend's schedule is **never** exposed by reading their rows — only via the gated compare/free-time routes.

### Key RPCs (single round-trip; dodge PostgREST's 1000-row cap)
- **`user_sessions(uid)`** (migrations 010→013→**017**): returns `SETOF courses` — *admin* ⇒ all
  non-common sessions; *1st-yr* ⇒ whole `section` timetable; *2nd-yr/unset* ⇒ sessions whose
  `course_code ∈ enrollments`, year-2. Branches are mutually exclusive and year-scoped.
- **`course_catalog()` / `course_catalog(year)`** — one representative row per `course_code`.
- **`pick_course` / `unpick_course`** — write/delete one `enrollments` row by code.
- **`replace_roster_year(year, rows)`** — authoritative per-year REPLACE; **`apply_roster_to_user`** —
  set a user's year/section/enrollments from their roster row; **`prune_departed_students`** /
  **`departed_students`** view — roster-authoritative cleanup (guarded against an empty-roster wipe).

## 2.4 API surface (`app/api/**`)

| Route | Auth | Purpose |
|------|------|---------|
| `POST /api/user` | session | get-or-create the signed-in app user |
| `GET/POST /api/courses/user` | session (RLS) | GET = your live sessions (`user_sessions`); POST = add/remove a course (`pick/unpick` + bg Calendar sync) |
| `GET /api/courses` | none (**edge-cached**) | shared reads: `catalog` / `common` events / `year1sections` / `tab` / date window |
| `GET/POST /api/attendance` · `/api/notes` | session (RLS) | per-user marks / notes |
| `GET/PATCH/DELETE /api/notifications` | session (RLS) | alert list / mark-read / delete |
| `GET/POST/DELETE /api/friends` | session (service + authz) | list / add-by-share-code (mutual) / remove (both directions) |
| `GET /api/friends/compare` | session + **friendship check** | both schedules for the date-compare view |
| `GET /api/friends/free-time` | session | You + accepted friends, compact `busyByDate` |
| `GET /api/bus-mess` | none (**edge-cached**) | bus + mess (DB blob, else **empty** → "ask your admin to upload" state; no built-in default) |
| `GET /api/source-sheet` | session | the user's year's **admin-pasted** sheet URL (now via `resolveSheetSources`) |
| `GET /api/calendar?userId=` | capability token | `.ics` subscription feed (cookieless exception) |
| `/api/calendar/google/{connect,callback,status,disconnect}` | session | per-user Google Calendar OAuth + sync |
| `POST /api/push/subscribe` · `PATCH /api/user/prefs` | session (RLS) | push subscription / notify prefs (display name is auto-set from email; year/section come from the roster) |
| `POST/GET /api/sync` | `CRON_SECRET` **or** admin | run the sheet sync for every configured source |
| `POST /api/cron/{reminders,daily-summary,retention}` | `CRON_SECRET` | tomorrow's notes / morning summary / DPDP purge |
| `/api/admin/*` | `requireAdmin()` | status · roster · schedule(+source) · bus-mess · reconcile · oauth(+callback) |
| `GET /api/user/resolve` | — | **410 Gone** (removed impersonation vector) |

## 2.5 Sync & diff engine (`lib/sheets.ts`, `lib/diff.ts`, `lib/sync-core.ts`)

1. **Fetch** (`fetchBothSheetTabsWithFormatting`): pulls the *Schedule* and *Course Details* tabs with
   per-cell **background colour + strikethrough** and the schedule tab's **merge ranges**. Tab names
   auto-detect by regex (survives per-term renames).
2. **Parse** (`parseSheetRows`): a **matrix parser** for the grid (section columns × dated rows; date
   fill-forward across merged cells; events/exams detected by amber colour or keywords, expanded over
   their merge span) and a **flat-list parser** for Course Details. Two layouts: `division` (2nd-yr,
   section header `D1/E2`, code = room) and `section` (1st-yr, header `Sec A`, room = cell above).
3. **Classify colour** (`classifyColor`): relative channel dominance, not absolute thresholds, so
   pastel highlights still register. Red/strikethrough ⇒ cancelled, green ⇒ added, amber ⇒ event.
4. **Diff** (`diffSheetData`): compares old↔new **by slot** `session_date::start_time::sheet_tab`
   (reading colour from the **exact** parsed cell, never the wrong column). Emits
   added / removed / cancelled / reinstated / in-place-update / **moved** (a remove+add of the same
   course matched on date, preferring same-section⇒time-change then same-time⇒room-change) and
   **reverted** (a coordinator's green "added" mark removed → the badge should be cleared, no notification).
5. **Ingest** (`ingestSheetData`): enrich from Course Details (name/credits/faculty), dedupe,
   **upsert** `courses`, **reconcile** stale rows *scoped to `source_key`* (a broken 1st-yr sheet can
   never touch 2nd-yr), **write** fresh 3-day change highlights and **clear** reverted + aged-out ones
   (so "New"/"Moved" badges stop piling up), **save the snapshot before** the slow notify/calendar tail.
   An unchanged sheet still re-runs the idempotent upsert — that's how a newly-saved Institution-Profile
   change (e.g. a venue alias) applies to existing rows; only an empty parse short-circuits, and
   notify/calendar fire only on real changes.

**Cross-sheet aliasing** (Institution-Profile `catalog.aliases`, via `getDetailAbbr`,
`aliasToScheduleCode`, `normalizeScheduleCode`) resolves "two spellings = one course". Two kinds,
distinguished by whether the alias **key** has a space: a **plain code alias** (`RTM`→`RM`, single-token
key) keeps the schedule's own code and maps the roster onto it; a **venue / whole-cell alias**
(`YMHC MN Common Room`→`YMHC`, multi-word key) is normalised **at parse time** to the real code with the
leftover text as the room, so it matches the roster's clean code no matter when the alias was added.
*(The old hardcoded area map, programme-qualifiers, and the `isYmhcVenue`/override mechanism were removed.)*

## 2.6 Enrollment resolution (`lib/enrollment.ts`)

- `getUserSessions(supabase, userId)` is the single read path. Fast path = the `user_sessions` RPC
  (one round trip); it **remembers** if the RPC is missing and falls back to a paged
  `courses WHERE course_code IN (picks)` query (the two-query path also dodges the 1000-row cap).
- Roster-driven: `applyRosterOnSignIn` runs on **every** sign-in (idempotent), so a student listed
  before *or* after their roster upload still gets auto-filled. The **Courses** tab shows every
  student a unified read-only **"My Courses"** with attendance stats, built from their resolved
  sessions (`useAttendanceStats` → `summarizeAttendance`) — identical for 1st-year sections and
  2nd-year electives. The self-service picker is disabled (`ROSTER_MANAGED = true`); only admins see
  the year switch (to browse either catalog).

## 2.7 Notifications (`lib/notify.ts`, `lib/notify-format.ts`)

- **Change alerts**: recipients resolved (2nd-yr by enrolled code via `enrollments`; 1st-yr by
  `section`), honouring per-type prefs. Rows are **deduped** (`dedupKey` = day∷type∷code∷date∷time)
  and bulk-inserted; only genuinely-new rows trigger a **single batched Web Push per user** (chunked
  so a 500-student change doesn't blow the 60-s budget). A dead push subscription self-heals (cleared).
- **Crons**: `reminders` (push tomorrow's notes ~20:00 IST), `daily-summary` (today's classes+notes
  ~07:00 IST), `retention` (DPDP purge of old notes/attendance/notifications beyond `RETENTION_DAYS`).
  All are triggered by an external scheduler (e.g. cron-job.org) with the `CRON_SECRET` bearer;
  the sheet sync runs on the same scheduler (~30-min cadence) to keep Active CPU low.

## 2.8 Comparison & free time (`lib/clashes.ts`, `lib/free-time.ts`)

- **Canonical slots** (`CANONICAL_SLOTS` + `SLOT_END`) are the single source of truth for the busy/free
  grid, shared by Schedule, Compare and Free-Time. `isBusyAt` uses **overlap** (so a multi-hour exam
  blocks every slot it spans); cancelled sessions and holidays/events don't block.
- **Compare** (`/friends/compare`) renders a **date-based** day grid (You vs friend, per canonical
  slot: same-class / clash / one-only / both-free) from the authorized `/api/friends/compare` payload.
- **Free-Time** intersects You + any selected friends entirely **client-side** from one compact
  `busyByDate` fetch (toggling friends never refetches).

## 2.9 Google Calendar & ICS (`lib/gcal.ts`, `app/api/calendar`)

- **Per-user 2-way-ish sync**: on connect/pick/sheet-change, `planCalendarSync` (pure, unit-tested)
  computes minimal `toUpsert`/`toDelete`; users unaffected by a change make **zero** Google calls.
  Events are one-time dated (IST→UTC instant), coloured for cancelled/exam, mapped in `calendar_event_map`.
- **ICS feed** is a cookieless read-only subscription keyed by the `userId` capability token.

## 2.10 Client data layer (`lib/hooks.ts`, SWR)

One shared, deduped SWR cache across all pages: `revalidateOnFocus/Reconnect/IfStale = false`,
`dedupingInterval = 120 s`. Freshness comes from **optimistic `mutate` on every write** + a fresh
fetch on cold load + Web Push on server-side changes; the shared course routes are edge-cached, so the
rare revalidation is cheap. `useUserSessions / useCommonEvents / useCatalog / useWindowCourses /
useAttendance / useNotes / useAttendanceStats / useFriends` are the hooks; **attendance stats are
computed on the client** from the already-cached sessions+attendance (the pure `summarizeAttendance`
roll-up), so they update the instant a class is marked.

## 2.11 Caching & cost

- **Shared reads** (`/api/courses*`, `/api/bus-mess`): `public, max-age, s-maxage, stale-while-revalidate`
  → served from the browser cache (no edge hit) within the window, else a cheap CDN hit; the DB is
  touched ~once per window per distinct URL.
- **Per-user reads**: never cached.
- **RSC Router Cache** `staleTimes` extended so tabbing between pages reuses the segment shell.

## 2.12 Configuration & secrets

- **Required env** (validated at boot by `lib/env.ts`): `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAIL_DOMAIN`, `ADMIN_EMAILS`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
- **Optional env**: VAPID trio (push; UI hides itself if absent), `RETENTION_DAYS`, and Google
  client/token *as a dev fallback only*.
- **Runtime config (no env, no code):** Google client+token (`google_integration`), per-term sheet
  links (`schedule_sources`), rosters (`roster`), bus/mess (`site_content`) — all set in `/admin`.
- **Security headers** (`next.config.ts`): CSP (connect-src locked to this deploy's Supabase origin),
  HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

## 2.13 Invariants & gotchas (read before changing code)

- **Never read a `userId` from the request body/query for own-data routes.** Use `getAuthedSession()`.
  The client still *sends* `?userId=` on some calls — it is a **cache key only**, ignored server-side.
- **Dates are strings (`YYYY-MM-DD`), times are `HH:MM`, all IST.** Date parsing is string-based to
  avoid TZ drift; `istNow()` / `istInstant()` centralise the +5:30 offset. Don't introduce `new Date(iso)`
  for date-only values.
- **Sync reconciliation is scoped by `source_key`** — keep it that way so years stay isolated.
- **Notification inserts are idempotent via the partial unique index**, filtered-then-inserted (the
  index is the backstop for a concurrent race).
- **`ROSTER_MANAGED`** in `courses/page.tsx` gates the 2nd-year self-service picker (off by default —
  the roster is authoritative for year/section, so there's intentionally no user-facing year/section
  setter). Every student's Courses tab is the unified attendance-tracker "My Courses" (a flat,
  code-sorted list — no area grouping); the year switch is admin-only.
- **The Today date-rail follows the data, not a hardcoded term.** `termDates()` (`lib/term-window.ts`)
  spans the user's own sessions + their year's exams (±a few days), so 1st/2nd-year each track their own
  uploaded sheet. Don't reintroduce `TERM_START`/`TERM_END` constants.
- **No built-in bus/mess.** `lib/site-content.ts` returns **empty** when nothing's uploaded; the Today
  tab shows an "ask your admin to upload" state. A fork must upload its own data (don't re-add IIM-K's).
- **Change highlights live for 3 days** (`CHANGE_WINDOW_MS`, `lib/changes.ts`, shared by Today/Schedule
  and the sync's clear step). The UI gates the badge on this window; the sync *writes* fresh highlights
  and *clears* reverted/aged-out ones, so they don't accumulate. Keep the window in one place.
- **No `.xlsx` schedule upload.** The schedule comes only from the admin-pasted Google Sheet link
  (`/admin/schedule` is paste-link + "Sync now"). `lib/xlsx-schedule.ts` was removed; `exceljs` remains
  only for the roster upload.
- **Build now type-checks** (no `ignoreBuildErrors`). A stale `.next/` can carry a dead generated route
  type — `rm -rf .next` before a verification build if you see a phantom `*/route.js` type error.

## 2.14 Testing

- **Pure logic** is isolated into `lib/*` and unit-tested (auth, sheets parse + venue normalise, diff
  incl. reverted, clashes, free-time, attendance, retention, notify-format, sheet-url, bus-mess-validate,
  env, gcal plan, institution-profile, **term-window**, **changes**).
- **DB/RLS/RPC** behaviour is tested against a real Postgres-compatible **pglite** instance that runs
  the actual migrations (`tests/db-harness.ts`): `db-rls`, `db-user-sessions`, `db-reconcile`,
  `db-google-integration`, `db-institution-profile`. 244 tests total; `npm test`, `npm run lint`,
  `npm run build` are green.
