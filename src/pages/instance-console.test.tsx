import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { BooleanFilter } from '@/api/genproto/dashboard/instance/v1/instance_pb'
import { OrgRole } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

const { listUsers, listOrganizations, getOrganization, listDeletions } = vi.hoisted(() => ({
  listUsers: vi.fn(),
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  listDeletions: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    instanceAdminRPCAtom: atom({ listUsers, listOrganizations, getOrganization, listDeletions }),
    orgsRPCAtom: atom({ list: vi.fn() }),
    projectsRPCAtom: atom({ batchGet: vi.fn() }),
  }
})

const InstanceConsole = (await import('./instance-console')).default

beforeEach(() => {
  listUsers.mockReset()
  listOrganizations.mockReset()
  getOrganization.mockReset()
  listDeletions.mockReset()
  listUsers.mockResolvedValue({
    users: [{ id: 'user-1', email: 'someone@example.com', emailVerified: true, disabled: false, memberships: [] }],
    nextPageToken: 'next-user',
  })
  listOrganizations.mockResolvedValue({
    organizations: [{ id: 'org-1', name: 'Acme' }],
    nextPageToken: '',
  })
  getOrganization.mockResolvedValue({
    organization: {
      id: 'org-1',
      name: 'Acme',
      projectCount: 2,
      memberCount: 1,
      createdAt: '2026-09-20T00:00:00Z',
      deletionState: 'active',
      needsAdmin: false,
    },
    projects: [{ id: 'project-1', name: 'Alpha project', deletionState: 'active' }],
    members: [
      {
        id: 'user-1',
        email: 'member@example.com',
        disabled: false,
        memberships: [{ orgId: 'org-1', role: OrgRole.MEMBER }],
      },
    ],
    invitations: [
      { id: 'invite-1', email: 'invitee@example.com', role: OrgRole.MEMBER, expiresAt: '2026-09-29T00:00:00Z' },
    ],
    nextProjectPageToken: '',
    nextMemberPageToken: '',
    nextInvitationPageToken: '',
  })
  listDeletions.mockResolvedValue({ operations: [] })
})

it('applies user filters on the server and resets the cursor when they change', async () => {
  render(
    <Provider store={createStore()}>
      <Router hook={memoryLocation({ path: '/instance/users' }).hook}>
        <InstanceConsole />
      </Router>
    </Provider>,
  )

  await waitFor(() => expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ pageToken: '' })))
  const table = screen.getByRole('table', { name: 'Users' })
  expect(
    within(table)
      .getAllByText('Verified')
      .some(element => element.getAttribute('data-slot') === 'badge'),
  ).toBe(true)
  expect(
    within(table)
      .getAllByText('Enabled')
      .some(element => element.getAttribute('data-slot') === 'badge'),
  ).toBe(true)
  fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
  await waitFor(() => expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ pageToken: 'next-user' })))

  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Organization' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Acme' }))
  await waitFor(() =>
    expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ orgId: 'org-1', pageToken: '' })),
  )

  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Verified' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Unverified' }))
  await waitFor(() =>
    expect(listUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ orgId: 'org-1', verified: BooleanFilter.FALSE, pageToken: '' }),
    ),
  )

  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Enabled' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Enabled' }))
  await waitFor(() =>
    expect(listUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ orgId: 'org-1', verified: BooleanFilter.FALSE, enabled: BooleanFilter.TRUE }),
    ),
  )

  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Search users' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search users' }), { target: { value: 'someone' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'someone' })))
  fireEvent.click(screen.getByRole('button', { name: 'Remove Search filter' }))
  await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: '' })))

  const action = screen.getByRole('button', { name: 'Revoke sessions for someone@example.com' })
  expect(action.parentElement?.className).not.toContain('opacity-0')
  fireEvent.click(action)
  expect(screen.getByText('Revoke all sessions for someone@example.com?')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel action for someone@example.com' }))
})

