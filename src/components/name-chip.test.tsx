import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { NameChip } from './name-chip'

const chipFor = (name: string) => render(<NameChip name={name} />).container.firstElementChild as HTMLElement

// Without compiled CSS the class names are the only trace of the theme tokens, so those are read by
// token name rather than as whole class strings; the hue is read by behaviour.
it('takes lightness and chroma from the theme and the hue from the name', () => {
  const chip = chipFor('Acme')
  expect(chip.className).toMatch(/var\(--identity-surface\)/)
  expect(chip.className).toMatch(/var\(--identity-ink\)/)
  expect(chip.className).not.toContain('dark:')
  expect(chip.textContent).toBe('A')
})

it('gives a name the same hue every time, and another name its own', () => {
  const tone = (name: string) => chipFor(name).style.getPropertyValue('--tone')
  expect(tone('Acme')).not.toBe('')
  expect(tone('Acme')).toBe(tone('Acme'))
  expect(tone('Acme')).not.toBe(tone('Zephyr'))
})
