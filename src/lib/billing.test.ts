import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { describe, expect, it, vi } from 'vitest'
import {
  BillingStatus,
  GetBillingStatusResponseSchema,
  SubscriptionStatus,
  TierUsageSchema,
} from '@/api/genproto/dashboard/billing/v1/billing_pb'
import {
  allowanceApplies,
  formatEvents,
  graceDeadline,
  hasLiveSubscription,
  retentionLabel,
  statusLabel,
  subStatusLabel,
  tierRows,
  USAGE_WARN_RATIO,
  usageBannerKey,
  usageFor,
} from './billing'

describe('usageFor', () => {
  // Either half missing means no meter to draw; substituting a zero for the other is the one thing
  // this must never do.
  it('has nothing to draw when the quota is absent', () => {
    expect(usageFor(undefined, 1_000)).toBeNull()
  })

  it('has nothing to draw when the period has not been metered', () => {
    expect(usageFor(500_000n, null)).toBeNull()
  })

  it('reports a real zero once the meter has counted', () => {
    expect(usageFor(500_000n, 0)).toEqual({ used: 0, included: 500_000, percent: 0, tone: 'normal' })
  })

  it('floors the percentage so 99.6% does not read as 100%', () => {
    const usage = usageFor(1_000n, 996)
    expect(usage?.percent).toBe(99)
    expect(usage?.tone).toBe('caution')
  })

  it('turns caution at the warn ratio and over at the limit', () => {
    expect(usageFor(1_000n, Math.ceil(1_000 * USAGE_WARN_RATIO) - 1)?.tone).toBe('normal')
    expect(usageFor(1_000n, 1_000 * USAGE_WARN_RATIO)?.tone).toBe('caution')
    expect(usageFor(1_000n, 1_000)?.tone).toBe('over')
    expect(usageFor(1_000n, 5_000)?.tone).toBe('over')
  })

  it('caps the bar at 100% while still reporting over', () => {
    expect(usageFor(1_000n, 5_000)?.percent).toBe(100)
  })

  // The server says "no quota" by absence, but a 0 would divide into a bar of width "NaN%".
  it('does not divide by a zero quota', () => {
    expect(usageFor(0n, 10)).toEqual({ used: 10, included: 0, percent: 100, tone: 'over' })
    expect(usageFor(0n, 0)).toEqual({ used: 0, included: 0, percent: 0, tone: 'normal' })
  })
})

describe('allowanceApplies', () => {
  const withStatus = (status: BillingStatus) => create(GetBillingStatusResponseSchema, { status })

  // Past the allowance, an org with no subscription sees a banner and nothing else.
  it('applies to an org with no subscription', () => {
    expect(allowanceApplies(withStatus(BillingStatus.FREE))).toBe(true)
  })

  // A subscriber's events past it are billed by tier, over the provider's period rather than the
  // usage period the meter counts, so "over" would tell every paying customer they are over.
  it('leaves a subscriber to the tiers', () => {
    expect(allowanceApplies(withStatus(BillingStatus.ACTIVE))).toBe(false)
  })

  // Proto enums are open: a state this build cannot place warns nobody rather than everybody.
  it('applies to nothing it cannot place', () => {
    expect(allowanceApplies(withStatus(BillingStatus.UNSPECIFIED))).toBe(false)
    expect(allowanceApplies(withStatus(99 as BillingStatus))).toBe(false)
    expect(allowanceApplies(null)).toBe(false)
  })
})

