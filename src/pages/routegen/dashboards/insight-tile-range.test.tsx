import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { render } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { afterEach, expect, it, vi } from 'vitest'
import { DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import {
  AggregationType,
  Granularity,
  InsightQuerySpecSchema,
  InsightType,
  TrendSeriesSchema,
  TrendsResultSchema,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import type { ChartComparison } from '../insights/charts'
import type { ChartPoint } from '../insights/charts/types'

type Handed = { chartData: ChartPoint[]; comparison?: ChartComparison }

const { handed } = vi.hoisted(() => ({ handed: [] as Handed[] }))

// Read off the props: the dashed line's values never reach the DOM as numbers.
vi.mock('../insights/content', () => ({
  InsightsContent: (props: Handed) => {
    handed.push(props)
    return null
  },
}))

const { InsightTileView } = await import('./insight-tile-view')

afterEach(() => vi.useRealTimers())

const at = (day: number, hour: number) => new Date(Date.UTC(2026, 6, day, hour))
const endOf = (day: number) => new Date(Date.UTC(2026, 6, day, 23, 59, 59, 999))
const purchases = (points: [Date, number][]) =>
  create(TrendSeriesSchema, {
    eventKind: 'purchase',
    points: points.map(([time, value]) => ({ time: timestampFromDate(time), value })),
  })

const draw = (props: Partial<Parameters<typeof InsightTileView>[0]> = {}) => {
  render(
    <Provider store={createStore()}>
      <InsightTileView
        viewMode={DashboardTileViewMode.LINE}
        spec={create(InsightQuerySpecSchema, {
          insightType: InsightType.TRENDS,
          events: [{ event: { kind: 'purchase' }, aggregation: AggregationType.TOTAL }],
        })}
        result={{
          case: 'trends',
          value: create(TrendsResultSchema, {
            series: [
              purchases([
                [at(20, 0), 10],
                [at(20, 1), 20],
                [at(20, 2), 30],
              ]),
            ],
          }),
        }}
        granularity={Granularity.HOUR}
        timeZone="UTC"
        fillRange={{ from: at(20, 0), to: new Date(Date.UTC(2026, 6, 20, 3, 30)) }}
        {...props}
      />
    </Provider>,
  )
  return handed.at(-1)
}

// The prior window's empty hours are dropped too. Laid over by position its points slide toward the start;
// gridded over its own window, bucket i is the same hour into each.
it('lays the prior window over the current one hour for hour', () => {
  const props = draw({
    comparePrior: true,
    compare: {
      label: 'vs prior 4h',
      series: [purchases([[at(19, 22), 9]])],
      granularity: Granularity.HOUR,
      fillRange: { from: at(19, 20), to: new Date(Date.UTC(2026, 6, 19, 23, 30)) },
    },
  })
  expect(props?.comparison?.values).toEqual([0, 0, 9, 0])
})

// A range picked to the end of today stops at the hour in progress; yesterday, run whole, would be squeezed into it.
it('cuts the prior day to as far as today has run', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.UTC(2026, 6, 20, 3, 30)))
  const props = draw({
    fillRange: { from: at(20, 0), to: endOf(20) },
    comparePrior: true,
    compare: {
      label: 'vs yesterday',
      series: [purchases([[at(19, 2), 9]])],
      granularity: Granularity.HOUR,
      fillRange: { from: at(19, 0), to: endOf(19) },
    },
  })
  expect(props?.comparison?.values).toEqual([0, 0, 9, 0])
})

// One window can land at a new granularity before the other does.
it('draws no prior line across two granularities', () => {
  const props = draw({
    comparePrior: true,
    compare: {
      label: 'vs prior',
      series: [purchases([[at(19, 0), 9]])],
      granularity: Granularity.DAY,
      fillRange: undefined,
    },
  })
  expect(props?.chartData).toHaveLength(4)
  expect(props?.comparison).toBeUndefined()
})
