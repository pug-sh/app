import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetBillingStatusResponseSchema } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { OrgSchema } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { GetUsageResponseSchema } from '@/api/genproto/dashboard/usage/v1/usage_pb'

// The RPC atoms are faked, not the transport: a hand-held call is the only way to decide when a
// response resolves.
const { getBillingStatus, getUsage } = vi.hoisted(() => ({
  getBillingStatus: vi.fn(),
  getUsage: vi.fn(),
}))

vi.mock('@/api/rpc', async () => {
  const { atom } = await import('jotai')
  return { billingRPCAtom: atom({ getBillingStatus }), usageRPCAtom: atom({ getUsage }) }
})

const { activeOrgAtom } = await import('@/data/workspace.atoms')
const { billingAtom, loadBillingAtom, pollBillingAfterCheckoutAtom, resetBillingAtom } = await import('./billing.atoms')

const orgA = create(OrgSchema, { id: 'org-a', displayName: 'A' })
const orgB = create(OrgSchema, { id: 'org-b', displayName: 'B' })

const status = (slug: string) =>
  create(GetBillingStatusResponseSchema, { billingEnabled: true, plan: { slug, displayName: slug } })

const usage = (usedEvents: number, counted: boolean) =>
  create(GetUsageResponseSchema, { usedEvents: BigInt(usedEvents), counted })

const newStore = (org = orgA) => {
  const store = createStore()
  store.set(activeOrgAtom, org)
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
  getBillingStatus.mockResolvedValue(status('growth'))
  getUsage.mockResolvedValue(usage(1_000, true))
})

