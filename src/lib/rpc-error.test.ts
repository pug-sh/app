import { BinaryWriter, WireType } from '@bufbuild/protobuf/wire'
import { Code, ConnectError } from '@connectrpc/connect'
import { describe, expect, it, vi } from 'vitest'
import { errorReason, rpcErrorMessage } from './rpc-error'

describe('rpcErrorMessage', () => {
  it("shows the server's reason", () => {
    const err = new ConnectError('an org can add at most 10 domains', Code.FailedPrecondition)

    expect(rpcErrorMessage(err, 'Failed to add domain')).toBe('an org can add at most 10 domains')
  })

  it.each([
    ['a dropped connection', new ConnectError('Failed to fetch', Code.Unknown)],
    ['a server fault', new ConnectError('internal error', Code.Internal)],
  ])("uses the caller's words for %s", (_, err) => {
    expect(rpcErrorMessage(err, 'Failed to add domain')).toBe('Failed to add domain')
  })
})

const refused = (type: string, value: Uint8Array) => {
  const err = new ConnectError('refused', Code.InvalidArgument)
  err.details.push({ type, value })
  return err
}

describe('errorReason', () => {
  it('reads the reason wherever it sits in the ErrorInfo', () => {
    const value = new BinaryWriter()
      .tag(2, WireType.LengthDelimited)
      .string('pug.sh')
      .tag(3, WireType.LengthDelimited)
      .fork()
      .tag(1, WireType.LengthDelimited)
      .string('resource')
      .tag(2, WireType.LengthDelimited)
      .string('project')
      .join()
      .tag(1, WireType.LengthDelimited)
      .string('MCP_CLIENT_INVALID')
      .finish()

    expect(errorReason(refused('google.rpc.ErrorInfo', value))).toBe('MCP_CLIENT_INVALID')
  })

  it('reads only an ErrorInfo, and only off a ConnectError', () => {
    const value = new BinaryWriter().tag(1, WireType.LengthDelimited).string('invalid_request').finish()

    expect(errorReason(refused('dashboard.mcpgrants.v1.AuthorizationError', value))).toBeUndefined()
    expect(errorReason(new Error('MCP_CLIENT_INVALID'))).toBeUndefined()
  })

  it('reads nothing from an ErrorInfo it cannot decode', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const truncated = new Uint8Array([0x0a, 0x10, 0x41])

    expect(errorReason(refused('google.rpc.ErrorInfo', truncated))).toBeUndefined()
  })
})
