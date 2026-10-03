import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

const { inviteMember } = vi.hoisted(() => ({ inviteMember: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({
      listMembers: vi.fn(async () => ({ members: [] })),
      listInvitations: vi.fn(async () => ({ invitations: [] })),
      inviteMember,
    }),
  }
})

const { activeOrgAtom } = await import('@/data/workspace.atoms')
const Members = (await import('./index.page')).default

describe('inviting a member', () => {
  // The transport's proto check refuses it too, but only as a bare "Failed to send invitation".
  it('says an address is invalid before sending it', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    const store = createStore()
    store.set(activeOrgAtom, create(OrgSchema, { id: 'org-a', displayName: 'Acme', role: OrgRole.ADMIN }))
    render(
      <Provider store={store}>
        <Members />
      </Provider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Invite member' }))
    const input = screen.getByPlaceholderText('colleague@company.com')
    fireEvent.change(input, { target: { value: 'bob' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(error).toHaveBeenCalledWith('Enter a valid email address'))
    expect(inviteMember).not.toHaveBeenCalled()
  })
})
