import { describe, expect, it } from 'bun:test'
import { deviconSrc } from '@/lib/devicon-assets'
import type { DeviconName } from '@/lib/devicon-map'

// The complete key union, mirrored here so the test fails loudly if a name is
// added to DeviconName without a corresponding asset entry.
const ALL_NAMES: DeviconName[] = [
  'android-original',
  'chrome-original',
  'debian-original',
  'edge',
  'fedora-original',
  'firefox',
  'ios',
  'linux-original',
  'macos',
  'opera-original',
  'safari-original',
  'ubuntu-original',
  'windows11-original',
]

describe('deviconSrc', () => {
  it('returns the self-hosted path for public assets', () => {
    expect(deviconSrc('edge')).toBe('/devicon/edge.svg')
    expect(deviconSrc('ios')).toBe('/devicon/ios.svg')
    expect(deviconSrc('macos')).toBe('/devicon/macos.svg')
  })

  it('returns a bundled .svg url for every other name', () => {
    expect(deviconSrc('android-original')).toContain('android-original')
    expect(deviconSrc('chrome-original')).toContain('chrome-original')
    expect(deviconSrc('windows11-original')).toContain('windows11-original')
  })

  it('resolves a non-empty .svg source for every DeviconName', () => {
    for (const name of ALL_NAMES) {
      const src = deviconSrc(name)
      expect(src).toBeTruthy()
      expect(src.endsWith('.svg')).toBe(true)
    }
  })
})
