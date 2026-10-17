import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { act, render } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { DashboardTileSchema, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  DataPointSchema,
  Granularity,
  InsightQuerySpecSchema,
  InsightType,
  SessionMetric,
  TrendSeriesSchema,
  TrendsResultSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'

// The tile reads activeProjectTimezoneAtom, which pulls workspace.atoms → api/rpc → transport, and
// that throws at module scope with no VITE_API_BASE_URL. Nothing here reads an RPC atom.
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { orgsRPCAtom: atom({}), projectsRPCAtom: atom({}), insightsRPCAtom: atom({}) }
})

// happy-dom reports the container as 0x0, and an unsized chart renders nothing at all.
vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 300 }),
}))

const { InsightTileView } = await import('./insight-tile-view')
const { compiledThemeAtom, installedThemesAtom, themeModeAtom, themeSelectionAtom } = await import('@/data/theme.atoms')
const { setSeriesPalette } = await import('@/lib/event-colors')

const EMBER = {
  id: 'installed-ember' as const,
  text: JSON.stringify({
    version: 1,
    name: 'Ember',
    variants: { dark: { data: { events: { page_view: '#ff5f5f' } } } },
  }),
  hash: 'ember',
  installedAt: 0,
  source: 'file' as const,
}

const at = (hour: number) => new Date(Date.UTC(2026, 6, 20, hour))
const result = {
  case: 'trends' as const,
  value: create(TrendsResultSchema, {
    series: [
      create(TrendSeriesSchema, {
        eventKind: 'page_view',
        points: [4, 9, 6].map((value, i) => create(DataPointSchema, { time: timestampFromDate(at(i)), value })),
      }),
    ],
  }),
}

// Two dark themes share a polarity, so a tile whose series colours are cached on anything but the
// theme revision keeps drawing the first theme's line after a switch to the second.
it('re-colours its series when switching between two dark themes', () => {
  const store = createStore()
  store.set(themeModeAtom, 'dark')
  setSeriesPalette(store.get(compiledThemeAtom).data)
  const { container } = render(
    <Provider store={store}>
      <InsightTileView
        viewMode={DashboardTileViewMode.LINE}
        spec={create(InsightQuerySpecSchema, { insightType: InsightType.TRENDS })}
        result={result}
        granularity={Granularity.HOUR}
      />
    </Provider>,
  )
  const pugDark = store.get(compiledThemeAtom).data.events.page_view.line
  expect(container.innerHTML).toContain(pugDark)

  act(() => {
    store.set(installedThemesAtom, [EMBER])
    store.set(themeSelectionAtom, { light: 'pug', dark: EMBER.id })
    setSeriesPalette(store.get(compiledThemeAtom).data)
  })

  const ember = store.get(compiledThemeAtom).data.events.page_view.line
  expect(ember).not.toBe(pugDark)
  expect(container.innerHTML).toContain(ember)
})

it("passes the caller's empty-state condition through to an empty result", () => {
  const { container } = render(
    <Provider store={createStore()}>
      <InsightTileView
        viewMode={DashboardTileViewMode.LINE}
        spec={create(InsightQuerySpecSchema, { insightType: InsightType.TRENDS })}
        result={{ case: 'trends', value: create(TrendsResultSchema) }}
        granularity={Granularity.DAY}
        emptyQualifier="under the dashboard filters"
      />
    </Provider>,
  )
  expect(container.textContent).toContain('No events recorded in this period under the dashboard filters')
})

it.each([
  ['an event', { events: [{ event: { kind: 'signup' } }] }, 'Loading chart'],
  ['a session metric', { session: { metric: SessionMetric.SESSIONS } }, 'Loading chart'],
  ['no event', {}, 'Pick an event to start'],
])('tells a pending tile with %s what it is waiting for', (_, fields, hint) => {
  const { container } = render(
    <Provider store={createStore()}>
      <InsightTileView
        viewMode={DashboardTileViewMode.LINE}
        spec={create(InsightQuerySpecSchema, { insightType: InsightType.TRENDS, ...fields })}
        result={{ case: undefined, value: undefined }}
        granularity={Granularity.DAY}
        compact
      />
    </Provider>,
  )
  expect(container.textContent).toContain(hint)
})

const settledEmpty = { case: 'trends' as const, value: create(TrendsResultSchema) }
const pending = { case: undefined, value: undefined }

it.each([
  ['a count with data', '19', AggregationType.TOTAL, result],
  ['a count that came back empty', '0', AggregationType.TOTAL, settledEmpty],
  ['an average that came back empty', '—', AggregationType.AVG, settledEmpty],
  ['a count still loading', '—', AggregationType.TOTAL, pending],
])('shows %s on a KPI as %s', (_, shown, aggregation, kpiResult) => {
  const { container } = render(
    <Provider store={createStore()}>
      <InsightTileView
        tile={create(DashboardTileSchema, { viewMode: DashboardTileViewMode.KPI })}
        spec={create(InsightQuerySpecSchema, {
          insightType: InsightType.TRENDS,
          events: [{ event: { kind: 'signup' }, aggregation }],
        })}
        result={kpiResult}
        granularity={Granularity.DAY}
      />
    </Provider>,
  )
  expect(container.querySelector('.tabular-nums')?.textContent).toBe(shown)
})
