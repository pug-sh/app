import { atomWithStorage } from 'jotai/utils'

// Build-time gate for the sign-in page's "Explore the live demo" link, driven by VITE_DEMO_ENABLED.
// It does NOT gate the /demo route itself (which always runs and surfaces the backend's Unavailable
// response when the demo is off), nor the in-app demo banner (that follows the active demo session —
// see isDemoSessionAtom). The real switch is the server's PUG_DEMO_ENABLED; this flag only decides
// whether to advertise the demo from sign-in in this build.
export function isDemoEnabled() {
  return (import.meta.env.VITE_DEMO_ENABLED ?? '').trim() === 'true'
}

// Marks the current session as the read-only demo viewer. The demo access token is an ordinary
// viewer JWT — indistinguishable from a real viewer login, since the role is never in the JWT (by
// design) — so this frontend-only flag is what lets the UI show the demo banner, route sign-out
// back to sign-in, and detect an already-active demo on the /demo page. Persisted so a reload
// mid-demo keeps the banner. Written by applySessionAtom, derived from the sign-in method in the same
// pass as the token: a demo login (via demoSignInAtom, method 'demo') sets it and every other real
// sign-in clears it; also cleared on sign-out and when a session dies via clearSession (failed refresh).
export const isDemoSessionAtom = atomWithStorage('pug:isDemo', false)
