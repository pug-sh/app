import {
  BillingStatus,
  type GetBillingStatusResponse,
  SubscriptionStatus,
} from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { tsToDate } from '@/lib/timestamp'

// What the org is entitled to. Derived from the clock on the server, so a trial
// that ended an hour ago already reads free here.
const STATUS_LABEL: Record<BillingStatus, string> = {
  [BillingStatus.UNSPECIFIED]: '',
  [BillingStatus.TRIALING]: 'Trial',
  [BillingStatus.ACTIVE]: 'Active',
  [BillingStatus.FREE]: 'Free',
}

// `?? ''` is live: proto enums are open, so a newer server can send a value this build has no key
// for. Same reason as roleLabel in auth/permissions.ts.
export const statusLabel = (status: BillingStatus) => STATUS_LABEL[status] ?? ''

// The provider subscription behind the entitlement, which is a different question. Only
// UNSPECIFIED, ACTIVE and PAST_DUE are reachable — the server consults only a live subscription —
// so the rest carry no label rather than inviting a branch that can never run.
const SUB_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.UNSPECIFIED]: '',
  [SubscriptionStatus.ACTIVE]: '',
  [SubscriptionStatus.PAST_DUE]: 'Payment failed',
  [SubscriptionStatus.PAUSED]: '',
  [SubscriptionStatus.CANCELLED]: '',
  [SubscriptionStatus.EXPIRED]: '',
  [SubscriptionStatus.FAILED]: '',
}

export const subStatusLabel = (status: SubscriptionStatus) => SUB_STATUS_LABEL[status] ?? ''

// A failed card is worth a banner and never a degraded product: the server keeps the quota through
// PAST_DUE on purpose, and the delivery that normalizes to cancelled is what finally drops the org.
export const isPastDue = (status: GetBillingStatusResponse | null) =>
  status?.subscriptionStatus === SubscriptionStatus.PAST_DUE

export type UsageTone = 'normal' | 'caution' | 'over'

// Tone drives a fill and an ink colour on every surface, so it is owned here. The fills come from
// the chart band, not the semantic *text* tier: that tier is chroma-capped for reading against a
// near-grayscale UI, which in dark leaves the warning bar less saturated than the normal one.
export const TONE_FILL: Record<UsageTone, string> = {
  normal: 'bg-chart-1',
  caution: 'bg-chart-3',
  over: 'bg-chart-5',
}

export const TONE_TEXT: Record<UsageTone, string> = {
  normal: 'text-muted-foreground',
  caution: 'text-caution',
  over: 'text-negative',
}

export const USAGE_WARN_RATIO = 0.9

export type Usage = {
  used: number
  included: number
  percent: number
  tone: UsageTone
}

// The two halves of "X of Y" come from different RPCs, and each has its own way of having no
// answer:
//
//   - `included` is absent when there is NO quota — billing is off, or the plan carries none. It is
//     never 0, and rendering its absence as 0 would tell every org on a self-hosted install it is
//     over a limit that does not exist.
//   - `used` is meaningless unless the meter has actually summed this period. The proto carries a
//     `counted` flag for exactly this, and a bare 0 is what a client sees when it has not.
//
// Either missing means there is no meter to draw, which is why this returns null rather than
// substituting a zero for the half it does have.
export const usageFor = (includedEvents: bigint | undefined, usedEvents: number | null): Usage | null => {
  if (includedEvents === undefined || usedEvents === null) return null
  const included = Number(includedEvents)
  const used = usedEvents
  const ratio = included > 0 ? used / included : used > 0 ? 1 : 0
  const tone: UsageTone = ratio >= 1 ? 'over' : ratio >= USAGE_WARN_RATIO ? 'caution' : 'normal'
  // Floored, not rounded: 99.6% must not render as "100%" while the tone still says caution.
  return { used, included, percent: Math.min(100, Math.floor(ratio * 100)), tone }
}

export type BannerTone = Exclude<UsageTone, 'normal'> | 'past_due'

// Dismissal lasts the period, but crossing from "nearly out" to "over" earns a fresh banner. With
// no period there is nothing to expire against, so it lasts the day rather than forever.
export const usageBannerKey = (status: GetBillingStatusResponse, tone: BannerTone) => {
  const periodEnd = tsToDate(status.periodEnd)
  return `${periodEnd ? periodEnd.getTime() : new Date().toDateString()}:${tone}`
}

// Plan + subscription state — what a completed checkout changes, and null while nothing is loaded.
export const billingSignature = (status: GetBillingStatusResponse | null) =>
  status ? `${status.plan?.slug ?? ''}:${status.status}:${status.subscriptionStatus}` : null

// Pinned to en-US for the same reason formatMoney is, and it has to be the SAME reason: a quota is
// a catalog number, it sits beside a price on the same line, and the two halves of "X of Y" must be
// grouped the same way. On a machine defaulting to en-IN the browser locale renders this pair as
// "1,20,000 / 5,00,000" beside a "$20", which reads as three different number systems at once.
export const formatEvents = (n: number) => n.toLocaleString('en-US')

export const formatMoney = (cents: bigint, currency: string) => {
  const code = currency || 'USD'
  try {
    // Pinned to en-US: this is the catalog price, and it has to read the way the pricing page
    // writes it. The browser locale renders the same USD amount as "US$10".
    const options = { style: 'currency', currency: code } as const
    // The field is named cents but carries the currency's smallest unit, and not every currency
    // has 100 of them — a fixed /100 renders JPY and KRW a hundred times low.
    const digits = new Intl.NumberFormat('en-US', options).resolvedOptions().maximumFractionDigits ?? 2
    const amount = Number(cents) / 10 ** digits
    return new Intl.NumberFormat('en-US', {
      ...options,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
    }).format(amount)
  } catch {
    // Intl throws on a malformed code (not merely an unknown one).
    return `${(Number(cents) / 100).toFixed(2)} ${currency}`.trim()
  }
}
