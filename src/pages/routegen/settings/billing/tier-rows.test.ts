import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'
import { TierUsageSchema } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { tierRows } from './tier-rows'

describe('tierRows', () => {
  const tier = (fromEvents: bigint, upToEvents: bigint | undefined, events = 0n) =>
    create(TierUsageSchema, { fromEvents, upToEvents, events })

  // A catalog-shaped fixture: a 100K allowance under six tiers.
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
  // renumbering the rest would point each one at the wrong provider meter.
  it('drops a tier the allowance covers, keeping the numbering', () => {
    const rows = tierRows([tier(5_000_000n, 2_000_000n), tier(5_000_000n, 15_000_000n, 3_000_000n)])
    expect(rows).toEqual([{ tier: 2, range: '5M – 15M', events: 3_000_000n }])
  })

  // An allowance equal to a bound, as a deal's often is, covers that tier exactly.
  it('drops a tier the allowance exactly reaches', () => {
    expect(tierRows([tier(2_000_000n, 2_000_000n), tier(2_000_000n, 15_000_000n, 7n)])).toEqual([
      { tier: 2, range: '2M – 15M', events: 7n },
    ])
  })

  // Covered should mean it holds nothing, but the billing pass keeps the larger count when an allowance is
  // raised mid-period. Those events are billed, so the row stays, under the tier's own bounds: its
  // from_events, the new allowance, would print the range backwards.
  it('keeps a covered tier that holds events, under its own bounds', () => {
    expect(tierRows([tier(5_000_000n, 2_000_000n, 10n)])).toEqual([{ tier: 1, range: '0 – 2M', events: 10n }])
    expect(tierRows([tier(20_000_000n, 2_000_000n), tier(20_000_000n, 15_000_000n, 5n)])).toEqual([
      { tier: 2, range: '2M – 15M', events: 5n },
    ])
  })

  // Catalog bounds are round, but an allowance override can be any number, and "1.2M" for 1,234,567
  // would misstate where its billing starts.
  it('compacts a bound only where that is exact', () => {
    expect(tierRows([tier(1_234_567n, 2_000_000n)])[0].range).toBe('1,234,567 – 2M')
    expect(tierRows([tier(1_500_000n, 2_000_000n)])[0].range).toBe('1.5M – 2M')
    expect(tierRows([tier(2_500n, 2_000_000n)])[0].range).toBe('2.5K – 2M')
    expect(tierRows([tier(1_234n, 2_000_000n)])[0].range).toBe('1,234 – 2M')
    expect(tierRows([tier(1_050_000n, 2_000_000n)])[0].range).toBe('1,050,000 – 2M')
    expect(tierRows([tier(1_250n, 2_000_000n)])[0].range).toBe('1,250 – 2M')
    expect(tierRows([tier(1n, 2_000_000n)])[0].range).toBe('1 – 2M')
  })
})
