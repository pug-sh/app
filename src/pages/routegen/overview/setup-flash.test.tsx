import { create } from '@bufbuild/protobuf'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'

// Counts renders, not presence: the fetch effect runs before `render()` returns, so the setup
// screen is already replaced by then and a DOM query would pass against the bug.
const { setupRenders, schemaCall } = vi.hoisted(() => ({
  setupRenders: { count: 0 },
  schemaCall: {
    resolve: (_: unknown) => {},
    reject: (_: unknown) => {},
    promise: Promise.resolve(null as unknown),
  },
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({}),
    projectsRPCAtom: atom({}),
    insightsRPCAtom: atom({ getFilterSchema: () => schemaCall.promise }),
  }
})

vi.mock('@/lib/rpc-error', () => ({
  toastRPCError: vi.fn(),
  rpcErrorMessage: (_: unknown, fallback: string) => fallback,
}))

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  const project = { id: 'p1', name: 'Test' }
  return {
    ...actual,
    activeProjectAtom: atom(project),
    projectHeaderAtom: atom({ 'x-project-id': project.id }),
  }
})

vi.mock('./setup-mode', () => ({
  default: () => {
    setupRenders.count += 1
    return <div data-testid="setup-body" />
  },
}))

vi.mock('./traffic-analytics-mode', () => ({ default: () => <div data-testid="traffic-body" /> }))
vi.mock('./analytics-mode', () => ({ default: () => <div data-testid="product-body" /> }))

const Overview = (await import('./index.page')).default

const schemaWith = (eventNames: string[]) =>
  create(GetFilterSchemaResponseSchema, { events: eventNames.map(name => ({ name, count: BigInt(1) })) })

// A fresh store per test, or the module-level schema atom carries the previous case's answer in.
const renderOverview = () =>
  render(
    <Provider>
      <Overview />
    </Provider>,
  )

describe('overview setup screen', () => {
  beforeEach(() => {
    setupRenders.count = 0
    schemaCall.promise = new Promise((resolve, reject) => {
      schemaCall.resolve = resolve
      schemaCall.reject = reject
    })
  })

  it('never renders while the schema is still in flight', async () => {
    const { container } = renderOverview()

    expect(setupRenders.count).toBe(0)
    expect(container.querySelector('.animate-spin')).toBeTruthy()

    schemaCall.resolve(schemaWith(['page_view']))
    await waitFor(() => expect(screen.getByTestId('traffic-body')).toBeTruthy())

    expect(setupRenders.count).toBe(0)
  })

  // Non-vacuous: the same wiring must still reach the setup screen once the schema says empty.
  it('renders once the schema comes back with no events', async () => {
    renderOverview()

    schemaCall.resolve(schemaWith([]))
    await waitFor(() => expect(screen.getByTestId('setup-body')).toBeTruthy())
  })

  it('shows a retryable error instead of the setup screen when the fetch fails', async () => {
    renderOverview()

    schemaCall.reject(new Error('boom'))
    await waitFor(() => expect(screen.getByText('Failed to load project overview')).toBeTruthy())

    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(setupRenders.count).toBe(0)
  })
})
