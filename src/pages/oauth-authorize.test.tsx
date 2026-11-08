import { create, toBinary } from '@bufbuild/protobuf'
import { BinaryWriter, WireType } from '@bufbuild/protobuf/wire'
import { Code, ConnectError } from '@connectrpc/connect'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import {
  AuthorizationErrorSchema,
  DescribeAuthorizationResponseSchema,
} from '@/api/genproto/dashboard/mcpgrants/v1/mcpgrants_pb'
import { jwtFor } from '@/test/jwt'

const rpc = vi.hoisted(() => ({
  describeAuthorization: vi.fn(),
  approveAuthorization: vi.fn(),
  getMe: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return {
    mcpGrantsRPCAtom: atom({
      describeAuthorization: rpc.describeAuthorization,
      approveAuthorization: rpc.approveAuthorization,
    }),
    customersRPCAtom: atom({ getMe: rpc.getMe }),
    authRPCAtom: atom({ signOut: rpc.signOut }),
  }
})

vi.mock('@/analytics/pug', () => ({ trackEvent: vi.fn() }))

const OAuthAuthorize = (await import('./oauth-authorize')).default
const { jwtAtom, refreshTokenAtom } = await import('@/auth/jwt.atoms')

const clientId = 'https://claude.ai/oauth/mcp-oauth-client-metadata'
const redirectUri = 'https://claude.ai/api/mcp/auth_callback'
const challenge = 'c'.repeat(43)
const query = new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri,
  state: 'st4te',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  resource: 'https://api.pugs.dev/mcp',
  scope: 'read',
}).toString()

const production = {
  id: 'd3uqa6s1m7j9b2c4e5p1',
  displayName: 'Production',
  orgId: 'd3uqa6s1m7j9b2c4e5o1',
  orgDisplayName: 'Acme',
}
const staging = { ...production, id: 'd3uqa6s1m7j9b2c4e5p2', displayName: 'Staging' }
const side = {
  id: 'd3uqa6s1m7j9b2c4e5p3',
  displayName: 'Side project',
  orgId: 'd3uqa6s1m7j9b2c4e5o2',
  orgDisplayName: 'Personal',
}

const cancelUri = `${redirectUri}?error=access_denied&iss=https%3A%2F%2Fapi.pugs.dev&state=st4te`
const codeUri = `${redirectUri}?code=the-code&iss=https%3A%2F%2Fapi.pugs.dev&state=st4te`

const consent = (init: Record<string, unknown> = {}) =>
  create(DescribeAuthorizationResponseSchema, {
    clientHost: 'claude.ai',
    clientName: 'Claude',
    redirectHost: 'claude.ai',
    projects: [production, staging, side],
    cancelUri,
    ...init,
  })

// As the server sends it: the reason in a google.rpc.ErrorInfo, beside any typed detail.
const refusal = (code: Code, reason: string, details: ConnectError['details'] = []) => {
  const err = new ConnectError(reason, code)
  const errorInfo = new BinaryWriter()
    .tag(1, WireType.LengthDelimited)
    .string(reason)
    .tag(2, WireType.LengthDelimited)
    .string('pug.sh')
    .finish()
  err.details.push({ type: 'google.rpc.ErrorInfo', value: errorInfo }, ...details)
  return err
}

const mount = (search = query) => {
  const store = createStore()
  store.set(refreshTokenAtom, 'refresh-token')
  store.set(jwtAtom, jwtFor('cust-1'))
  const location = memoryLocation({ path: `/oauth/authorize?${search}`, record: true })
  render(
    <Provider store={store}>
      <Router hook={location.hook}>
        <OAuthAuthorize />
      </Router>
    </Provider>,
  )
  return { store, location }
}

const leaving = () => vi.spyOn(window.location, 'replace').mockImplementation(() => {})

