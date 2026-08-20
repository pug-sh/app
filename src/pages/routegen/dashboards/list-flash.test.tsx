import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Counts renders, not presence: the fetch effect runs before `render()` returns, so the empty
// state is already replaced by then and a DOM query would pass against the bug.
const { emptyRenders, listCall } = vi.hoisted(() => ({
  emptyRenders: { count: 0 },
  listCall: { resolve: (_: unknown) => {}, promise: Promise.resolve(null as unknown) },
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({}),
    projectsRPCAtom: atom({}),
    dashboardsRPCAtom: atom({ list: () => listCall.promise }),
  }
})

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

vi.mock('./list-placeholder', () => ({
  DashboardsPlaceholder: ({ title }: { title: string }) => {
    if (title === 'No dashboards yet') emptyRenders.count += 1
    return <div data-testid="placeholder">{title}</div>
  },
}))

vi.mock('./list-row', () => ({
  DashboardListRow: ({ dashboard }: { dashboard: { displayName: string } }) => (
    <div data-testid="dashboard-row">{dashboard.displayName}</div>
  ),
}))

const Dashboards = (await import('./index.page')).default

const renderDashboards = () =>
  render(
    <Provider>
      <Dashboards />
    </Provider>,
  )

describe('dashboards list', () => {
  beforeEach(() => {
    emptyRenders.count = 0
    listCall.promise = new Promise(resolve => {
      listCall.resolve = resolve
    })
  })

  it('never renders the empty state while the list is still in flight', async () => {
    const { container } = renderDashboards()

    expect(emptyRenders.count).toBe(0)
    expect(container.querySelector('.animate-spin')).toBeTruthy()

    listCall.resolve({ dashboards: [{ id: 'd1', displayName: 'Growth', description: '' }] })
    await waitFor(() => expect(screen.getByTestId('dashboard-row')).toBeTruthy())

    expect(emptyRenders.count).toBe(0)
  })

  // Non-vacuous: the same wiring must still reach the empty state once the list comes back empty.
  it('renders the empty state once the list comes back empty', async () => {
    renderDashboards()

    listCall.resolve({ dashboards: [] })
    await waitFor(() => expect(screen.getByText('No dashboards yet')).toBeTruthy())
  })
})
