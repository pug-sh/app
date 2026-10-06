import { Code, ConnectError } from '@connectrpc/connect'
import { describe, expect, it } from 'vitest'
import { rpcErrorMessage } from './rpc-error'

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
