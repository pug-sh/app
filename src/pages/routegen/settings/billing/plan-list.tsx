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
  plan.priceCents === undefined ? 'Agreed price' : formatMoney(plan.priceCents, plan.currency)

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
  // A live subscriber switches tiers in the provider's portal, where the card and billing date
  // carry over. The catalog is informational then.
  readOnly: boolean
  onSelect: (plan: PlanOption) => void
}) => (
  <div>
    {plans.map(plan => {
      const current = plan.slug === currentSlug
      // Purchasable is the server's own answer to "would a checkout open" — a button that cannot
      // work is worse than no button, so nothing here re-derives it.
      const selectable = !readOnly && !current && plan.purchasable
      return (
        <div
          key={plan.slug}
          className="flex items-center gap-4 border-b border-border/50 py-3 transition-colors last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{plan.displayName}</span>
              {current && <Check className="size-3.5 text-positive" />}
            </div>
            <p className="text-xs text-muted-foreground">{quotaLabel(plan)}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm tabular-nums">{priceLabel(plan)}</div>
            <div className="text-xs text-muted-foreground">per month</div>
          </div>
          <div className="w-24 shrink-0 text-right">
            {current ? (
              <span className="text-xs text-muted-foreground">Current</span>
            ) : selectable ? (
              <Button size="sm" variant="outline" disabled={!!busySlug} onClick={() => onSelect(plan)}>
                {busySlug === plan.slug ? <Loader2 className="size-3.5 animate-spin" /> : 'Choose'}
              </Button>
            ) : null}
          </div>
        </div>
      )
    })}
  </div>
)

export default PlanList
