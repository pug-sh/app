import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { ComparePeriod, DashboardTileSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Granularity, InsightType, type QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'
import { createFilter } from '@/components/event-filters/filter-model'

const { queryRPC, emptyQualifiers, shareMeta } = vi.hoisted(() => ({
  queryRPC: vi.fn(async (_query: QueryRequest) => ({ result: undefined })),
  emptyQualifiers: new Map<string, string | undefined>(),
  shareMeta: new Map<string, string>(),
}))
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ query: queryRPC }) }
})
vi.mock('@/data/workspace.atoms', async () => {
  const { atom } = await import('jotai')
  return { projectHeaderAtom: atom({ 'x-project-id': 'p1' }), activeProjectTimezoneAtom: atom('UTC') }
})
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }))
vi.mock('@/components/share-chart-button', () => ({
  ShareChartButton: ({ fallbackName, meta }: { fallbackName: string; meta: string }) => {
    shareMeta.set(fallbackName, meta)
    return null
  },
}))
vi.mock('./insight-tile-view', () => ({
  InsightTileView: ({ tile, emptyQualifier }: { tile: { id: string }; emptyQualifier?: string }) => {
    emptyQualifiers.set(tile.id, emptyQualifier)
    return null
  },
}))

const { DashboardGrid } = await import('./grid')

const range = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-08T00:00:00Z') }

describe('dashboard filters in tile RPCs', () => {
  it('filters every tile and its comparison, then reruns the original queries when cleared', async () => {
    const tiles = ['signup', 'purchase'].map((kind, i) =>
      create(DashboardTileSchema, {
        id: kind,
        compare: i === 0 ? ComparePeriod.PRIOR : ComparePeriod.UNSPECIFIED,
        content: {
          case: 'insight',
          value: {
            spec: {
              insightType: InsightType.TRENDS,
              events: [{ event: { kind, filters: [{ property: 'local', operator: FilterOperator.IS_SET }] } }],
              filterGroups: [{ filters: [{ property: 'saved', operator: FilterOperator.IS_SET }] }],
            },
          },
        },
      }),
    )
    const before = structuredClone(tiles)
    const filters = [createFilter('tenant', PropertySource.PROFILE, FilterOperator.EQUALS, 'acme')]
    const view = (globalFilters: typeof filters) => (
      <Provider>
        <DashboardGrid
          tiles={tiles}
          globalTimeRange={range}
          globalGranularity={Granularity.DAY}
          globalFilters={globalFilters}
        />
      </Provider>
    )
    const { rerender } = render(view(filters))
    await waitFor(() => expect(queryRPC).toHaveBeenCalledTimes(3))
    for (const [query] of queryRPC.mock.calls) {
      expect(query.spec?.filterGroups.flatMap(group => group.filters).map(filter => filter.property)).toEqual([
        'saved',
        'tenant',
      ])
      expect(query.spec?.events[0].event?.filters[0].property).toBe('local')
    }
    expect(queryRPC.mock.calls.filter(([query]) => query.spec?.events[0].event?.kind === 'signup')).toHaveLength(2)
    rerender(view([]))
    await waitFor(() => expect(queryRPC).toHaveBeenCalledTimes(6))
    for (const [query] of queryRPC.mock.calls.slice(3)) {
      expect(query.spec?.filterGroups.flatMap(group => group.filters).map(filter => filter.property)).toEqual(['saved'])
    }
    expect(tiles).toEqual(before)
  })
})

describe('dashboard filter overlap flag', () => {
  const tile = (id: string, spec: object, hideTitle = false) =>
    create(DashboardTileSchema, {
      id,
      displayName: id,
      header: { hideTitle },
      content: {
        case: 'insight',
        value: { spec: { insightType: InsightType.TRENDS, events: [{ event: { kind: 'signup' } }], ...spec } },
      },
    })
  const equals = (property: string, value: string) => ({ property, operator: FilterOperator.EQUALS, value })
  const tiles = [
    tile('own-filter', { filterGroups: [{ filters: [equals('$browser', 'Chrome')] }] }),
    tile('split', { breakdowns: [{ property: '$browser' }] }, true),
    tile('unrelated', { filterGroups: [{ filters: [equals('$os', 'iOS')] }] }),
  ]
  const safari = [createFilter('$browser', PropertySource.AUTO, FilterOperator.EQUALS, 'Safari')]
  const view = (globalFilters: typeof safari, mode: 'view' | 'edit' = 'view') => (
    <Provider>
      <DashboardGrid
        tiles={tiles}
        mode={mode}
        onPatchTile={() => {}}
        globalTimeRange={range}
        globalGranularity={Granularity.DAY}
        globalFilters={globalFilters}
      />
    </Provider>
  )
  const flags = () => screen.queryAllByRole('button', { name: 'Overlaps the dashboard filters' })

  beforeEach(() => {
    emptyQualifiers.clear()
    shareMeta.clear()
  })

  it.each(['view', 'edit'] as const)('flags tiles that filter or split by a dashboard property (%s mode)', mode => {
    const { rerender } = render(view(safari, mode))
    expect(flags()).toHaveLength(2)
    expect(emptyQualifiers.get('own-filter')).toBe("under both this tile's filters and the dashboard's")
    expect(emptyQualifiers.get('split')).toBe('under the dashboard filters')
    expect(emptyQualifiers.get('unrelated')).toBe('under the dashboard filters')

    rerender(view([], mode))
    expect(flags()).toHaveLength(0)
    for (const id of ['own-filter', 'split', 'unrelated']) expect(emptyQualifiers.get(id)).toBeUndefined()
  })

  it("names the tile's own condition and the split it shares with the dashboard", async () => {
    render(view(safari))
    const [ownFilter, split] = flags()
    fireEvent.focus(ownFilter)
    expect(await screen.findByText('$browser = Chrome')).toBeTruthy()
    fireEvent.focus(split)
    expect(await screen.findByText(/which the dashboard filters/)).toBeTruthy()
  })

  it('marks a shared image as filtered while dashboard filters apply', () => {
    const { rerender } = render(view(safari))
    expect(shareMeta.get('chart-unrelated')).toMatch(/ · Filtered$/)
    rerender(view([]))
    expect(shareMeta.get('chart-unrelated')).not.toContain('Filtered')
  })
})
