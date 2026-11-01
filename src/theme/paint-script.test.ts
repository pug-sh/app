import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANONICAL_COLOR_RE } from '../lib/color/parse'
import { runPaintScript as paint, PAINT_SCRIPT as script } from '../test/paint-script'
import { compileVariant } from './compile'
import { buildLibrary, checkInstall } from './library'
import { buildPaintCache, PAINT_CACHE_KEY } from './paint-cache'
import { POLARITIES, TOKENS } from './tokens'

const root = document.documentElement
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
    cache({ v: 4, autoContrast: false, light: { builtin: 'pug-colourblind', standard: true } })
    paint()
    expect(root.hasAttribute('data-theme')).toBe(false)
    localStorage.setItem(PAINT_CACHE_KEY, '{')
    paint()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('swaps in High Contrast when the OS asks, on a first visit too', () => {
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

  // A broken cache is the same as none: Pug, with High Contrast if the OS asks, not a script that
  // stops halfway through.
  it('swaps in High Contrast under a cache that is not JSON', () => {
    media({ '(prefers-contrast: more)': true })
    localStorage.setItem(PAINT_CACHE_KEY, '{')
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-high-contrast')
  })

  // The two halves meet here: what buildPaintCache writes for a real installed theme has to be what
  // the script puts on <html>, token for token, in the mode, at the level and in the colour vision it paints.
  it.each(POLARITIES)('paints exactly what the app compiles for an installed theme, %s', polarity => {
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
    const selection = { light: check.theme.id, dark: check.theme.id }
    cache(
      buildPaintCache({
        previous: null,
        projectId: null,
        choice: { selection, source: 'personal' },
        personal: selection,
        contrast: 'system',
        vision: 'colourblind',
        library,
      }),
    )

    for (const contrast of ['standard', 'high'] as const) {
      root.className = ''
      root.removeAttribute('style')
      localStorage.setItem('pug:theme', JSON.stringify(polarity))
      media({ '(prefers-contrast: more)': contrast === 'high' })
      paint()
      const access = { contrast, vision: 'colourblind' as const }
      const { vars } = compileVariant({ id: check.theme.id, builtin: false, family, polarity, access })
      for (const [name, value] of Object.entries(vars)) expect(root.style.getPropertyValue(name)).toBe(value)
    }
  })
})

describe('the first-paint script, per project', () => {
  const at = (path: string) => window.history.replaceState(null, '', path)
  const pug = { builtin: 'pug', standard: true }
  const colourblind = { builtin: 'pug-colourblind', standard: true }
  const v2 = (fields: Record<string, unknown>) =>
    cache({ v: 2, autoContrast: false, personal: { light: pug, dark: pug }, projects: {}, ...fields })

  afterEach(() => at('/'))

  it('paints the project in the path', () => {
    v2({ projects: { p1: { light: colourblind, dark: pug } } })
    at('/p/p1/overview')
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  it('paints the member’s own choice for a project it has no paint for', () => {
    v2({ personal: { light: colourblind, dark: pug }, projects: { p1: { light: pug, dark: pug } } })
    at('/p/p2/overview')
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  // '/' redirects to the last project, so painting the member's own there would switch on every visit.
  it('paints the last project on a page without one', () => {
    v2({ last: 'p1', projects: { p1: { light: colourblind, dark: pug } } })
    at('/')
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  // Nothing else redirects there, and React paints the member's own on these pages.
  it.each(['/shared/s1', '/magic-link', '/oauth/callback', '/demo'])('paints the member’s own on %s', path => {
    v2({ last: 'p1', personal: { light: colourblind, dark: pug }, projects: { p1: { light: pug, dark: pug } } })
    at(path)
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  it('lets a pin beat the mode, both ways', () => {
    v2({ projects: { p1: { pin: 'dark', light: pug, dark: pug } } })
    localStorage.setItem('pug:theme', JSON.stringify('light'))
    at('/p/p1/overview')
    paint()
    expect(root.classList.contains('dark')).toBe(true)

    root.className = ''
    v2({ projects: { p1: { pin: 'light', light: pug, dark: pug } } })
    localStorage.setItem('pug:theme', JSON.stringify('dark'))
    paint()
    expect(root.classList.contains('dark')).toBe(false)
  })

  // The path is untrusted input too.
  it('never reads a project paint off the prototype', () => {
    v2({ personal: { light: colourblind, dark: pug } })
    at('/p/__proto__/overview')
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })
})

describe('the first-paint script, version 3', () => {
  const MORE = '(prefers-contrast: more)'
  const at = (path: string) => window.history.replaceState(null, '', path)
  const pug = { standard: { builtin: 'pug' }, high: { builtin: 'pug-high-contrast' } }
  const blind = { standard: { builtin: 'pug-colourblind' }, high: { builtin: 'pug-high-contrast-colourblind' } }
  const v3 = (fields: Record<string, unknown>) =>
    cache({
      v: 3,
      contrast: 'system',
      vision: 'standard',
      personal: { light: pug, dark: pug },
      projects: {},
      ...fields,
    })

  afterEach(() => at('/'))

  it('paints High when set, whatever the OS says', () => {
    v3({ contrast: 'high' })
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-high-contrast')
  })

  it('paints Standard when set, whatever the OS says', () => {
    media({ [MORE]: true })
    v3({ contrast: 'standard' })
    paint()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it.each([
    [true, 'pug-high-contrast'],
    [false, null],
  ])('follows the OS under Match system: more contrast asked for, %s', (more, key) => {
    media({ [MORE]: more })
    v3({ contrast: 'system' })
    paint()
    expect(root.getAttribute('data-theme')).toBe(key)
  })

  it('reads an unknown contrast as Match system', () => {
    media({ [MORE]: true })
    v3({ contrast: 'loud' })
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-high-contrast')
  })

  it('paints the project in the path at the right level', () => {
    v3({ contrast: 'high', projects: { p1: { light: blind, dark: blind } } })
    at('/p/p1/overview')
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-high-contrast-colourblind')
  })

  it('lets a pin beat the mode', () => {
    localStorage.setItem('pug:theme', JSON.stringify('light'))
    v3({ projects: { p1: { pin: 'dark', light: pug, dark: blind } } })
    at('/p/p1/overview')
    paint()
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  it('paints the member’s colour vision', () => {
    v3({ personal: { light: blind, dark: blind } })
    paint()
    expect(root.getAttribute('data-theme')).toBe('pug-colourblind')
  })

  it('paints Pug when a level is missing, rather than nothing at all', () => {
    v3({ contrast: 'high', personal: { light: { standard: { builtin: 'pug-colourblind' } }, dark: pug } })
    paint()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })
})
