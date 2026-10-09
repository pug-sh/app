import type { TierUsage } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { formatEvents } from '@/lib/billing'
import { compactNumber } from '@/lib/format'

// Compact only where that is exact: the catalog's bounds are round, but an allowance override (a deal's,
// or a comp that rode onto the plan) can be any number, and "1.2M" for 1,234,567 would misstate where its
// billing starts. compactNumber keeps one decimal, so that is a multiple of 100K in millions, of 100 in
// thousands, and never below.
const boundLabel = (n: bigint) => {
  if (n >= 1_000_000n) return n % 100_000n === 0n ? compactNumber(n) : formatEvents(n)
  if (n >= 1_000n) return n % 100n === 0n ? compactNumber(n) : formatEvents(n)
  return formatEvents(n)
}

// Numbered in the server's order, the tier meters' keys (t1, t2, …), so Tier k is always the provider's
// tk meter, the line to reconcile an invoice against. A tier the allowance covers (from_events reaching
// up_to_events) holds nothing, so its row is dropped and the rest keep their numbers — unless it holds
// events anyway, which the billing pass keeps when an allowance is raised mid-period. Those are billed,
// so the row stays, under the tier's own bounds (the previous tier's upper one, or 0), since from_events
// would print it backwards. An absent bound is the unbounded last tier, never a 0.
export const tierRows = (tiers: TierUsage[]) =>
  tiers.flatMap((t, i) => {
    if (t.upToEvents === undefined) return [{ tier: i + 1, range: `${boundLabel(t.fromEvents)}+`, events: t.events }]
    let from = t.fromEvents
    if (from >= t.upToEvents) {
      if (t.events === 0n) return []
      from = i === 0 ? 0n : (tiers[i - 1].upToEvents ?? 0n)
    }
    return [{ tier: i + 1, range: `${boundLabel(from)} – ${boundLabel(t.upToEvents)}`, events: t.events }]
  })
