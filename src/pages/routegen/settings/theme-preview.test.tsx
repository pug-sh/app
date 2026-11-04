import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ThemePreview from '@/pages/routegen/settings/theme-preview'
import { BUILTINS } from '@/theme/builtin'
import { compileOnce } from '@/theme/compile'

const compiled = compileOnce({ id: 'pug', builtin: true, family: BUILTINS.pug, polarity: 'light' })

const attributes = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll(`[${name}]`)].map(element => element.getAttribute(name))

describe('ThemePreview', () => {
  it('draws the primary and the link', () => {
    const { container } = render(<ThemePreview compiled={compiled} />)
    const fills = attributes(container, 'fill')
    expect(fills).toContain(compiled.vars['--primary'])
    expect(fills).toContain(compiled.vars['--link'])
  })

  it('draws a sidebar, a card and a canvas from the theme', () => {
    const { container } = render(<ThemePreview compiled={compiled} />)
    const fills = attributes(container, 'fill')
    expect(fills).toContain(compiled.vars['--background'])
    expect(fills).toContain(compiled.vars['--sidebar'])
    expect(fills).toContain(compiled.vars['--card'])
    expect(fills).toContain(compiled.vars['--foreground'])
  })

  it('draws its chart line in the first categorical colour', () => {
    const { container } = render(<ThemePreview compiled={compiled} />)
    expect(attributes(container, 'stroke')).toContain(compiled.data.categorical[0].line)
  })

  it('stays out of the accessibility tree', () => {
    const { container } = render(<ThemePreview compiled={compiled} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
