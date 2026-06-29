# KampusSchedule — Manual Test Plan

> Covers **every feature** end-to-end, with expected results derived from the actual code logic
> (referenced as `file:func`). Branch: `localdev`. Architecture: [`architecture.md`](./architecture.md).
>
> **Legend** — 🔑 needs admin · 👤 needs a normal student · 👥 needs two accounts · ⏰ time-sensitive (IST) · 🔁 needs a re-sync.
>
> **Accounts to prepare:** one **admin** (email in `ADMIN_EMAILS`), two **students** A & B on `@iimk.ac.in`,
> and ideally one **non-college** Google account for the domain-rejection test.

---

## 0. Environment & boot

| # | Steps | Expected (code) |
|---|-------|-----------------|
| 0.1 | Unset a required env var (e.g. `CRON_SECRET`), `npm run dev`. | Server **fails fast** with `Missing required environment variable(s): CRON_SECRET …` — `lib/env.ts:assertServerEnv` via `instrumentation.ts`. |
| 0.2 | Restore env, `npm run dev`. | Boots cleanly. |
| 0.3 | `npm run build`. | Type-checks and builds (exit 0) — `ignoreBuildErrors` is removed. If a phantom `*/route.js` type error appears, `rm -rf .next` first. |
| 0.4 | `npm test` / `npm run lint`. | 210 tests pass; lint exits 0 (only `set-state-in-effect` **warnings**). |
| 0.5 | Open the app, DevTools → Application. | `manifest.json` loads; `sw.js` registers (`session-provider.tsx`). Installable PWA. |

---

## 1. Authentication & access control

| # | Steps | Expected |
|---|-------|----------|
| 1.1 👤 | Visit any path while signed out (e.g. `/today`). | Redirected to `/sign-in` (`proxy.ts` → `authRouteAction` `to-sign-in`). |
| 1.2 | On `/sign-in`, click **Continue with Google**, pick an `@iimk.ac.in` account. | Lands on `/today`. A `users` row is created (`getOrCreateUser`) with a `share_code` and `display_name` = email local-part. |
| 1.3 | Sign in with a **non-`@iimk.ac.in`** Google account. | Bounced to `/sign-in?error=domain` with "Please sign in with your @iimk.ac.in college account." — server check `emailDomainAllowed` in `auth/callback`. Session is signed out. |
| 1.4 | While signed in, manually visit `/sign-in`. | Redirected to `/today` (`authRouteAction` `to-home`). |
| 1.5 👤 | As a **student**, visit `/admin`. | Redirected to `/today` (admin pages require role; proxy `to-home`). |
| 1.6 🔑 | As **admin**, visit `/admin`. | Dashboard loads. |
| 1.7 | Settings → **Sign out**. | Session cleared (`/auth/signout`), redirected to `/sign-in`; revisiting `/today` redirects back to sign-in. |
| 1.8 | Hit `GET /api/user/resolve` directly. | **410 Gone** with the removal message. |
| 1.9 👥 | As A, call `GET /api/courses/user?userId=<B's id>` (any value). | Returns **A's** sessions, not B's — the param is ignored; identity is the cookie (`api-auth.getAuthedSession`). |

---

## 2. Admin setup (do this first — it powers the student views) 🔑

