import {
  BillingStatus,
  type GetBillingStatusResponse,
  SubscriptionStatus,
} from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { tsToDate, validDate } from '@/lib/timestamp'

const STATUS_LABEL: Record<BillingStatus, string> = {
  [BillingStatus.UNSPECIFIED]: '',
  [BillingStatus.TRIALING]: 'Trial',
  [BillingStatus.ACTIVE]: 'Active',
  [BillingStatus.FREE]: 'Free',
}

// `?? ''` is live: proto enums are open, so a newer server can send a value this build has no key for.
export const statusLabel = (status: BillingStatus) => STATUS_LABEL[status] ?? ''

// Only UNSPECIFIED, ACTIVE and PAST_DUE are reachable — the server consults only a live subscription.
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

// A failed card is worth a banner and never a degraded product: the server keeps the quota
// through PAST_DUE on purpose.
export const isPastDue = (status: GetBillingStatusResponse | null) =>
  status?.subscriptionStatus === SubscriptionStatus.PAST_DUE

export type UsageTone = 'normal' | 'caution' | 'over'

// Fills come from the chart band, not the semantic text tier: that tier is chroma-capped, which in
// dark leaves the warning bar less saturated than the normal one.
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

// Absent `included` is NO quota, absent `used` is a meter with no answer — neither is 0, so either
// missing means there is no meter to draw.
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

export const BANNER_BOX: Record<BannerTone, string> = {
  caution: 'border-caution/25 bg-caution/8',
  over: 'border-negative/25 bg-negative/8',
  past_due: 'border-negative/25 bg-negative/8',
}

export const BANNER_TEXT: Record<BannerTone, string> = {
  caution: 'text-caution',
  over: 'text-negative',
  past_due: 'text-negative',
}

// Dismissal lasts the period, but crossing from "nearly out" to "over" earns a fresh banner. With no
// period there is nothing to expire against, so it lasts the day rather than forever.
export const usageBannerKey = (status: GetBillingStatusResponse, tone: BannerTone) => {
  const periodEnd = validDate(tsToDate(status.periodEnd))
  return `${periodEnd ? periodEnd.getTime() : new Date().toDateString()}:${tone}`
}

// Plan + subscription state — what a completed checkout changes, and null while nothing is loaded.
export const billingSignature = (status: GetBillingStatusResponse | null) =>
  status ? `${status.plan?.slug ?? ''}:${status.status}:${status.subscriptionStatus}` : null

// Pinned to en-US like formatMoney: a quota sits beside a price on the same line, and the browser
// locale renders the pair as "1,20,000 / 5,00,000" beside a "$20".
export const formatEvents = (n: number) => n.toLocaleString('en-US')

export const formatMoney = (cents: bigint, currency: string) => {
  // No currency means we cannot name the amount; "$20" would state a price the server never sent.
  if (!currency) return '—'
  try {
    // Pinned to en-US: the browser locale renders the same USD amount as "US$10".
    const options = { style: 'currency', currency } as const
    // The field is named cents but carries the currency's smallest unit, and not every currency has
    // 100 of them — a fixed /100 renders JPY and KRW a hundred times low.
    const digits = new Intl.NumberFormat('en-US', options).resolvedOptions().maximumFractionDigits ?? 2
    const amount = Number(cents) / 10 ** digits
    return new Intl.NumberFormat('en-US', {
      ...options,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
    }).format(amount)
  } catch {
    // Intl throws on a malformed code (not merely an unknown one). Minor units are unknowable here,
    // so show the raw amount beside the code rather than guessing /100.
    return `${cents} ${currency}`
  }
}