const pick = async (name: string) => {
  fireEvent.click(await screen.findByRole('combobox'))
  // Base UI commits a mouse pick only when the press started on the item.
  const option = await screen.findByRole('option', { name })
  fireEvent.pointerDown(option)
  fireEvent.click(option)
}

beforeEach(() => {
  rpc.describeAuthorization.mockResolvedValue(consent())
  rpc.approveAuthorization.mockResolvedValue({ redirectUri: codeUri })
  rpc.getMe.mockResolvedValue({ customerId: 'cust-1', email: 'dev@acme.com', emailVerified: true })
  rpc.signOut.mockResolvedValue({})
})

describe('the consent page', () => {
  it('asks the server about the request exactly as the client sent it', async () => {
    mount()

    await screen.findByRole('heading', { name: 'claude.ai wants to read your data in Pug' })
    expect(rpc.describeAuthorization).toHaveBeenCalledWith({
      request: {
        clientId,
        redirectUri,
        responseType: 'code',
        state: 'st4te',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        resource: 'https://api.pugs.dev/mcp',
      },
    })
  })

  // Anyone can write any name into their own details, but only the app can serve a document on its host.
  it('names the app by its host, its own name in small print, and where it goes back to', async () => {
    rpc.describeAuthorization.mockResolvedValue(consent({ clientName: 'Totally Claude' }))
    mount()

    await screen.findByRole('heading', { name: 'claude.ai wants to read your data in Pug' })
    expect(screen.getByText('It calls itself “Totally Claude”.')).toBeTruthy()
    expect(screen.getByText('After this you go back to claude.ai.')).toBeTruthy()
    expect(await screen.findByText('dev@acme.com')).toBeTruthy()
  })

  it('makes the person pick a project, then sends the browser back with the code', async () => {
    const replace = leaving()
    mount()

    const allow = await screen.findByRole('button', { name: 'Allow' })
    expect(allow.hasAttribute('disabled')).toBe(true)
    await pick('Staging')
    fireEvent.click(allow)

    await waitFor(() => expect(replace).toHaveBeenCalledWith(codeUri))
    expect(rpc.approveAuthorization).toHaveBeenCalledWith({
      request: expect.objectContaining({ clientId, redirectUri, state: 'st4te' }),
      projectId: staging.id,
    })
  })

  it('preselects the only project', async () => {
    const replace = leaving()
    rpc.describeAuthorization.mockResolvedValue(consent({ projects: [side] }))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith(codeUri))
    expect(rpc.approveAuthorization).toHaveBeenCalledWith(expect.objectContaining({ projectId: side.id }))
  })

  it('sends the browser back with access_denied on Cancel', async () => {
    const replace = leaving()
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(replace).toHaveBeenCalledWith(cancelUri)
    expect(rpc.approveAuthorization).not.toHaveBeenCalled()
  })

  // Any program on the computer can claim a loopback port.
  it('warns before an app on this computer is allowed', async () => {
    rpc.describeAuthorization.mockResolvedValue(consent({ redirectHost: 'localhost:53682', loopbackRedirect: true }))
    mount()

    expect(await screen.findByText(/This app runs on your computer\./)).toBeTruthy()
    expect(screen.getByText('After this you go back to localhost:53682.')).toBeTruthy()
  })

  it.each([
    ['https', codeUri, true],
    ['http to localhost', 'http://localhost:53682/callback?code=c', true],
    ['http to 127.0.0.1', 'http://127.0.0.1:53682/callback?code=c', true],
    ['http to [::1]', 'http://[::1]:53682/callback?code=c', true],
    ['http to another host', 'http://claude.ai/api/mcp/auth_callback?code=c', false],
    ['http to a host that only starts with localhost', 'http://localhost.example.com/callback?code=c', false],
    ['javascript', 'javascript:alert(1)', false],
  ])('follows a redirect over %s only if it is safe', async (_kind, url, followed) => {
    const replace = leaving()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.describeAuthorization.mockResolvedValue(consent({ projects: [side] }))
    rpc.approveAuthorization.mockResolvedValue({ redirectUri: url })
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))

    if (followed) {
      await waitFor(() => expect(replace).toHaveBeenCalledWith(new URL(url).href))
    } else {
      await screen.findByRole('heading', { name: "Can't return to the app" })
      expect(replace).not.toHaveBeenCalled()
    }
  })

  it('offers the way back the server vouches for, carrying the OAuth error', async () => {
    const replace = leaving()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const back = `${redirectUri}?error=invalid_target&iss=https%3A%2F%2Fapi.pugs.dev&state=st4te`
    rpc.describeAuthorization.mockRejectedValue(
      refusal(Code.InvalidArgument, 'MCP_AUTHORIZATION_INVALID', [
        {
          type: AuthorizationErrorSchema.typeName,
          value: toBinary(
            AuthorizationErrorSchema,
            create(AuthorizationErrorSchema, { error: 'invalid_target', redirectUri: back }),
          ),
        },
      ]),
    )
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Back to claude.ai' }))

    expect(replace).toHaveBeenCalledWith(back)
  })

  // The redirect itself is what can't be trusted, so there is no way back to offer.
  it.each([
    ['MCP_CLIENT_INVALID', Code.InvalidArgument, "Can't connect this app"],
    ['MCP_REDIRECT_NOT_LISTED', Code.InvalidArgument, "Can't connect this app"],
    ['MCP_OAUTH_DISABLED', Code.FailedPrecondition, 'App connections are off'],
  ])('offers no way back for %s', async (reason, code, title) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.describeAuthorization.mockRejectedValue(refusal(code, reason))
    mount()

    await screen.findByRole('heading', { name: title })
    expect(screen.queryByRole('button', { name: /Back to/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it("tries again when the app's details couldn't be loaded", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.describeAuthorization.mockRejectedValueOnce(refusal(Code.FailedPrecondition, 'MCP_CLIENT_UNAVAILABLE'))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    await screen.findByRole('heading', { name: 'claude.ai wants to read your data in Pug' })
    expect(rpc.describeAuthorization).toHaveBeenCalledTimes(2)
  })

  it('asks for another project when the one picked is no longer readable', async () => {
    const replace = leaving()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.approveAuthorization.mockRejectedValue(refusal(Code.NotFound, 'PROJECT_NOT_FOUND'))
    mount()

    await pick('Staging')
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))

    expect(await screen.findByText("You can't read that project anymore. Pick another one.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Allow' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('combobox'))
    await screen.findByRole('option', { name: 'Production' })
    expect(screen.queryByRole('option', { name: 'Staging' })).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it("tells the demo account it can't connect apps", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.describeAuthorization.mockResolvedValue(consent({ projects: [side] }))
    rpc.approveAuthorization.mockRejectedValue(refusal(Code.PermissionDenied, 'ORG_ROLE_FORBIDDEN'))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))

    expect(await screen.findByText("This account is read-only, so it can't connect apps.")).toBeTruthy()
  })

  it('switches account by signing out where it stands, keeping the request', async () => {
    const { store, location } = mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Switch account' }))

    await waitFor(() => expect(store.get(refreshTokenAtom)).toBe(''))
    expect(rpc.signOut).toHaveBeenCalledWith({ refreshToken: 'refresh-token' })
    expect(location.history).toEqual([`/oauth/authorize?${query}`])
  })

  it('keeps the person, their orgs and projects out of click autocapture', async () => {
    mount()

    const heading = await screen.findByRole('heading', { name: 'claude.ai wants to read your data in Pug' })
    expect(heading.closest('[data-pug-no-capture]')).not.toBeNull()
  })

  it('refuses to run inside a frame', async () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    mount()

    expect(await screen.findByRole('heading', { name: 'Open this in its own tab' })).toBeTruthy()
    expect(rpc.describeAuthorization).not.toHaveBeenCalled()
  })
})
