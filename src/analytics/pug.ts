// Pug dogfooding itself: this dashboard reports its own usage through @pug-sh/browser, into an
// ordinary Pug project, over the same public-key ingest path a customer would use.
//
// Every export is a no-op unless VITE_PUG_PROJECT_ID and VITE_PUG_PUBLIC_KEY are both set, so an
// unconfigured checkout — the dev default — sends nothing. That gate is enforced here rather than
// leaned on from the SDK: the SDK's pre-init calls are already safe no-ops, but each one warns
// through an ungated console.warn, which would put "[Pug SDK] track() called before init()" behind
// every click in local dev.

import { identify, init, reset, type TrackFn, track } from '@pug-sh/browser'
import { sanitizeUrl } from './sanitize-url'

const projectId = import.meta.env.VITE_PUG_PROJECT_ID
const publicKey = import.meta.env.VITE_PUG_PUBLIC_KEY

const enabled = Boolean(projectId && publicKey)

export const initAnalytics = () => {
  // Exactly one of the two set is a deploy typo, not an intentional "off": neither-set is silent by
  // design, but a half-configured build believes analytics is on while sending nothing, and stays
  // that way until someone notices an empty dashboard. Warn once (init runs once at startup) so the
  // misconfiguration surfaces instead of hiding behind the same silent no-op as the disabled default.
  if (Boolean(projectId) !== Boolean(publicKey)) {
    console.warn(
      '[analytics] Only one of VITE_PUG_PROJECT_ID / VITE_PUG_PUBLIC_KEY is set — dogfooding stays OFF. Set both or neither.',
    )
  }

  if (!enabled) return

  init(projectId, {
    apiKey: publicKey,
    // Shares identity with pug.sh across the registrable domain, which is the whole point of
    // instrumenting both: without it the anonymous visitor reading the marketing site and the
    // account they create here are two unrelated profiles, and the signup funnel is unfollowable.
    //
    // Pinned to 'pug.sh' (must match pug-site). `true` would auto-discover the same domain, but its
    // widest-first probe tries `domain=.sh` first on an apex host and the browser logs that public-
    // suffix rejection as "Cookie … rejected for invalid domain". Pinning skips that probe — same
    // .pug.sh cookie, no console noise, and no write-probe guessing. On app.pug.sh the SDK confirms
    // the host ends with .pug.sh before using it.
    crossSubdomainTracking: { domain: 'pug.sh' },
    sanitizeUrl,
  })

  // autoCapture is left at its default (everything on) deliberately, clicks included. What keeps
  // that safe is the `data-pug-no-capture` marker on <main> in App.tsx: click and dead-click
  // capture send the clicked element's innerText, and in this app that text is customer data.
  // The marker blanks text under the content region while still counting the interaction, so app
  // chrome (sidebar, header) keeps meaningful labels and the data surfaces send structure only.
  // Buttons inside <main> are covered by explicit trackFeature() calls instead — see below.
}

// Gated passthrough. Typed as TrackFn so call sites keep the SDK's well-known-event autocomplete
// and property checking; unknown event names still fall through to the loose overload.
export const trackEvent: TrackFn = (kind: string, props?: Parameters<TrackFn>[1], opts?: Parameters<TrackFn>[2]) => {
  if (!enabled) return
  track(kind, props, opts)
}

// The answer to "what buttons are users clicking".
//
// Click autocapture can't answer it here on its own: it sends only tag/id/class/innerText, this
// app's buttons carry no ids and Tailwind-soup classes, and an icon-only button (every hover-
// revealed row action) reports tag `svg` with empty text — SVG elements have no innerText. On top
// of that the <main> marker blanks the label text of the very buttons we care about.
//
// So the buttons that matter get named explicitly. `feature_used` is the well-known event built
// for this, which makes the question a single featureId breakdown in Insights rather than an
// archaeology dig through class strings. featureId is the stable key ('dashboard.create'); rename
// featureName freely, but treat featureId as a wire contract — changing one splits its own history.
// Taken as a named object, not two positional strings, so the stable key and the free label can't be
// transposed at a call site (they are the same type — nothing else would catch the swap).
export const trackFeature = ({ featureId, featureName }: { featureId: string; featureName: string }) => {
  trackEvent('feature_used', { featureId, featureName })
}

// Identity. externalId is the JWT's customerId, the only stable ID available at boot (email would
// cost a GetMe that nothing else needs). Traits ride along from state WorkspaceBootstrap has
// already loaded, so this stays free.
//
// CustomerTraits is a closed shape, not Record<string, string>, because this is the one call that
// attaches persistent identity — a PII boundary. Our own first-party account labels only, never an
// end-user's email/id and never free customer text: a stray `{ email }` on a direct call is then a
// compile error, and adding a trait is a deliberate edit here rather than an ad-hoc key at a caller.
export type CustomerTraits = {
  readonly orgId?: string
  readonly orgName?: string
  readonly role?: string
  readonly projectId?: string
  readonly projectName?: string
}

export const identifyCustomer = (customerId: string, traits: CustomerTraits) => {
  if (!enabled) return
  // identify() returns a promise that never rejects — failures are logged inside the SDK. Nothing
  // here can react to a failed identify anyway, so it's deliberately not awaited.
  void identify(customerId, traits)
}

export const resetIdentity = () => {
  if (!enabled) return
  reset()
}
