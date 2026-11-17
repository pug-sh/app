import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'
import { AggregationType, Granularity, QueryResponseSchema } from '@/api/genproto/shared/insights/v1/insights_pb'

const { query, getFilterSchema } = vi.hoisted(() => ({ query: vi.fn(), getFilterSchema: vi.fn() }))

vi.mock('@/components/charts/chart-parent-size', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ query, getFilterSchema }) }
})

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return {
    ...actual,
    activeProjectAtom: atom({ id: 'p1', displayName: 'Test' }),
    projectHeaderAtom: atom({ 'x-project-id': 'p1' }),
    activeProjectTimezoneAtom: atom('UTC'),
  }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

const Insights = (await import('./index.page')).default

const result = (kind: string, points: [Date, number][]) =>
  create(QueryResponseSchema, {
    result: {
      case: 'trends',
      value: {
        series: [
          { eventKind: kind, points: points.map(([time, value]) => ({ time: timestampFromDate(time), value })) },
        ],
      },
    },
  })

const jan = (day: number) => new Date(Date.UTC(2026, 0, day))

const axisDays = () => screen.queryAllByText(/^[A-Z][a-z]{2} \d{1,2}$/).map(el => el.textContent ?? '')

const open = (entry: object) => {
  const ef = encodeURIComponent(JSON.stringify([{ filters: [], ...entry }]))
  window.history.replaceState(
    null,
    '',
    `/insights?ef=${ef}&gr=${Granularity.DAY}&tf=${jan(1).getTime()}&tt=${jan(8).getTime()}`,
  )
  render(<Insights />)
}

beforeEach(() => {
  getFilterSchema.mockResolvedValue(create(GetFilterSchemaResponseSchema, {}))
})

afterEach(() => vi.useRealTimers())

// The page keeps a result up while the next query runs. Drawn on the next query's range or granularity, it would
// gain days or hours nothing has answered yet, every one of them reading zero.
it('draws each result on the range and granularity it answers', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.UTC(2026, 2, 15, 12)))
  query.mockResolvedValue(result('page_view', [[jan(4), 5]]))
  open({ kind: 'page_view' })

  await waitFor(() => expect(axisDays()).toContain('Jan 1'))
  const shown = axisDays()

  let land: (response: unknown) => void = () => {}
  query.mockImplementation(
    () =>
      new Promise(resolve => {
        land = resolve
      }),
  )
  fireEvent.click(screen.getByText('granularity'))
  fireEvent.click(screen.getByRole('button', { name: 'Hour' }))
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
  expect(axisDays()).toEqual(shown)

  fireEvent.click(screen.getByText('time'))
  fireEvent.click(screen.getByText('Last 30 days'))
  await waitFor(() => expect(query).toHaveBeenCalledTimes(3))
  expect(axisDays()).toEqual(shown)

  await act(async () => land(result('page_view', [[new Date(Date.UTC(2026, 2, 10)), 5]])))
  await waitFor(() => expect(axisDays()).not.toContain('Jan 1'))
  expect(axisDays().length).toBeGreaterThan(1)
  expect(axisDays().every(day => /^(Feb|Mar) /.test(day))).toBe(true)
})

// An average of an empty day has no value, and a zero there drags the summary's avg and min down.
it('keeps an average to the days that hold data', async () => {
  query.mockResolvedValue(
    result('purchase', [
      [jan(4), 10],
      [jan(5), 20],
    ]),
  )
  open({ kind: 'purchase', aggregation: AggregationType.AVG, aggregationProperty: 'amount' })

  await waitFor(() => expect(axisDays()).toContain('Jan 4'))
  expect(axisDays()).toEqual(['Jan 4', 'Jan 5'])
})
