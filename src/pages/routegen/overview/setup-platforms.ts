import flutterIcon from 'devicon/icons/flutter/flutter-original.svg?url'
import javascriptIcon from 'devicon/icons/javascript/javascript-original.svg?url'
import nodejsIcon from 'devicon/icons/nodejs/nodejs-original.svg?url'

// Per-platform onboarding shown on the Overview setup screen while a project has no events yet.
//
// Snippets are verified against the published SDKs: @pug-sh/browser (init(projectId, { apiKey })),
// pug_flutter (Pug.init(projectId, PugOptions(apiKey))), and @pug-sh/node (new Pug({ apiKey })).
// Client SDKs (web, Flutter) take the project ID at init — it namespaces the stored
// identity/session/consent and stamps every event, so it's required, not cosmetic. The Node server
// SDK omits it: the secret private key is project-scoped, and track() takes the distinctId first
// since a server has no ambient user. Docs links deep-link into the one tabbed SDK page via
// ?platform= — verified live at docs.pug.sh/docs/sdks.

const DOCS_BASE = 'https://docs.pug.sh/docs/sdks'

// Order is the source of truth; PlatformId is derived so the union can't drift from the tab list.
// Adding a platform = one entry here + one in PLATFORMS (the total Record makes the latter a
// compile error if forgotten).
export const PLATFORM_ORDER = ['web', 'node', 'flutter'] as const

export type PlatformId = (typeof PLATFORM_ORDER)[number]

export type Platform = {
  label: string
  icon: string
  docsUrl: string
  install: string
  // Client snippets interpolate the project ID and the public (publishable) key; the Node snippet
  // reads its secret key from the environment instead, so it ignores both arguments.
  setup: (projectId: string, publicKey: string) => string
}

export const PLATFORMS: Record<PlatformId, Platform> = {
  web: {
    label: 'Web',
    icon: javascriptIcon,
    docsUrl: `${DOCS_BASE}?platform=web`,
    install: 'npm install @pug-sh/browser',
    setup: (projectId, publicKey) => `import { init, identify, track } from '@pug-sh/browser'

init('${projectId}', { apiKey: '${publicKey}' })

// Tie events to a user once they sign in
identify('user_123', { email: 'ada@example.com', plan: 'pro' })

// Track what they do
track('signed_up', { plan: 'pro' })`,
  },
  node: {
    label: 'Node',
    icon: nodejsIcon,
    docsUrl: `${DOCS_BASE}?platform=node`,
    install: 'npm install @pug-sh/node',
    setup: () => `import { Pug } from '@pug-sh/node'

// Server-side: use your private key, read from the environment — never hardcode it
const pug = new Pug({ apiKey: process.env.PUG_API_KEY })

await pug.identify('user_123', { email: 'ada@example.com', plan: 'pro' })

pug.track('user_123', 'order_completed', { revenue: 49 })`,
  },
  flutter: {
    label: 'Flutter',
    icon: flutterIcon,
    docsUrl: `${DOCS_BASE}?platform=flutter`,
    install: 'flutter pub add pug_flutter',
    setup: (projectId, publicKey) => `import 'package:pug_flutter/pug_flutter.dart';

await Pug.init('${projectId}', const PugOptions(apiKey: '${publicKey}'));

// Tie events to a user once they sign in
await Pug.identify('user_123', traits: {'email': 'ada@example.com', 'plan': 'pro'});

// Track what they do
Pug.track('signed_up', props: {'plan': 'pro'});`,
  },
}
