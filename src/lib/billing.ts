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

// `?? ''` is live: proto enums are open, so a newer server can send a value with no key here.
export const statusLabel = (status: BillingStatus) => STATUS_LABEL[status] ?? ''

// Listed, not Partial, so a new enum member is a compile error.
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

// A failed card is a banner, not a degraded product: the server keeps the plan through PAST_DUE.
export const isPastDue = (status: GetBillingStatusResponse | null) =>
  status?.subscriptionStatus === SubscriptionStatus.PAST_DUE

// When the provider stops waiting for the failed card and holds or cancels: the "update your card by".
// The server can keep serving it after it has passed, until it sees which, and a date already gone
// asks for the impossible, so only one still ahead counts. A hold, or no grace period configured, has
// none.
export const graceDeadline = (status: GetBillingStatusResponse | null, now = new Date()) => {
  if (!isPastDue(status)) return null
  const endsAt = validDate(tsToDate(status?.gracePeriodEndsAt))
  return endsAt && endsAt > now ? endsAt : null
}

// The allowance warns only an org with no subscription. A subscriber's events past it are billed by
// tier, over the provider's period rather than the usage period, so "over" would flag every subscriber
// past it, which is the plan working as sold. Keyed on FREE, so a state this build cannot place warns
// nobody.
export const allowanceApplies = (status: GetBillingStatusResponse | null) => status?.status === BillingStatus.FREE

// Live whatever the portal can do: `manageable` reads false on a failed lookup, and a paying customer
// must never be offered a second checkout over one. A terminal state has no card to carry over, so it
// is not live.
export const hasLiveSubscription = (status: GetBillingStatusResponse) =>
  status.subscriptionStatus === SubscriptionStatus.ACTIVE || status.subscriptionStatus === SubscriptionStatus.PAST_DUE

export type UsageTone = 'normal' | 'caution' | 'over'

// The chart band, not the chroma-capped semantic tier, which in dark leaves caution paler than
// normal.
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

const toneFor = (ratio: number) => {
  if (ratio >= 1) return 'over'
  if (ratio >= USAGE_WARN_RATIO) return 'caution'
  return 'normal'
}

// Neither absence is 0, so neither draws.
export const usageFor = (includedEvents: bigint | undefined, usedEvents: number | null): Usage | null => {
  if (includedEvents === undefined || usedEvents === null) return null
  const included = Number(includedEvents)
  const used = usedEvents
  // An allowance of zero is not absence: any use is already past it.
  const ratio = included > 0 ? used / included : used > 0 ? 1 : 0
  // Floored, or 99.6% renders "100%" while the tone still says caution.
  return { used, included, percent: Math.min(100, Math.floor(ratio * 100)), tone: toneFor(ratio) }
}

// Usage against the free allowance, for the orgs it applies to; null for everyone else.
export const allowanceUsage = (status: GetBillingStatusResponse | null, usedEvents: number | null) =>
  allowanceApplies(status) ? usageFor(status?.includedEvents, usedEvents) : null

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

// A dismissal expires with the period, or — lacking one — with the day. A failed payment's also expires
// with its grace window, since a new window is a new failure.
export const usageBannerKey = (status: GetBillingStatusResponse, tone: BannerTone) => {
  const periodEnd = validDate(tsToDate(status.periodEnd))
  const key = `${periodEnd ? periodEnd.getTime() : new Date().toDateString()}:${tone}`
  const graceEndsAt = validDate(tsToDate(status.gracePeriodEndsAt))
  if (tone !== 'past_due' || !graceEndsAt) return key
  return `${key}:${graceEndsAt.getTime()}`
}

// What a completed checkout changes; null while nothing is loaded.
export const billingSignature = (status: GetBillingStatusResponse | null) =>
  status ? `${status.plan?.slug ?? ''}:${status.status}:${status.subscriptionStatus}` : null

// en-US like the dates beside it, or a machine defaulting to en-IN renders "1,20,000 / 5,00,000".
export const formatEvents = (n: number | bigint) => n.toLocaleString('en-US')

export const retentionLabel = (days: bigint) => `${formatEvents(days)} ${days === 1n ? 'day' : 'days'} of event history`
