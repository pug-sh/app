import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'
import {
  AggregationType,
  InsightType,
  QueryResponseSchema,
  TopKQuery_Dimension,
} from '@/api/genproto/shared/insights/v1/insights_pb'

const { query, getFilterSchema } = vi.hoisted(() => ({ query: vi.fn(), getFilterSchema: vi.fn() }))

vi.mock('@visx/responsive', () => ({
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

const open = (search: string) => {
  window.history.replaceState(null, '', `/insights?${search}`)
  render(<Insights />)
}

const openWith = (aggregation: AggregationType, extra = '') => {
  const ef = JSON.stringify([{ kind: 'page_view', filters: [], aggregation }])
  open(`ef=${encodeURIComponent(ef)}${extra}`)
}

const param = (key: string, value: unknown) => `${key}=${encodeURIComponent(JSON.stringify(value))}`

const spec = (call: number) => query.mock.calls[call][0].spec
const settled = (calls: number) => waitFor(() => expect(query).toHaveBeenCalledTimes(calls))

beforeEach(() => {
  query.mockReset().mockResolvedValue(create(QueryResponseSchema, {}))
  getFilterSchema.mockReset().mockResolvedValue(create(GetFilterSchemaResponseSchema, {}))
})

describe('insights cookieless visibility', () => {
  // The control is the whole point of the flag — Insights was excluding these visitors with nothing
  // on screen saying so, while Overview counted them.
  it('offers the toggle on a measure that counts people', async () => {
    openWith(AggregationType.UNIQUE_USERS)
    await settled(1)
    expect(screen.getByText('Cookieless excluded')).toBeTruthy()
  })

  // Counting events is unaffected by the flag, so a chip here would toggle nothing and read as
  // proof there are no cookieless visitors.
  it('hides the toggle on a measure that counts events', async () => {
    openWith(AggregationType.TOTAL)
    await settled(1)
    expect(screen.queryByText('Cookieless excluded')).toBeNull()
  })

  // Strict equality: a page that forgets the field sends `undefined`, which the server's
  // GetIncludeCookieless() reads as false — the right answer by accident.
  it('asks for them to be excluded on the first load', async () => {
    openWith(AggregationType.UNIQUE_USERS)
    await settled(1)
    expect(spec(0).includeCookieless).toBe(false)
  })

  // The flag has to be in the debounced query's key or the chip flips, the label changes, and the
  // chart keeps showing the numbers it already had.
  it('re-queries with them counted when the toggle is flipped', async () => {
    openWith(AggregationType.UNIQUE_USERS)
    await settled(1)

    fireEvent.click(screen.getByText('Cookieless excluded'))
    await settled(2)

    expect(spec(1).includeCookieless).toBe(true)
    expect(screen.getByText('Cookieless counted')).toBeTruthy()
  })

  it('writes the opt-in to the URL and drops it again', async () => {
    openWith(AggregationType.UNIQUE_USERS)
    await settled(1)
    expect(window.location.search).not.toContain('cookieless')

    fireEvent.click(screen.getByText('Cookieless excluded'))
    await waitFor(() => expect(window.location.search).toContain('cookieless=1'))

    fireEvent.click(screen.getByText('Cookieless counted'))
    await waitFor(() => expect(window.location.search).not.toContain('cookieless'))
  })

  // The page builds its spec in three branches, and top-k and map each take their own — so the
  // trends assertions above say nothing about them.
  it('carries the opt-in on a top-K over users', async () => {
    const topK = { dimension: TopKQuery_Dimension.USER, property: '', metric: AggregationType.TOTAL }
    open(`it=${InsightType.TOP_K}&${param('tk', topK)}&cookieless=1`)
    await settled(1)
    expect(spec(0).includeCookieless).toBe(true)
  })

  it('carries the opt-in on a map of unique users', async () => {
    open(`it=${InsightType.MAP}&${param('mp', { metric: AggregationType.UNIQUE_USERS })}&cookieless=1`)
    await settled(1)
    expect(spec(0).includeCookieless).toBe(true)
  })

  // The param is gated on relevance like `tk`/`mp`, so a shared link can't carry an invisible
  // opt-in that switches the recipient to non-default numbers the moment they pick Unique users.
  it('drops the param when the measure makes the flag a no-op', async () => {
    openWith(AggregationType.TOTAL, '&cookieless=1')
    await settled(1)
    expect(window.location.search).not.toContain('cookieless')
  })

  // Including a rotating id in a person-based insight doesn't double-count, it can only drop off —
  // a different consequence than the user-count copy names.
  it('names the drop-off consequence on a person-based insight', async () => {
    open(`it=${InsightType.RETENTION}&cookieless=1`)
    const chip = await screen.findByText('Cookieless counted')
    expect(chip.getAttribute('title')).toContain('drop-off')
  })

  // A shared link is the only way this setting travels between people, so the read direction needs
  // its own guard — the writer above passes whether or not anything parses the param back.
  it('restores the opt-in from a shared link', async () => {
    openWith(AggregationType.UNIQUE_USERS, '&cookieless=1')
    await settled(1)
    expect(spec(0).includeCookieless).toBe(true)
    expect(screen.getByText('Cookieless counted')).toBeTruthy()
  })
})
