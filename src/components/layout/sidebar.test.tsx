import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { jwtFor } from '@/test/jwt'

const { batchGet, projectCreate, orgsList } = vi.hoisted(() => ({
  batchGet: vi.fn(),
  projectCreate: vi.fn(),
  orgsList: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    projectsRPCAtom: atom({ batchGet, create: projectCreate }),
    orgsRPCAtom: atom({ list: orgsList }),
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

const { SidebarProvider, SidebarTrigger } = await import('@/components/ui/sidebar')
const AppSidebar = (await import('@/components/layout/sidebar')).default
const { activeOrgAtom, activeProjectAtom, projectsAtom } = await import('@/data/workspace.atoms')
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')

// Admin so the Can gate renders the create-project affordance at all.
const orgA = create(OrgSchema, { id: 'org-a', displayName: 'Org A', role: OrgRole.ADMIN })
const projects = [
  create(ProjectSchema, { id: 'p1', displayName: 'First' }),
  create(ProjectSchema, { id: 'p2', displayName: 'Second' }),
]

// Below use-mobile's breakpoint, so the sidebar renders as a sheet over the page rather than as a
// column beside it. Read once in a lazy useState initializer, so setting it before render is enough.
const MOBILE_WIDTH = 500

const mount = async (path: string) => {
  const store = createStore()
  store.set(refreshTokenAtom, 'refresh-token')
  store.set(jwtAtom, jwtFor('cust-1'))
  store.set(activeOrgAtom, orgA)
  store.set(projectsAtom, projects)
  store.set(activeProjectAtom, projects[0])
  const { hook, history } = memoryLocation({ path, record: true })
  render(
    <Provider store={store}>
      <Router hook={hook}>
        <SidebarProvider>
          <SidebarTrigger />
          <AppSidebar />
        </SidebarProvider>
      </Router>
    </Provider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }))
  const nav = await screen.findByRole('link', { name: 'Insights' })
  // Only the mobile branch renders a sheet. Without this the dismissal assertions below would pass
  // against a desktop column that was never a sheet, which is what a stale innerWidth would leave.
  expect(document.querySelector('[data-mobile="true"]')).not.toBeNull()
  return { history, nav }
}

describe('the sidebar on mobile', () => {
  beforeEach(() => {
    window.innerWidth = MOBILE_WIDTH
    orgsList.mockResolvedValue({ orgs: [orgA] })
    batchGet.mockResolvedValue({ projects })
  })

  it('dismisses itself and navigates when a nav item is picked', async () => {
    const { history, nav } = await mount('/p/p1/overview')

    fireEvent.click(nav)

    await waitFor(() => expect(document.body.contains(nav)).toBe(false))
    expect(history).toContain('/p/p1/insights')
  })

  // The sheet covers the page, so landing back on the page you were already on still has to reveal
  // it. Were the dismissal keyed off the location changing, this one would stay open.
  it('dismisses itself when the nav item picked is the current page', async () => {
    const { nav } = await mount('/p/p1/insights')

    fireEvent.click(nav)

    await waitFor(() => expect(document.body.contains(nav)).toBe(false))
  })

  it('dismisses itself and navigates when the project is switched', async () => {
    const { history, nav } = await mount('/p/p1/overview')

    fireEvent.click(screen.getByRole('button', { name: /Org A/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Second' }))

    await waitFor(() => expect(document.body.contains(nav)).toBe(false))
    expect(history).toContain('/p/p2/overview')
  })

  // The one guarded dismissal: it sits inside `if (project)`, so a create that returns nothing
  // leaves the sheet open rather than dismissing onto a page it never navigated to.
  it('dismisses itself and navigates when a project is created', async () => {
    const created = create(ProjectSchema, { id: 'p3', displayName: 'Third' })
    projectCreate.mockResolvedValue({ project: created })
    batchGet.mockResolvedValue({ projects: [...projects, created] })
    const { history, nav } = await mount('/p/p1/overview')

    fireEvent.click(screen.getByRole('button', { name: /Org A/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'New project' }))
    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'Third' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(document.body.contains(nav)).toBe(false))
    expect(history).toContain('/p/p3/overview')
  })

  it('stays open when the theme is cycled', async () => {
    const { nav } = await mount('/p/p1/overview')

    fireEvent.click(screen.getByRole('button', { name: /light|dark|system/i }))

    expect(document.body.contains(nav)).toBe(true)
  })
})
