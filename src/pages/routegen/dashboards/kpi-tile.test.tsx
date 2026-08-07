import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeltaBadge } from './kpi-tile'

// The badge encodes two separate things: the arrow is the direction the number moved, the color is
// whether that direction is good. Reading the color straight off the sign shipped a doubling bounce
// rate as a green win, so the two are asserted apart here.
describe('DeltaBadge', () => {
  it('colors a climbing lower-is-better metric as a regression', () => {
    render(<DeltaBadge pct={105.3} label="105.3%" lowerIsBetter />)
    expect(screen.getByText('105.3%').className).toContain('text-negative')
  })

  it('colors a falling lower-is-better metric as an improvement', () => {
    render(<DeltaBadge pct={-63.6} label="63.6%" lowerIsBetter />)
    expect(screen.getByText('63.6%').className).toContain('text-positive')
  })

  it('keeps the arrow on the direction the number moved, not on the color', () => {
    const { container } = render(<DeltaBadge pct={105.3} label="105.3%" lowerIsBetter />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('trending-up')
  })

  it('leaves higher-is-better metrics reading off the sign', () => {
    const { unmount } = render(<DeltaBadge pct={12} label="12.0%" />)
    expect(screen.getByText('12.0%').className).toContain('text-positive')
    unmount()

    render(<DeltaBadge pct={-12} label="12.0%" />)
    expect(screen.getByText('12.0%').className).toContain('text-negative')
  })

  // Two equal windows are not a regression, so flat stays green whichever way the metric runs.
  it('treats no change as unremarkable in both polarities', () => {
    const { unmount } = render(<DeltaBadge pct={0} label="0.0%" lowerIsBetter />)
    expect(screen.getByText('0.0%').className).toContain('text-positive')
    unmount()

    render(<DeltaBadge pct={0} label="0.0%" />)
    expect(screen.getByText('0.0%').className).toContain('text-positive')
  })
})
