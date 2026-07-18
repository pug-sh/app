import { create } from '@bufbuild/protobuf'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { OrgRole, OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

const { orgsCreate, orgsUpdateDisplayName } = vi.hoisted(() => ({
  orgsCreate: vi.fn(),
  orgsUpdateDisplayName: vi.fn(),
}))

// The page reaches the RPC clients through workspace.atoms, which build them over the real
// transport at read time. Swap them for fakes so a submit that slips past validation is visible
// here as a call, rather than as a network attempt.
vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    projectsRPCAtom: atom({ batchGet: vi.fn() }),
    orgsRPCAtom: atom({
      list: vi.fn(),
      get: vi.fn(),
      create: orgsCreate,
      leave: vi.fn(),
      updateDisplayName: orgsUpdateDisplayName,
    }),
  }
})

const { activeOrgAtom } = await import('@/data/workspace.atoms')
const Organization = (await import('./index.page')).default

// ADMIN, or <Can action='update' resource='org'> renders the read-only name and there is no rename
// form to submit.
const orgA = create(OrgSchema, { id: 'org-a', displayName: 'Acme', role: OrgRole.ADMIN })

const mount = () => {
  const store = createStore()
  store.set(activeOrgAtom, orgA)
  render(
    <Provider store={store}>
      <Organization />
    </Provider>,
  )
}

// Submitting the form rather than clicking a button: both forms here are single-input and commit on
// Enter, and the rename one has no submit button at all.
const submit = (input: HTMLElement) => fireEvent.submit(input.closest('form') as HTMLFormElement)

describe('organization name validation', () => {
  it('rejects a rename to nothing but spaces, and says so', async () => {
    mount()

    fireEvent.click(screen.getByLabelText('Rename organization'))
    const input = screen.getByLabelText('Organization name')
    fireEvent.change(input, { target: { value: '   ' } })
    submit(input)

    // min(1) alone accepts spaces, so this reached the RPC and stored a name that renders as blank
    // everywhere it is listed — the switcher included. The error has to surface in the field: the
    // page's own failure path is a toast on RPC rejection, and the server accepts '   ' happily.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Organization name is required'))
    expect(orgsUpdateDisplayName).not.toHaveBeenCalled()
  })

  it('rejects creating an org named nothing but spaces, and says so', async () => {
    mount()

    fireEvent.click(screen.getByText('New organization'))
    const input = screen.getByPlaceholderText('New organization name')
    fireEvent.change(input, { target: { value: '   ' } })
    submit(input)

    // This path trimmed at the call site instead of in the schema, so spaces became '' and earned a
    // protovalidate throw — a toast saying the request was invalid, where a field error belongs.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Required'))
    expect(orgsCreate).not.toHaveBeenCalled()
  })

  it('trims the padding off an otherwise valid name', async () => {
    mount()

    fireEvent.click(screen.getByLabelText('Rename organization'))
    const input = screen.getByLabelText('Organization name')
    fireEvent.change(input, { target: { value: '  Acme Inc  ' } })
    submit(input)

    // The resolver hands on the trimmed value, so the trim is not merely a gate — nothing downstream
    // has to remember to do it again.
    await waitFor(() => expect(orgsUpdateDisplayName).toHaveBeenCalledWith({ orgId: 'org-a', displayName: 'Acme Inc' }))
  })
})
