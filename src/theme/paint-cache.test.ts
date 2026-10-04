import { describe, expect, it } from 'vitest'
import { formatColor, parseColor } from '../lib/color/parse'
import { buildLibrary, type InstalledTheme } from './library'
import { buildPaintCache } from './paint-cache'

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
