import { create } from '@bufbuild/protobuf'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  AggregationType,
  Granularity,
  type UserFlowResult,
  UserFlowResultSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
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
  isUserFlow: false,
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

  // With the caption suppressed, the reported boolean is the only thing naming the line.
  it('hands the caption to a hoisting caller instead of drawing it', () => {
    const onComparisonCaption = vi.fn()
    const { container, unmount } = render(
      <InsightsContent
        {...base}
        chartData={LIVE}
        comparison={comparison([40, 50, 60])}
        onComparisonCaption={onComparisonCaption}
      />,
    )

    expect(shows(container, CAPTION)).toBe(false)
    expect(onComparisonCaption).toHaveBeenLastCalledWith(true)

    unmount()
    expect(onComparisonCaption).toHaveBeenLastCalledWith(false)
  })

  // Silence, not a `false` — a view that never draws a line has nothing to report and the caller's
  // own initial state stands. What must never happen is claiming one.
  it('says nothing to a hoisting caller when no line is drawn', () => {
    const onComparisonCaption = vi.fn()
    render(<InsightsContent {...base} chartData={LIVE} onComparisonCaption={onComparisonCaption} />)

    expect(onComparisonCaption).not.toHaveBeenCalledWith(true)
  })

  // Every gate that hides the inline caption has to reach the hoisted one too, and by rerender:
  // a stat or filter change swaps the data under a chart that stays mounted.
  it('reports the same gates to a hoisting caller that hide the inline caption', () => {
    const spy = vi.fn()
    const { rerender } = render(
      <InsightsContent {...base} chartData={LIVE} comparison={comparison([40, 50, 60])} onComparisonCaption={spy} />,
    )
    expect(spy).toHaveBeenLastCalledWith(true)

    rerender(
      <InsightsContent {...base} chartData={ZERO} comparison={comparison([0, 0, 0])} onComparisonCaption={spy} />,
    )
    expect(spy).toHaveBeenLastCalledWith(false)

    rerender(
      <InsightsContent
        {...base}
        chartData={LIVE}
        viewMode="bar-grouped"
        comparison={comparison([40, 50, 60])}
        onComparisonCaption={spy}
      />,
    )
    expect(spy).toHaveBeenLastCalledWith(false)

    // No rows means no chart, so the footer must not name a line over the empty state.
    rerender(
      <InsightsContent {...base} chartData={[]} comparison={comparison([40, 50, 60])} onComparisonCaption={spy} />,
    )
    expect(spy).toHaveBeenLastCalledWith(false)

    // An early return that has nothing to do with the data: the caption goes with the chart it names.
    rerender(
      <InsightsContent
        {...base}
        chartData={LIVE}
        comparison={comparison([40, 50, 60])}
        error="Query failed"
        onComparisonCaption={spy}
      />,
    )
    expect(spy).toHaveBeenLastCalledWith(false)
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

// A user-flow response can be non-empty and still have nothing drawable, because buildSankeyData
// drops links whose endpoints don't resolve, whose count isn't positive, or that don't advance
// exactly one step. What the reader is told about that is the whole point of these.
describe('InsightsContent user flow', () => {
  const flow = (nodes: unknown[], links: unknown[]) =>
    create(UserFlowResultSchema, { nodes, links } as never) as UserFlowResult

  const WHOLE = flow(
    [
      { id: 'a0', depth: 0, label: 'home' },
      { id: 'b1', depth: 1, label: 'search' },
    ],
    [{ source: 'a0', target: 'b1', value: 40n }],
  )

  // Every link here skips a step, so all of them drop — the shape a backend that switched to
  // 1-based depths would produce.
  const ALL_DROPPED = flow(
    [
      { id: 'a0', depth: 1, label: 'home' },
      { id: 'b1', depth: 3, label: 'search' },
    ],
    [{ source: 'a0', target: 'b1', value: 9999n }],
  )

  // A user-flow query sends no events, so there is no trend series behind it.
  const userFlow = { ...base, chartData: [], isTrends: false, isUserFlow: true, resultCase: 'userFlow' }

  it('draws the flow when there is something to draw', () => {
    const { container } = render(<InsightsContent {...userFlow} userFlowResult={WHOLE} />)

    expect(container.querySelector('svg')).toBeTruthy()
    expect(shows(container, 'No transitions recorded in this period')).toBe(false)
  })

  it('says nothing happened only when nothing did', () => {
    const { container } = render(<InsightsContent {...userFlow} userFlowResult={flow([], [])} />)

    expect(shows(container, 'No transitions recorded in this period')).toBe(true)
  })

  // The damaging case. "No transitions recorded in this period" over a response carrying 9,999
  // sessions tells a growth manager their traffic is single-event bounces. It is the one sentence
  // this feature must never emit about data it merely failed to read.
  it('does not claim an empty period when the transitions were dropped', () => {
    const { container } = render(<InsightsContent {...userFlow} userFlowResult={ALL_DROPPED} />)

    expect(shows(container, 'No transitions recorded in this period')).toBe(false)
    expect(shows(container, 'could not be drawn')).toBe(true)
  })

  it('captions a partly-drawn flow so its totals are not read as exact', () => {
    const partial = flow(
      [
        { id: 'a0', depth: 0, label: 'home' },
        { id: 'b1', depth: 1, label: 'search' },
        { id: 'c9', depth: 9, label: 'ghost' },
      ],
      [
        { source: 'a0', target: 'b1', value: 40n },
        { source: 'a0', target: 'c9', value: 7n },
      ],
    )
    const { container } = render(<InsightsContent {...userFlow} userFlowResult={partial} />)

    expect(container.querySelector('svg')).toBeTruthy()
    expect(shows(container, 'flow totals may be incomplete')).toBe(true)
  })

  // A tile that cannot run has to say why: it renders on a dashboard with no query above it.
  it('says why the flow is not running instead of hinting at a query bar', () => {
    const { container } = render(
      <InsightsContent {...userFlow} userFlowIncompleteReason="Select a property to group the flow by" />,
    )

    expect(shows(container, 'Select a property to group the flow by')).toBe(true)
    expect(shows(container, 'Adjust the query above')).toBe(false)
  })

  it('does not hint at a query bar while a tile is still loading', () => {
    const { container } = render(<InsightsContent {...userFlow} compact />)

    expect(shows(container, 'Adjust the query above')).toBe(false)
  })
})

describe('InsightsContent pie view', () => {
  it('renders the selected trend series as a pie chart', () => {
    render(<InsightsContent {...base} chartData={LIVE} viewMode="pie" />)

    expect(screen.getByRole('group', { name: 'Pie chart' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'page_view: 6 (100.0%)' })).toBeTruthy()
  })

  it('places the shared series legend below the pie', () => {
    const { container } = render(<InsightsContent {...base} chartData={LIVE} viewMode="pie" hideLegend={false} />)

    const pie = screen.getByRole('group', { name: 'Pie chart' })
    const legendLabel = [...container.querySelectorAll('span')].find(element => element.textContent === 'page_view')

    expect(legendLabel).toBeTruthy()
    expect(pie.compareDocumentPosition(legendLabel as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not impose the Cartesian minimum height on a compact pie', () => {
    render(<InsightsContent {...base} chartData={LIVE} viewMode="pie" compact />)

    const pieWrapper = screen.getByRole('group', { name: 'Pie chart' }).parentElement
    expect(pieWrapper).not.toBeNull()
    expect(pieWrapper?.getAttribute('class')).not.toContain('min-h-[120px]')
  })

  it('does not show a partial legend when a negative value makes the pie unsupported', () => {
    render(
      <InsightsContent
        {...base}
        chartData={[{ date: at(0), values: [5, -1] }]}
        viewMode="pie"
        hideLegend={false}
        seriesNames={['positive', 'negative']}
        seriesColors={[COLORS[0]!, COLORS[0]!]}
        seriesAggregations={[AggregationType.TOTAL, AggregationType.TOTAL]}
      />,
    )

    expect(screen.getByText('Pie charts require non-negative values')).toBeTruthy()
    expect(screen.queryByText('positive')).toBeNull()
  })
})

describe('InsightsContent legend placement', () => {
  it('renders an explicit top legend before the chart', () => {
    const { container } = render(<InsightsContent {...base} chartData={LIVE} hideLegend={false} legendPosition="top" />)

    expect(shows(container.firstElementChild?.firstElementChild as HTMLElement, 'page_view')).toBe(true)
  })

  it('keeps the shared legend to the right in a deterministic two-track layout', () => {
    const { container } = render(
      <InsightsContent {...base} chartData={LIVE} hideLegend={false} legendPosition="right" />,
    )

    const layout = container.querySelector('[data-legend-position="right"]')
    expect(layout).toBeTruthy()
    expect(layout?.children).toHaveLength(2)
    expect(layout?.className).toContain('grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')
    expect(shows(layout as HTMLElement, 'page_view')).toBe(true)
  })
})
