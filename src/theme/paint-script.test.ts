import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANONICAL_COLOR_RE } from '../lib/color/parse'
import { compileVariant } from './compile'
import { buildLibrary, checkInstall } from './library'
import { buildPaintCache, PAINT_CACHE_KEY } from './paint-cache'
import { POLARITIES, TOKENS } from './tokens'

// Runs the real inline script from index.html — the one piece of theming that executes before any
// module loads, and the one that trusts localStorage.
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const script = html.match(/<script>\s*(\/\/ Paint the stored theme[\s\S]*?)<\/script>/)?.[1] ?? ''
const root = document.documentElement
const paint = () => new Function(script)()
const media = (matches: Record<string, boolean>) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches[query] ?? false, media: query }))
const cache = (value: unknown) => localStorage.setItem(PAINT_CACHE_KEY, JSON.stringify(value))
const inline = () => TOKENS.filter(t => root.style.getPropertyValue(`--${t}`) !== '')

beforeEach(() => {
  root.className = ''
  root.removeAttribute('data-theme')
  root.removeAttribute('style')
  localStorage.clear()
  media({})
})
afterEach(() => vi.unstubAllGlobals())

describe('the first-paint script', () => {
  it('is in index.html, trusting exactly the canonical colour form', () => {
    expect(script).toContain(PAINT_CACHE_KEY)
    expect(script).toContain(CANONICAL_COLOR_RE.source)
  })

  it('paints Pug light with nothing stored', () => {
    paint()
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(inline()).toEqual([])
  })

  it('follows the OS in system mode, and the stored mode over it', () => {
    media({ '(prefers-color-scheme: dark)': true })
    paint()
    expect(root.classList.contains('dark')).toBe(true)
    root.className = ''
    localStorage.setItem('pug:theme', JSON.stringify('light'))
    paint()
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('selects a cached built-in by attribute', () => {
    cache({
      v: 1,
      autoContrast: false,
      light: { builtin: 'pug-colourblind', standard: true },
      dark: { builtin: 'pug', standard: true },
    })
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  it("applies an installed theme's canonical variables and nothing else", () => {
    cache({
      v: 1,
      autoContrast: false,
      light: {
        vars: { '--background': 'oklch(0.97 0.02 90)', '--card': 'url(https://example.com/x)', '--radius': '0' },
        standard: true,
      },
      dark: { builtin: 'pug', standard: true },
    })
    paint()
    expect(root.style.getPropertyValue('--background')).toBe('oklch(0.97 0.02 90)')
    expect(root.style.getPropertyValue('--card')).toBe('')
    expect(root.style.getPropertyValue('--radius')).toBe('')
  })

  it('ignores a cache from another version, or one that is not JSON', () => {
    cache({ v: 2, autoContrast: false, light: { builtin: 'pug-colourblind', standard: true } })
    paint()
    expect(root.hasAttribute('data-theme')).toBe(false)
    localStorage.setItem(PAINT_CACHE_KEY, '{')
    paint()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('swaps in High Contrast when the OS asks — on a first visit too', () => {
    media({ '(prefers-contrast: more)': true })
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-high-contrast')
  })

  it('leaves an installed high-contrast theme alone', () => {
    media({ '(prefers-contrast: more)': true })
    cache({
      v: 1,
      autoContrast: true,
      light: { vars: { '--background': 'oklch(1 0 0)' }, standard: false },
      dark: { builtin: 'pug', standard: true },
    })
    paint()
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(root.style.getPropertyValue('--background')).toBe('oklch(1 0 0)')
  })

  it('puts a stored dark mode on, whatever the OS says', () => {
    localStorage.setItem('pug:theme', JSON.stringify('dark'))
    paint()
    expect(root.classList.contains('dark')).toBe(true)
  })

  // themeModeAtom reads anything but light or dark as following the OS; painting it light flashes
  // every load for someone on a dark OS.
  it('follows the OS for a stored mode it does not know', () => {
    media({ '(prefers-color-scheme: dark)': true })
    localStorage.setItem('pug:theme', JSON.stringify('auto'))
    paint()
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('still paints the cached theme when the stored mode is not JSON', () => {
    localStorage.setItem('pug:theme', 'dark')
    cache({
      v: 1,
      autoContrast: false,
      light: { builtin: 'pug-colourblind', standard: true },
      dark: { builtin: 'pug', standard: true },
    })
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  it('leaves auto contrast off when the cache says so', () => {
    media({ '(prefers-contrast: more)': true })
    cache({
      v: 1,
      autoContrast: false,
      light: { builtin: 'pug', standard: true },
      dark: { builtin: 'pug', standard: true },
    })
    paint()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  // A broken cache is the same as none: Pug, with High Contrast if the OS asks — not a script that
  // stops halfway through.
  it('swaps in High Contrast under a cache that is not JSON', () => {
    media({ '(prefers-contrast: more)': true })
    localStorage.setItem(PAINT_CACHE_KEY, '{')
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-high-contrast')
  })

  // The two halves meet here: what buildPaintCache writes for a real installed theme has to be what
  // the script puts on <html>, token for token, in the mode it paints.
  it('paints exactly what the app compiles for an installed theme, in each mode', () => {
    const text = JSON.stringify({
      version: 1,
      name: 'Duo',
      variants: { light: { colors: { background: '#fdf6e3' } }, dark: { colors: { background: '#002b36' } } },
    })
    const check = checkInstall(text, [])
    if (!check.ok) throw new Error(JSON.stringify(check.issues))
    const library = buildLibrary([check.theme])
    const family = library.find(entry => entry.id === check.theme.id)?.family
    if (!family) throw new Error('Duo is not usable')
    cache(buildPaintCache({ selection: { light: check.theme.id, dark: check.theme.id }, autoContrast: false, library }))

    for (const polarity of POLARITIES) {
      root.className = ''
      root.removeAttribute('style')
      localStorage.setItem('pug:theme', JSON.stringify(polarity))
      paint()
      const { vars } = compileVariant({ id: check.theme.id, builtin: false, family, polarity })
      for (const [name, value] of Object.entries(vars)) expect(root.style.getPropertyValue(name)).toBe(value)
    }
  })
})
