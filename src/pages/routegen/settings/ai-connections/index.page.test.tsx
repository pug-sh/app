import { create } from '@bufbuild/protobuf'
import { BinaryWriter, WireType } from '@bufbuild/protobuf/wire'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GrantSchema, ListGrantsResponseSchema } from '@/api/genproto/dashboard/mcpgrants/v1/mcpgrants_pb'
import { jwtFor } from '@/test/jwt'

const { listGrants, revokeGrant } = vi.hoisted(() => ({ listGrants: vi.fn(), revokeGrant: vi.fn() }))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { mcpGrantsRPCAtom: atom({ listGrants, revokeGrant }) }
})

const { jwtAtom } = await import('@/auth/jwt.atoms')
const { loadGrantsAtom } = await import('./grants.atoms')
const AiConnections = (await import('./index.page')).default

const grantInit = {
  id: 'd3uqa6s1m7j9b2c4e5g1',
  clientHost: 'claude.ai',
  clientName: 'Claude',
  orgs: [
    { id: 'o1', displayName: 'Acme' },
    { id: 'o2', displayName: 'Globex' },
  ],
  createTime: timestampFromDate(new Date(Date.now() - 3 * 86_400_000)),
  lastUsedTime: timestampFromDate(new Date(Date.now() - 2 * 3_600_000)),
}
const claude = create(GrantSchema, grantInit)
const chatgpt = create(GrantSchema, {
  ...grantInit,
  id: 'd3uqa6s1m7j9b2c4e5g2',
  clientHost: 'chatgpt.com',
  clientName: 'ChatGPT',
})

const listed = (grants = [claude, chatgpt]) => create(ListGrantsResponseSchema, { oauthEnabled: true, grants })

const refusal = (code: Code, reason: string) => {
  const err = new ConnectError(reason, code)
  const errorInfo = new BinaryWriter().tag(1, WireType.LengthDelimited).string(reason).finish()
  err.details.push({ type: 'google.rpc.ErrorInfo', value: errorInfo })
  return err
}

const mount = (Page = AiConnections, jwt = jwtAtom) => {
  const store = createStore()
  store.set(jwt, jwtFor('cust-1'))
  render(
    <Provider store={store}>
      <Page />
    </Provider>,
  )
  return store
}

const disconnect = async (host: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `Disconnect ${host}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect?' }))
}

beforeEach(() => {
  listGrants.mockResolvedValue(listed())
  revokeGrant.mockResolvedValue({})
})

afterEach(() => vi.unstubAllEnvs())

describe('AI connections', () => {
  // Anyone can write any name into their app's details, so the host leads.
  it('lists each connection by its host, with its own name and the orgs it reads', async () => {
    mount()

    const row = (await screen.findByText('claude.ai')).closest('tr')
    expect(row?.textContent).toContain('Claude')
    expect(row?.textContent).toContain('Acme, Globex')
    expect(row?.textContent).toContain('3d ago')
    expect(row?.textContent).toContain('2h ago')
    expect(screen.getByText('chatgpt.com')).toBeTruthy()
  })

  it('disconnects one after a confirming click', async () => {
    mount()

    await disconnect('claude.ai')

    await waitFor(() => expect(screen.queryByText('claude.ai')).toBeNull())
    expect(revokeGrant).toHaveBeenCalledWith({ grantId: claude.id })
    expect(screen.getByText('chatgpt.com')).toBeTruthy()
  })

  it('drops a connection that is already gone without an error', async () => {
    const shown = vi.spyOn(toast, 'error')
    revokeGrant.mockRejectedValue(refusal(Code.NotFound, 'MCP_GRANT_NOT_FOUND'))
    mount()

    await disconnect('claude.ai')

    await waitFor(() => expect(screen.queryByText('claude.ai')).toBeNull())
    expect(shown).not.toHaveBeenCalled()
  })

  it('keeps a connection the server refused to disconnect, and says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const shown = vi.spyOn(toast, 'error')
    revokeGrant.mockRejectedValue(new ConnectError('down', Code.Unavailable))
    mount()

    await disconnect('claude.ai')

    await waitFor(() => expect(shown).toHaveBeenCalled())
    expect(screen.getByText('claude.ai')).toBeTruthy()
  })

  // A list asked for before the disconnect would bring it back.
  it('keeps a disconnected app gone when an earlier list lands after', async () => {
    let land = (_: unknown) => {}
    const store = mount()
    await screen.findByText('claude.ai')
    listGrants.mockReturnValueOnce(new Promise(resolve => (land = resolve)))
    const reload = store.set(loadGrantsAtom)
    expect(listGrants).toHaveBeenCalledTimes(2)

    await disconnect('claude.ai')
    await waitFor(() => expect(screen.queryByText('claude.ai')).toBeNull())
    await act(async () => {
      land(listed())
      await reload
    })

    expect(screen.queryByText('claude.ai')).toBeNull()
  })

  it("never shows the last account's connections to the next while its own load", async () => {
    const store = mount()
    await screen.findByText('claude.ai')
    cleanup()

    listGrants.mockReturnValueOnce(new Promise(() => {}))
    store.set(jwtAtom, jwtFor('cust-2'))
    render(
      <Provider store={store}>
        <AiConnections />
      </Provider>,
    )

    expect(screen.queryByText('claude.ai')).toBeNull()
    expect(listGrants).toHaveBeenCalledTimes(2)
  })

  it('offers the MCP server URL on the API origin to connect another app', async () => {
    mount()

    expect(await screen.findByText('http://vitest.invalid/mcp')).toBeTruthy()
    expect(screen.queryByRole('link', { name: "Pug in Claude's directory" })).toBeNull()
  })

  it("links Claude's directory on Pug Cloud", async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.pug.sh')
    vi.resetModules()
    const { jwtAtom: cloudJwtAtom } = await import('@/auth/jwt.atoms')
    const CloudAiConnections = (await import('./index.page')).default
    mount(CloudAiConnections, cloudJwtAtom)

    const link = await screen.findByRole('link', { name: "Pug in Claude's directory" })
    expect(link.getAttribute('href')).toBe('https://claude.ai/directory/pug')
    expect(screen.getByText(/^Connect Claude from its directory/)).toBeTruthy()
    expect(screen.getByText('https://api.pug.sh/mcp')).toBeTruthy()
  })

  it("says so where the server doesn't let apps connect", async () => {
    listGrants.mockResolvedValue(create(ListGrantsResponseSchema, { oauthEnabled: false }))
    mount()

    expect(await screen.findByText("This Pug server doesn't let apps connect.")).toBeTruthy()
    expect(screen.queryByText('http://vitest.invalid/mcp')).toBeNull()
  })

  it('retries a list that could not be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listGrants.mockRejectedValueOnce(new ConnectError('down', Code.Unavailable))
    mount()

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('claude.ai')).toBeTruthy()
  })
})