describe('tierRows', () => {
  const tier = (fromEvents: bigint, upToEvents: bigint | undefined, events = 0n) =>
    create(TierUsageSchema, { fromEvents, upToEvents, events })

  // The usage plan as a subscriber holds it: a 100K allowance under the catalog's six tiers.
  const usagePlanTiers = [
    tier(100_000n, 2_000_000n, 1_234_567n),
    tier(2_000_000n, 15_000_000n),
    tier(15_000_000n, 50_000_000n),
    tier(50_000_000n, 100_000_000n),
    tier(100_000_000n, 250_000_000n),
    tier(250_000_000n, undefined),
  ]

  it("labels each tier's range and keeps its count", () => {
    expect(tierRows(usagePlanTiers)).toEqual([
      { tier: 1, range: '100K – 2M', events: 1_234_567n },
      { tier: 2, range: '2M – 15M', events: 0n },
      { tier: 3, range: '15M – 50M', events: 0n },
      { tier: 4, range: '50M – 100M', events: 0n },
      { tier: 5, range: '100M – 250M', events: 0n },
      { tier: 6, range: '250M+', events: 0n },
    ])
  })

  // A deal's 5M allowance swallows the first tier whole. Its row would print "5M – 2M", and
  // renumbering the rest would point each one at the wrong line of the provider's invoice.
  it('drops a tier the allowance covers, keeping the numbering', () => {
    const rows = tierRows([tier(5_000_000n, 2_000_000n), tier(5_000_000n, 15_000_000n, 3_000_000n)])
    expect(rows).toEqual([{ tier: 2, range: '5M – 15M', events: 3_000_000n }])
  })

  // Covered means it holds nothing. A count there contradicts that, and hiding it hides billing.
  it('keeps a covered tier that holds events', () => {
    expect(tierRows([tier(5_000_000n, 2_000_000n, 10n)])).toHaveLength(1)
  })

  // Catalog bounds are round, but a deal's allowance can be any number, and "1.2M" for 1,234,567
  // would misstate where its billing starts.
  it('compacts a bound only where that is exact', () => {
    expect(tierRows([tier(1_234_567n, 2_000_000n)])[0].range).toBe('1,234,567 – 2M')
    expect(tierRows([tier(1_500_000n, 2_000_000n)])[0].range).toBe('1.5M – 2M')
    expect(tierRows([tier(2_500n, 2_000_000n)])[0].range).toBe('2.5K – 2M')
    expect(tierRows([tier(1n, 2_000_000n)])[0].range).toBe('1 – 2M')
  })
})

describe('retentionLabel', () => {
  it('agrees with its own number', () => {
    expect(retentionLabel(90n)).toBe('90 days of event history')
    expect(retentionLabel(1n)).toBe('1 day of event history')
  })

  // Grouped the way the quota beside it is, not the way the browser locale would.
  it('groups in en-US', () => {
    expect(retentionLabel(3_650n)).toBe('3,650 days of event history')
  })
})

describe('labels', () => {
  it('names each entitlement state', () => {
    expect(statusLabel(BillingStatus.TRIALING)).toBe('Trial')
    expect(statusLabel(BillingStatus.ACTIVE)).toBe('Active')
    expect(statusLabel(BillingStatus.FREE)).toBe('Free')
  })

  // Proto enums are open, and the lookup must not return undefined into the markup.
  it('says nothing for a value this build does not know', () => {
    expect(statusLabel(99 as BillingStatus)).toBe('')
    expect(subStatusLabel(99 as SubscriptionStatus)).toBe('')
  })

  // The one subscription state a customer acts on; the rest are invisible or unreachable.
  it('labels only the state that needs acting on', () => {
    expect(subStatusLabel(SubscriptionStatus.PAST_DUE)).toBe('Payment failed')
    expect(subStatusLabel(SubscriptionStatus.ACTIVE)).toBe('')
  })
})

describe('usageBannerKey', () => {
  // An Invalid Date is truthy, so getTime() is NaN and the key freezes at "NaN:over" — a dismissal
  // that never expires.
  it('does not freeze the key when the period end is unreadable', () => {
    const status = create(GetBillingStatusResponseSchema, {
      periodEnd: { seconds: 900_000_000_000_000n, nanos: 0 },
    })
    expect(usageBannerKey(status, 'over')).not.toContain('NaN')
  })

  // What the dismissal expires against, so it has to stay in the key.
  it('keys on the period end when there is one', () => {
    const periodEnd = new Date('2026-10-01T00:00:00Z')
    const status = create(GetBillingStatusResponseSchema, {
      periodEnd: { seconds: BigInt(periodEnd.getTime() / 1000), nanos: 0 },
    })
    expect(usageBannerKey(status, 'over')).toBe(`${periodEnd.getTime()}:over`)
  })

  // A new grace window is a new failure, and a dismissed "update your card by" must not hide it.
  it('brings a failed payment back for a new grace window', () => {
    const failed = (graceEndsAt: string) =>
      create(GetBillingStatusResponseSchema, {
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        periodEnd: timestampFromDate(new Date('2026-10-01T00:00:00Z')),
        gracePeriodEndsAt: timestampFromDate(new Date(graceEndsAt)),
      })
    expect(usageBannerKey(failed('2026-09-10T00:00:00Z'), 'past_due')).not.toBe(
      usageBannerKey(failed('2026-09-24T00:00:00Z'), 'past_due'),
    )
  })
})

