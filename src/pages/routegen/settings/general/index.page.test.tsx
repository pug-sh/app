import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { type Project, ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { jwtFor } from '@/test/jwt'

const { batchGet, deleteProject } = vi.hoisted(() => ({ batchGet: vi.fn(), deleteProject: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { projectsRPCAtom: atom({ batchGet, delete: deleteProject }) }
})

vi.mock('@/analytics/pug', () => ({
  trackEvent: vi.fn(),
  trackFeature: vi.fn(),
  identifyCustomer: vi.fn(),
  resetIdentity: vi.fn(),
  initAnalytics: vi.fn(),
  analyticsEnabled: false,
}))

const { WorkspaceBootstrap } = await import('@/App')
const { ProjectRedirect, ProjectSync } = await import('@/pages/router')
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')
const { activeOrgAtom, activeProjectAtom, bootstrapStatusAtom, projectsAtom } = await import('@/data/workspace.atoms')
const General = (await import('./index.page')).default

const orgAs = (role: OrgRole) => create(OrgSchema, { id: 'org-a', displayName: 'Org A', role })
const project = (id: string, displayName: string) => create(ProjectSchema, { id, displayName, orgId: 'org-a' })

const doomed = project('doomed', 'Doomed')
const kept = project('kept', 'Kept')
const spare = project('spare', 'Spare')

const CONFIRM_LABEL = 'Type the project name to confirm'
const deleteButton = () => screen.getByRole('button', { name: 'Delete project' }) as HTMLButtonElement

const mountPage = (role: OrgRole) => {
  const store = createStore()
  store.set(activeOrgAtom, orgAs(role))
  store.set(activeProjectAtom, doomed)
  render(
    <Provider store={store}>
      <General />
    </Provider>,
  )
}

// Through the bootstrap and the real Switch: where a delete lands is decided by the default pick and
// ProjectRedirect racing off '/', and neither runs on a bare page.
const mountApp = ({ before, after }: { before: Project[]; after: Project[] }) => {
  batchGet.mockResolvedValueOnce({ projects: before }).mockResolvedValue({ projects: after })
  deleteProject.mockResolvedValue({})
  const store = createStore()
  store.set(refreshTokenAtom, 'refresh-token')
  store.set(jwtAtom, jwtFor('cust-1'))
  store.set(bootstrapStatusAtom, 'ready')
  store.set(activeOrgAtom, orgAs(OrgRole.ADMIN))
  const { hook, history, navigate } = memoryLocation({ path: `/p/${doomed.id}/settings/general`, record: true })
  render(
    <Provider store={store}>
      <Router hook={hook}>
        <WorkspaceBootstrap />
        <Switch>
          <Route path="/p/:projectId/settings/general">
            <ProjectSync>
              <General />
            </ProjectSync>
          </Route>
          <Route path="/p/:projectId/overview">
            <ProjectSync>
              <div>overview</div>
            </ProjectSync>
          </Route>
          <Route>
            <ProjectRedirect />
          </Route>
        </Switch>
      </Router>
    </Provider>,
  )
  return { store, history, navigateTo: navigate }
}

const confirmDelete = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Delete project' }))
  fireEvent.change(screen.getByLabelText(CONFIRM_LABEL), { target: { value: doomed.displayName } })
  fireEvent.click(deleteButton())
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleting a project', () => {
  it('is offered to admins', () => {
    mountPage(OrgRole.ADMIN)

    expect(deleteButton()).toBeTruthy()
  })

  it.each([
    ['members', OrgRole.MEMBER],
    ['viewers', OrgRole.VIEWER],
  ])('is not offered to %s', (_, role) => {
    mountPage(role)

    expect(screen.queryByRole('button', { name: 'Delete project' })).toBeNull()
  })

  it('stays disabled until the typed name matches the project’s exactly', () => {
    mountPage(OrgRole.ADMIN)
    fireEvent.click(deleteButton())
    const input = screen.getByLabelText(CONFIRM_LABEL)

    expect(deleteButton().disabled).toBe(true)
    for (const almost of ['Doom', 'doomed', 'Doomed ']) {
      fireEvent.change(input, { target: { value: almost } })
      expect(deleteButton().disabled).toBe(true)
    }

    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(deleteProject).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'Doomed' } })
    expect(deleteButton().disabled).toBe(false)
  })

  it('lands on the first remaining project', async () => {
    const { store, history } = mountApp({ before: [doomed, kept, spare], after: [kept, spare] })

    await confirmDelete()

    await waitFor(() => expect(history).toEqual([`/p/${kept.id}/overview`]))
    expect(store.get(activeProjectAtom)?.id).toBe(kept.id)
    expect(screen.getByText('overview')).toBeTruthy()
    expect(deleteProject).toHaveBeenCalledWith({}, { headers: { 'x-project-id': doomed.id } })
  })

  it('says there are no projects when it was the last one', async () => {
    const { history } = mountApp({ before: [doomed], after: [] })

    await confirmDelete()

    await waitFor(() => expect(screen.getByText('No projects yet')).toBeTruthy())
    expect(history).toEqual(['/'])
  })

  it('treats a project already deleted elsewhere as deleted', async () => {
    const { history } = mountApp({ before: [doomed, kept, spare], after: [kept, spare] })
    deleteProject.mockRejectedValueOnce(new ConnectError('project not found or access denied', Code.Unauthenticated))

    await confirmDelete()

    await waitFor(() => expect(history).toEqual([`/p/${kept.id}/overview`]))
  })

  it('keeps the project and the form when the delete fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const toastError = vi.spyOn(toast, 'error').mockImplementation(() => '')
    const { store, history } = mountApp({ before: [doomed, kept, spare], after: [doomed, kept, spare] })
    deleteProject.mockRejectedValueOnce(new ConnectError('internal error', Code.Internal))

    await confirmDelete()

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to delete project'))
    await waitFor(() => expect(deleteButton().disabled).toBe(false))
    expect((screen.getByLabelText(CONFIRM_LABEL) as HTMLInputElement).value).toBe(doomed.displayName)
    expect(history).toEqual([`/p/${doomed.id}/settings/general`])
    expect(store.get(activeProjectAtom)?.id).toBe(doomed.id)
  })

  it('leaves someone who switched project mid-delete where they went', async () => {
    const toastSuccess = vi.spyOn(toast, 'success').mockImplementation(() => '')
    const { store, history, navigateTo } = mountApp({ before: [doomed, kept, spare], after: [kept, spare] })
    let landDelete = () => {}
    deleteProject.mockReturnValueOnce(new Promise(resolve => (landDelete = () => resolve({}))))

    await confirmDelete()
    act(() => {
      store.set(activeProjectAtom, kept)
      navigateTo(`/p/${kept.id}/settings/general`)
    })
    await act(async () => landDelete())

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(`Deleted ${doomed.displayName}`))
    expect(history.at(-1)).toBe(`/p/${kept.id}/settings/general`)
    expect(store.get(activeProjectAtom)).toBe(kept)
    expect(store.get(projectsAtom)).toEqual([kept, spare])
    expect(batchGet).toHaveBeenCalledTimes(1)
  })
})
