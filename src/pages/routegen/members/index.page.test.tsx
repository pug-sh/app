import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvitationStatus, OrgInvitationSchema, OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

const { inviteMember, listInvitations, resendInvite } = vi.hoisted(() => ({
  inviteMember: vi.fn(),
  listInvitations: vi.fn(),
  resendInvite: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({
      listMembers: vi.fn(async () => ({ members: [] })),
      listInvitations,
      inviteMember,
      resendInvite,
    }),
  }
})

const { activeOrgAtom } = await import('@/data/workspace.atoms')
const Members = (await import('./index.page')).default

const renderMembers = () => {
  const store = createStore()
  store.set(activeOrgAtom, create(OrgSchema, { id: 'org-a', displayName: 'Acme', role: OrgRole.ADMIN }))
  render(
    <Provider store={store}>
      <Members />
    </Provider>,
  )
}

const invitation = (id: string, expiresAt: string) =>
  create(OrgInvitationSchema, {
    id,
    email: `${id}@acme.com`,
    expiresAt,
    orgId: 'org-a',
    role: OrgRole.MEMBER,
    status: InvitationStatus.PENDING,
  })

const LAPSED = '2000-01-01T00:00:00Z'
const LIVE = '2099-01-01T00:00:00Z'

beforeEach(() => {
  listInvitations.mockResolvedValue({ invitations: [] })
})

describe('inviting a member', () => {
  // The transport's proto check refuses it too, but only as a bare "Failed to send invitation".
  it('says an address is invalid before sending it', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    renderMembers()

    fireEvent.click(await screen.findByRole('button', { name: 'Invite member' }))
    const input = screen.getByPlaceholderText('colleague@company.com')
    fireEvent.change(input, { target: { value: 'bob' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(error).toHaveBeenCalledWith('Enter a valid email address'))
    expect(inviteMember).not.toHaveBeenCalled()
  })

  it('points an address whose invitation expired to resend instead', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    listInvitations.mockResolvedValue({ invitations: [invitation('old', LAPSED)] })
    renderMembers()

    expect(await screen.findByText('Expired')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }))
    const input = screen.getByPlaceholderText('colleague@company.com')
    fireEvent.change(input, { target: { value: 'Old@acme.com' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('This address already has an invitation. Resend it from the list below.'),
    )
    expect(inviteMember).not.toHaveBeenCalled()
  })
})

// The server keeps listing an invitation after its link lapses, still PENDING, and refuses it on accept.
describe('an invitation', () => {
  it('reads expired once its link has lapsed', async () => {
    listInvitations.mockResolvedValue({ invitations: [invitation('old', LAPSED), invitation('new', LIVE)] })
    renderMembers()

    const lapsed = (await screen.findByText('old@acme.com')).parentElement as HTMLElement
    expect(within(lapsed).getByText('Expired')).toBeTruthy()
    const live = screen.getByText('new@acme.com').parentElement as HTMLElement
    expect(within(live).getByText('Pending')).toBeTruthy()
  })

  it('reads pending again once a resend renews it', async () => {
    listInvitations.mockResolvedValue({ invitations: [invitation('old', LAPSED)] })
    resendInvite.mockResolvedValue({ invitation: invitation('old', LIVE) })
    renderMembers()

    expect(await screen.findByText('Expired')).toBeTruthy()
    fireEvent.click(screen.getByTitle('Resend invitation'))

    expect(await screen.findByText('Pending')).toBeTruthy()
    expect(screen.queryByText('Expired')).toBeNull()
  })
})
