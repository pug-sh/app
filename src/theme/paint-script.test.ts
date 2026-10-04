import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANONICAL_COLOR_RE } from '../lib/color/parse'
import { PAINT_CACHE_KEY } from './paint-cache'
import { TOKENS } from './tokens'

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
})
