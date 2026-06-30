// Per-deployment identity. This is the ONE place the institution name + email domain live for the
// client UI, so forking the app for another institution (IIM-C/B) is an env change, not a code hunt.
// Set these in `.env.local` (dev) and the deploy env (prod) — see `.env.example`.
//
// These are NEXT_PUBLIC_* (inlined into the client bundle). There are NO institution-specific
// hardcoded fallbacks: the values come from config, and a misconfigured deploy shows a neutral
// placeholder rather than silently branding as some other college. The SERVER-SIDE email-domain gate
// reads the non-public `ALLOWED_EMAIL_DOMAIN` (see auth/callback) — keep it in sync with the public
// copy below; the public one only drives the sign-in copy + the Google `hd` hint (spoofable anyway,
// re-checked server-side), so it falls back to empty when unset.
export const INSTITUTION_NAME = process.env.NEXT_PUBLIC_INSTITUTION_NAME || 'Your Institution'
export const INSTITUTION_SHORT_NAME = process.env.NEXT_PUBLIC_INSTITUTION_SHORT_NAME || 'Campus'
export const ALLOWED_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || ''
