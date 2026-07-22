import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The page gates on an active project before it renders anything, and nothing bootstraps one here.
vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return { ...actual, activeProjectAtom: atom({ id: 'p1', name: 'Test' }) }
})

// One event is all `hasEvents` needs to render the analytics body rather than SetupMode, and the
// no-op fetch keeps the RPC atom unread.
vi.mock('./overview.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('./overview.atoms')>()
  const { atom } = await import('jotai')
  return {
    ...actual,
    overviewSchemaAtom: atom({ events: [{ kind: 'page_view' }] }),
    overviewSchemaLoadingAtom: atom(false),
    fetchOverviewSchemaAtom: atom(null, () => {}),
  }
})

// Both modes stand in for their tile grids: the window they receive is the whole assertion.
vi.mock('./web-analytics-mode', () => ({ default: () => <div data-testid="web-body" /> }))
vi.mock('./analytics-mode', () => ({
  default: ({ globalTimeRange }: { globalTimeRange?: { from: Date; to: Date } }) => (
    <div data-testid="product-body">{globalTimeRange ? String(globalTimeRange.from.getTime()) : 'no-window'}</div>
  ),
}))

const Overview = (await import('./index.page')).default

const setSearch = (search: string) => window.history.replaceState(null, '', `/${search}`)

const switchTo = (label: string) => {
  fireEvent.click(screen.getByText('view'))
  fireEvent.click(screen.getByText(label))
}

describe('overview mode switch', () => {
  beforeEach(() => setSearch(''))

  // The web default is implicit: rangeIsDefault keeps it out of the URL, so leaving it on the shared
  // range would clamp product tiles to 24h on a toggle but not on a reload of the same view.
  it('drops the implicit web window when switching to product', () => {
    render(<Overview />)
    expect(screen.getByTestId('web-body')).toBeTruthy()

    switchTo('Product analytics')
    expect(screen.getByTestId('product-body').textContent).toBe('no-window')
  })

  it('keeps an explicitly picked window across the switch', () => {
    const from = new Date('2026-07-01T00:00:00Z')
    setSearch(`?tf=${from.getTime()}&tt=${new Date('2026-07-08T00:00:00Z').getTime()}`)
    render(<Overview />)

    switchTo('Product analytics')
    expect(screen.getByTestId('product-body').textContent).toBe(String(from.getTime()))
  })

  // Going back re-pins a fresh default, so the picker never reads "Default range" over live data.
  it('re-pins the default when switching back to web', () => {
    render(<Overview />)
    switchTo('Product analytics')
    switchTo('Web analytics')
    expect(screen.getByTestId('web-body')).toBeTruthy()
    expect(screen.getByText('Last 24 hours')).toBeTruthy()
  })
})
