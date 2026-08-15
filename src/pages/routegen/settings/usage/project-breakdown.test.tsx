import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SeriesColor } from '@/lib/event-colors'
import ProjectBreakdown from './project-breakdown'
import { OTHERS_LABEL, type ProjectTotal } from './usage-helpers'

// Only `line` is read by this table; the rest of SeriesColor is irrelevant here, and stub values
// make a wrong lookup obvious in the assertion.
const colors = [
  { line: 'rgb(1, 1, 1)' },
  { line: 'rgb(2, 2, 2)' },
  { line: 'rgb(3, 3, 3)' },
] as unknown as SeriesColor[]

const row = (projectId: string, total: number, seriesIndex: number | null): ProjectTotal => ({
  projectId,
  name: `Project ${projectId}`,
  total,
  seriesIndex,
})

const dotColors = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr')].map(
    tr => (tr.querySelector('td span span[style]') as HTMLElement | null)?.style.backgroundColor ?? null,
  )

describe('ProjectBreakdown', () => {
  it('renders nothing when there are no projects', () => {
    const { container } = render(<ProjectBreakdown projectTotals={[]} windowTotal={0} colors={colors} />)

    expect(container.innerHTML).toBe('')
  })

  // The whole reason seriesIndex is carried on the row rather than inferred from position: the two
  // stop agreeing the moment this table is sorted or filtered, and the mismatch surfaces only as a
  // wrong colour, which nobody audits. Rows are deliberately out of series order here, so a
  // positional lookup returns the other row's colour instead of failing loudly.
  it('colours each dot from its own row, not from its position in the table', () => {
    const { container } = render(
      <ProjectBreakdown projectTotals={[row('c', 10, 2), row('a', 5, 0)]} windowTotal={15} colors={colors} />,
    )

    expect(dotColors(container)).toEqual(['rgb(3, 3, 3)', 'rgb(1, 1, 1)'])
  })

  it('leaves a folded project without a series colour', () => {
    const { container } = render(
      <ProjectBreakdown projectTotals={[row('a', 10, 0), row('z', 1, null)]} windowTotal={11} colors={colors} />,
    )

    // The one spare hue belongs to the folded band, so borrowing it here would read as this row
    // being that series.
    expect(dotColors(container)).toEqual(['rgb(1, 1, 1)', null])
  })

  it('never rounds a project that had events down to 0.0%', () => {
    render(
      <ProjectBreakdown
        projectTotals={[row('a', 1, 0), row('b', 999_999, 1)]}
        windowTotal={1_000_000}
        colors={colors}
      />,
    )

    expect(screen.getByText('<0.1%')).not.toBeNull()
    expect(screen.queryByText('0.0%')).toBeNull()
  })

  it('states a share once it is large enough to state', () => {
    render(<ProjectBreakdown projectTotals={[row('a', 250, 0)]} windowTotal={1000} colors={colors} />)

    expect(screen.getByText('25.0%')).not.toBeNull()
  })

  // Reachable only from an out-of-contract response, since a day with no events has no row at all
  // — but dividing by it would put NaN% in a billing column.
  it('declines to state a share when the window total is zero', () => {
    const { container } = render(<ProjectBreakdown projectTotals={[row('a', 0, 0)]} windowTotal={0} colors={colors} />)

    expect(container.textContent).toContain('—')
    expect(container.textContent).not.toContain('NaN')
  })

  it('names the folded band in the singular and in the plural', () => {
    const { unmount } = render(
      <ProjectBreakdown projectTotals={[row('a', 10, 0), row('z', 1, null)]} windowTotal={11} colors={colors} />,
    )
    expect(screen.getByText(new RegExp(`The smallest is charted inside “${OTHERS_LABEL}”`))).not.toBeNull()
    unmount()

    render(
      <ProjectBreakdown
        projectTotals={[row('a', 10, 0), row('y', 2, null), row('z', 1, null)]}
        windowTotal={13}
        colors={colors}
      />,
    )
    expect(screen.getByText(new RegExp(`The smallest 2 are charted together as “${OTHERS_LABEL}”`))).not.toBeNull()
  })

  it('counts every project, charted or folded', () => {
    render(
      <ProjectBreakdown
        projectTotals={[row('a', 10, 0), row('y', 2, null), row('z', 1, null)]}
        windowTotal={13}
        colors={colors}
      />,
    )

    expect(screen.getByText('3')).not.toBeNull()
  })
})
