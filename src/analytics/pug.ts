// Pug dogfooding itself: this dashboard reports its own usage through @pug-sh/browser, into an
// ordinary Pug project, over the same public-key ingest path a customer would use.
//
// Every export is a no-op unless VITE_PUG_PROJECT_ID and VITE_PUG_PUBLIC_KEY are both set, so an
// unconfigured checkout — the dev default — sends nothing. That gate is enforced here rather than
// leaned on from the SDK: the SDK's pre-init calls are already safe no-ops, but each one warns
// through an ungated console.warn, which would put "[Pug SDK] track() called before init()" behind
// every click in local dev.

import { identify, init, reset, type TrackFn, track } from '@pug-sh/browser'
import { maskEventUrls } from './sanitize-url'

const projectId = import.meta.env.VITE_PUG_PROJECT_ID
const publicKey = import.meta.env.VITE_PUG_PUBLIC_KEY

// Exported so a caller can skip work that exists only to feed analytics — an unconfigured
// (self-hosted) dashboard should not spend a request on identity it will never report.
export const analyticsEnabled = Boolean(projectId && publicKey)

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

  if (!analyticsEnabled) return

  init(projectId, {
    apiKey: publicKey,
    // Shares identity with pug.sh and docs.pug.sh across the registrable domain, which is what
    // puts "read the docs, then came back and built a dashboard" on one profile. It carries
    // identity outward only: both of those start cookieless for a visitor we have never met, so a
    // first-timer has no device ID for the first identify() here to merge, and the pre-signup half
    // of the funnel stays unjoined. Recovering it means granting consent over there.
    //
    // Pinned to 'pug.sh' (must match pug-site). `true` would auto-discover the same domain, but its
    // widest-first probe tries `domain=.sh` first on an apex host and the browser logs that public-
    // suffix rejection as "Cookie … rejected for invalid domain". Pinning skips that probe — same
    // .pug.sh cookie, no console noise, and no write-probe guessing. On app.pug.sh the SDK confirms
    // the host ends with .pug.sh before using it.
    crossSubdomainTracking: { domain: 'pug.sh' },
    // The SDK defaults to 'cookieless': no identifier is written to the device and identify() is a
    // no-op, which would make the cross-subdomain cookie above dead config and leave every signed-in
    // session anonymous. Stated explicitly because this is our own product behind a login, not a
    // marketing page — the funnel is the reason both surfaces are instrumented at all.
    trackingConsent: 'granted',
    beforeSend: maskEventUrls,
    // An allowlist, not a denylist: every key omitted here is off, so this is the SDK's default set
    // minus `scroll`. `{ scroll: false }` would not do it — it is a compile error, and under an
    // allowlist it would mean "capture nothing".
    autoCapture: { pageView: true, click: true, form: true, rageClick: true, deadClick: true },
  })

  // Clicks stay on deliberately. What keeps that safe is the `data-pug-no-capture` marker on <main>
  // in App.tsx: click and dead-click capture send the clicked element's innerText, and in this app
  // that text is customer data.
  // The marker blanks text under the content region while still counting the interaction, so app
  // chrome (sidebar, header) keeps meaningful labels and the data surfaces send structure only.
  // Buttons inside <main> are covered by explicit trackFeature() calls instead — see below.
}

// Gated passthrough. Typed as TrackFn so call sites keep the SDK's well-known-event autocomplete
// and property checking; unknown event names still fall through to loose props.
export const trackEvent: TrackFn = (kind: string, props?: Parameters<TrackFn>[1], opts?: Parameters<TrackFn>[2]) => {
  if (!analyticsEnabled) return
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

// Identity. externalId stays the JWT's customerId, and the email is a trait rather than the ID it
// looks like it could be: a profile is keyed by (project, externalId) with no rename path, so an
// address would strand the profile the day someone changes theirs — and post-identify it is the
// distinct ID stamped on every event and held in plaintext in the identity cookie the SDK shares
// across .pug.sh. As a trait it still identifies the person, on the profile's secondary line —
// though not as the label: resolveIdentity prefers only a *name* trait over the external ID.
//
// CustomerTraits is a closed shape, not Record<string, string>, because this is the one call that
// attaches persistent identity — a PII boundary. Our own first-party account labels only, never a
// *customer's* end-user email/id and never free customer text: a stray trait on a direct call is
// then a compile error, and adding one is a deliberate edit here rather than a key at a caller.
export type CustomerTraits = {
  readonly email?: string
  readonly orgId?: string
  readonly orgName?: string
  readonly role?: string
  readonly projectId?: string
  readonly projectName?: string
}

export const identifyCustomer = (customerId: string, traits: CustomerTraits) => {
  if (!analyticsEnabled) return
  // identify() returns a promise that never rejects — failures are logged inside the SDK. Nothing
  // here can react to a failed identify anyway, so it's deliberately not awaited.
  void identify(customerId, traits)
}

export const resetIdentity = () => {
  if (!analyticsEnabled) return
  reset()
}
