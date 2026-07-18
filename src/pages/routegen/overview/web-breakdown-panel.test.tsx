import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AggregationType, Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

// The RPC atom builds a real ConnectRPC client at read time. Swap it for a hand-held fake so a test
// decides when a query resolves — the only way to observe a tab switch while one is still in flight.
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ query }) }
})

// useWebQuery reads both of these off the active project, which no test bootstraps.
vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  return {
    ...actual,
    projectHeaderAtom: atom({ 'x-project-id': 'p1' }),
    activeProjectTimezoneAtom: atom('UTC'),
  }
})

// Type-only, so it's erased and can't defeat the mocks above by evaluating the module early.
import type { BreakdownPanelConfig } from './web-breakdown-panel'

const { WebBreakdownPanel } = await import('./web-breakdown-panel')

// Two `property` tabs, which is the case that breaks: they share `source: 'property'`, so the rows
// memo's deps can't tell them apart. No `valueKind`, to keep flag/devicon assets out of the render.
const CONFIG: BreakdownPanelConfig = {
  title: 'Sources',
  footer: 'by referrer / UTM',
  tabs: [
    {
      id: 'referrer',
      label: 'Referrer',
      source: 'property',
      property: '$referrerDomain',
      metric: AggregationType.TOTAL,
    },
    { id: 'source', label: 'Source', source: 'property', property: '$utmSource', metric: AggregationType.TOTAL },
  ],
}

const RANGE = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-02T00:00:00Z') }

// A query whose resolution this test controls, so a tab can change while it's still in flight.
// useDebouncedQuery fires on a timer, so settling has to wait for the call to actually arrive.
const deferredQuery = () => {
  let settle!: (value: unknown) => void
  let called!: () => void
  const arrived = new Promise<void>(resolve => (called = resolve))
  query.mockImplementationOnce(() => {
    called()
    return new Promise(resolve => (settle = resolve))
  })
  return async (...labels: string[]) => {
    await arrived
    settle({
      result: { case: 'topK', value: { rows: labels.map((label, i) => ({ dimensionValue: label, value: 10 - i })) } },
    })
  }
}

const renderPanel = () =>
  render(
    <WebBreakdownPanel
      config={CONFIG}
      range={RANGE}
      granularity={Granularity.DAY}
      queryKeyPrefix="test-panel"
      filters={[]}
      onAddFilter={vi.fn()}
    />,
  )

beforeEach(() => {
  query.mockReset()
})

describe('WebBreakdownPanel', () => {
  it('does not claim "No data" while the first query is still in flight', async () => {
    const settleFirst = deferredQuery()
    renderPanel()

    expect(screen.queryByText('No data')).toBeNull()

    await settleFirst('referrer.example')
    await waitFor(() => expect(screen.getByText('referrer.example')).toBeTruthy())
  })

  it('still reports "No data" once a query settles empty', async () => {
    const settleFirst = deferredQuery()
    renderPanel()

    await settleFirst()
    await waitFor(() => expect(screen.getByText('No data')).toBeTruthy())
  })

  // The regression: useDebouncedQuery deliberately retains `data` across a key change, so on switching
  // Referrer -> Source the previous tab's rows stayed rendered under the new tab — and stayed clickable,
  // with onRowClick already pointing at $utmSource. One click filed a referrer domain as a UTM source.
  it("drops the previous tab's rows while the new tab's query is in flight", async () => {
    const settleReferrer = deferredQuery()
    renderPanel()
    await settleReferrer('referrer.example')
    await waitFor(() => expect(screen.getByText('referrer.example')).toBeTruthy())

    const settleSource = deferredQuery()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))

    expect(screen.queryByText('referrer.example')).toBeNull()

    await settleSource('newsletter')
    await waitFor(() => expect(screen.getByText('newsletter')).toBeTruthy())
    expect(screen.queryByText('referrer.example')).toBeNull()
  })
})
