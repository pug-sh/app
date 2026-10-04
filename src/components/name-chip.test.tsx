import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { NameChip } from './name-chip'

it('takes lightness and chroma from the theme and the hue from the name', () => {
  const { container } = render(<NameChip name="Acme" />)
  const chip = container.firstElementChild as HTMLElement
  expect(chip.className).toContain('oklch(from_var(--identity-surface)_l_c_var(--tone))')
  expect(chip.className).toContain('oklch(from_var(--identity-ink)_l_c_var(--tone))')
  expect(chip.className).not.toContain('dark:')
  expect(chip.style.getPropertyValue('--tone')).not.toBe('')
  expect(chip.textContent).toBe('A')
})
