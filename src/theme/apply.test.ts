import { beforeEach, describe, expect, it } from 'vitest'
import { applyCompiledTheme } from './apply'
import { BUILTINS } from './builtin'
import { compileVariant } from './compile'
import { parseThemeObject } from './format'
import { ACCESS_MODES, TOKENS } from './tokens'

const root = document.documentElement
const inline = () => TOKENS.filter(t => root.style.getPropertyValue(`--${t}`) !== '')
const grape = (() => {
  const parsed = parseThemeObject({
    version: 1,
    name: 'Grape',
    variants: { dark: { colors: { background: '#1e1b2e' } } },
  })
  if (!parsed.ok) throw new Error('grape did not parse')
  return parsed.family
})()

beforeEach(() => {
  root.className = ''
  root.removeAttribute('data-theme')
  root.removeAttribute('style')
})

describe('applyCompiledTheme', () => {
  it('leaves Pug to the stylesheet: the class, no attribute, no inline variables', () => {
    applyCompiledTheme(compileVariant({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity: 'dark' }))
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(inline()).toEqual([])
  })

  it('applies an installed theme as inline variables', () => {
    const compiled = compileVariant({ id: 'installed-grape', builtin: false, family: grape, polarity: 'dark' })
    applyCompiledTheme(compiled)
    expect(root.style.getPropertyValue('--background')).toBe(compiled.vars['--background'])
    expect(inline()).toHaveLength(TOKENS.length)
  })

  // When the active installed theme goes away, nothing of it may stay on <html> —
  // including variables the first-paint script set before React loaded.
  it('clears every inline variable when a built-in takes over, including ones it never set', () => {
    root.style.setProperty('--background', 'oklch(0.236563 0.03305 290.061)')
    applyCompiledTheme(compileVariant({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity: 'light' }))
    expect(inline()).toEqual([])
    expect(root.classList.contains('dark')).toBe(false)
  })

  it.each([
    [ACCESS_MODES[1], 'pug-high-contrast'],
    [ACCESS_MODES[2], 'pug-colourblind'],
    [ACCESS_MODES[3], 'pug-high-contrast-colourblind'],
  ])('selects Pug’s mode by attribute, with no inline variables', (access, key) => {
    applyCompiledTheme(compileVariant({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity: 'light', access }))
    expect(root.getAttribute('data-theme')).toBe(key)
    expect(inline()).toEqual([])
  })

  it('leaves no attribute on Pug at standard, once a mode is switched off', () => {
    root.setAttribute('data-theme', 'pug-colourblind')
    applyCompiledTheme(compileVariant({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity: 'light' }))
    expect(root.hasAttribute('data-theme')).toBe(false)
  })
})
