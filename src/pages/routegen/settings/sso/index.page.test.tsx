import { create } from '@bufbuild/protobuf'
import { createValidator } from '@bufbuild/protovalidate'
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
  ListSSOConnectionsResponseSchema,
  OrgDomainSchema,
  OrgRole,
  OrgSchema,
  SetSSOConnectionRequestSchema,
  type SSOConnection,
  SSOConnectionSchema,
} from '@/api/genproto/dashboard/orgs/v1/orgs_pb'

const {
  listDomains,
  setDomainSettings,
  verifyDomain,
  addDomain,
  removeDomain,
  updateDomain,
  listSSOConnections,
  setSSOConnection,
  deleteSSOConnection,
} = vi.hoisted(() => ({
  listDomains: vi.fn(),
  setDomainSettings: vi.fn(),
  verifyDomain: vi.fn(),
  addDomain: vi.fn(),
  removeDomain: vi.fn(),
  updateDomain: vi.fn(),
  listSSOConnections: vi.fn(),
  setSSOConnection: vi.fn(),
  deleteSSOConnection: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    orgsRPCAtom: atom({
      listDomains,
      setDomainSettings,
      verifyDomain,
      addDomain,
      removeDomain,
      updateDomain,
      listSSOConnections,
      setSSOConnection,
      deleteSSOConnection,
    }),
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

const connectionListing = (connections: SSOConnection[]) => create(ListSSOConnectionsResponseSchema, { connections })

beforeEach(() => {
  vi.resetAllMocks()
  listSSOConnections.mockResolvedValue(connectionListing([]))
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

    fireEvent.click(await screen.findByRole('switch', { name: 'Let people on your domains create organizations' }))

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
    expect(
      screen.getByText('These apply to every verified domain, including ones verified later. Verify a domain first.'),
    ).toBeTruthy()
  })

  it('warns that new people get no organization with auto-join and org creation both off', async () => {
    listDomains.mockResolvedValue(listing([verified], OrgRole.UNSPECIFIED, false))
    mount()

    expect(
      await screen.findByText(
        'With auto-join off too, new people on your domains start with no organization until someone invites them.',
      ),
    ).toBeTruthy()
  })

  it("warns that people who don't sign in through SSO get no organization with auto-join on", async () => {
    listDomains.mockResolvedValue(listing([verified], OrgRole.VIEWER, false))
    mount()

    expect(
      await screen.findByText(
        "New people on your domains who don't sign in through SSO start with no organization until someone invites them.",
      ),
    ).toBeTruthy()
  })

  it.each([
    ['org creation is on', verified, true],
    ['no domain is verified', pending, false],
  ])("doesn't warn about a missing organization when %s", async (_, domain, membersCanCreateOrgs) => {
    listDomains.mockResolvedValue(listing([domain], OrgRole.UNSPECIFIED, membersCanCreateOrgs))
    mount()

    await screen.findByRole('switch', { name: 'Auto-join' })
    expect(screen.queryByText(/start with no organization/)).toBeNull()
  })

  it('can always turn a setting back off', async () => {
    listDomains.mockResolvedValue(listing([pending], OrgRole.VIEWER, false))
    mount()

    expect(isDisabled(await screen.findByRole('switch', { name: 'Auto-join' }))).toBe(false)
    expect(isDisabled(screen.getByRole('switch', { name: 'Let people on your domains create organizations' }))).toBe(
      false,
    )
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

    await waitFor(() => expect(screen.queryByText('acme.io')).toBeNull())
    expect(screen.getByRole('button', { name: 'Add domain' })).toBeTruthy()
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
    await waitFor(() => expect(screen.queryByText('acme.io')).toBeNull())
    await act(async () => landVerify({ domain: pending }))

    expect(screen.queryByText('acme.io')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add domain' })).toBeTruthy()
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
    await waitFor(() => expect(screen.queryByText('acme.com')).toBeNull())
    expect(screen.getByRole('button', { name: 'Add domain' })).toBeTruthy()
  })

  it("folds a verified domain's record away until asked", async () => {
    listDomains.mockResolvedValue(
      listing([create(OrgDomainSchema, { ...verifiedInit, txtRecordName: '_pug-verification.acme.com' })]),
    )
    mount()

    const show = await screen.findByRole('button', { name: 'Show record' })
    expect(screen.queryByText('_pug-verification.acme.com')).toBeNull()
    fireEvent.click(show)
    expect(screen.getByText('_pug-verification.acme.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide record' }))

    expect(screen.queryByText('_pug-verification.acme.com')).toBeNull()
  })

  it('shows no record for a domain the operator verified', async () => {
    listDomains.mockResolvedValue(
      listing([create(OrgDomainSchema, { ...verifiedInit, verificationMethod: DomainVerificationMethod.OPERATOR })]),
    )
    mount()

    expect(await screen.findByText('Verified by your administrator')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show record' })).toBeNull()
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

describe('SSO connections', () => {
  const acmeSSOInit = {
    id: 'd3uqa6s1m7j9b2c4e5f0',
    label: 'Acme SSO',
    issuerUrl: 'https://acme.okta.com',
    clientId: 'acme-client',
    domains: [{ id: 'd-verified', domain: 'acme.com' }],
  }
  const acmeSSO = create(SSOConnectionSchema, acmeSSOInit)
  const signedInByAcmeSSO = create(OrgDomainSchema, { ...verifiedInit, ssoConnectionId: acmeSSO.id })
  const globexInit = { ...verifiedInit, id: 'd-globex', domain: 'globex.com' }

  // The mocked RPC skips the transport's protovalidate check, so run it here; '' counts as set.
  const expectValidRequest = (request: unknown) => {
    const message = create(SetSSOConnectionRequestSchema, request as object)
    expect(createValidator().validate(SetSSOConnectionRequestSchema, message).kind).toBe('valid')
  }

  const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

  it('lists a connection with the redirect URL to add in the identity provider', async () => {
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValue(connectionListing([acmeSSO]))
    mount()

    expect(await screen.findByText('Acme SSO')).toBeTruthy()
    expect(screen.getByText('Signs in acme.com')).toBeTruthy()
    expect(screen.getByText('https://acme.okta.com')).toBeTruthy()
    expect(screen.getByText(`${window.location.origin}/oauth/callback/${acmeSSO.id}`)).toBeTruthy()
  })

  it('sets one up for a verified domain', async () => {
    listDomains.mockResolvedValue(listing([verified, pending]))
    listSSOConnections.mockResolvedValueOnce(connectionListing([])).mockResolvedValue(connectionListing([acmeSSO]))
    setSSOConnection.mockResolvedValue({ connection: acmeSSO })
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))
    fill('Button label', 'Acme SSO')
    fill('Issuer URL', ' https://acme.okta.com ')
    fill('Client ID', 'acme-client')
    fill('Client secret', 's3cret')
    // Only a verified domain can be signed in through a connection, and the only free one starts ticked.
    expect(screen.queryByRole('checkbox', { name: 'acme.io' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'acme.com' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(setSSOConnection).toHaveBeenCalledOnce())
    const request = setSSOConnection.mock.calls[0][0]
    expect(request).toEqual({
      orgId: 'org-a',
      label: 'Acme SSO',
      issuerUrl: 'https://acme.okta.com',
      clientId: 'acme-client',
      clientSecret: 's3cret',
      domainIds: ['d-verified'],
    })
    expectValidRequest(request)
    expect(await screen.findByText(`${window.location.origin}/oauth/callback/${acmeSSO.id}`)).toBeTruthy()
  })

  it('ticks the one free domain, not one another connection signs in', async () => {
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO, create(OrgDomainSchema, globexInit)]))
    listSSOConnections.mockResolvedValue(connectionListing([acmeSSO]))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))

    expect(screen.getByRole('checkbox', { name: 'acme.com' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('checkbox', { name: 'globex.com' }).getAttribute('aria-checked')).toBe('true')
  })

  it('ticks nothing when more than one domain is free', async () => {
    listDomains.mockResolvedValue(listing([verified, create(OrgDomainSchema, globexInit)]))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Pick at least one domain')).toBeTruthy()
  })

  it('ticks nothing for an edit, even with one domain free', async () => {
    listDomains.mockResolvedValue(listing([create(OrgDomainSchema, globexInit)]))
    listSSOConnections.mockResolvedValue(
      connectionListing([create(SSOConnectionSchema, { ...acmeSSOInit, domains: [] })]),
    )
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme SSO' }))

    expect(screen.getByRole('checkbox', { name: 'globex.com' }).getAttribute('aria-checked')).toBe('false')
  })

  it("won't tick a domain a connection was just saved with", async () => {
    listDomains.mockResolvedValueOnce(listing([verified])).mockReturnValue(new Promise(() => {}))
    listSSOConnections.mockResolvedValueOnce(connectionListing([])).mockReturnValue(new Promise(() => {}))
    setSSOConnection.mockResolvedValue({ connection: acmeSSO })
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))
    fill('Button label', 'Acme SSO')
    fill('Issuer URL', 'https://acme.okta.com')
    fill('Client ID', 'acme-client')
    fill('Client secret', 's3cret')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))

    expect(screen.getByRole('checkbox', { name: 'acme.com' }).getAttribute('aria-checked')).toBe('false')
  })

  it('keeps the stored secret when an edit leaves it blank', async () => {
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValue(connectionListing([acmeSSO]))
    setSSOConnection.mockResolvedValue({ connection: acmeSSO })
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme SSO' }))
    fill('Button label', 'Acme Okta')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(setSSOConnection).toHaveBeenCalledOnce())
    const request = setSSOConnection.mock.calls[0][0]
    expect(request).toMatchObject({ connectionId: acmeSSO.id, label: 'Acme Okta', clientSecret: '' })
    expectValidRequest(request)
  })

  it('leaves open an editor opened while another saved', async () => {
    const globexSSO = create(SSOConnectionSchema, { ...acmeSSOInit, id: 'g1obexs5o0000000000a', label: 'Globex SSO' })
    let landSave: (value: unknown) => void = () => {}
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValue(connectionListing([acmeSSO, globexSSO]))
    setSSOConnection.mockReturnValue(new Promise(resolve => (landSave = resolve)))
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme SSO' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(setSSOConnection).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Edit Globex SSO' }))
    await act(async () => landSave({ connection: acmeSSO }))

    expect((screen.getByLabelText('Button label') as HTMLInputElement).value).toBe('Globex SSO')
  })

  it('drops a domain removed while the editor was open instead of sending it', async () => {
    const both = create(SSOConnectionSchema, {
      ...acmeSSOInit,
      domains: [...acmeSSOInit.domains, { id: 'd-globex', domain: 'globex.com' }],
    })
    listDomains
      .mockResolvedValueOnce(
        listing([signedInByAcmeSSO, create(OrgDomainSchema, { ...globexInit, ssoConnectionId: acmeSSO.id })]),
      )
      .mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValueOnce(connectionListing([both])).mockResolvedValue(connectionListing([acmeSSO]))
    removeDomain.mockResolvedValue({})
    setSSOConnection.mockResolvedValue({ connection: acmeSSO })
    vi.spyOn(toast, 'success').mockImplementation(() => '')
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme SSO' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove globex.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove?' }))
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'globex.com' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(setSSOConnection).toHaveBeenCalledOnce())
    expect(setSSOConnection.mock.calls[0][0].domainIds).toEqual(['d-verified'])
  })

  it('asks for a domain again when the ticked one is removed while the form is open', async () => {
    listDomains.mockResolvedValueOnce(listing([verified])).mockResolvedValue(listing([]))
    removeDomain.mockResolvedValue({})
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove acme.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove?' }))
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'acme.com' })).toBeNull())
    fill('Button label', 'Acme SSO')
    fill('Issuer URL', 'https://acme.okta.com')
    fill('Client ID', 'acme-client')
    fill('Client secret', 's3cret')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Pick at least one domain')).toBeTruthy()
    expect(setSSOConnection).not.toHaveBeenCalled()
  })

  it('reloads after a failed save, and lets the editor untick a domain taken meanwhile', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(toast, 'error').mockImplementation(() => '')
    listDomains
      .mockResolvedValueOnce(listing([signedInByAcmeSSO, create(OrgDomainSchema, globexInit)]))
      .mockResolvedValue(
        listing([signedInByAcmeSSO, create(OrgDomainSchema, { ...globexInit, ssoConnectionElsewhere: true })]),
      )
    listSSOConnections.mockResolvedValue(connectionListing([acmeSSO]))
    setSSOConnection.mockRejectedValue(
      new ConnectError('another SSO connection signs in globex.com', Code.AlreadyExists),
    )
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme SSO' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'globex.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText("Another organization's connection signs it in.")).toBeTruthy()
    expect(isDisabled(screen.getByRole('checkbox', { name: 'globex.com' }))).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: 'globex.com' }))

    expect(screen.getByRole('checkbox', { name: 'globex.com' }).getAttribute('aria-checked')).toBe('false')
  })

  it('asks for the secret again when the issuer changes', async () => {
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValue(connectionListing([acmeSSO]))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme SSO' }))
    fill('Issuer URL', 'https://acme.okta.com/oauth2/default')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter the client secret again for the new issuer')).toBeTruthy()
    expect(screen.getByText(/A new issuer unlinks the people who signed in through this connection/)).toBeTruthy()
    expect(setSSOConnection).not.toHaveBeenCalled()
  })

  it.each([
    ['http://acme.okta.com', 'Enter an HTTPS URL such as https://acme.okta.com'],
    ['https://acme.okta.com/?tenant=1', 'Enter an HTTPS URL such as https://acme.okta.com'],
  ])('turns the issuer %s away before sending it', async (issuer, message) => {
    listDomains.mockResolvedValue(listing([verified]))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))
    fill('Issuer URL', issuer)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(message)).toBeTruthy()
    expect(setSSOConnection).not.toHaveBeenCalled()
  })

  it('says why the server would not save it, and keeps the form', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    const reason = "we couldn't read the issuer's OpenID configuration; check the issuer URL"
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValue(connectionListing([acmeSSO]))
    setSSOConnection.mockRejectedValue(new ConnectError(reason, Code.FailedPrecondition))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme SSO' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(error).toHaveBeenCalledWith(reason))
    expect(screen.getByLabelText('Issuer URL')).toBeTruthy()
  })

  it("won't offer a domain another org's connection signs in", async () => {
    listDomains.mockResolvedValue(listing([create(OrgDomainSchema, { ...verifiedInit, ssoConnectionElsewhere: true })]))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))

    expect(isDisabled(screen.getByRole('checkbox', { name: 'acme.com' }))).toBe(true)
    expect(screen.getByText("Another organization's connection signs it in.")).toBeTruthy()
  })

  it("won't offer a domain another of this org's connections signs in", async () => {
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValue(connectionListing([acmeSSO]))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Add connection' }))

    expect(isDisabled(screen.getByRole('checkbox', { name: 'acme.com' }))).toBe(true)
    expect(screen.getByText('Acme SSO signs it in.')).toBeTruthy()
  })

  // Only ListDomains sets ssoConnectionElsewhere; UpdateDomain's reply leaves it false.
  it("still won't offer it after a Require SSO change whose reload fails", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(toast, 'error').mockImplementation(() => '')
    const elsewhereInit = { ...verifiedInit, ssoSeen: true, ssoConnectionElsewhere: true }
    listDomains
      .mockResolvedValueOnce(listing([create(OrgDomainSchema, elsewhereInit)]))
      .mockRejectedValue(new Error('down'))
    updateDomain.mockResolvedValue({
      domain: create(OrgDomainSchema, { ...verifiedInit, ssoSeen: true, requireSso: true }),
    })
    mount()

    fireEvent.click(await screen.findByRole('switch', { name: 'Require SSO for acme.com' }))
    await waitFor(() => expect(updateDomain).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Require SSO for acme.com' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }))

    expect(isDisabled(screen.getByRole('checkbox', { name: 'acme.com' }))).toBe(true)
  })

  it('asks before removing one', async () => {
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValueOnce(connectionListing([acmeSSO])).mockResolvedValue(connectionListing([]))
    deleteSSOConnection.mockResolvedValue({})
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Acme SSO' }))
    expect(deleteSSOConnection).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove?' }))

    await waitFor(() => expect(deleteSSOConnection).toHaveBeenCalledWith({ orgId: 'org-a', connectionId: acmeSSO.id }))
    await waitFor(() => expect(screen.queryByText('Acme SSO')).toBeNull())
    expect(screen.getByRole('button', { name: 'Add connection' })).toBeTruthy()
  })

  it('needs a verified domain first', async () => {
    listDomains.mockResolvedValue(listing([pending]))
    mount()

    expect(((await screen.findByRole('button', { name: 'Add connection' })) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Verify a domain first.')).toBeTruthy()
  })

  it('says when connections are off on this server, and keeps the domains', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listDomains.mockResolvedValue(listing([verified]))
    listSSOConnections.mockRejectedValue(
      new ConnectError('SSO connections are not enabled on this server', Code.FailedPrecondition),
    )
    mount()

    expect(
      await screen.findByText(
        "SSO connections aren't turned on for this server. Ask its operator to set PUG_SSO_SECRET_KEY.",
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add connection' })).toBeNull()
    expect(screen.getByText('acme.com')).toBeTruthy()
  })

  it("doesn't toast connections being off on every reload", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    listDomains.mockResolvedValue(listing([verified]))
    listSSOConnections.mockRejectedValue(
      new ConnectError('SSO connections are not enabled on this server', Code.FailedPrecondition),
    )
    addDomain.mockResolvedValue({ domain: pending })
    mount()

    await typeDomain('acme.io')
    await waitFor(() => expect(listSSOConnections).toHaveBeenCalledTimes(2))
    await act(() => new Promise(resolve => setTimeout(resolve, 0)))

    expect(error).not.toHaveBeenCalled()
  })

  it('keeps the connections and says so when their reload fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    listDomains.mockResolvedValue(listing([signedInByAcmeSSO]))
    listSSOConnections.mockResolvedValueOnce(connectionListing([acmeSSO])).mockRejectedValue(new Error('down'))
    addDomain.mockResolvedValue({ domain: pending })
    mount()

    await typeDomain('acme.io')

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to refresh SSO connections'))
    expect(screen.getByText('Acme SSO')).toBeTruthy()
  })
})
