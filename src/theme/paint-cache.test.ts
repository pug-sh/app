import { describe, expect, it, vi } from 'vitest'
import { formatColor, parseColor } from '../lib/color/parse'
import { buildLibrary, type InstalledTheme } from './library'
import {
  buildPaintCache,
  MAX_PAINTED_PROJECTS,
  PAINT_CACHE_KEY,
  type Paint,
  readPaintCache,
  writePaintCache,
} from './paint-cache'

const grape: InstalledTheme = {
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}
const library = buildLibrary([grape])
const own = { light: 'pug', dark: 'pug' }
const personal = { selection: own, source: 'personal' as const }
const project = { selection: own, source: 'project' as const }
const build = (over: Partial<Parameters<typeof buildPaintCache>[0]> = {}) =>
  buildPaintCache({
    previous: null,
    projectId: null,
    choice: personal,
    personal: own,
    contrast: 'system',
    vision: 'standard',
    library,
    ...over,
  })

describe('buildPaintCache', () => {
  it('names Pug’s paint key at each level, in the member’s colour vision', () => {
    const cache = build({ vision: 'colourblind' })
    expect(cache.personal.light).toEqual({
      standard: { builtin: 'pug-colourblind' },
      high: { builtin: 'pug-high-contrast-colourblind' },
    })
  })

  it('carries an installed theme as variables at both levels', () => {
    const { dark } = build({ personal: { light: 'pug', dark: grape.id } }).personal
    const background = (paint: Paint) => ('vars' in paint ? paint.vars['--background'] : null)
    expect(background(dark.standard)).toBe(formatColor(parseColor('#1e1b2e') as never))
    expect(background(dark.high)).toMatch(/^oklch\(0\.13 /)
  })

  // The file has no light variant, so Pug stands in, at each level: a compile of it would paint a project's own.
  it('names Pug for a mode the theme doesn’t have', () => {
    const { light } = build({ personal: { light: grape.id, dark: 'pug' } }).personal
    expect(light).toEqual({ standard: { builtin: 'pug' }, high: { builtin: 'pug-high-contrast' } })
  })

  it('records both settings', () => {
    expect(build({ contrast: 'high', vision: 'colourblind' })).toMatchObject({
      v: 3,
      contrast: 'high',
      vision: 'colourblind',
      projects: {},
    })
  })

  it('paints the project’s choice with its pin, and remembers it as last', () => {
    const cache = build({ projectId: 'p1', choice: { ...project, pin: 'dark' } })
    expect(cache.last).toBe('p1')
    expect(cache.projects.p1).toMatchObject({
      pin: 'dark',
      dark: { standard: { builtin: 'pug' }, high: { builtin: 'pug-high-contrast' } },
    })
  })

  // The script paints the member's own for a project with no entry, which stays right when they change it
  // from another project. An entry would freeze the old one, and the next load there would flash.
  it('keeps no entry for a project on the member’s own theme, nor names it last', () => {
    const before = build({ projectId: 'p1', choice: project })
    const cache = build({ previous: before, projectId: 'p1' })
    expect(cache.projects).toEqual({})
    expect(cache.last).toBeUndefined()
  })

  it('keeps other projects, most recent last, up to the limit', () => {
    let cache: ReturnType<typeof buildPaintCache> | null = null
    for (let i = 0; i <= MAX_PAINTED_PROJECTS; i++) {
      cache = build({ previous: cache, projectId: `p${i}`, choice: project })
    }
    const ids = Object.keys(cache?.projects ?? {})
    expect(ids).toHaveLength(MAX_PAINTED_PROJECTS)
    expect(ids).not.toContain('p0')
    expect(ids.at(-1)).toBe(`p${MAX_PAINTED_PROJECTS}`)
  })
})

describe('readPaintCache', () => {
  const pug = { standard: { builtin: 'pug' }, high: { builtin: 'pug-high-contrast' } }
  const p1 = { light: pug, dark: pug }

  it('carries a version 3 cache’s project paints forward', () => {
    const cache = { v: 3, contrast: 'system', vision: 'standard', last: 'p1', personal: p1, projects: { p1 } }
    localStorage.setItem(PAINT_CACHE_KEY, JSON.stringify(cache))
    expect(readPaintCache()).toEqual({ projects: { p1 }, last: 'p1' })
  })

  // Its paints are one per mode, which the script would read as two missing levels.
  it('takes project paints only from a version 3 cache', () => {
    const paint = { builtin: 'pug', standard: true }
    const old = { light: paint, dark: paint }
    localStorage.setItem(
      PAINT_CACHE_KEY,
      JSON.stringify({ v: 2, autoContrast: true, personal: old, projects: { old } }),
    )
    expect(readPaintCache()).toBeNull()
  })

  it('reads nothing from a cache that isn’t one', () => {
    localStorage.setItem(PAINT_CACHE_KEY, '{')
    expect(readPaintCache()).toBeNull()
    localStorage.setItem(PAINT_CACHE_KEY, JSON.stringify({ v: 3 }))
    expect(readPaintCache()).toBeNull()
    localStorage.setItem(PAINT_CACHE_KEY, JSON.stringify({ v: 3, projects: [] }))
    expect(readPaintCache()).toBeNull()
  })
})

describe('writePaintCache', () => {
  // A refused write leaves the old cache in place, and the next load would paint whatever it says,
  // possibly a theme that has since been removed. With no cache it paints Pug, then React corrects.
  it('drops the old cache when storage refuses the new one', () => {
    localStorage.setItem(
      PAINT_CACHE_KEY,
      JSON.stringify({ v: 1, autoContrast: true, light: { builtin: 'pug-colourblind' } }),
    )
    const refusal = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      writePaintCache(build())
    } finally {
      refusal.mockRestore()
    }
    expect(localStorage.getItem(PAINT_CACHE_KEY)).toBeNull()
  })
})
