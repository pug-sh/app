import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { type Project, ProjectSchema } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { fakeResponse } from '@/test/fake-response'
import { jwtFor } from '@/test/jwt'
import { serveByUrl } from '@/test/serve'
import { applyTheme, openTheme, panel, tile } from '@/test/theme-gallery'
import { CLAY_LIST, clayFile, LIST_URL } from '@/test/theme-repository'

const { batchGet, deleteProject, updateMeta } = vi.hoisted(() => ({
  batchGet: vi.fn(),
  deleteProject: vi.fn(),
  updateMeta: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { projectsRPCAtom: atom({ batchGet, delete: deleteProject, updateMeta }) }
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
const { projectOverridesAtom, refreshFetchedThemeAtom } = await import('@/data/theme.atoms')
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

describe('the default theme', () => {
  const themed = (defaultTheme: string) =>
    create(ProjectSchema, { id: 'doomed', displayName: 'Doomed', orgId: 'org-a', defaultTheme })
  const mountWith = (role: OrgRole, defaultTheme = '', override?: string) => {
    const store = createStore()
    store.set(activeOrgAtom, orgAs(role))
    store.set(projectsAtom, [themed(defaultTheme)])
    store.set(activeProjectAtom, themed(defaultTheme))
    if (override) store.set(projectOverridesAtom, { doomed: override })
    render(
      <Provider store={store}>
        <General />
      </Provider>,
    )
    return store
  }
  const choose = (name: string) => applyTheme(name, 'Set as project default')
  const saves = () =>
    updateMeta.mockImplementation(async ({ defaultTheme }: { defaultTheme: string }) => ({
      project: themed(defaultTheme),
    }))

  afterEach(() => vi.unstubAllGlobals())

  it('shows everyone what the default is, and only admins the controls', () => {
    mountWith(OrgRole.VIEWER, 'pug#dark')
    expect(screen.getByText('Pug, always dark')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add a theme' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear default' })).toBeNull()
  })

  // Review Focus 1: project defaults are live, so one can name a theme that's now a mode of Pug.
  it('reads a default saved before the modes as Pug, and saves it as Pug', async () => {
    saves()
    mountWith(OrgRole.ADMIN, 'pug-colourblind#dark')
    expect(screen.getByText('Pug, always dark')).toBeTruthy()
    expect(screen.queryByText(/can’t be used/)).toBeNull()
    expect(tile('Pug').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Follow each member’s mode' }))
    await waitFor(() =>
      expect(updateMeta).toHaveBeenCalledWith({ defaultTheme: 'pug' }, { headers: { 'x-project-id': 'doomed' } }),
    )
  })

  it('saves a theme from its own button, and puts the stored project back into the workspace', async () => {
    saves()
    const store = mountWith(OrgRole.ADMIN)
    await choose('Pug')
    await waitFor(() => expect(store.get(activeProjectAtom)?.defaultTheme).toBe('pug'))
    expect(updateMeta).toHaveBeenCalledWith({ defaultTheme: 'pug' }, { headers: { 'x-project-id': 'doomed' } })
    expect(store.get(projectsAtom)[0].defaultTheme).toBe('pug')
    expect(within(panel()).getByRole('button', { name: 'Project default' })).toBeTruthy()
  })

  it('pins the saved default to a mode at once', async () => {
    saves()
    const store = mountWith(OrgRole.ADMIN, 'pug')
    fireEvent.click(screen.getByRole('button', { name: 'Always dark' }))
    await waitFor(() => expect(store.get(activeProjectAtom)?.defaultTheme).toBe('pug#dark'))
    expect(screen.getByText('Pug, always dark')).toBeTruthy()
  })

  // Your own pick for the project paints over the default, so saving one used to change nothing on your screen.
  it('says when your own pick for this project hides the default, and shows the default on request', async () => {
    saves()
    const store = mountWith(OrgRole.ADMIN, '', 'pug#dark')
    expect(screen.queryByText(/so that’s what you see/)).toBeNull()
    await choose('Pug')
    const note = 'You picked Pug for this project in Appearance, so that’s what you see.'
    expect(await within(panel()).findByText(note, { exact: false })).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Show the default' }))
    expect(store.get(projectOverridesAtom)).toEqual({})
    expect(screen.queryByText(/so that’s what you see/)).toBeNull()
  })

  it('says so to anyone whose own pick hides the default', () => {
    mountWith(OrgRole.VIEWER, 'pug', 'pug#dark')
    expect(screen.getByText(/You picked Pug for this project in Appearance/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show the default' })).toBeTruthy()
  })

  // An id this build doesn't have, or a URL the URL parser refuses: never a crash, and the admin can clear it.
  it.each(['pug-colorblind', 'https://themes.pug.sh:99999/t.json'])(
    'says %j can’t be used, and offers to clear it',
    value => {
      mountWith(OrgRole.ADMIN, value)
      expect(screen.getByText('The saved default can’t be used. Members see their own theme.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Clear default' })).toBeTruthy()
    },
  )

  // The page says why, and the workspace keeps what it had.
  it('keeps the project as it was when the save is refused', async () => {
    const toastError = vi.spyOn(toast, 'error').mockImplementation(() => '')
    updateMeta.mockRejectedValue(
      new ConnectError('default_theme: the host can’t be localhost or an IP address', Code.InvalidArgument),
    )
    const store = mountWith(OrgRole.ADMIN)
    await choose('Pug')
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(store.get(activeProjectAtom)?.defaultTheme).toBe('')
    expect(within(panel()).getByRole('button', { name: 'Set as project default' })).toBeTruthy()
  })

  it('clears the default on a second click', async () => {
    saves()
    const store = mountWith(OrgRole.ADMIN, 'pug')
    fireEvent.click(screen.getByRole('button', { name: 'Clear default' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear the default?' }))
    await waitFor(() => expect(store.get(activeProjectAtom)?.defaultTheme).toBe(''))
    expect(updateMeta).toHaveBeenCalledWith({ defaultTheme: '' }, { headers: { 'x-project-id': 'doomed' } })
  })

  // A dead file is reported where it can be fixed.
  it('tells the admin why the default’s file failed its last check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse('', { status: 404 })),
    )
    const url = 'https://themes.pug.sh/gone/theme.json'
    const store = mountWith(OrgRole.ADMIN, url)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('gone, latest (themes.pug.sh), follows each member’s mode')).toBeTruthy()
    expect(screen.getByText('Last check failed: the host answered 404.')).toBeTruthy()
  })

  it('warns that members in a mode the file lacks see Pug', async () => {
    const linen = JSON.stringify({
      version: 1,
      name: 'Linen',
      variants: { light: { colors: { background: '#f3eee4' } } },
    })
    const url = 'https://cdn.example.com/linen/theme.json'
    serveByUrl({ [url]: linen })
    const store = mountWith(OrgRole.VIEWER, url)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Linen has no dark variant, so members in dark see Pug.')).toBeTruthy()
  })

  it('leaves that to the pin warning when a pin is what went wrong', async () => {
    const linen = JSON.stringify({
      version: 1,
      name: 'Linen',
      variants: { light: { colors: { background: '#f3eee4' } } },
    })
    const url = 'https://cdn.example.com/linen/theme.json'
    serveByUrl({ [url]: linen })
    const store = mountWith(OrgRole.VIEWER, `${url}#dark`)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText(/Pinned to dark, but the file has no dark variant/)).toBeTruthy()
    expect(screen.queryByText(/members in dark see Pug/)).toBeNull()
  })

  it('keeps the default’s track when an admin opens its theme, and says what it won’t reach', async () => {
    const url = 'https://themes.pug.sh/clay/1/theme.json'
    serveByUrl({ [LIST_URL]: CLAY_LIST, [url]: JSON.stringify(clayFile('1.1.0')) })
    mountWith(OrgRole.ADMIN, url)
    expect(await screen.findByText('2.0.0 is out. You stay on 1.x until you switch.')).toBeTruthy()
    await openTheme('Clay')
    expect(within(panel()).getByRole('button', { name: 'Project default' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Follow 1.x' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('names the default’s file and its host once it has loaded', async () => {
    const linen = JSON.stringify({
      version: 1,
      name: 'Linen',
      variants: { light: { colors: { background: '#f3eee4' } } },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(linen)),
    )
    const url = 'https://cdn.example.com/linen/theme.json'
    const store = mountWith(OrgRole.VIEWER, `${url}#light`)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Linen (cdn.example.com), always light')).toBeTruthy()
  })

  it('reads an official default by how it follows and what it is now', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(JSON.stringify(clayFile('1.1.0')))),
    )
    const url = 'https://themes.pug.sh/clay/1/theme.json'
    const store = mountWith(OrgRole.VIEWER, `${url}#light`)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Clay, following 1.x (now 1.1.0), always light')).toBeTruthy()
  })

  it('lists the errors of a default whose file broke', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse('{"version":1,"name":"Linen","variants":{}}')),
    )
    const url = 'https://themes.pug.sh/linen/theme.json'
    const store = mountWith(OrgRole.ADMIN, url)
    await act(() => store.set(refreshFetchedThemeAtom, url))
    expect(screen.getByText('Last check failed: the file has errors.')).toBeTruthy()
    expect(screen.getByText('A theme needs a light or a dark variant')).toBeTruthy()
  })
})
