import { describe, expect, it, vi } from 'vitest'
import { formatColor, parseColor } from '../lib/color/parse'
import { buildLibrary, type InstalledTheme } from './library'
import { buildPaintCache, PAINT_CACHE_KEY, writePaintCache } from './paint-cache'

const grape: InstalledTheme = {
  id: 'installed-grape',
  text: JSON.stringify({ version: 1, name: 'Grape', variants: { dark: { colors: { background: '#1e1b2e' } } } }),
  hash: 'grape',
  installedAt: 0,
  source: 'file',
}

describe('buildPaintCache', () => {
  it('names built-ins and carries an installed theme as variables', () => {
    const cache = buildPaintCache({
      selection: { light: 'pug', dark: grape.id },
      autoContrast: true,
      library: buildLibrary([grape]),
    })
    expect(cache.v).toBe(1)
    expect(cache.autoContrast).toBe(true)
    expect(cache.light).toEqual({ builtin: 'pug', standard: true })
    expect('vars' in cache.dark && cache.dark.vars['--background']).toBe(formatColor(parseColor('#1e1b2e') as never))
    expect(cache.dark.standard).toBe(true)
  })

  it('falls back to Pug for a mode the selected family lacks', () => {
    const cache = buildPaintCache({
      selection: { light: grape.id, dark: 'pug' },
      autoContrast: false,
      library: buildLibrary([grape]),
    })
    expect(cache.light).toEqual({ builtin: 'pug', standard: true })
  })
})

describe('writePaintCache', () => {
  // A refused write leaves the old cache in place, and the next load would paint whatever it says —
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
      writePaintCache(
        buildPaintCache({ selection: { light: 'pug', dark: 'pug' }, autoContrast: true, library: buildLibrary([]) }),
      )
    } finally {
      refusal.mockRestore()
    }
    expect(localStorage.getItem(PAINT_CACHE_KEY)).toBeNull()
  })
})
