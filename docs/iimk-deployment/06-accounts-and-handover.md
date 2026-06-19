# Accounts & ownership handover

## Situation

No college-owned accounts yet — the college provides them **after** project completion. Currently a mix of personal Gmail + college mail is in use. Goal: build now under accounts **you** control, so the eventual handover to institutional accounts is a **config swap, not a rewrite**.

## Recommendation: one dedicated project account now

- Create a **single dedicated Google account** for the project (a fresh Gmail used only for this app). It owns: the **Supabase project**, the **Google Cloud OAuth client**, and the **schedule Google Sheet**.
- **Keep your personal Gmail out of the ownership chain** — use it only to test the "wrong domain → rejected" path. Mixing personal Gmail into project ownership is what makes handover painful.
- Use your **college email (`@iimk.ac.in`)** as the **first admin user** and to test domain-restricted sign-in (real college-domain account = the happy path).
- At handover: either **transfer ownership** of these projects to the college account, or **recreate** them under the college account and swap env vars. Because the schema lives in `supabase/migrations/`, recreating is reproducible.

## Set up now (dev only — localhost; `localdev` branch)

Only **one** environment is needed right now, since `localdev` is not deployed:

- **Supabase:** a free project with **fresh keys** — do **not** reuse any key currently in `.env.local`; those are exposed/compromised.
- **Google Cloud:** an OAuth 2.0 Web client. Consent screen "External", Testing mode, add your emails as test users. Scopes: sign-in + Sheets read.
- **Schedule Sheet:** in the dedicated account's Drive.
- **Generate:** VAPID keypair, `CRON_SECRET` (random string).

All of the above live in `.env.local` only. **The app uses no paid services** — bus/mess are added by pasting a table generated in any free chat tool, not a vision API.

## Design rules that make handover a config swap (build these in from the start)

1. Every credential via env var (`.env.example` + `lib/env.ts`); **nothing account-specific in code**.
2. Move the **hardcoded sheet IDs** in `lib/sheets-config.ts` to env/DB (admin-managed), so swapping to the institutional sheet is config.
3. Domain restriction via env: `ALLOWED_EMAIL_DOMAIN=iimk.ac.in`.
4. Admin list as **data** (an `admins` table / seed), seeded with your college email; college edits it later.
5. Schema in `supabase/migrations/` → recreating under the college project = run migrations.
6. Maintain the handover checklist below as the single list of accounts/secrets to transfer.

## At handover (when college accounts arrive)

1. Create the prod **Supabase project** + **Google Cloud OAuth client** under the college Workspace.
   - If `iimk.ac.in` is Google Workspace, make the OAuth app **"Internal"** → it auto-restricts to college accounts (cleaner than `hd` + server check, which stays as the portable fallback).
2. Move the **schedule Sheet** to institutional Drive; update its env var.
3. **Run the migrations** on the new Supabase project.
4. Set all secrets in **Vercel env** (fresh/rotated): Supabase keys, Google client, Sheet id, VAPID, `CRON_SECRET`.
5. Seed the **admin allowlist** with institutional admin emails.
6. Connect `master` to Vercel production and deploy.
7. **Decommission** the old app and retire its exposed keys.
