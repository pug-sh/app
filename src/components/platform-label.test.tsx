import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlatformLabel, PlatformStackLabel } from '@/components/platform-label'

// The trigger renders one icon. Its <img> is aria-hidden, so reach for it directly rather than by
// role; absence of one means the neutral globe rendered instead.
const triggerIconSrc = (container: HTMLElement) => container.querySelector('img')?.getAttribute('src') ?? null

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
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).toContain('Epiphany')
  })

  // The case the fallback was written for, and the one it has to keep: no browser, so the OS leads.
  it('draws the OS mark when no browser is named', () => {
    const { container } = render(<Label os="Linux" />)
    expect(triggerIconSrc(container)).toBe('/brands/linux.svg')
  })
})
