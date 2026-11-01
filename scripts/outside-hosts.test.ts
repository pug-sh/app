// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The next outside host will arrive the way the last three did: quietly, in a useful feature. So every origin our own
// code names has to say why it's safe, and a new one fails here until someone does. Comments count, which keeps this
// simple. The bundle can't be checked this way: dist holds dozens of dependency strings that make no request.
const ALLOWED: Record<string, string> = {
  'https://themes.pug.sh': 'gated by VITE_PUG_SERVICES_ENABLED',
  'https://favicons.pug.sh': 'gated by VITE_PUG_SERVICES_ENABLED',
  'https://challenges.cloudflare.com': 'gated by a Turnstile key',
  'https://accounts.google.com': 'label, compared with a provider’s issuer',
  'https://cdn.pugs.dev': 'label, text in an SDK snippet',
  'https://acme.okta.com': 'label, a form placeholder',
  'https://docs.pug.sh': 'link',
  'https://discord.gg': 'link',
  'https://www.reddit.com': 'link',
  'https://openstreetmap.org': 'link, map attribution',
  'https://protomaps.com': 'link, map attribution',
  'http://www.w3.org': 'label, an XML namespace',
}

const ROOTS = ['src', 'functions', 'index.html']
// Generated or vendored, so never something we'd act on, and the test files' addresses are made up.
const SKIPPED = [
  'src/test/',
  'src/api/genproto/',
  'src/components/charts/',
  'src/components/shimmering-text.tsx',
  'src/theme/generated/',
  'src/theme/__fixtures__/',
]
const ORIGIN = /\b(?:https?|wss?):\/\/[a-z0-9.-]+\.[a-z]{2,}/gi

const filesUnder = (root: string) => {
  const names = root === 'index.html' ? [root] : readdirSync(root, { recursive: true, encoding: 'utf8' })
  return names.map(name => (root === 'index.html' ? name : path.join(root, name)))
}

const ownCode = (file: string) =>
  /\.(ts|tsx|css|html)$/.test(file) && !file.includes('.test.') && !SKIPPED.some(skip => file.startsWith(skip))

// Each origin, and the first file that names it, for the failure message.
const named = new Map<string, string>()
for (const file of ROOTS.flatMap(filesUnder).filter(ownCode)) {
  for (const [origin] of readFileSync(file, 'utf8').matchAll(ORIGIN)) {
    if (!named.has(origin.toLowerCase())) named.set(origin.toLowerCase(), file)
  }
}

describe('outside hosts in our own code', () => {
  it('names none it can’t explain', () => {
    expect([...named].filter(([origin]) => !Object.hasOwn(ALLOWED, origin))).toEqual([])
  })

  it('explains none it no longer names', () => {
    expect(Object.keys(ALLOWED).filter(origin => !named.has(origin))).toEqual([])
  })
})
