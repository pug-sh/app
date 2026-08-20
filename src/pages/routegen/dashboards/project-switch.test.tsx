import { create } from '@bufbuild/protobuf'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider, useAtomValue } from 'jotai'
import { Fragment } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { activeProjectAtom } from '@/data/workspace.atoms'

const { listCalls, renderedNames } = vi.hoisted(() => ({
  listCalls: new Map<string, { promise: Promise<unknown>; resolve: (v: unknown) => void }>(),
  renderedNames: { list: [] as string[] },
}))

const deferredFor = (projectId: string) => {
  const existing = listCalls.get(projectId)
  if (existing) return existing
  let resolve: (v: unknown) => void = () => {}
  const promise = new Promise<unknown>(r => {
    resolve = r
  })
  const entry = { promise, resolve }
  listCalls.set(projectId, entry)
  return entry
}

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({}),
    projectsRPCAtom: atom({}),
    dashboardsRPCAtom: atom({
      list: (_req: unknown, opts: { headers: Record<string, string> }) =>
        deferredFor(opts.headers['x-project-id']).promise,
    }),
  }
})

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

vi.mock('./list-placeholder', () => ({
  DashboardsPlaceholder: ({ title }: { title: string }) => <div data-testid="placeholder">{title}</div>,
}))

vi.mock('./list-row', () => ({
  DashboardListRow: ({ dashboard }: { dashboard: { displayName: string } }) => {
    renderedNames.list.push(dashboard.displayName)
    return <div data-testid="dashboard-row">{dashboard.displayName}</div>
  },
}))

const Dashboards = (await import('./index.page')).default

// Mirrors ProjectSync: the page is keyed on the route's project, so a switch remounts it. The
// remount is the point — module-level atoms survive it.
const Harness = () => {
  const project = useAtomValue(activeProjectAtom)
  return (
    <Fragment key={project?.id}>
      <Dashboards />
    </Fragment>
  )
}

describe('dashboards across a project switch', () => {
  beforeEach(() => {
    listCalls.clear()
    renderedNames.list = []
  })

  it('never renders the previous project dashboards after switching', async () => {
    const store = createStore()
    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    )

    deferredFor('p1').resolve({ dashboards: [{ id: 'd1', displayName: 'P1 board', description: '' }] })
    await waitFor(() => expect(screen.getByTestId('dashboard-row').textContent).toBe('P1 board'))

    renderedNames.list = []
    act(() => {
      store.set(activeProjectAtom, create(ProjectSchema, { id: 'p2', displayName: 'P2' }))
    })

    expect(renderedNames.list).not.toContain('P1 board')

    deferredFor('p2').resolve({ dashboards: [{ id: 'd2', displayName: 'P2 board', description: '' }] })
    await waitFor(() => expect(screen.getByTestId('dashboard-row').textContent).toBe('P2 board'))
    expect(renderedNames.list).not.toContain('P1 board')
  })
})
