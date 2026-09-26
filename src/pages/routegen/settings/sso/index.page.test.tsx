import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DomainSettingsSchema,
  DomainStatus,
  DomainVerificationMethod,
  ListDomainsResponseSchema,
  OrgDomainSchema,
  OrgRole,
  OrgSchema,
} from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

const { listDomains, setDomainSettings, verifyDomain, addDomain, removeDomain, updateDomain } = vi.hoisted(() => ({
  listDomains: vi.fn(),
  setDomainSettings: vi.fn(),
  verifyDomain: vi.fn(),
  addDomain: vi.fn(),
  removeDomain: vi.fn(),
  updateDomain: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({ listDomains, setDomainSettings, verifyDomain, addDomain, removeDomain, updateDomain }),
  }
})

vi.mock('@/analytics/pug', () => ({ trackEvent: vi.fn() }))

const { activeOrgAtom } = await import('@/data/workspace.atoms')
const SsoDomainsPage = (await import('./index.page')).default

// Variants spread these inits, never a built message: create() hands a spread message back as-is,
// unset fields undefined, and an undefined `checked` leaves the Require SSO switch flipping itself.
const pendingInit = {
  id: 'd-pending',
  domain: 'acme.io',
  status: DomainStatus.PENDING,
  txtRecordName: '_pug-verification.acme.io',
  txtRecordValue: 'pug-verification=abc',
}
const verifiedInit = {
  id: 'd-verified',
  domain: 'acme.com',
  status: DomainStatus.VERIFIED,
  verificationMethod: DomainVerificationMethod.DNS,
  orgCreationRestrictedElsewhere: true,
}
const pending = create(OrgDomainSchema, pendingInit)
const verified = create(OrgDomainSchema, verifiedInit)

const listing = (domains: (typeof pending)[], autoJoinRole = OrgRole.UNSPECIFIED, membersCanCreateOrgs = true) =>
  create(ListDomainsResponseSchema, {
    settings: create(DomainSettingsSchema, { autoJoinRole, membersCanCreateOrgs }),
    domains,
  })

const mount = (role = OrgRole.ADMIN) => {
  const store = createStore()
  store.set(activeOrgAtom, create(OrgSchema, { id: 'org-a', displayName: 'Acme', role }))
  render(
    <Provider store={store}>
      <SsoDomainsPage />
    </Provider>,
  )
}

const isDisabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled')

