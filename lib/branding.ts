// Per-deployment identity. This is the ONE place the institution name + email domain live for the
// client UI, so forking the app for another institution (IIM-C/B) is an env change, not a code hunt.
//
// These are NEXT_PUBLIC_* (inlined into the client bundle) with IIM-K fallbacks. The SERVER-SIDE
// email-domain gate still reads the non-public `ALLOWED_EMAIL_DOMAIN` (see auth/callback) — keep both
// in sync; the public one only drives the sign-in copy + the Google `hd` hint (which is spoofable
// anyway and re-checked server-side).
export const INSTITUTION_NAME = process.env.NEXT_PUBLIC_INSTITUTION_NAME || 'IIM Kozhikode'
export const INSTITUTION_SHORT_NAME = process.env.NEXT_PUBLIC_INSTITUTION_SHORT_NAME || 'IIM-K'
export const ALLOWED_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || 'iimk.ac.in'
