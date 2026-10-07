import type { TierUsage } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { formatEvents } from '@/lib/billing'
import { compactNumber } from '@/lib/format'

// Compact only where that is exact: the catalog's bounds are round, but a deal's allowance can be any
// number, and "1.2M" for 1,234,567 would misstate where its billing starts.
const boundLabel = (n: bigint) => {
  const exact = (n >= 1_000_000n && n % 100_000n === 0n) || (n >= 1_000n && n < 1_000_000n && n % 100n === 0n)
  return exact ? compactNumber(n) : formatEvents(n)
}

// Numbered in the server's order, which is the meters' (t1, t2, …), so each row matches its line on
// the provider's invoice. A tier the allowance covers (from_events reaching up_to_events) holds nothing,
// so it is dropped rather than renumbered — unless it holds events anyway, which the meter keeps when
// an allowance is raised mid-period. Those are billed, so the row stays, under the tier's own bounds
// (the previous tier's upper one, or 0), since from_events would print it backwards. An absent bound
// is the unbounded last tier, never a 0.
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
