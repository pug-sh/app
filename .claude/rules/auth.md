---
paths:
  - "src/auth/**"
  - "src/pages/{sign-in,magic-link,oauth-callback}*.tsx"
---

# Sign-in flows and Turnstile

The backend auth model (JWT, `x-project-id`, API-key SDK endpoints) is in CLAUDE.md.

## Sign-in

- Unauthenticated sign-in: magic link (`/magic-link?token=…`), a server-configured OIDC provider (`/oauth/callback`, Authorization Code + PKCE), or an org's SSO connection (`/oauth/callback/<connectionId>`, found through `DiscoverSignIn`). Google uses the same generic OIDC path.
- External sign-in fetches safe provider settings from `GetAuthConfig`; every provider, including Google, uses Authorization Code + PKCE and `/oauth/callback`. A connection isn't in `GetAuthConfig`, so its config rides the redirect in sessionStorage, and the callback refuses a code that lands on another path (OAuth mix-up). The callback sends `providerId` (or `connectionId`), code, PKCE verifier, redirect URI and nonce to `CompleteOIDCSignIn`; the server performs the token exchange, so provider secrets and tokens never enter the dashboard.

## Turnstile

`RequestMagicLink` and `SignInWithEmail` carry a Cloudflare Turnstile token when `GetAuthConfig` returns a `turnstileSiteKey`. Without a key nothing changes: no script, no widget, an empty token. `auth/turnstile.ts` loads the API and `auth/use-turnstile.ts` drives the one widget on the sign-in form.

- **`api.js` loads from `challenges.cloudflare.com`, never from a bundled or self-hosted copy**, because Cloudflare breaks a proxied or cached one. It is the one exception to the no-CDN rule. It loads only on the sign-in page and only with a key, so a deployment with the check off never contacts Cloudflare. A Content-Security-Policy added later must allow that origin for scripts and frames.
- **With a key, `take()` never lets a request go out without a token.** It waits for one that isn't ready. It resets the widget as it hands one out, because a token works once and a wrong password spends it too. It returns `null` when the widget errors or can't load.
- **The refusals are mapped on the code, like OAuth's, but only on an error that carries a detail.** On these two RPCs only the check answers `PermissionDenied` (`TURNSTILE_FAILED`) or `Unavailable` (`TURNSTILE_UNAVAILABLE`), but Connect turns a proxy's bare 403 or 429/502/503/504 into the same codes. The server's own refusal always carries an `ErrorInfo` detail, and a status-derived error never does. A `PermissionDenied` fetches the config again, which covers a page opened before the keys were set or rotated, and a failed first fetch.
- **The widget is `interaction-only`**: an empty box until Cloudflare wants a click, and an empty box adds no gap to the form's `space-y` stack. Cloudflare's test site keys work on localhost with the dummy secrets in the backend's `.env.example`, since a real secret refuses their tokens: `1x00000000000000000000AA` always passes, `3x00000000000000000000FF` forces the click.
