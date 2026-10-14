---
paths:
  - "src/analytics/**"
  - "src/main.tsx"
  - "src/hooks/use-copy-to-clipboard.ts"
---

# Dogfooding (`src/analytics/`)

The dashboard reports its own usage into Pug through `@pug-sh/browser`, the same public-key ingest path customers use. It is off unless `VITE_PUG_PROJECT_ID` and `VITE_PUG_PUBLIC_KEY` are both set, so dev sends nothing by default. `initAnalytics()` runs at module scope in `main.tsx`, not in an effect, because StrictMode would double-fire the first `page_view`. The rules that apply anywhere in the app (the `<main>` no-capture marker, what an event property may carry, `trackFeature`, the static `<title>`) are in CLAUDE.md under Dogfooding.

## Coupling to pug.sh

pug.sh is instrumented the same way and **must stay on the same project, public key and SDK version**. `crossSubdomainTracking` shares identity through a cookie keyed by project ID, so a mismatched project splits every visitor into two profiles and the signup funnel stops resolving. The SDK version matters the same way: the stored identity envelope changed shape after 0.0.4, and builds on either side of a change like that can't read each other's, so a visitor crossing between the sites thrashes their anonymous ID on the shared `.pug.sh` cookie. Move both repos together.

## Invariants

- **`sanitizeUrl` (`analytics/sanitize-url.ts`) drops the whole query string**, not a denylist. `ef`/`pf` carry property-filter *values*, `/magic-link` carries a live token, and forgetting to add a new param to a denylist fails silently and permanently. Path IDs are masked (`:profileId`, `:sessionId`, `:dashboardId`, `:shareId`, `:connectionId`) because a profileId is another company's end-user and a shareId is a bearer credential. This costs no UTM attribution: the SDK parses `$utm*` from `window.location.search` directly and never routes it through the sanitizer.
- It reaches the SDK through `beforeSend` (`maskEventUrls`, covering `$url`, `$referrer` and a `form_submit`'s `action`). The hook must not throw, since a throw drops the **whole event** rather than blanking one URL, and `''` has to pass through untouched or a referrer-less page view resolves into a fabricated self-referral.
- `$pageTitle` is **not** sanitized. It is safe only because `index.html` sets a static `<title>Pug</title>` and nothing mutates it.
- **`trackingConsent: 'granted'` is stated in `init()` and has to stay.** The SDK defaults to `'cookieless'`: events still flow, but no identifier is written to the device and `identify()` is a no-op, which makes `crossSubdomainTracking` dead config and leaves every signed-in session anonymous. Nothing errors; the funnel just stops resolving.
- **`useCopyToClipboard`'s `copy(text, context?)` tracks a `copied` event only when a call site passes a stable `context` label**, and the copied `text` is never sent (it is frequently a credential). Secret-copy sites (the once-shown private key) pass **no** context, so they stay silent; the minting event (`api_key_created`, `scope: Private`) is the signal, not the copy.

## Identity

- **Identity is the customerId, and the signed-in email is a trait on it. Don't swap them.** A profile is keyed by `(project, externalId)` with no rename path (the only merge is anonymous→identified, on the first `identify()`), so an address as the external ID strands the profile whenever someone changes theirs; post-identify it would also be the distinct ID on every event and sit in plaintext in the identity cookie shared across `.pug.sh`. As a trait it still identifies the person and stays filterable, but it does **not** become the profile's label: `resolveIdentity` (`profiles/_identity.ts`) resolves that from a *name* trait only, falling back to the external ID, and renders `email` on the secondary line, so our own dogfood profiles head with the customerId.
- The email isn't in the JWT, so `analytics/identity.tsx` owns a `GetMe` and holds the first `identify()` until it lands. It is gated on `analyticsEnabled`, since a request is the one thing there that isn't already a no-op on an unconfigured build, and matched against the current `customerId`, since a cross-tab sign-in moves the JWT without clearing `meAtom`.
- **Demo sessions are deliberately not identified.** The demo signs everyone in as the shared `snoop@pug.sh` viewer, so identifying it would fuse every demo visitor into one profile and absorb their anonymous histories.

## Events

`trackFeature(featureId, featureName)` sends the well-known `feature_used` event, so a single `featureId` breakdown answers "what are users clicking". Never pass customer text (dashboard names, key names) as props; the `featureId` already says what happened.

Other manual events: `signin` (`method`), `signout`, `api_key_created`/`api_key_revoked`, `insight_queried` (shape only: type + counts, no filter values; fired inside the debounced query fn, one per settled query), `dashboard_viewed` (`dashboardId`, deduped by ref), `copied` (`context` label), `theme_selected` (`theme`: a built-in id or `custom`, `mode`), `theme_installed` (`source`).
