import { Check, Loader2 } from 'lucide-react'
import type { PlanOption } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { Button } from '@/components/ui/button'
import { formatEvents, formatMoney, retentionLabel } from '@/lib/billing'

// Absent is the custom tier, never 0.
const quotaLabel = (plan: PlanOption) =>
  plan.includedEvents === undefined ? 'Quota agreed with us' : `${formatEvents(plan.includedEvents)} events / month`

// Absent shows the quota alone.
const detailLabel = (plan: PlanOption) =>
  plan.retentionDays === undefined ? quotaLabel(plan) : `${quotaLabel(plan)} · ${retentionLabel(plan.retentionDays)}`

// Absent is the custom tier, distinct from the free floor's price of zero.
const priceLabel = (plan: PlanOption) =>
  plan.priceCents === undefined ? 'Agreed price' : `${formatMoney(plan.priceCents, plan.currency)} / month`

const PlanList = ({
  plans,
  currentSlug,
  busySlug,
  readOnly,
  onSelect,
}: {
  plans: PlanOption[]
  currentSlug: string | undefined
  busySlug: string | null
  readOnly: boolean
  onSelect: (plan: PlanOption) => void
}) => {
  // `purchasable` is the server's "would a checkout open"; the rest is this page's.
  const isSelectable = (plan: PlanOption) => !readOnly && plan.slug !== currentSlug && plan.purchasable
  // Reserved only when some row can fill it, or every price hangs short of the rule.
  const anySelectable = plans.some(isSelectable)

  return (
    <div>
      {plans.map(plan => (
        <div key={plan.slug} className="flex items-center gap-4 border-b border-border/50 py-3 last:border-b-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{plan.displayName}</span>
              {plan.slug === currentSlug && (
                <>
                  <Check className="size-3.5 text-positive" />
                  <span className="sr-only">Current</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{detailLabel(plan)}</p>
          </div>
          <div className="shrink-0 text-right text-sm tabular-nums">{priceLabel(plan)}</div>
          {anySelectable && (
            <div className="w-20 shrink-0 text-right">
              {isSelectable(plan) && (
                // The spinner replaces the only text and is aria-hidden, so the name goes with it.
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Choose ${plan.displayName}`}
                  aria-busy={busySlug === plan.slug}
                  disabled={!!busySlug}
                  onClick={() => onSelect(plan)}
                >
                  {busySlug === plan.slug ? <Loader2 className="size-3.5 animate-spin" /> : 'Choose'}
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default PlanList
