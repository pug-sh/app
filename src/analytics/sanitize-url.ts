// URL redaction for the SDK's `$url` / `$referrer` / form-action capture.
//
// This dashboard is not a normal integration: almost everything it renders belongs to someone
// else. A profileId is a *customer's* end-user distinct ID — frequently their email — so an
// unredacted URL would pull third parties' PII into our own project and make us a controller of
// data we only process. A shareId is worse: it is the bearer credential for a public dashboard,
// and /magic-link's `token` is a live sign-in credential. None of it may leave the device.
//
// Runs synchronously on every event, so it stays allocation-light and side-effect-free. The SDK
// fails closed around it (a throw or non-string drops the URL to '' rather than sending it raw),
// so correctness here is about *what* we keep, not about defending the call.

// Static children of /dashboards that are routes, not IDs. Without this, /dashboards/new — a real
// page whose usage we want to see — would be masked into the :dashboardId bucket and vanish.
const DASHBOARD_STATIC_SEGMENTS = new Set(['new'])

const maskPath = (pathname: string) => {
  const segments = pathname.split('/')

  // segments[0] is always '' for an absolute path, so the route root sits at [1].
  switch (segments[1]) {
    case 'profiles':
      if (segments[2]) segments[2] = ':profileId'
      // /profiles/:profileId/sessions/:sessionId — the tab segment at [3] is static and kept.
      if (segments[3] === 'sessions' && segments[4]) segments[4] = ':sessionId'
      break
    case 'dashboards':
      if (segments[2] && !DASHBOARD_STATIC_SEGMENTS.has(segments[2])) segments[2] = ':dashboardId'
      break
    case 'shared':
      if (segments[2]) segments[2] = ':shareId'
      break
  }

  return segments.join('/')
}

// Drops every query param rather than denylisting the known-sensitive ones. The app encodes
// Insights state into the query as JSON (`ef`/`pf` carry property-filter *values*, i.e. customer
// PII; `bd`/`tk`/`it`/`gr`/`tf`/`tt` carry UI state) and /magic-link carries `token`. An allowlist
// would need updating every time a param is added — and the failure mode of forgetting is silent,
// permanent PII in our own analytics. Nothing in this app's query string is worth that risk:
// what we actually want from the query is answered by explicit track() calls instead.
//
// This does NOT cost UTM attribution. The SDK parses $utmSource/$utmMedium/etc. from
// window.location.search directly and never routes them through this function (see track.ts),
// so the acquisition funnel from pug.sh survives intact.
export const sanitizeUrl = (raw: string) => {
  const url = new URL(raw, window.location.origin)
  url.search = ''
  url.hash = ''
  url.pathname = maskPath(url.pathname)
  return url.toString()
}
