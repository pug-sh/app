import type { Timestamp } from '@bufbuild/protobuf/wkt'
import { useMemo } from 'react'
import type { GetBillingStatusResponse, TierUsage } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import HoverSwap from '@/components/hover-swap'
import SectionHeader from '@/components/section-header'
import { useRelativeTime } from '@/hooks/use-relative-time'
import { formatEvents } from '@/lib/billing'
import { formatDateTime, formatLocalDate, tsToDate, validDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { tierRows } from './tier-rows'

// Live, since the billing pass states hourly and a tab left open would say "5m ago" for hours. Memoized
// on the message, so the hook's timer is not reset by every render's fresh Date.
const Reported = ({ at }: { at: Timestamp | undefined }) => {
  const asOf = useMemo(() => validDate(tsToDate(at)), [at])
  const relative = useRelativeTime(asOf)
  if (!asOf) return null
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Reported <HoverSwap primary={relative} secondary={formatDateTime(asOf)} />
    </p>
  )
}

const TierTable = ({ tiers, asOf }: { tiers: TierUsage[]; asOf: Timestamp | undefined }) => {
  // Empty until the period's first statement, which is not a tier at 0. Read off what the server sent:
  // a row can be dropped from what is drawn without anything having gone unreported.
  if (tiers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Nothing reported to the payment provider yet this billing period.</p>
    )
  }

  const rows = tierRows(tiers)
  const total = rows.reduce((sum, row) => sum + row.events, 0n)

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <th className="pb-2 text-left font-medium">Tier</th>
            <th className="pb-2 text-left font-medium">Range</th>
            <th className="pb-2 text-right font-medium">Events</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.tier}
              className={cn(
                'border-b border-border/50 transition-colors hover:bg-muted/40',
                row.events === 0n && 'text-muted-foreground',
              )}
            >
              <td className="py-2 tabular-nums">{row.tier}</td>
              <td className="py-2 tabular-nums">{row.range}</td>
              <td className="py-2 text-right tabular-nums">{formatEvents(row.events)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-2" />
            <td className="pt-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</td>
            <td className="pt-2 text-right tabular-nums">{formatEvents(total)}</td>
          </tr>
        </tfoot>
      </table>
      <Reported at={asOf} />
    </>
  )
}

// Each tier's count carries the previous period's late days, so the total can exceed this period's own.
const CARRY_NOTE = 'Includes any events from the previous period that were counted late.'

const billedUsageNote = (status: GetBillingStatusResponse, now: Date) => {
  const end = validDate(tsToDate(status.currentPeriodEnd))
  // Nothing is stated past a period's end, so until the provider starts the next one this count is final.
  if (end && end <= now) {
    return `Events past your free allowance in the billing period that ended ${formatLocalDate(end)}, as last reported to the payment provider, which has not started the next one yet. ${CARRY_NOTE}`
  }
  const period = end ? `the billing period ending ${formatLocalDate(end)}` : 'this billing period'
  return `Events past your free allowance in ${period}, as last reported to the payment provider: a running count, not an invoice. ${CARRY_NOTE}`
}

// What the billing pass last stated to the provider's per-tier meters for the provider's billing
// period, not the usage period counted above. The provider bills each tier the most it was told by the
// period's end, and the last statement may not be acknowledged yet, so this is a running count, never an
// invoice — and quantities only, since no rate reaches here.
const BilledUsage = ({ status }: { status: GetBillingStatusResponse }) => (
  <section>
    <SectionHeader title="Billed usage" description={billedUsageNote(status, new Date())} />
    <TierTable tiers={status.tierUsage} asOf={status.tierUsageAsOf} />
  </section>
)

export default BilledUsage
