import { Check, Loader2 } from 'lucide-react'
import type { PlanOption } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { Button } from '@/components/ui/button'
import { formatEvents, formatMoney } from '@/lib/billing'

// Absent means the tier carries no quota of its own — the custom tier, whose quota comes from the
// org's own row and is reported by GetBillingStatus instead. Never 0.
const quotaLabel = (plan: PlanOption) =>
  plan.includedEvents === undefined
    ? 'Quota agreed with us'
    : `${formatEvents(Number(plan.includedEvents))} events / month`

// Absent means no list price — the custom tier again. Distinct from a price of zero, which the
// floors have and which are never listed here.
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
  // Purchasable is the server's own answer to "would a checkout open" — a button that cannot work is
  // worse than no button, so nothing here re-derives it.
  const isSelectable = (plan: PlanOption) => !readOnly && plan.slug !== currentSlug && plan.purchasable
  // Reserve the action column only when some row can fill it, or every price hangs short of the rule
  // to leave room for buttons that never come.
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
            <p className="text-xs text-muted-foreground">{quotaLabel(plan)}</p>
          </div>
          <div className="shrink-0 text-right text-sm tabular-nums">{priceLabel(plan)}</div>
          {anySelectable && (
            <div className="w-20 shrink-0 text-right">
              {isSelectable(plan) && (
                // The spinner replaces the only text in the button, and lucide marks it aria-hidden,
                // so without a label of its own the button loses its name exactly while it is busy.
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Choose"
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
