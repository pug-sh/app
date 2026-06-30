import flutterIcon from 'devicon/icons/flutter/flutter-original.svg?url'
import javascriptIcon from 'devicon/icons/javascript/javascript-original.svg?url'
import nodejsIcon from 'devicon/icons/nodejs/nodejs-original.svg?url'

// Per-platform onboarding shown on the Overview setup screen while a project has no events yet.
//
// PLACEHOLDERS TO CONFIRM: the package names, docs URLs, and SDK method surface below are
// best-guess conventions — this repo has no real SDK references yet. Update these once the
// published packages and docs site are settled. Key split follows the usual convention: the
// publishable public key goes in client SDKs, the secret private key stays server-side.

const DOCS_BASE = 'https://docs.pug.sh/sdks'

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
  // The public (publishable) key is interpolated into client snippets; the Node snippet reads
  // its secret key from the environment instead, so it ignores this argument.
  setup: (publicKey: string) => string
}

export const PLATFORMS: Record<PlatformId, Platform> = {
  web: {
    label: 'Web',
    icon: javascriptIcon,
    docsUrl: `${DOCS_BASE}/web`,
    install: 'npm install @pug-sh/web',
    setup: publicKey => `import { Pug } from '@pug-sh/web'

const pug = new Pug({ apiKey: '${publicKey}' })

// Tie events to a user once they sign in
pug.identify('user_123', { email: 'ada@example.com', plan: 'pro' })

// Track what they do
pug.track('signed_up', { plan: 'pro' })`,
  },
  node: {
    label: 'Node',
    icon: nodejsIcon,
    docsUrl: `${DOCS_BASE}/node`,
    install: 'npm install @pug-sh/node',
    setup: () => `import { Pug } from '@pug-sh/node'

// Server-side: use your private key, read from the environment — never hardcode it
const pug = new Pug({ apiKey: process.env.PUG_API_KEY })

await pug.identify('user_123', { email: 'ada@example.com', plan: 'pro' })

await pug.track('order_completed', { userId: 'user_123', revenue: 49 })`,
  },
  flutter: {
    label: 'Flutter',
    icon: flutterIcon,
    docsUrl: `${DOCS_BASE}/flutter`,
    install: 'flutter pub add pug_flutter',
    setup: publicKey => `import 'package:pug_flutter/pug_flutter.dart';

final pug = Pug(apiKey: '${publicKey}');

// Tie events to a user once they sign in
pug.identify('user_123', traits: {'email': 'ada@example.com', 'plan': 'pro'});

// Track what they do
pug.track('signed_up', properties: {'plan': 'pro'});`,
  },
}