| # | Steps | Expected |
|---|-------|----------|
| 2.1 | First admin sign-in (Google client configured, no token yet). | Auto-redirected once through `/api/admin/oauth` consent; on return, `google_integration.sheet_refresh_token` is stored. The refresh token is **never** rendered (server-log only) — `oauth/callback`. |
| 2.2 | `/admin/schedule` → **Google access**. | Shows "✅ Connected" once authorized (`isSheetAuthorized`). |
| 2.3 | Paste a valid Google Sheet **link** for source `y2` → **Save link**. | "Saved link for y2…"; `schedule_sources` upserted (`/api/admin/schedule/source`, `parseSheetId`). Paste a garbage string → "Could not find a Google Sheet id…". |
| 2.4 | `/admin/preview`. | Renders fetched rows + parsed sample for the first configured source. With **no** source configured → "No schedule source configured — paste a Google Sheet link…". |
| 2.5 | `/admin` → **Sync now**. | "Sync complete — schedule refreshed."; the **Schedule sync** table shows a `success` row per source with `+/~/−` counts (`/api/sync` → `syncOneSource` → `ingestSheetData`). |
| 2.6 | Click **Sync now** again immediately (no sheet change). | Succeeds; `rows_added/modified/removed` ~0 — the no-op fast path (`ingestSheetData` skip). |
| 2.7 | `/admin/schedule` → **upload .xlsx** (a workbook with a "…Schedule" + "Course Details" tab) for a source. | "Synced …: +x added · ~y modified · −z removed …" — same `ingestSheetData` path as a Google sync (`/api/admin/schedule` POST). An empty/invalid file → a clear 400. |
| 2.8 | `/admin/roster` → upload **1st-year** roster (.xlsx: email, section). | "Stored N students · applied to M already-signed-in." (`parseYear1Roster` → `replace_roster_year`). |
| 2.9 | Upload **2nd-year** roster (.xlsx: email + elective codes matching the sheet, e.g. `GT-A`). | Same success shape; `enrollments` populated for already-registered students (`apply_roster_to_user`). |
| 2.10 | `/admin/bus-mess` → **Copy prompt**, paste valid JSON → **Validate & save**. | "Saved ✓ N trips / N days. Students see it within ~10 min (cached)." (`parseBusPayload`/`parseMessPayload` → `site_content`). Paste malformed JSON → a human-readable validation error (no save). |
| 2.11 | `/admin` stats cards. | Courses (Y1/Y2), Students, Enrollments, Roster (Y1/Y2) counts reflect the uploads (`/api/admin/status`). |

---

## 3. Today / Home (`app/(app)/today`) 👤

