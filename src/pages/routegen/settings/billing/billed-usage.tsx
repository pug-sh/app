import type { GetBillingStatusResponse } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import HoverSwap from '@/components/hover-swap'
import SectionHeader from '@/components/section-header'
import { formatRelative } from '@/hooks/use-relative-time'
import { formatEvents } from '@/lib/billing'
import { formatDateTime, formatLocalDate, tsToDate, validDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import { tierRows } from './tier-rows'

const TierTable = ({ rows, asOf }: { rows: ReturnType<typeof tierRows>; asOf: Date | null }) => {
  // Empty until the period's first statement, which is not a tier at 0.
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Nothing reported to the payment provider yet this billing period.</p>
    )
  }

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
      {asOf && (
        <p className="mt-2 text-xs text-muted-foreground">
          Reported <HoverSwap primary={formatRelative(asOf)} secondary={formatDateTime(asOf)} />
        </p>
      )}
    </>
  )
}

// What the meter last stated to the provider for this billing period, which is the provider's own and
// not the usage period counted above. The provider bills each tier the most it was told by the period's
// end, so this is a running count, never an invoice — and quantities only, since no rate reaches here.
const BilledUsage = ({ status }: { status: GetBillingStatusResponse }) => {
  const periodEnd = validDate(tsToDate(status.currentPeriodEnd))
  const period = periodEnd ? `The billing period ending ${formatLocalDate(periodEnd)}` : 'This billing period'

  return (
    <section>
      <SectionHeader
        title="Billed usage"
        description={`${period}, past your free allowance, as last reported to the payment provider. A running count, not an invoice.`}
      />
      <TierTable rows={tierRows(status.tierUsage)} asOf={validDate(tsToDate(status.tierUsageAsOf))} />
    </section>
  )
}

export default BilledUsage
