import { create } from '@bufbuild/protobuf'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema, PropertySource } from '@/api/genproto/common/v1/filter_schema_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { DashboardTileSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { createFilter } from '@/components/event-filters/filter-model'
import { clearSchemaCache } from '@/hooks/use-global-filter-schema'

const { getSchema } = vi.hoisted(() => ({ getSchema: vi.fn() }))
const { testHeaders } = await vi.hoisted(async () => {
  const { atom } = await import('jotai')
  return { testHeaders: atom({ 'x-project-id': 'p1' }) }
})
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { insightsRPCAtom: atom({ getFilterSchema: getSchema }) }
})
vi.mock('@/data/workspace.atoms', () => ({ projectHeaderAtom: testHeaders }))
// The real builder lists properties only inside its open popover; render them flat to assert on.
vi.mock('@/components/event-filters/filter-builder', () => ({
  FilterBuilder: ({ schema }: { schema: { customPropertyKeys: { name: string }[] } }) => (
    <div data-testid="available">{schema.customPropertyKeys.map(key => key.name).join(',')}</div>
  ),
}))

const { DashboardFilterBar } = await import('./dashboard-filter-bar')
const eventTile = create(DashboardTileSchema, {
  content: {
    case: 'insight',
    value: { spec: { events: [{ event: { kind: 'signup' } }, { event: { kind: 'purchase' } }] } },
  },
})
const unscopedTile = create(DashboardTileSchema, { content: { case: 'insight', value: { spec: { topK: {} } } } })
const base = create(GetFilterSchemaResponseSchema)
const scoped = create(GetFilterSchemaResponseSchema, { customPropertyKeys: [{ name: 'shared' }] })
const old = create(GetFilterSchemaResponseSchema, { customPropertyKeys: [{ name: 'old' }] })

const pending = new Map<string, (value: unknown) => void>()
const holdEveryRequest = () =>
  getSchema.mockImplementation(
    ({ eventKind }: { eventKind: string }, options: { headers: Record<string, string> }) =>
      new Promise((resolve, reject) => {
        pending.set(`${options.headers['x-project-id']}:${eventKind}`, value =>
          value instanceof Error ? reject(value) : resolve(value),
        )
      }),
  )
const settle = async (request: string, value: unknown) => {
  await waitFor(() => expect(pending.has(request)).toBe(true))
  await act(async () => pending.get(request)?.(value))
}

beforeEach(() => {
  clearSchemaCache()
  getSchema.mockReset()
  pending.clear()
})

describe('dashboard shared filter loading', () => {
  it('waits for every event schema and offers no partial intersection on failure, then retries', async () => {
    let rejectPurchase = (_reason: Error) => {}
    getSchema.mockImplementation(({ eventKind }: { eventKind: string }) => {
      if (!eventKind) return Promise.resolve(base)
      if (eventKind === 'signup') return Promise.resolve(scoped)
      return new Promise((_, reject) => {
        rejectPurchase = reject
      })
    })
    render(
      <Provider>
        <DashboardFilterBar tiles={[eventTile]} filters={[]} onChange={vi.fn()} />
      </Provider>,
    )
    await waitFor(() => expect(getSchema).toHaveBeenCalledTimes(3))
    expect(screen.queryByTestId('available')).toBeNull()
    await act(async () => rejectPurchase(new Error('unavailable')))
    expect(screen.queryByTestId('available')).toBeNull()
    getSchema.mockResolvedValue(scoped)
    fireEvent.click(screen.getByText('Could not load filters. Retry'))
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('shared'))
  })

  it('hides a loaded schema as soon as the project changes', async () => {
    holdEveryRequest()
    const store = createStore()
    render(
      <Provider store={store}>
        <DashboardFilterBar tiles={[eventTile]} filters={[]} onChange={vi.fn()} />
      </Provider>,
    )
    await settle('p1:', base)
    await settle('p1:signup', old)
    await settle('p1:purchase', old)
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('old'))
    await act(async () => store.set(testHeaders, { 'x-project-id': 'p2' }))
    expect(screen.queryByTestId('available')).toBeNull()
  })

  it.each([
    ['response', old],
    ['failure', new Error('late')],
  ])('ignores a late %s from the previous project', async (_, late) => {
    holdEveryRequest()
    const store = createStore()
    render(
      <Provider store={store}>
        <DashboardFilterBar tiles={[eventTile]} filters={[]} onChange={vi.fn()} />
      </Provider>,
    )
    await settle('p1:', base)
    await settle('p1:signup', old)
    await act(async () => store.set(testHeaders, { 'x-project-id': 'p2' }))
    await settle('p2:', base)
    await settle('p2:signup', scoped)
    await settle('p2:purchase', scoped)
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('shared'))
    await settle('p1:purchase', late)
    expect(screen.getByTestId('available').textContent).toBe('shared')
  })

  it('makes no request per project event for an unscoped tile', async () => {
    const events = Array.from({ length: 40 }, (_, i) => ({ name: `event_${i}` }))
    getSchema.mockImplementation(({ eventKind }: { eventKind: string }) =>
      Promise.resolve(eventKind ? scoped : create(GetFilterSchemaResponseSchema, { events })),
    )
    render(
      <Provider>
        <DashboardFilterBar tiles={[eventTile, unscopedTile]} filters={[]} onChange={vi.fn()} />
      </Provider>,
    )
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('shared'))
    expect(getSchema.mock.calls.map(([request]) => request.eventKind).sort()).toEqual(['', 'purchase', 'signup'])
  })

  it('offers the base schema when every tile is unscoped', async () => {
    getSchema.mockResolvedValue(
      create(GetFilterSchemaResponseSchema, { events: [{ name: 'signup' }], customPropertyKeys: [{ name: 'plan' }] }),
    )
    render(
      <Provider>
        <DashboardFilterBar tiles={[unscopedTile]} filters={[]} onChange={vi.fn()} />
      </Provider>,
    )
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('plan'))
    expect(getSchema).toHaveBeenCalledTimes(1)
  })

  it('keeps restored filters visible and clearable even when schemas fail', async () => {
    getSchema.mockRejectedValue(new Error('offline'))
    const onChange = vi.fn()
    const filters = [createFilter('tenant', PropertySource.PROFILE, FilterOperator.EQUALS, 'acme')]
    render(
      <Provider>
        <DashboardFilterBar tiles={[eventTile]} filters={filters} onChange={onChange} />
      </Provider>,
    )
    await screen.findByText('Could not load filters. Retry')
    expect(screen.getByText('tenant')).toBeTruthy()
    fireEvent.click(screen.getByText('Clear all'))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