| # | Steps | Expected |
|---|-------|----------|
| 3.1 | Open **Today**. | Header shows "Today" + full date; a horizontal **date rail** spans the term (`TERM_START`→`TERM_END`), centred on today, with month labels. |
| 3.2 | New account with no courses. | The branded **Onboarding** card with "Add your courses". (Under roster management the student's courses are auto-filled, so this only shows if the roster has no entry for them.) |
| 3.3 | After enrollment, look at today. | Class cards sorted by start time; each shows code, name, time, room ("Class X"), instructor. Common events (exams/holidays) appear amber for your year (`useCommonEvents`). |
| 3.4 | A day with no classes. | "No classes on {date} · Enjoy the free day". |
| 3.5 | Tap a future date on the rail. | Header switches to that weekday; a **Today** chip appears to jump back (`jumpToday`). |
| 3.6 | A date with a recent sheet change (within 3 days). | An amber dot on the rail date; the class card shows a change badge (New/Moved/Updated/Cancelled) + `change_note` (`recentlyChanged`, `CHANGE_LABEL`). |
| 3.7 | A cancelled class. | Red card, struck-through, "CANCELLED" badge; **no** attendance toggle shown (`ClassCard` hides it when cancelled). |
| 3.8 | Tap **P** on a class. | Turns green "✓ Marked present" instantly (optimistic `useAttendance.setStatus`). Tap **P** again → clears. Tap **A** → red "Marked absent". |
| 3.9 | A class with a reminder note (set in Schedule). | Amber sticky-note row with the note text. |
| 3.10 | Top-right **bell**. | Opens the **Alerts** panel; the unread badge count matches (`unreadCount`). |
| 3.11 | Push deep-link: open `/today?alerts=1`. | Alerts panel opens automatically and the URL is cleaned to `/today`. |
| 3.12 | Tap the **Disclaimer** "i". | Expands/collapses the cross-check message. |

### 3a. Mess tab

| # | Steps | Expected |
|---|-------|----------|
| 3a.1 | Today → **Mess**, pick a weekday on the rail. | Breakfast/Lunch/Dinner cards for that weekday; veg items + highlighted "special" chips; the admin's note line (`MessView`, from `/api/bus-mess` or the built-in fallback). |
| 3a.2 | A weekday with no menu. | "No menu." |

### 3b. Bus tab

| # | Steps | Expected |
|---|-------|----------|
| 3b.1 | Today → **Bus**. | Trip list; the **NEXT** bus (first trip with `min ≥ now` in IST) is highlighted and auto-scrolled into view (`BusView`, `nextIdx`). The date rail is hidden (bus is the same daily). |
| 3b.2 | Tap a stop filter chip. | List filters to trips from that stop; re-scrolls to the next one. |
| 3b.3 | A "via main gate" trip. | Shows the "→ MAIN GATE" tag. |

---

## 4. Schedule (`app/(app)/schedule`) 👤

| # | Steps | Expected |
|---|-------|----------|
| 4.1 | Open **Schedule** (Week view). | A grid: canonical time rows × Sun–Sat columns for the current week; your picks + your-year exams only (`visible` filter). Today's column highlighted. |
| 4.2 | ◀ / ▶ week nav; tap the middle label. | Moves a week; the label jumps back to the current week (`shiftWeek`, `weekStartISO`). |
| 4.3 | Switch to **Day** view; tap a date chip. | Single-day list with MINE / status / REM / CANCELLED / change badges per row (`DayRow`). |
| 4.4 | Tap a class block/row. | Detail dialog: date, time, room, instructor; **Attendance** Present/Absent; **Reminder note** textarea ("you'll get a push at 8 PM the day before"). |
| 4.5 | Mark attendance in the dialog. | Same optimistic update; reflected in Today and My Courses stats (shared SWR cache). |
| 4.6 | Type a note → **Save**. | Dialog closes; note persists (`useNotes.setNote`, `/api/notes`); a sticky-note indicator appears on that session in Today/Schedule. Clearing the note text + Save deletes it. |
| 4.7 | Click the **Sheet** button (after admin configured a sheet). | Opens the **admin-pasted** Google Sheet for your year in a new tab (`/api/source-sheet` → `resolveSheetSources`). **No** hardcoded sheet. |
| 4.8 | Click **Sheet** when **no** source is configured. | Button is **disabled** (greyed, "No source sheet configured yet") — not a dead click. |
| 4.9 | A week with no classes. | "No classes this week." |

---

## 5. Courses / My Courses (`app/(app)/courses`) 👤🔑

> The **Courses** tab is the same unified read-only **"My Courses"** for every student — 1st years
> see their **section** courses, 2nd years see their **electives** — both with the full attendance
> tracker. There is **no year switch for students** (admin-only).

| # | Steps | Expected |
|---|-------|----------|
| 5.1 👤 | Open **Courses** as a roster-managed **2nd-year**. | "My Courses": read-only list of your **electives** with **attendance stats** (Present `x/total`, Absent, Attendance %, Left). No Edit button and no year switch (`ROSTER_MANAGED = true`). Note line "set from the official roster". |
| 5.2 👤 | Open **Courses** as a roster-managed **1st-year**. | **Same** "My Courses" view, listing your **section's** courses with the **same attendance stats** — full feature parity (summary-driven `useAttendanceStats`). No "2nd Year" tab is shown. |
| 5.3 👤 | Mark classes present/absent in Today/Schedule (either year), return here. | Stats update **instantly** (client-computed from the shared caches — `summarizeAttendance`); attendance % turns red below 75%. Works for 1st and 2nd years alike. |
| 5.4 | A course where credits×8 ≠ scheduled count. | "· credits expect N ⓘ" hint (`mismatch`). |
| 5.5 👤 | Open **Courses** before your section/electives are loaded (or not in any roster). | Friendly empty state: "No courses yet — your classes appear once your section / electives are loaded." (no crash). |
| 5.6 🔑 | Open **Courses** as **admin**. | "All Courses · 2nd Year", every course grouped by area, read-only, "you're enrolled in all of them". A **1st/2nd Year** switch is shown (admins only) — `/api/courses?catalog=1&year=`. |
| 5.7 🔑 | Switch the admin year tab to 1st. | Lists all 1st-year courses (year-parameterised `course_catalog`). |
| 5.8 | (Self-service regression, only if `ROSTER_MANAGED=false`) 2nd-year picks an elective. | Optimistic toggle; `pick_course`/`unpick_course`; account flips to year 2; background Google-Calendar sync of just that course. |

---

## 6. Friends (`app/(app)/friends`) 👥

| # | Steps | Expected |
|---|-------|----------|
| 6.1 | Open **Friends**. Note your **share code**; copy it. | 8-char code shown; copy toast (`copyCode`). |
| 6.2 👤 | Look at the line above your share code. | "Friends see you as **{name}**" where name is **auto-filled** from your college email local-part (e.g. `arun.teja_2027`). There is **no** manual name editor — it's set on first sign-in (`getOrCreateUser`). |
| 6.3 👥 | As B, enter A's share code → add. | "Added {A}!"; a **mutual** accepted friendship is created (both directions) — `/api/friends` POST. |
| 6.4 | Enter your **own** code. | "That's your own code!" (400). |
| 6.5 | Re-add an existing friend. | "Already friends or request pending" (409). |
| 6.6 | Search the friends list by name/code. | Filters live (`visibleFriends`). |
| 6.7 | Remove a friend (trash icon). | Disappears immediately (optimistic); both directions deleted (`/api/friends` DELETE). |

### 6a. Compare schedules 👥

| # | Steps | Expected |
|---|-------|----------|
| 6a.1 | Friend row → compare (→ arrow). | `/friends/compare?friendId=…`. A date strip + a per-slot grid: **You** vs friend, coloured Both-free / Same-class / Clash / One-only (`isBusyAt`, date-based). |
| 6a.2 | Step through dates. | Defaults to today (or first date with data); common exams appear on both sides. |
| 6a.3 👤 | Manually GET `/api/friends/compare?friendId=<a stranger's id>`. | **403 "Not friends"** — friendship is verified server-side before returning any schedule. |

### 6b. Free-Time Analysis 👥

| # | Steps | Expected |
|---|-------|----------|
| 6b.1 | Friends → the **clock** icon. | Dialog: "Who's meeting" chips (You + each friend), a week summary with a **free-slot count per day** (best day highlighted), and a per-slot day view ("Everyone free" / "N busy · names"). |
| 6b.2 | Toggle friends in/out; change week. | The free intersection recomputes **client-side** with no refetch (`freeSlotsOn`, one `/api/friends/free-time` call). |

---

## 7. Settings (`app/(app)/settings`) 👤

| # | Steps | Expected |
|---|-------|----------|
| 7.1 | **Appearance**: Light / Dark / System. | Theme switches (`next-themes`); persists across reloads. |
| 7.2 | **Notifications** with VAPID configured. | "Push notifications OFF" toggle. Enable → browser permission prompt → "Push notifications enabled!" and a sub is saved (`/api/push/subscribe`). Disable → unsubscribes + clears. |
| 7.3 | With VAPID **not** configured. | "Push notifications aren't configured on this deployment. The calendar feed and in-app alerts still work." (`PUSH_CONFIGURED`). There is **no** "class reminder (~14 min)" toggle — that feature was removed. |
| 7.4 | Toggle the four pref checkboxes (cancelled / rescheduled / room / daily summary). | Each PATCHes `/api/user/prefs` (whitelisted columns). |
| 7.6 | **Calendar (subscribe)**: tap "Subscribe — iPhone". | Opens `webcal://…/api/calendar?userId=…`. |
| 7.7 | "Add to Google Calendar (by URL)". | Copies the `https` feed URL + opens Google's "add by URL" page. |
| 7.8 | "Download .ics". | Downloads a snapshot `.ics` of your schedule (`/api/calendar`). |
| 7.9 | **Connect Google Calendar** (Android path). | OAuth (`/api/calendar/google/connect`, state = your uid); on return "Google Calendar connected!" and status flips to **Connected** (`/api/calendar/google/status`). |
| 7.10 | **Disconnect**. | Removes tokens + mapped events (`disconnectGoogleCalendar`); status back to disconnected. |
| 7.11 | **Source Schedule** → "View Original Google Sheet". | Opens the admin-pasted sheet for your year (`/api/source-sheet`). No-ops cleanly if none configured. |
| 7.12 🔑 | **Admin** section (admins only). | "Open admin console" → `/admin`. Hidden for students. |
| 7.13 | **Friends Code** copy. | Copies your share code. |
| 7.14 | **About** text. | "Schedule syncs: automatically, every few minutes" and "Your data: synced to your college account across devices" (corrected copy — sign-in is required). |

---

## 8. Alerts / Notifications (`components/alerts-panel`) 👤🔁

| # | Steps | Expected |
|---|-------|----------|
| 8.1 🔁 | Edit the source sheet (e.g. colour a class **red** = cancelled), **Sync now**. | Affected enrolled users get a `notifications` row and (if subscribed) one Web Push; the **bell** badge increments (`notifyAffectedUsers`). |
| 8.2 | Open Alerts. | Cards coloured by type (red cancelled / green added / indigo moved-updated / grey removed), each with title, body, relative time, and a legend. |
| 8.3 | Tap a card. | Marks it read (badge decrements). **Read all** marks every one; the count clears. |
| 8.4 | Delete one (✕) / **Clear** all. | Removed optimistically and on the server (`/api/notifications` DELETE). |
| 8.5 🔁 | Run the same sync twice. | No duplicate alerts — `dedupKey` + the partial unique index (`insertNotificationsDeduped`). |

---

## 9. Sheet sync & change detection (deeper) 🔑🔁

For each, edit the **source sheet**, **Sync now**, then check Today/Schedule/Alerts:

| # | Change in sheet | Expected detection (`lib/diff.ts`) |
|---|-----------------|-------------------------------------|
| 9.1 | Colour a class cell **red** (or strikethrough). | "Cancelled" alert; class shows red/struck in the UI. |
| 9.2 | Un-red a previously red class. | "Class reinstated" (added). |
| 9.3 | Colour an empty/new cell **green**. | "Marked as added". |
| 9.4 | Move a class to a different **time**, same section. | "Rescheduled" with "Moved from {old} → {new}". |
| 9.5 | Move a class to a different **room/section**, same time. | "Room changed" / class-changed note. |
| 9.6 | Edit a code in place (`GT` → `GT (E1)`). | "Updated: GT → GT (E1)" (same base abbr → in-place update). |
| 9.7 | Delete a class from the sheet. | "Removed" alert; the session disappears after reconcile. |
| 9.8 | Add an **amber** event / "Mid-Term Exam" row spanning dates (merged). | A common event/exam appears on every spanned date for everyone of that year (`eventDates`, `is_common`). |
| 9.9 | Break the 1st-year sheet, keep 2nd-year valid, sync. | 2nd-year is unaffected; the 1st-year source logs an `error` row — reconcile is `source_key`-scoped (`sync-core`). |
| 9.10 | Let a change age past 3 days, sync again. | The highlight clears (`change_kind/note/last_changed_at` nulled by the global expiry in `/api/sync`). |

---

## 10. Google Calendar 2-way sync 👤🔁

| # | Steps | Expected |
|---|-------|----------|
| 10.1 | Connect Google Calendar, then open Google Calendar. | Your enrolled sessions + common events appear as dated events (IST), cancelled ones red (`buildEvent`). |
| 10.2 🔁 | Cancel a class in the sheet, sync. | The matching Google event updates (patched) — only changed events touched (`planCalendarSync`); unaffected connected users make zero Google calls. |
| 10.3 | (self-service mode) Unpick a course. | Its events are removed from your calendar (orphan cleanup). |
| 10.4 | Disconnect. | All app-created events removed; tokens dropped. |
| 10.5 | Subscribe via the `.ics` URL in another calendar app. | Read-only feed renders; editing the `userId` in the URL to a different UUID exposes *that* user's schedule (known capability-token tradeoff — documented). |

---

## 11. Cron jobs (call with the `CRON_SECRET` bearer) ⏰

| # | Steps | Expected |
|---|-------|----------|
| 11.1 | `POST /api/cron/reminders` with `Authorization: Bearer <CRON_SECRET>`. | Pushes each user their **notes for tomorrow** (IST); `{ ok, sent }`. Without/with a wrong bearer → **401**. |
| 11.2 | `POST /api/cron/daily-summary` (bearer). | Pushes today's classes + notes to users who enabled the daily summary and have a push sub; `{ ok, sent }`. |
| 11.3 | `POST /api/cron/retention` (bearer). | Deletes notes/attendance/notifications older than `RETENTION_DAYS` (default 180) and returns the purged counts + cutoff. Reference data (courses/bus/mess) and identities are untouched. |
| 11.4 | `GET /api/sync` from a browser **as admin**. | Runs (admin fallback). As a **student** or signed-out → **401** (`requireAdmin`). |

---

## 12. Roster authority & student cleanup 🔑

| # | Steps | Expected |
|---|-------|----------|
| 12.1 | Upload a 2nd-year roster that **omits** a previously-listed student, then `/admin` → **Students who have left**. | That student appears in the "departed" list (in **no** current roster) — `previewDeparted` / `departed_students`. |
| 12.2 | Upload only ONE year's roster and look at the warning. | "A year's roster is empty — upload BOTH…" (`reconcileWarning`). Removal is blocked-by-warning. |
| 12.3 | With both rosters uploaded and >30% would be removed. | "This would remove X of Y students (Z%)…" warning. |
| 12.4 | Click **Review & remove** → **Yes, remove**. | Hard-deletes those students; cascade clears their enrollments/friends/notes/attendance/tokens (`prune_departed_students`); "Removed N student(s)." Admins are never listed/removed. |
| 12.5 | Re-upload a roster that re-includes a student who had left, have them sign in. | Their schedule auto-fills again (`applyRosterOnSignIn` on every sign-in). |
| 12.6 | Promote a student from Y1 to the new Y2 roster, sign in. | They keep their account and get the Y2 view (covered by `db-reconcile` test "keeps a promoted student"). |

---

## 13. Security / authorization (negative tests) 👥

| # | Steps | Expected |
|---|-------|----------|
| 13.1 | Signed out, call any `/api/*` own-data route. | **401** (`getAuthedSession` null). |
| 13.2 👥 | As A, try to read B's data by spoofing `?userId=B`/body `userId=B` on attendance/notes/prefs/etc. | Always operates on **A** — server uses the session, RLS enforces `auth.uid() = user_id`. |
| 13.3 👤 | As a student, call any `/api/admin/*`. | **403 "Forbidden — admin only"** (`requireAdmin`). |
| 13.4 | As a student, `GET /api/friends/free-time`. | Returns only **you + your accepted friends** — no other user leaks in (`/api/friends/free-time`). |
| 13.5 | Inspect response headers on any page. | CSP (connect-src limited to your Supabase origin), HSTS, `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy (`next.config.ts`). |
| 13.6 | Hit `/api/admin/oauth/callback?code=…` as a non-admin. | **403**; the refresh token is never echoed to HTML on any path. |

---

## 14. PWA / offline-ish & resilience

| # | Steps | Expected |
|---|-------|----------|
| 14.1 | Install to home screen (Android/desktop) or Add to Home Screen (iOS). | App installs; the `InstallPrompt` appears where supported. |
| 14.2 | Navigate Today → Schedule → Courses → Friends repeatedly. | Shared SWR cache means no refetch storm; no auto-revalidate on focus/reconnect (`SWR_DEFAULTS`). |
| 14.3 | Toggle attendance offline / on a flaky connection. | UI updates optimistically; the write retries-or-silently-fails without corrupting the view (`useAttendance` catch). |
| 14.4 | Reopen the app after a server-side sheet change while it was closed. | Fresh fetch on cold load shows the change; a Web Push (if subscribed) also arrived. |

---

## 15. Regression checklist before merge/handover

- [ ] `npm test` (210) · `npm run lint` (0 errors) · `npm run build` (type-checks, exit 0).
- [ ] Sign-in restricted to `@iimk.ac.in`; admin-only paths blocked for students; impersonation params no-op.
- [ ] No hardcoded sheet IDs anywhere — Schedule "Sheet" and Settings "View Original Sheet" follow the admin-pasted link; both disable/no-op cleanly when unset.
- [ ] A sheet edit produces correct alerts + UI highlights; an identical re-sync is a cheap no-op; a broken year doesn't break the other.
- [ ] Roster upload personalises schedules; "students who left" preview→confirm→cascade works with both rosters loaded.
- [ ] Bus/mess paste-import renders; falls back to built-ins before any upload.
- [ ] Calendar `.ics` + Google sync produce correct IST-dated events; retention purge removes only old per-user rows.
