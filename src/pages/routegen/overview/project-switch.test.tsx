import { create } from '@bufbuild/protobuf'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider, useAtomValue } from 'jotai'
import { Fragment } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetFilterSchemaResponseSchema } from '@/api/genproto/common/v1/filter_schema_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { activeProjectAtom } from '@/data/workspace.atoms'

const { schemaCalls, renderedEvents } = vi.hoisted(() => ({
  schemaCalls: new Map<string, { promise: Promise<unknown>; resolve: (v: unknown) => void }>(),
  renderedEvents: { list: [] as string[] },
}))

const deferredFor = (projectId: string) => {
  const existing = schemaCalls.get(projectId)
  if (existing) return existing
  let resolve: (v: unknown) => void = () => {}
  const promise = new Promise<unknown>(r => {
    resolve = r
  })
  const entry = { promise, resolve }
  schemaCalls.set(projectId, entry)
  return entry
}

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({}),
    projectsRPCAtom: atom({}),
    insightsRPCAtom: atom({
      getFilterSchema: (_req: unknown, opts: { headers: Record<string, string> }) =>
        deferredFor(opts.headers['x-project-id']).promise,
    }),
  }
})

vi.mock('@/lib/rpc-error', () => ({
  toastRPCError: vi.fn(),
  rpcErrorMessage: (_: unknown, fallback: string) => fallback,
}))

vi.mock('@/data/workspace.atoms', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/workspace.atoms')>()
  const { atom } = await import('jotai')
  const activeProjectAtom = atom<{ id: string; displayName: string } | null>({ id: 'p1', displayName: 'P1' })
  const projectHeaderAtom = atom(get => {
    const project = get(activeProjectAtom)
    return project ? { 'x-project-id': project.id } : undefined
  })
  return { ...actual, activeProjectAtom, projectHeaderAtom }
})

vi.mock('./setup-mode', () => ({ default: () => <div data-testid="setup-body" /> }))
vi.mock('./analytics-mode', () => ({ default: () => <div data-testid="product-body" /> }))
vi.mock('./traffic-analytics-mode', () => ({
  default: ({ schema }: { schema: { events: { name: string }[] } }) => {
    const name = schema.events[0]?.name ?? ''
    renderedEvents.list.push(name)
    return <div data-testid="traffic-body">{name}</div>
  },
}))

const Overview = (await import('./index.page')).default

const schemaWith = (name: string) => create(GetFilterSchemaResponseSchema, { events: [{ name, count: BigInt(1) }] })

// Mirrors ProjectSync: the page is keyed on the route's project, so a switch remounts it. The
// remount is the point — module-level atoms survive it.
const Harness = () => {
  const project = useAtomValue(activeProjectAtom)
  return (
    <Fragment key={project?.id}>
      <Overview />
    </Fragment>
  )
}

describe('overview across a project switch', () => {
  beforeEach(() => {
    schemaCalls.clear()
    renderedEvents.list = []
  })

  it('never renders the previous project schema after switching', async () => {
    const store = createStore()
    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )

    deferredFor('p1').resolve(schemaWith('p1_event'))
    await waitFor(() => expect(screen.getByTestId('traffic-body').textContent).toBe('p1_event'))

    renderedEvents.list = []
    act(() => {
      store.set(activeProjectAtom, create(ProjectSchema, { id: 'p2', displayName: 'P2' }))
    })

    expect(renderedEvents.list).not.toContain('p1_event')

    deferredFor('p2').resolve(schemaWith('p2_event'))
    await waitFor(() => expect(screen.getByTestId('traffic-body').textContent).toBe('p2_event'))
    expect(renderedEvents.list).not.toContain('p1_event')
  })
})
