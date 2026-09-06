import { describe, expect, it } from 'vitest'
import { BillingStatus, SubscriptionStatus } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { formatMoney, statusLabel, subStatusLabel, USAGE_WARN_RATIO, usageFor } from './billing'

describe('usageFor', () => {
  // The two halves come from different RPCs and each has its own way of having no answer. Either
  // missing means there is no meter to draw — substituting a zero for the half we do have is the
  // one thing this must never do.
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

  // A quota of 0 is not something the server emits — absent is how it says "no quota" — but the
  // ratio would divide by it, and NaN renders as a bar of width "NaN%".
  it('does not divide by a zero quota', () => {
    expect(usageFor(0n, 10)).toEqual({ used: 10, included: 0, percent: 100, tone: 'over' })
    expect(usageFor(0n, 0)).toEqual({ used: 0, included: 0, percent: 0, tone: 'normal' })
  })
})

describe('formatMoney', () => {
  it('drops the cents on a whole amount', () => {
    expect(formatMoney(2_000n, 'USD')).toBe('$20')
  })

  it('keeps them when there are any', () => {
    expect(formatMoney(1_999n, 'USD')).toBe('$19.99')
  })

  // The field is named cents but carries the currency's smallest unit, and JPY has none — a fixed
  // /100 renders it a hundred times low.
  it('respects a currency with no minor unit', () => {
    expect(formatMoney(2_000n, 'JPY')).toBe('¥2,000')
  })

  // Intl throws on a malformed code rather than merely an unknown one. Minor units are unknowable
  // there, so the fallback shows the raw amount rather than reintroducing the /100 it warns about.
  it('falls back rather than throwing on a malformed code', () => {
    expect(formatMoney(2_000n, 'not a currency')).toBe('2000 not a currency')
  })

  // An absent currency cannot be denominated; "$20" would state a price the server never sent.
  it('never guesses dollars for a plan with no currency', () => {
    expect(formatMoney(2_000n, '')).toBe('—')
  })
})

describe('labels', () => {
  it('names each entitlement state', () => {
    expect(statusLabel(BillingStatus.TRIALING)).toBe('Trial')
    expect(statusLabel(BillingStatus.ACTIVE)).toBe('Active')
    expect(statusLabel(BillingStatus.FREE)).toBe('Free')
  })

  // Proto enums are open: a newer server can send a value this build has no key for, and the
  // lookup must not return undefined into the markup.
  it('says nothing for a value this build does not know', () => {
    expect(statusLabel(99 as BillingStatus)).toBe('')
    expect(subStatusLabel(99 as SubscriptionStatus)).toBe('')
  })

  // Only past_due carries a label: it is the one subscription state a customer has to act on, and
  // the others are either invisible (active) or unreachable (the server nils out a dead one).
  it('labels only the state that needs acting on', () => {
    expect(subStatusLabel(SubscriptionStatus.PAST_DUE)).toBe('Payment failed')
    expect(subStatusLabel(SubscriptionStatus.ACTIVE)).toBe('')
  })
})