const typeDomain = async (value: string) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add domain' }))
  fireEvent.change(screen.getByPlaceholderText('acme.com'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Add domain' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the SSO & domains tab', () => {
  // SetDomainSettings replaces both settings, so each control has to send the other one back as it was.
  it('turns auto-join on as viewer, keeping org creation as it was', async () => {
    listDomains.mockResolvedValue(listing([verified], OrgRole.UNSPECIFIED, false))
    setDomainSettings.mockResolvedValue({
      settings: create(DomainSettingsSchema, { autoJoinRole: OrgRole.VIEWER, membersCanCreateOrgs: false }),
    })
    mount()

    fireEvent.click(await screen.findByRole('switch', { name: 'Auto-join' }))

    await waitFor(() =>
      expect(setDomainSettings).toHaveBeenCalledWith({
        orgId: 'org-a',
        autoJoinRole: OrgRole.VIEWER,
        membersCanCreateOrgs: false,
      }),
    )
    expect(await screen.findByText('Role for new people')).toBeTruthy()
  })

  it('keeps the auto-join role when org creation is turned off', async () => {
    listDomains.mockResolvedValue(listing([verified], OrgRole.MEMBER))
    setDomainSettings.mockResolvedValue({
      settings: create(DomainSettingsSchema, { autoJoinRole: OrgRole.MEMBER, membersCanCreateOrgs: false }),
    })
    mount()

    fireEvent.click(await screen.findByRole('switch', { name: 'Let members create their own organizations' }))

    await waitFor(() =>
      expect(setDomainSettings).toHaveBeenCalledWith({
        orgId: 'org-a',
        autoJoinRole: OrgRole.MEMBER,
        membersCanCreateOrgs: false,
      }),
    )
  })

  it('keeps org creation as it was when the auto-join role changes', async () => {
    listDomains.mockResolvedValue(listing([verified], OrgRole.VIEWER, false))
    setDomainSettings.mockResolvedValue({
      settings: create(DomainSettingsSchema, { autoJoinRole: OrgRole.MEMBER, membersCanCreateOrgs: false }),
    })
    mount()

    fireEvent.click(await screen.findByRole('combobox'))
    // Base UI commits a mouse pick only when the press started on the item.
    const member = await screen.findByRole('option', { name: 'Member' })
    fireEvent.pointerDown(member)
    fireEvent.click(member)

    await waitFor(() =>
      expect(setDomainSettings).toHaveBeenCalledWith({
        orgId: 'org-a',
        autoJoinRole: OrgRole.MEMBER,
        membersCanCreateOrgs: false,
      }),
    )
  })

  it('says when another org restricts a domain further', async () => {
    listDomains.mockResolvedValue(listing([verified]))
    mount()

    expect(await screen.findByText('Also turned off by another organization that verified acme.com.')).toBeTruthy()
  })

  it('needs a verified domain before auto-join can go on', async () => {
    listDomains.mockResolvedValue(listing([pending]))
    mount()

    expect(isDisabled(await screen.findByRole('switch', { name: 'Auto-join' }))).toBe(true)
    expect(screen.getAllByText('Verify a domain first.').length).toBeGreaterThan(0)
  })

  it('can always turn a setting back off', async () => {
    listDomains.mockResolvedValue(listing([pending], OrgRole.VIEWER, false))
    mount()

    expect(isDisabled(await screen.findByRole('switch', { name: 'Auto-join' }))).toBe(false)
    expect(isDisabled(screen.getByRole('switch', { name: 'Let members create their own organizations' }))).toBe(false)
  })

  it('offers Member only once a domain is verified', async () => {
    listDomains.mockResolvedValue(listing([pending], OrgRole.VIEWER))
    mount()

    fireEvent.click(await screen.findByRole('combobox'))

    expect(isDisabled(await screen.findByRole('option', { name: 'Member' }))).toBe(true)
  })

  it('shows a pending domain its record and verifies it', async () => {
    listDomains.mockResolvedValueOnce(listing([pending])).mockResolvedValueOnce(listing([verified]))
    verifyDomain.mockResolvedValue({ domain: verified })
    mount()

    expect(await screen.findByText('_pug-verification.acme.io')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Verify now' }))

    await waitFor(() => expect(verifyDomain).toHaveBeenCalledWith({ orgId: 'org-a', domainId: 'd-pending' }))
    expect(await screen.findByText('acme.com')).toBeTruthy()
  })

  it('says why a domain could not be verified', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    const success = vi.spyOn(toast, 'success').mockImplementation(() => '')
    const reason = "no TXT record for acme.io holds this org's verification value; check it and try again"
    listDomains.mockResolvedValue(listing([pending]))
    verifyDomain.mockRejectedValue(new ConnectError(reason, Code.FailedPrecondition))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Verify now' }))

    await waitFor(() => expect(error).toHaveBeenCalledWith(reason))
    expect(success).not.toHaveBeenCalled()
  })

  it('drops a domain someone else removed instead of failing on it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(toast, 'error').mockImplementation(() => '')
    listDomains.mockResolvedValueOnce(listing([pending])).mockResolvedValueOnce(listing([]))
    verifyDomain.mockRejectedValue(new ConnectError('domain not found', Code.NotFound))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Verify now' }))

    expect(await screen.findByText('No domains yet.')).toBeTruthy()
  })

  it('keeps a domain removed during its verify from coming back', async () => {
    let landVerify: (value: unknown) => void = () => {}
    listDomains
      .mockResolvedValueOnce(listing([pending]))
      .mockResolvedValueOnce(listing([]))
      .mockReturnValueOnce(new Promise(() => {}))
    verifyDomain.mockReturnValue(new Promise(resolve => (landVerify = resolve)))
    removeDomain.mockResolvedValue({})
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Verify now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme.io' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove?' }))
    await screen.findByText('No domains yet.')
    await act(async () => landVerify({ domain: pending }))

    expect(screen.getByText('No domains yet.')).toBeTruthy()
  })

  it('keeps each verify spinner to its own row', async () => {
    const other = create(OrgDomainSchema, { ...pendingInit, id: 'd-other', domain: 'acme.dev' })
    const land: Record<string, (value: unknown) => void> = {}
    listDomains.mockResolvedValue(listing([pending, other]))
    verifyDomain.mockImplementation(
      ({ domainId }: { domainId: string }) => new Promise(resolve => (land[domainId] = resolve)),
    )
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    mount()

    const [first, second] = await screen.findAllByRole('button', { name: 'Verify now' })
    fireEvent.click(first)
    fireEvent.click(second)
    await act(async () => land['d-other']({ domain: other }))

    expect((screen.getAllByRole('button', { name: 'Verify now' })[0] as HTMLButtonElement).disabled).toBe(true)
  })

  it('asks before removing a domain', async () => {
    listDomains.mockResolvedValueOnce(listing([verified])).mockResolvedValueOnce(listing([]))
    removeDomain.mockResolvedValue({})
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove acme.com' }))
    expect(removeDomain).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove?' }))

    await waitFor(() => expect(removeDomain).toHaveBeenCalledWith({ orgId: 'org-a', domainId: 'd-verified' }))
    expect(await screen.findByText('No domains yet.')).toBeTruthy()
  })

  it('adds a domain and shows its record', async () => {
    listDomains.mockResolvedValueOnce(listing([])).mockResolvedValueOnce(listing([pending]))
    addDomain.mockResolvedValue({ domain: pending })
    mount()

    await typeDomain(' acme.io ')

    await waitFor(() => expect(addDomain).toHaveBeenCalledWith({ orgId: 'org-a', domain: 'acme.io' }))
    expect(await screen.findByText('_pug-verification.acme.io')).toBeTruthy()
    expect(screen.queryByPlaceholderText('acme.com')).toBeNull()
  })

  it('lists a new domain once when a reload got to it first', async () => {
    const added = create(OrgDomainSchema, { ...pendingInit, id: 'd-added', domain: 'acme.dev' })
    let landAdd: (value: unknown) => void = () => {}
    listDomains
      .mockResolvedValueOnce(listing([pending]))
      .mockResolvedValueOnce(listing([pending, added]))
      .mockReturnValueOnce(new Promise(() => {}))
    addDomain.mockReturnValue(new Promise(resolve => (landAdd = resolve)))
    verifyDomain.mockResolvedValue({ domain: pending })
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    mount()

    await typeDomain('acme.dev')
    await waitFor(() => expect(addDomain).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Verify now' }))
    await screen.findByText('acme.dev')
    await act(async () => landAdd({ domain: added }))

    expect(screen.getAllByText('acme.dev')).toHaveLength(1)
  })

  // The transport's proto check refuses these too, but only as a bare "Failed to add domain".
  it.each(['https://acme.com', '10.0.0.1'])('turns %s away before sending it', async value => {
    listDomains.mockResolvedValue(listing([]))
    mount()

    await typeDomain(value)

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Enter a domain name such as acme.com'))
    expect(addDomain).not.toHaveBeenCalled()
  })

  it('says why a domain could not be added', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    listDomains.mockResolvedValue(listing([]))
    addDomain.mockRejectedValue(new ConnectError('an org can add at most 10 domains', Code.FailedPrecondition))
    mount()

    await typeDomain('acme.io')

    await waitFor(() => expect(error).toHaveBeenCalledWith('an org can add at most 10 domains'))
    expect(screen.getByPlaceholderText('acme.com')).toBeTruthy()
  })

  it('holds Cancel while a domain is being added', async () => {
    listDomains.mockResolvedValue(listing([]))
    addDomain.mockReturnValue(new Promise(() => {}))
    mount()

    await typeDomain('acme.io')

    await waitFor(() => expect(addDomain).toHaveBeenCalled())
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers a retry when the server predates domains', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listDomains.mockRejectedValue(new ConnectError('not implemented', Code.Unimplemented))
    mount()

    expect(await screen.findByText("This server doesn't support domains yet.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  // A demoted admin's role is stale until a reload, which Retry can't do.
  it('shows the admin-only note when the server refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listDomains.mockRejectedValue(new ConnectError('your role does not permit this action', Code.PermissionDenied))
    mount()

    expect(await screen.findByText('Only admins can manage SSO and domains.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('shows the retry is under way', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listDomains.mockRejectedValueOnce(new Error('down')).mockReturnValueOnce(new Promise(() => {}))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull())
  })

  it('keeps the page when the reload after a change fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    listDomains.mockResolvedValueOnce(listing([verified])).mockRejectedValueOnce(new Error('down'))
    addDomain.mockResolvedValue({ domain: pending })
    mount()

    await typeDomain('acme.io')

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to refresh domains'))
    expect(screen.getByText('acme.com')).toBeTruthy()
    expect(screen.getByText('_pug-verification.acme.io')).toBeTruthy()
  })

  it('shows Require SSO on even when the reload after it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(toast, 'error').mockImplementation(() => '')
    listDomains
      .mockResolvedValueOnce(listing([create(OrgDomainSchema, { ...verifiedInit, ssoSeen: true })]))
      .mockRejectedValueOnce(new Error('down'))
    updateDomain.mockResolvedValue({
      domain: create(OrgDomainSchema, { ...verifiedInit, ssoSeen: true, requireSso: true }),
    })
    mount()

    fireEvent.click(await screen.findByRole('switch', { name: 'Require SSO for acme.com' }))

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Require SSO for acme.com' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    )
  })

  // It has no admin exception, so turning it on before anyone signed in through SSO could lock everyone out.
  it('needs an SSO sign-in before Require SSO can go on', async () => {
    listDomains.mockResolvedValue(listing([verified, pending]))
    mount()

    expect(isDisabled(await screen.findByRole('switch', { name: 'Require SSO for acme.com' }))).toBe(true)
    expect(screen.getByText('Sign in once through SSO with an account on acme.com to turn this on.')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Require SSO for acme.io' })).toBeNull()
  })

  it('turns Require SSO on for one domain', async () => {
    listDomains
      .mockResolvedValueOnce(listing([create(OrgDomainSchema, { ...verifiedInit, ssoSeen: true })]))
      .mockResolvedValueOnce(listing([create(OrgDomainSchema, { ...verifiedInit, ssoSeen: true, requireSso: true })]))
    updateDomain.mockResolvedValue({})
    mount()

    fireEvent.click(await screen.findByRole('switch', { name: 'Require SSO for acme.com' }))

    await waitFor(() =>
      expect(updateDomain).toHaveBeenCalledWith({ orgId: 'org-a', domainId: 'd-verified', requireSso: true }),
    )
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Require SSO for acme.com' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    )
  })

  it('says when another org requires SSO for a domain', async () => {
    listDomains.mockResolvedValue(listing([create(OrgDomainSchema, { ...verifiedInit, ssoRequiredElsewhere: true })]))
    mount()

    expect(await screen.findByText('Also required by another organization that verified acme.com.')).toBeTruthy()
  })

  it('is admin-only', async () => {
    mount(OrgRole.MEMBER)

    expect(screen.getByText('Only admins can manage SSO and domains.')).toBeTruthy()
    expect(listDomains).not.toHaveBeenCalled()
  })
})