it('keeps a multi-organization cell compact and shows every membership on demand', async () => {
  listUsers.mockResolvedValue({
    users: [
      {
        id: 'user-1',
        email: 'someone@example.com',
        emailVerified: true,
        disabled: false,
        memberships: [
          { orgId: 'org-c', orgName: 'Charlie', role: OrgRole.VIEWER },
          { orgId: 'org-a', orgName: 'Alpha', role: OrgRole.ADMIN },
          { orgId: 'org-b', orgName: 'Bravo', role: OrgRole.MEMBER },
        ],
      },
    ],
    nextPageToken: '',
  })
  render(
    <Provider store={createStore()}>
      <Router hook={memoryLocation({ path: '/instance/users' }).hook}>
        <InstanceConsole />
      </Router>
    </Provider>,
  )

  const trigger = await screen.findByRole('button', { name: 'Show all 3 organizations for someone@example.com' })
  expect(trigger.textContent).toBe('+2')
  fireEvent.click(trigger)
  const popover = await screen.findByRole('dialog')
  expect(within(popover).getAllByRole('listitem')).toHaveLength(3)
  expect(within(popover).getByText('Alpha')).toBeTruthy()
  expect(within(popover).getByText('Bravo')).toBeTruthy()
  expect(within(popover).getByText('Charlie')).toBeTruthy()
})

it('separates organization overview, projects, members, and pending invitations', async () => {
  const location = memoryLocation({ path: '/instance/organizations/org-1' })
  render(
    <Provider store={createStore()}>
      <Router hook={location.hook}>
        <InstanceConsole />
      </Router>
    </Provider>,
  )

  await screen.findByRole('heading', { name: 'Acme' })
  expect(
    screen
      .getByRole('navigation', { name: 'Breadcrumb' })
      .compareDocumentPosition(screen.getByRole('heading', { name: 'Acme' })),
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(
    within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Organizations' }),
  ).toBeTruthy()
  expect(screen.getByText('2')).toBeTruthy()
  expect(screen.getByText('1')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Delete organization' })).toBeTruthy()
  expect(screen.queryByText('member@example.com')).toBeNull()

  fireEvent.click(screen.getByRole('link', { name: 'Projects' }))
  expect(await screen.findByText('Alpha project')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Delete organization' })).toBeNull()

  fireEvent.click(screen.getByRole('link', { name: 'Members' }))
  expect(await screen.findByText('member@example.com')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Invite member' })).toBeTruthy()
  expect(screen.queryByText('invitee@example.com')).toBeNull()

  fireEvent.click(screen.getByRole('link', { name: 'Invitations' }))
  expect(await screen.findByText(/invitee@example.com/)).toBeTruthy()
  expect(screen.queryByText('member@example.com')).toBeNull()
})

it('returns to the same organization search and page after viewing a detail', async () => {
  listOrganizations.mockImplementation(async ({ pageToken }: { pageToken: string }) => ({
    organizations: [{ id: 'org-1', name: 'Acme' }],
    nextPageToken: pageToken ? '' : 'next-org',
  }))
  const location = memoryLocation({ path: '/instance/organizations', record: true })
  render(
    <Provider store={createStore()}>
      <Router hook={location.hook}>
        <InstanceConsole />
      </Router>
    </Provider>,
  )

  fireEvent.change(screen.getByRole('textbox', { name: 'Search organizations' }), { target: { value: 'Acme' } })
  await waitFor(() => expect(listOrganizations).toHaveBeenCalledWith({ search: 'Acme', pageSize: 50, pageToken: '' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
  await waitFor(() =>
    expect(listOrganizations).toHaveBeenCalledWith({ search: 'Acme', pageSize: 50, pageToken: 'next-org' }),
  )

  fireEvent.click(screen.getByRole('button', { name: /Acme/ }))
  await screen.findByRole('heading', { name: 'Acme' })
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Organizations' }),
  )

  expect(location.history.at(-1)).toBe('/instance/organizations')
  expect((screen.getByRole('textbox', { name: 'Search organizations' }) as HTMLInputElement).value).toBe('Acme')
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeTruthy()
})
