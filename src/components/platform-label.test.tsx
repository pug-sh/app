import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrowserLabel, PlatformLabel, PlatformStackLabel, PlatformTooltip } from '@/components/platform-label'

// The trigger renders one icon. Its <img> is aria-hidden, so reach for it directly rather than by
// role; absence of one means a neutral glyph rendered instead — triggerGlyph says which.
const triggerIconSrc = (container: HTMLElement) => container.querySelector('img')?.getAttribute('src') ?? null

// Which glyph, not just that one rendered: lucide stamps the icon name into the class from a
// build-time literal, so this survives minification where displayName would not.
const triggerGlyph = (container: HTMLElement) =>
  container
    .querySelector('svg')
    ?.getAttribute('class')
    ?.match(/lucide-[a-z-]+/)?.[0] ?? null

describe.each([
  ['PlatformLabel', PlatformLabel],
  ['PlatformStackLabel', PlatformStackLabel],
])('%s icon slot', (_name, Label) => {
  it('draws the browser mark when the browser is known', () => {
    const { container } = render(<Label browser="Google Chrome" os="Windows" />)
    expect(triggerIconSrc(container)).toBe('/brands/chrome.svg')
  })

  // The bug: `resolveBrowserIcon(browser) ?? resolveOsIcon(os)` let an unrecognised browser fall
  // through to the OS mark, so this row drew Tux and never reached UnknownBrowserIcon. A named
  // browser owns the slot — unrecognised, that means the globe.
  it('draws the neutral globe when the browser is named but unrecognised', () => {
    const { container } = render(<Label browser="Epiphany" os="Linux" />)
    expect(triggerIconSrc(container)).toBeNull()
    expect(triggerGlyph(container)).toBe('lucide-globe')
    expect(container.textContent).toContain('Epiphany')
  })

  // The case the fallback was written for, and the one it has to keep: no browser, so the OS leads.
  it('draws the OS mark when no browser is named', () => {
    const { container } = render(<Label os="Linux" />)
    expect(triggerIconSrc(container)).toBe('/brands/linux.svg')
  })

  it('draws the bot glyph instead of the globe on automated traffic', () => {
    const { container } = render(<Label browser="Applebot" os="macOS" bot />)
    expect(triggerIconSrc(container)).toBeNull()
    expect(triggerGlyph(container)).toBe('lucide-bot')
  })

  it('keeps a recognised browser mark on automated traffic', () => {
    const { container } = render(<Label browser="Google Chrome" os="Linux" bot />)
    expect(triggerIconSrc(container)).toBe('/brands/chrome.svg')
  })
})

// On a native app the User-Agent is the Dart HTTP client's, so $browser came through as "Dart" and
// took the icon slot with the neutral globe — claiming a browser the row doesn't have. $platform is
// the only thing that distinguishes the two SDKs, since a native $browser is a plausible name.
describe.each([
  ['PlatformLabel', PlatformLabel],
  ['PlatformStackLabel', PlatformStackLabel],
])('%s native rows', (_name, Label) => {
  it('drops the HTTP client browser and lets the OS lead', () => {
    const { container } = render(<Label browser="Dart" os="android" platform="android" />)
    expect(container.textContent).not.toContain('Dart')
    expect(triggerIconSrc(container)).toBe('/brands/android.svg')
  })

  it('keeps the browser when the platform is web', () => {
    const { container } = render(<Label browser="Google Chrome" os="macOS" platform="web" />)
    expect(container.textContent).toContain('Google Chrome')
    expect(triggerIconSrc(container)).toBe('/brands/chrome.svg')
  })

  // Absent on the profile summary, which carries no platform field — those rows must not change.
  it('treats an absent platform as web', () => {
    const { container } = render(<Label browser="Google Chrome" os="macOS" />)
    expect(container.textContent).toContain('Google Chrome')
  })

  // Dart's Platform.operatingSystem is lowercase; the web SDK and the backend both send the canonical
  // casing, so an app row read "android" next to a browser row's "macOS".
  it('renders the native lowercase OS in canonical casing', () => {
    const { container } = render(<Label os="macos" platform="macos" />)
    expect(container.textContent).toContain('macOS')
    expect(container.textContent).not.toContain('macos')
  })
})

// The map popover is the one surface that renders the browser alone, so suppressing the name there
// left the version behind: a Flutter visitor drew the globe next to a bare "3".
describe('BrowserLabel native rows', () => {
  it('renders the fallback, not the HTTP client version', () => {
    const { container } = render(<BrowserLabel browser="Dart" browserVersion="3" platform="android" fallback="—" />)
    expect(container.textContent).toBe('—')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('still renders browser and version on web', () => {
    const { container } = render(<BrowserLabel browser="Google Chrome" browserVersion="124" platform="web" />)
    expect(container.textContent).toContain('Google Chrome 124')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brands/chrome.svg')
  })
})

// Rendered directly: the labels above only ever assert their trigger, so nothing covered the panel
// the trigger opens — where a native row's browser is suppressed a second, independent time.
describe('PlatformTooltip', () => {
  it('drops the HTTP client browser and canonicalises the native OS', () => {
    const { container } = render(
      <PlatformTooltip
        browser="Dart"
        browserVersion="3"
        os="android"
        osVersion="14"
        device="Pixel 8"
        platform="android"
      />,
    )
    expect(container.textContent).not.toContain('Dart')
    // The globe is the browser slot's unknown state, so its absence is what proves the item is gone
    // rather than merely unlabelled — BrandIcon renders an <img>, and the dividers are spans.
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brands/android.svg')
    expect(container.textContent).toContain('Android')
    expect(container.textContent).toContain('Pixel 8')
  })

  // The icon slot keeps a recognised mark on a bot, so the panel is the only place a datacenter
  // Chrome says it is automated at all.
  it('names automated traffic even when the browser mark resolves', () => {
    const { container } = render(<PlatformTooltip browser="Google Chrome" browserVersion="124" os="macOS" bot />)
    expect(container.textContent).toContain('Automated')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brands/chrome.svg')
  })

  it('keeps browser, device and OS on a web row', () => {
    const { container } = render(
      <PlatformTooltip
        browser="Google Chrome"
        browserVersion="124"
        os="macOS"
        osVersion="15"
        device="MacBookPro18,3"
        platform="web"
      />,
    )
    expect(container.textContent).toContain('Google Chrome')
    expect(container.textContent).toContain('124')
    expect(container.textContent).toContain('MacBookPro18,3')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brands/chrome.svg')
  })
})