describe('graceDeadline', () => {
  const now = new Date('2026-09-01T12:00:00Z')
  const failed = (extra: { subscriptionStatus?: SubscriptionStatus; graceEndsAt?: string } = {}) =>
    create(GetBillingStatusResponseSchema, {
      subscriptionStatus: extra.subscriptionStatus ?? SubscriptionStatus.PAST_DUE,
      gracePeriodEndsAt: extra.graceEndsAt ? timestampFromDate(new Date(extra.graceEndsAt)) : undefined,
    })

  // The provider's "update your card by": when it stops waiting and holds or cancels.
  it("dates a failed card's grace window", () => {
    expect(graceDeadline(failed({ graceEndsAt: '2026-09-08T12:00:00Z' }), now)).toEqual(
      new Date('2026-09-08T12:00:00Z'),
    )
  })

  // The server can serve a passed deadline until it sees whether the provider held or cancelled, and
  // "update your card by" a date already gone asks for the impossible.
  it('has no date once the window has passed', () => {
    expect(graceDeadline(failed({ graceEndsAt: '2026-08-31T12:00:00Z' }), now)).toBeNull()
  })

  // A hold, or a provider with no grace period configured, sends no date at all.
  it('has no date without a window', () => {
    expect(graceDeadline(failed(), now)).toBeNull()
  })

  // The proto sets it only beside PAST_DUE. Anywhere else there is no failed card to date.
  it('has no date without a failed card', () => {
    expect(
      graceDeadline(
        failed({ subscriptionStatus: SubscriptionStatus.ACTIVE, graceEndsAt: '2026-09-08T12:00:00Z' }),
        now,
      ),
    ).toBeNull()
  })
})

describe('hasLiveSubscription', () => {
  const sub = (subscriptionStatus: SubscriptionStatus, manageable = true) =>
    create(GetBillingStatusResponseSchema, { manageable, subscriptionStatus })

  // A running subscription moves plan changes to the portal, where the card and billing date carry
  // over.
  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE])('is live on %s', subscriptionStatus => {
    expect(hasLiveSubscription(sub(subscriptionStatus))).toBe(true)
  })

  // A terminal state has no card to carry over, so sending them to the portal would leave them with
  // no way to buy anything and a message about a subscription they no longer have.
  it.each([
    SubscriptionStatus.UNSPECIFIED,
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.FAILED,
  ])('is not live on %s', subscriptionStatus => {
    expect(hasLiveSubscription(sub(subscriptionStatus))).toBe(false)
  })

  // manageable is the server's own answer to "would a portal session open".
  it('is not live without a customer at the provider', () => {
    expect(hasLiveSubscription(sub(SubscriptionStatus.ACTIVE, false))).toBe(false)
  })
})

describe('the en-US pin', () => {
  // CI runs under an en-US default, where dropping the pin changes nothing and an output assertion
  // cannot go red. The argument is the contract, so that is what this reads.
  it('names the locale rather than taking the machine default', () => {
    const toLocaleString = vi.spyOn(Number.prototype, 'toLocaleString')
    const toLocaleStringBig = vi.spyOn(BigInt.prototype, 'toLocaleString')
    try {
      formatEvents(500_000)
      retentionLabel(90n)
      expect(toLocaleString).toHaveBeenCalledWith('en-US')
      expect(toLocaleStringBig).toHaveBeenCalledWith('en-US')
    } finally {
      toLocaleString.mockRestore()
      toLocaleStringBig.mockRestore()
    }
  })
})
