import { create } from '@bufbuild/protobuf'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from 'wouter'
import { navigate } from 'wouter/use-browser-location'
import { GetFilterSchemaResponseSchema, PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import { type Dashboard, DashboardSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightType, type QueryRequest, QueryResponseSchema } from '@/api/genproto/shared/insights/v1/insights_pb'
import { createFilter } from '@/components/event-filters/filter-model'
import { clearSchemaCache } from '@/hooks/use-global-filter-schema'

const { query, getDashboard } = vi.hoisted(() => ({ query: vi.fn(), getDashboard: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({}),
    projectsRPCAtom: atom({}),
    dashboardsRPCAtom: atom({ get: getDashboard }),
    insightsRPCAtom: atom({
      query,
      getFilterSchema: async () => create(GetFilterSchemaResponseSchema),
      getPropertyValues: async () => ({ values: [] }),
    }),
  }
})
vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return {
    ...actual,
    activeProjectAtom: atom({ id: 'p1', displayName: 'P1' }),
    projectHeaderAtom: atom({ 'x-project-id': 'p1' }),
    activeProjectTimezoneAtom: atom('UTC'),
  }
})
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }))
vi.mock('@/components/share-chart-button', () => ({ ShareChartButton: () => null }))
vi.mock('../insight-tile-view', () => ({ InsightTileView: () => null }))

const DashboardDetail = (await import('./index.page')).default

const insightTile = (id: string, kind: string) => ({
  id,
  content: {
    case: 'insight' as const,
    value: { spec: { insightType: InsightType.TRENDS, events: [{ event: { kind } }] } },
  },
})
const dashboards: Record<string, Dashboard> = {
  d1: create(DashboardSchema, { id: 'd1', displayName: 'One', tiles: [insightTile('t1', 'signup')] }),
  d2: create(DashboardSchema, { id: 'd2', displayName: 'Two', tiles: [insightTile('t2', 'purchase')] }),
  d3: create(DashboardSchema, {
    id: 'd3',
    displayName: 'Three',
    defaultTimeRange: TimeRangePreset.LAST_30_DAYS,
    tiles: [insightTile('t3', 'visit')],
  }),
}

const tenant = createFilter('tenant', PropertySource.PROFILE, FilterOperator.IN, ['acme'])
const pf = (filters: unknown[]) => `pf=${encodeURIComponent(JSON.stringify(filters))}`
const filteredOn = (request: QueryRequest) =>
  request.spec?.filterGroups.flatMap(group => group.filters).map(filter => filter.property)
const queriesFor = (kind: string) =>
  query.mock.calls
    .map(([request]) => request as QueryRequest)
    .filter(request => request.spec?.events[0]?.event?.kind === kind)

const spanDays = ({ timeRange }: QueryRequest) =>
  timeRange?.from && timeRange.to
    ? (timestampDate(timeRange.to).getTime() - timestampDate(timeRange.from).getTime()) / 86_400_000
    : 0

const open = (url: string) => {
  window.history.replaceState(null, '', url)
  render(
    <Provider>
      <Route path="/dashboards/:dashboardId">
        <DashboardDetail />
      </Route>
    </Provider>,
  )
}

beforeEach(() => {
  clearSchemaCache()
  query.mockReset().mockResolvedValue(create(QueryResponseSchema))
  getDashboard.mockReset().mockImplementation(async ({ id }: { id: string }) => ({ dashboard: dashboards[id] }))
})

describe('dashboard page filters', () => {
  it('applies filters restored from the URL to every tile query', async () => {
    open(`/dashboards/d1?${pf([tenant])}`)
    await waitFor(() => expect(queriesFor('signup').length).toBeGreaterThan(0))
    for (const request of queriesFor('signup')) expect(filteredOn(request)).toEqual(['tenant'])
  })

  it('drops a restored filter that cannot run and names it', async () => {
    const warning = vi.spyOn(toast, 'warning')
    open(`/dashboards/d1?${pf([tenant, { ...tenant, property: 'plan', values: [] }])}`)
    await waitFor(() => expect(queriesFor('signup').length).toBeGreaterThan(0))
    for (const request of queriesFor('signup')) expect(filteredOn(request)).toEqual(['tenant'])
    expect(warning).toHaveBeenCalledWith('Could not restore some dashboard filters from URL', {
      id: 'dashboard-filter-parse-warning',
      description: expect.stringMatching(/^plan: .*not be empty/),
    })
    expect(window.location.search).not.toContain('plan')
  })

  it('warns about a restored filter it cannot read', async () => {
    const warning = vi.spyOn(toast, 'warning')
    open(`/dashboards/d1?${pf([tenant, { property: 1 }])}`)
    await waitFor(() => expect(queriesFor('signup').length).toBeGreaterThan(0))
    expect(warning).toHaveBeenCalledWith('Could not restore some dashboard filters from URL', {
      id: 'dashboard-filter-parse-warning',
    })
  })

  it('removes an in filter emptied in its chip instead of failing every tile', async () => {
    open(`/dashboards/d1?${pf([tenant])}`)
    fireEvent.click(await screen.findByText('acme'))
    const removeValue = (await screen.findAllByText('acme'))
      .map(node => node.parentElement?.querySelector('button'))
      .find(Boolean)
    fireEvent.click(removeValue as HTMLButtonElement)
    await waitFor(() => expect(screen.queryByText('tenant')).toBeNull())
    expect(window.location.search).not.toContain('pf=')
    await waitFor(() => expect(filteredOn(queriesFor('signup').at(-1) as QueryRequest)).toEqual([]))
  })

  it('refuses a chip edit that cannot run and keeps the filter it replaced', async () => {
    const error = vi.spyOn(toast, 'error')
    const amount = createFilter('amount', PropertySource.CUSTOM, FilterOperator.GT, '5')
    open(`/dashboards/d1?${pf([amount])}`)
    fireEvent.click(await screen.findByText('5'))
    fireEvent.change(await screen.findByPlaceholderText('Type a value...'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByText('Apply'))
    expect(error).toHaveBeenCalledWith('Could not apply the amount filter', {
      description: expect.stringContaining('valid numbers'),
    })
    expect(screen.getByText('5')).toBeTruthy()
    expect(window.location.search).toContain('amount')
    for (const request of queriesFor('signup')) expect(filteredOn(request)).toEqual(['amount'])
  })

  it('opens the next dashboard without the previous dashboard filters', async () => {
    open(`/dashboards/d1?${pf([tenant])}`)
    await waitFor(() => expect(queriesFor('signup').length).toBeGreaterThan(0))
    act(() => navigate('/dashboards/d2'))
    await waitFor(() => expect(queriesFor('purchase').length).toBeGreaterThan(0))
    for (const request of queriesFor('purchase')) expect(filteredOn(request)).toEqual([])
  })
})

describe('dashboard default range', () => {
  it('queries each tile once, over the saved default range', async () => {
    open('/dashboards/d3')
    await waitFor(() => expect(queriesFor('visit').length).toBeGreaterThan(0))
    await act(() => new Promise(resolve => setTimeout(resolve, 50)))
    const requests = queriesFor('visit')
    expect(requests).toHaveLength(1)
    expect(spanDays(requests[0])).toBeGreaterThan(20)
  })
})
