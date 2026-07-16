import flutterIcon from 'devicon/icons/flutter/flutter-original.svg?url'
import html5Icon from 'devicon/icons/html5/html5-original.svg?url'
import javascriptIcon from 'devicon/icons/javascript/javascript-original.svg?url'
import nodejsIcon from 'devicon/icons/nodejs/nodejs-original.svg?url'

// Per-platform onboarding shown on the Overview setup screen while a project has no events yet.
//
// Snippets are verified against the published SDKs: @pug-sh/browser (init(projectId, { apiKey })),
// pug_flutter (Pug.init(projectId, PugOptions(apiKey))), and @pug-sh/node (new Pug({ apiKey })).
// Client SDKs (web, script, Flutter) take the project ID at init — it namespaces the stored
// identity/session/consent and stamps every event, so it's required, not cosmetic. The Node server
// SDK omits it: the secret private key is project-scoped, and track() takes the distinctId first
// since a server has no ambient user.
//
// The `script` platform is the same @pug-sh/browser SDK loaded from the CDN with no bundler: the
// loader snippet (stubs the API, queues early calls, then pug.init) and the one-tag install
// (declarative data-* attributes, for pages under a strict CSP that forbids inline script). Both
// derive from the README's "Script tag (CDN)" section. The loader snippet is verbatim — only the
// project ID and public key are interpolated. The one-tag install is that snippet minus its
// data-options attribute: the README seeds trackingConsent { default: 'denied' } to demo a
// consent-first setup, but this quickstart omits it so consent stays the SDK default ('granted')
// and first events actually flow — the setup screen polls until they do, so keep data-options
// dropped when syncing from the README. Docs links deep-link into the one tabbed SDK page via
// ?platform= (docs.pug.sh/docs/sdks); the CDN install is documented under the web SDK tab.

const DOCS_BASE = 'https://docs.pug.sh/docs/sdks'

// The CDN serves one immutable, self-contained bundle per SDK release at a version-in-path, @-free
// URL (a `pkg@version` substring trips Cloudflare Email Address Obfuscation and breaks the load —
// see sdk-web/RELEASING.md). Bump on every @pug-sh/browser release so the Script tab serves the
// current SDK: a stale pin still resolves (paths are immutable) but serves an old bundle, and the
// Web tab's unpinned `npm install` drifts ahead of it. Unlike sdk-web, nothing here gates this
// version against the SDK release, so the bump is manual. Pre-1.0 pins the exact version; at 1.0
// this becomes a rolling `v1` alias.
const PUG_CDN_VERSION = 'v0.0.3'
const PUG_CDN_URL = `https://cdn.pugs.dev/${PUG_CDN_VERSION}/pug.min.js`

// Order is the source of truth; PlatformId is derived so the union can't drift from the tab list.
// Adding a platform = one entry here + one in PLATFORMS (the total Record makes the latter a
// compile error if forgotten).
export const PLATFORM_ORDER = ['web', 'script', 'node', 'flutter'] as const

export type PlatformId = (typeof PLATFORM_ORDER)[number]

// One labeled code block in a platform's setup flow, rendered top-to-bottom. `code` receives the
// project's identifiers so client snippets can interpolate them; sections that don't need them —
// install commands, and the Node server snippet (secret key from the environment) — ignore both args.
//
// `credential` states which of them the snippet actually bakes in, so the setup screen knows whether
// the block is waiting on a fetched key. Required, not optional: a new section is a compile error
// until it answers, which is how this module keeps the rest of its metadata honest (see
// PLATFORM_ORDER above).
export type CodeSection = {
  label: string
  credential: 'public' | 'none'
  code: (projectId: string, publicKey: string) => string
}

export type Platform = {
  label: string
  icon: string
  docsUrl: string
  sections: CodeSection[]
  // Set when the platform authenticates with a private key. Its snippet reads that key from the
  // environment rather than interpolating it, and a project does not come with one — so the setup
  // screen points at the settings page, the only place to mint one and see it (once).
  needsPrivateKey?: boolean
}

export const PLATFORMS: Record<PlatformId, Platform> = {
  web: {
    label: 'Web',
    icon: javascriptIcon,
    docsUrl: `${DOCS_BASE}?platform=web`,
    sections: [
      { label: 'Install', credential: 'none', code: () => 'npm install @pug-sh/browser' },
      {
        label: 'Initialize & track',
        credential: 'public',
        code: (projectId, publicKey) => `import { init, identify, track } from '@pug-sh/browser'

init('${projectId}', { apiKey: '${publicKey}' })

// Tie events to a user once they sign in
identify('user_123', { email: 'ada@example.com', plan: 'pro' })

// Track what they do
track('signed_up', { plan: 'pro' })`,
      },
    ],
  },
  script: {
    label: 'Script',
    icon: html5Icon,
    docsUrl: `${DOCS_BASE}?platform=web`,
    sections: [
      {
        label: 'Add to your <head>',
        credential: 'public',
        code: (projectId, publicKey) => `<script>
  !(function (w, d) {
    if (w.pug) { if (!w.pug._q) console.warn('[Pug SDK] window.pug already defined by another script; not loaded.'); return; }
    var q = [];
    var pug = (w.pug = { _q: q, _v: 1 });
    var methods = ('init track identify reset destroy setAutoCapture optInTracking optOutTracking ' +
      'isTrackingEnabled getTrackingConsent rotate ready').split(' ');
    methods.forEach(function (m) {
      pug[m] = function () { if (q.length < 1000) q.push([m, [].slice.call(arguments)]); };
    });
    var s = d.createElement('script');
    s.async = true;
    s.src = '${PUG_CDN_URL}';
    s.onerror = function () { console.warn('[Pug SDK] Failed to load ' + s.src); };
    d.head.appendChild(s);
  })(window, document);

  pug.init('${projectId}', { apiKey: '${publicKey}' });
</script>`,
      },
      {
        label: 'Or, under a strict CSP (no inline script)',
        credential: 'public',
        code: (projectId, publicKey) => `<script
  async
  src="${PUG_CDN_URL}"
  data-project-id="${projectId}"
  data-api-key="${publicKey}"
></script>`,
      },
    ],
  },
  node: {
    label: 'Node',
    icon: nodejsIcon,
    docsUrl: `${DOCS_BASE}?platform=node`,
    needsPrivateKey: true,
    sections: [
      { label: 'Install', credential: 'none', code: () => 'npm install @pug-sh/node' },
      {
        label: 'Initialize & track',
        credential: 'none',
        code: () => `import { Pug } from '@pug-sh/node'

// Server-side: use your private key, read from the environment — never hardcode it
const pug = new Pug({ apiKey: process.env.PUG_API_KEY })

await pug.identify('user_123', { email: 'ada@example.com', plan: 'pro' })

pug.track('user_123', 'order_completed', { revenue: 49 })`,
      },
    ],
  },
  flutter: {
    label: 'Flutter',
    icon: flutterIcon,
    docsUrl: `${DOCS_BASE}?platform=flutter`,
    sections: [
      { label: 'Install', credential: 'none', code: () => 'flutter pub add pug_flutter' },
      {
        label: 'Initialize & track',
        credential: 'public',
        code: (projectId, publicKey) => `import 'package:pug_flutter/pug_flutter.dart';

await Pug.init('${projectId}', const PugOptions(apiKey: '${publicKey}'));

// Tie events to a user once they sign in
await Pug.identify('user_123', traits: {'email': 'ada@example.com', 'plan': 'pro'});

// Track what they do
Pug.track('signed_up', props: {'plan': 'pro'});`,
      },
    ],
  },
}
