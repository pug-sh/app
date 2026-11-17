import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'
import {
  AggregationType,
  InsightType,
  QueryResponseSchema,
  TopKQuery_Dimension,
} from '@/api/genproto/shared/insights/v1/insights_pb'
import { includeBotsAtom } from '@/data/bots.atoms'

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

const open = (search: string) => {
  window.history.replaceState(null, '', `/insights?${search}`)
  render(<Insights />)
}

const param = (key: string, value: unknown) => `${key}=${encodeURIComponent(JSON.stringify(value))}`
const rows = (kind: string) => param('ef', [{ kind, filters: [], aggregation: AggregationType.TOTAL }])

const spec = (call: number) => query.mock.calls[call][0].spec
const settled = (calls: number) => waitFor(() => expect(query).toHaveBeenCalledTimes(calls))
const chip = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement

beforeEach(() => {
  query.mockReset().mockResolvedValue(create(QueryResponseSchema, {}))
  getFilterSchema.mockReset().mockResolvedValue(create(GetFilterSchemaResponseSchema, {}))
  getDefaultStore().set(includeBotsAtom, false)
})

describe('insights bot visibility', () => {
  // Strict equality: a page that forgets the field sends `undefined`, false only by the server's default.
  it('asks for bots to be excluded on the first load', async () => {
    open(rows('page_view'))
    await settled(1)
    expect(spec(0).includeBots).toBe(false)
    expect(chip('Bots hidden').getAttribute('aria-disabled')).toBeNull()
  })

  // Events, Live and the profiles list share includeBotsAtom; showing bots there must not move these numbers.
  it('keeps its own setting apart from the explorer', async () => {
    getDefaultStore().set(includeBotsAtom, true)
    open(rows('page_view'))
    await settled(1)
    expect(spec(0).includeBots).toBe(false)
    expect(window.location.search).not.toContain('bots')
  })

  it('re-queries with bots included and keeps the choice in the URL', async () => {
    open(rows('page_view'))
    await settled(1)

    fireEvent.click(screen.getByText('Bots hidden'))
    await settled(2)

    expect(spec(1).includeBots).toBe(true)
    await waitFor(() => expect(window.location.search).toContain('bots=1'))
  })

  it('restores the choice from a shared link, and drops it when switched off', async () => {
    open(`${rows('page_view')}&bots=1`)
    await settled(1)
    expect(spec(0).includeBots).toBe(true)

    fireEvent.click(screen.getByText('Bots shown'))
    await settled(2)
    expect(spec(1).includeBots).toBe(false)
    await waitFor(() => expect(window.location.search).not.toContain('bots'))
  })

  // With bots excluded a crawler_request query is always empty, so the chip can't be left off.
  it('includes bots for crawler requests whatever the chip says', async () => {
    open(rows('crawler_request'))
    await settled(1)

    expect(spec(0).includeBots).toBe(true)
    expect(chip('Bots shown').getAttribute('aria-disabled')).toBe('true')
    expect(chip('Bots shown').getAttribute('aria-pressed')).toBe('true')

    // Focusable rather than disabled, so a click has to be ignored by hand.
    fireEvent.click(screen.getByText('Bots shown'))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(window.location.search).not.toContain('bots')
  })

  it('includes bots for a ranking by crawler', async () => {
    const topK = { dimension: TopKQuery_Dimension.PROPERTY, property: '$bot_reason', metric: AggregationType.TOTAL }
    open(`it=${InsightType.TOP_K}&${param('tk', topK)}`)
    await settled(1)
    expect(spec(0).includeBots).toBe(true)
  })
})
