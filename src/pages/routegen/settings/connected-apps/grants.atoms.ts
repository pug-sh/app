import { Code, ConnectError } from '@connectrpc/connect'
import { atom } from 'jotai'
import type { Grant } from '@/api/genproto/dashboard/mcpgrants/v1/mcpgrants_pb'
import { mcpGrantsRPCAtom } from '@/api/rpc'
import { customerIdAtom } from '@/auth/jwt.atoms'
import { errorReason } from '@/lib/rpc-error'

// enabled is null when the list couldn't be loaded. A server without the service has OAuth off.
type GrantsResult = { customerId: string; enabled: boolean | null; grants: Grant[] }

const resultAtom = atom<GrantsResult | null>(null)
const inFlightAtom = atom<{ customerId: string; promise: Promise<void> } | null>(null)
// Bumped by every load and revoke, so a list asked for earlier can't land over a later one.
const generationAtom = atom(0)

// Paired with its customer, so another account signing in never sees the last one's connections.
export const grantsAtom = atom(get => {
  const result = get(resultAtom)
  return result && result.customerId === get(customerIdAtom) ? result : null
})

// The settings layout and the page both load on mount, and share one request.
export const loadGrantsAtom = atom(null, (get, set) => {
  const customerId = get(customerIdAtom)
  if (!customerId) return Promise.resolve()
  const inFlight = get(inFlightAtom)
  if (inFlight?.customerId === customerId) return inFlight.promise

  const generation = get(generationAtom) + 1
  set(generationAtom, generation)
  const promise = get(mcpGrantsRPCAtom)
    .listGrants({})
    .then(
      resp => ({ customerId, enabled: resp.oauthEnabled, grants: resp.grants }),
      (err): GrantsResult => {
        if (err instanceof ConnectError && err.code === Code.Unimplemented) {
          return { customerId, enabled: false, grants: [] }
        }
        console.error('ListGrants failed', err)
        return { customerId, enabled: null, grants: [] }
      },
    )
    .then(result => {
      if (get(generationAtom) === generation) set(resultAtom, result)
    })
    .finally(() => {
      if (get(inFlightAtom)?.promise === promise) set(inFlightAtom, null)
    })
  set(inFlightAtom, { customerId, promise })
  return promise
})

// Throws what the server refused with, except a grant that is already gone.
export const revokeGrantAtom = atom(null, async (get, set, grantId: string) => {
  try {
    await get(mcpGrantsRPCAtom).revokeGrant({ grantId })
  } catch (err) {
    if (errorReason(err) !== 'MCP_GRANT_NOT_FOUND') throw err
  }
  set(generationAtom, n => n + 1)
  set(resultAtom, result => result && { ...result, grants: result.grants.filter(grant => grant.id !== grantId) })
})
