import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLATFORMS } from '@/pages/routegen/overview/setup-platforms'
import { BRAND_ICON_ASSETS } from './brand-icon-assets'

// public/ is copied verbatim and never enters the module graph, so a typo'd or stale path is not a
// build error — it is an <img> that 404s behind aria-hidden and renders the same as a brand we have
// no glyph for. Nothing else in the toolchain looks at these strings.
const PUBLIC_DIR = join(process.cwd(), 'public')

const brandPaths = Object.entries(BRAND_ICON_ASSETS)
const sdkPaths = Object.entries(PLATFORMS).map(([id, platform]) => [id, platform.icon] as const)

describe.each([
  ['brand icon', brandPaths, '/brands'],
  ['SDK setup icon', sdkPaths, '/sdk'],
])('%s assets', (_label, entries, dir) => {
  it.each(entries)('%s resolves to a real file', (_name, path) => {
    expect(path.startsWith(`${dir}/`)).toBe(true)
    const onDisk = join(PUBLIC_DIR, path)
    expect(existsSync(onDisk)).toBe(true)
    // Case-exact: a Chrome.svg typo resolves on a macOS checkout and 404s in production.
    expect(readdirSync(dirname(onDisk))).toContain(basename(onDisk))
  })

  it('leaves no orphan file in the directory', () => {
    const referenced = new Set(entries.map(([, path]) => basename(path)))
    const onDisk = readdirSync(join(PUBLIC_DIR, dir)).filter(f => f !== 'NOTICE.md')
    expect(onDisk.filter(f => !referenced.has(f))).toEqual([])
  })
})
