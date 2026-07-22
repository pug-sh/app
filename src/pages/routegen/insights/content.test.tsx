import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AggregationType, Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { SeriesColor } from '@/lib/event-colors'
import type { ChartPoint } from './charts/types'
import { InsightsContent } from './content'

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

// content.tsx reads activeProjectTimezoneAtom, which pulls workspace.atoms → api/rpc → transport,
// and that throws at module scope with no VITE_API_BASE_URL. Nothing here reads an RPC atom; the
// stubs exist only to keep transport out of the graph.
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { orgsRPCAtom: atom({}), projectsRPCAtom: atom({}), insightsRPCAtom: atom({}) }
})

const COLORS: SeriesColor[] = [{ line: '#4c8dff', fill: '#4c8dff1a', dot: '#4c8dff' }]

const at = (hour: number) => new Date(Date.UTC(2026, 6, 19, hour))

const ZERO: ChartPoint[] = [0, 1, 2].map(h => ({ date: at(h), values: [0] }))
const LIVE: ChartPoint[] = [1, 2, 3].map((v, i) => ({ date: at(i), values: [v] }))

const comparison = (values: number[]) => ({
  label: 'vs prior day',
  values,
  color: { line: '#4c8dff99', fill: '#4c8dff1a', dot: '#4c8dff99' },
})

const CAPTION = 'Dashed line is the previous period'
const EMPTY = 'No events recorded in this period'

// Scoped to the render's own container: several of these render more than once, and RTL's queries
// default to document.body, where every mount is still attached.
const shows = (container: HTMLElement, text: string) => container.textContent?.includes(text) ?? false

const base = {
  error: null,
  retry: () => {},
  unknownResultCase: false,
  resultCase: 'trends',
  resultSeriesCount: 1,
  isRetention: false,
  isTrends: true,
  hasIncompleteNumericAggregation: false,
  seriesNames: ['page_view'],
  seriesColors: COLORS,
  seriesAggregations: [AggregationType.TOTAL],
  viewMode: 'area' as const,
  granularity: Granularity.HOUR,
  breakdowns: [],
  breakdownResponseLimit: 100,
  retentionSeriesList: [],
  retentionLabels: [],
  retentionCohorts: [],
  funnelSeriesData: [],
  hideLegend: true,
}

// A window that fell to zero is exactly what a compare line is for, so the empty state has to yield
// to it — but only when the prior window has something to show.
describe('InsightsContent compare-vs-prior', () => {
  it('draws the prior window over a live window that is all zeros', () => {
    const { container } = render(<InsightsContent {...base} chartData={ZERO} comparison={comparison([40, 50, 60])} />)

    expect(shows(container, EMPTY)).toBe(false)
    expect(container.querySelectorAll('path[stroke="transparent"]').length).toBeGreaterThan(0)
  })

  it('keeps the empty state when neither window has data', () => {
    const { container } = render(<InsightsContent {...base} chartData={ZERO} comparison={comparison([0, 0, 0])} />)

    expect(shows(container, EMPTY)).toBe(true)
  })

  it('keeps the empty state when there is no comparison at all', () => {
    const { container } = render(<InsightsContent {...base} chartData={ZERO} />)

    expect(shows(container, EMPTY)).toBe(true)
  })

  // The caption stands in for a legend, so it must not outlive the line it names.
  it('names the dashed line only when one is drawn', () => {
    const drawn = render(<InsightsContent {...base} chartData={LIVE} comparison={comparison([40, 50, 60])} />)
    expect(shows(drawn.container, CAPTION)).toBe(true)

    const none = render(<InsightsContent {...base} chartData={LIVE} />)
    expect(shows(none.container, CAPTION)).toBe(false)

    const empty = render(<InsightsContent {...base} chartData={ZERO} comparison={comparison([0, 0, 0])} />)
    expect(shows(empty.container, CAPTION)).toBe(false)
  })

  // Bars and the table never receive the comparison, so they must neither advertise one nor let it
  // stand in for live data: a zero window on those views is still an empty window.
  it('ignores the comparison entirely on a view that cannot draw it', () => {
    const named = render(
      <InsightsContent {...base} chartData={LIVE} viewMode="bar-grouped" comparison={comparison([40, 50, 60])} />,
    )
    expect(shows(named.container, CAPTION)).toBe(false)

    const empty = render(
      <InsightsContent {...base} chartData={ZERO} viewMode="bar-grouped" comparison={comparison([40, 50, 60])} />,
    )
    expect(shows(empty.container, EMPTY)).toBe(true)
  })
})