describe('loadBillingAtom', () => {
  it('reports the plan and the counted total together', async () => {
    const store = newStore()
    await store.set(loadBillingAtom)

    const result = store.get(billingAtom)
    expect(result.loaded).toBe(true)
    expect(result.status?.plan?.slug).toBe('growth')
    expect(result.usedEvents).toBe(1_000)
  })

  // Unread, a just-rolled-over period reads as a real zero and renders "0 of 500,000" for an org
  // nobody has summed yet.
  it('has no total when the meter has not counted this period', async () => {
    getUsage.mockResolvedValue(usage(0, false))
    const store = newStore()
    await store.set(loadBillingAtom)

    expect(store.get(billingAtom).usedEvents).toBeNull()
  })

  // The meter is the optional half — a usage failure must leave the plan and quota on screen.
  it('keeps the plan when the meter call fails', async () => {
    getUsage.mockRejectedValue(new Error('boom'))
    const store = newStore()
    await store.set(loadBillingAtom)

    const result = store.get(billingAtom)
    expect(result.status?.plan?.slug).toBe('growth')
    expect(result.usedEvents).toBeNull()
    expect(result.error).toBeNull()
  })

  // Meter, banner and settings tab can all mount in one commit.
  it('dedupes concurrent callers into one request', async () => {
    const store = newStore()
    await Promise.all([store.set(loadBillingAtom), store.set(loadBillingAtom), store.set(loadBillingAtom)])

    expect(getBillingStatus).toHaveBeenCalledTimes(1)
  })

  it('serves a fresh answer from cache and refetches when forced', async () => {
    const store = newStore()
    await store.set(loadBillingAtom)
    await store.set(loadBillingAtom)
    expect(getBillingStatus).toHaveBeenCalledTimes(1)

    await store.set(loadBillingAtom, { force: true })
    expect(getBillingStatus).toHaveBeenCalledTimes(2)
  })

  // A cached failure is not an answer, so the next caller still retries.
  it('retries after a failure without being forced', async () => {
    getBillingStatus.mockRejectedValueOnce(new Error('boom'))
    const store = newStore()
    await store.set(loadBillingAtom)
    expect(store.get(billingAtom).error).toBe('Failed to load billing')

    getBillingStatus.mockResolvedValue(status('scale'))
    await store.set(loadBillingAtom)
    expect(store.get(billingAtom).status?.plan?.slug).toBe('scale')
  })

  // Not even for the render between the switch and the new answer.
  it('reports nothing for an org it has not answered for', async () => {
    const store = newStore()
    await store.set(loadBillingAtom)
    expect(store.get(billingAtom).status?.plan?.slug).toBe('growth')

    store.set(activeOrgAtom, orgB)
    const result = store.get(billingAtom)
    expect(result.loaded).toBe(false)
    expect(result.status).toBeNull()
  })

  // Switching away and BACK is what the org check alone cannot catch: A is active again when A's
  // first answer lands, so only the request id stops it painting over the newer one.
  it('does not let a superseded request paint over a newer one', async () => {
    const store = newStore()
    let settleA!: (v: unknown) => void
    getBillingStatus.mockImplementationOnce(() => new Promise(res => (settleA = res)))

    const first = store.set(loadBillingAtom)

    store.set(activeOrgAtom, orgB)
    getBillingStatus.mockResolvedValue(status('scale'))
    await store.set(loadBillingAtom)

    store.set(activeOrgAtom, orgA)
    getBillingStatus.mockResolvedValue(status('enterprise'))
    await store.set(loadBillingAtom)

    settleA(status('growth'))
    await first

    expect(store.get(billingAtom).status?.plan?.slug).toBe('enterprise')
  })

  // A forced reload waits out the request in the air, and the org can move while it waits — the
  // second request would then take over the new org's slot and have its answer discarded.
  it('follows the org that is current by the time a queued reload runs', async () => {
    const store = newStore()
    let settle!: (v: unknown) => void
    getBillingStatus.mockImplementationOnce(() => new Promise(res => (settle = res)))

    const first = store.set(loadBillingAtom)
    const forced = store.set(loadBillingAtom, { force: true })

    store.set(activeOrgAtom, orgB)
    getBillingStatus.mockResolvedValue(status('enterprise'))
    settle(status('growth'))
    await first
    await forced

    expect(store.get(billingAtom).status?.plan?.slug).toBe('enterprise')
  })

  it('sequences a forced reload behind the request already in the air', async () => {
    const store = newStore()
    let settle!: (v: unknown) => void
    getBillingStatus.mockImplementationOnce(() => new Promise(res => (settle = res)))

    const first = store.set(loadBillingAtom)
    const forced = store.set(loadBillingAtom, { force: true })
    settle(status('growth'))
    await first
    await forced

    expect(getBillingStatus).toHaveBeenCalledTimes(2)
  })

  // The usage page already refuses it; gating here gives every surface the same answer.
  it('refuses a negative total the way the usage page does', async () => {
    getUsage.mockResolvedValue(usage(-5_000, true))
    const store = newStore()
    await store.set(loadBillingAtom)

    expect(store.get(billingAtom).usedEvents).toBeNull()
  })

  // A meter we never reached has made no claim, so saying "not measured yet" for it is a lie.
  it('separates a meter that failed from one that has not counted', async () => {
    getUsage.mockRejectedValue(new Error('boom'))
    const store = newStore()
    await store.set(loadBillingAtom)

    const result = store.get(billingAtom)
    expect(result.usedEvents).toBeNull()
    expect(result.meterError).toBe(true)
    // The other half of the call, which must survive the meter failing.
    expect(result.status?.plan?.slug).toBe('growth')
    expect(result.error).toBeNull()
  })

  it('does not call a not-yet-counted period a meter failure', async () => {
    getUsage.mockResolvedValue(usage(0, false))
    const store = newStore()
    await store.set(loadBillingAtom)

    expect(store.get(billingAtom).meterError).toBe(false)
  })

  // The past-due banner is the only notice that a card was declined.
  it('keeps the last known plan when a refresh fails', async () => {
    const store = newStore()
    await store.set(loadBillingAtom)

    getBillingStatus.mockRejectedValue(new Error('boom'))
    await store.set(loadBillingAtom, { force: true })

    const result = store.get(billingAtom)
    expect(result.error).toBeTruthy()
    expect(result.status?.plan?.slug).toBe('growth')
  })

  // No billing service here, so a retry can only fail the same way.
  it('marks a deployment with no billing service unsupported, and stops asking', async () => {
    getBillingStatus.mockRejectedValue(new ConnectError('nope', Code.Unimplemented))
    const store = newStore()
    await store.set(loadBillingAtom)

    expect(store.get(billingAtom).unsupported).toBe(true)
    expect(getBillingStatus).toHaveBeenCalledTimes(1)

    await store.set(loadBillingAtom)
    expect(getBillingStatus).toHaveBeenCalledTimes(1)
  })

  // The contrast: an ordinary failure is not an answer, so the next caller retries.
  it('retries after an ordinary failure', async () => {
    getBillingStatus.mockRejectedValue(new ConnectError('down', Code.Unavailable))
    const store = newStore()
    await store.set(loadBillingAtom)

    expect(store.get(billingAtom).unsupported).toBe(false)
    await store.set(loadBillingAtom)
    expect(getBillingStatus).toHaveBeenCalledTimes(2)
  })

  it('asks for nothing without an org', async () => {
    const store = createStore()
    await store.set(loadBillingAtom)
    expect(getBillingStatus).not.toHaveBeenCalled()
  })
})

describe('pollBillingAfterCheckoutAtom', () => {
  // The baseline is the paying org's plan; reading another org's as the purchase landing tells
  // someone their payment settled when nothing has.
  it('does not read another org as the checkout landing', async () => {
    const store = newStore()
    store.set(activeOrgAtom, orgB)
    getBillingStatus.mockResolvedValue(status('enterprise'))

    const landed = await store.set(pollBillingAfterCheckoutAtom, { orgId: 'org-a', before: 'growth' })

    expect(landed).toBe(false)
  })
})

describe('resetBillingAtom', () => {
  // The next account landing on the same shared org is when stale numbers would be worst.
  it('drops the stored answer', async () => {
    const store = newStore()
    await store.set(loadBillingAtom)
    expect(store.get(billingAtom).loaded).toBe(true)

    store.set(resetBillingAtom)
    expect(store.get(billingAtom).loaded).toBe(false)
  })
})
