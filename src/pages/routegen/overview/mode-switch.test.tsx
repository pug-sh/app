import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Nothing here reads an RPC atom, but the modules below import them, and the real ones pull in
// network/transport — which throws at module scope when VITE_API_BASE_URL is unset. CI has no .env,
// so a local run passes while the pipeline fails on the import alone.
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { orgsRPCAtom: atom({}), projectsRPCAtom: atom({}), insightsRPCAtom: atom({}) }
})

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

  // Both modes default to the last 24 hours now, so the toggle carries that window straight into
  // product rather than dropping it to the tiles' own longer ranges.
  it('carries the 24h default into product', () => {
    render(<Overview />)
    expect(screen.getByTestId('web-body')).toBeTruthy()

    switchTo('Product analytics')
    const shown = Number(screen.getByTestId('product-body').textContent)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    expect(Math.abs(shown - dayAgo)).toBeLessThan(60_000)
  })

  it('keeps an explicitly picked window across the switch', () => {
    const from = new Date('2026-07-01T00:00:00Z')
    setSearch(`?tf=${from.getTime()}&tt=${new Date('2026-07-08T00:00:00Z').getTime()}`)
    render(<Overview />)

    switchTo('Product analytics')
    expect(screen.getByTestId('product-body').textContent).toBe(String(from.getTime()))
  })

  // The in-app version of the above: change the range from the picker while in web mode, then toggle.
  // The picked window has to ride across rather than snap back to either default.
  it('retains a range picked in web mode when switching to product', () => {
    render(<Overview />)

    fireEvent.click(screen.getByText('time'))
    fireEvent.click(screen.getByText('Last 7 days'))

    switchTo('Product analytics')

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const expected = new Date(weekAgo.getFullYear(), weekAgo.getMonth(), weekAgo.getDate()).getTime()
    expect(screen.getByTestId('product-body').textContent).toBe(String(expected))
  })

  // The 24h default rides through both toggles, so web still reads "Last 24 hours" — never
  // "Default range" over live data — after a round trip.
  it('keeps the 24h default across a web → product → web round trip', () => {
    render(<Overview />)
    switchTo('Product analytics')
    switchTo('Web analytics')
    expect(screen.getByTestId('web-body')).toBeTruthy()
    expect(screen.getByText('Last 24 hours')).toBeTruthy()
  })
})
