import { useAtomValue, useSetAtom } from 'jotai'
import { X } from 'lucide-react'
import { trackFeature } from '@/analytics/pug'
import { useCan } from '@/auth/can'
import { isDemoSessionAtom } from '@/auth/demo'
import ProjectLink from '@/components/project-link'
import { dismissedUsageBannerAtom } from '@/data/billing.atoms'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { useBilling } from '@/hooks/use-billing'
import { type BannerTone, formatEvents, isPastDue, usageBannerKey, usageFor } from '@/lib/billing'
import { cn } from '@/lib/utils'

// Nothing is enforced anywhere in this system — a quota drives a banner and never a rejected event —
// so this has to say so, or "over your limit" reads as an outage the customer is already having.
const UsageBanner = () => {
  const isDemo = useAtomValue(isDemoSessionAtom)
  const org = useAtomValue(activeOrgAtom)
  const { status, usedEvents } = useBilling()
  const dismissed = useAtomValue(dismissedUsageBannerAtom)
  const dismiss = useSetAtom(dismissedUsageBannerAtom)
  const can = useCan()

  const usage = usageFor(status?.includedEvents, usedEvents)
  // Gated on the same permission as the page it links to, or it links into a redirect.
  if (isDemo || !org || !status?.billingEnabled || !can('read', 'billing')) return null

  const pastDue = isPastDue(status)
  const tone: BannerTone | null = pastDue ? 'past_due' : usage && usage.tone !== 'normal' ? usage.tone : null
  if (!tone) return null

  const key = usageBannerKey(status, tone)
  if (dismissed[org.id] === key) return null

  const message = () => {
    if (pastDue) return 'Your last payment failed. Update your payment method to keep this plan.'
    if (!usage) return ''
    if (usage.tone === 'over') {
      return `You're over the ${formatEvents(usage.included)} events included in this plan — ${formatEvents(usage.used)} so far this period. Nothing is being dropped.`
    }
    return `You've used ${usage.percent}% of the ${formatEvents(usage.included)} events included in this plan.`
  }

  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-center gap-x-2 border-b px-4 py-1.5 text-center text-xs',
        tone === 'caution' ? 'border-caution/25 bg-caution/8' : 'border-negative/25 bg-negative/8',
      )}
      // Autocapture would otherwise file every click under this org's own usage numbers.
      data-pug-no-capture
    >
      <span className={tone === 'caution' ? 'text-caution' : 'text-negative'}>{message()}</span>
      <ProjectLink
        href="/settings/billing"
        onClick={() => trackFeature({ featureId: 'billing.banner', featureName: 'Usage banner' })}
        className="font-medium text-link underline-offset-4 hover:underline"
      >
        {pastDue ? 'Manage billing' : 'View plans'} →
      </ProjectLink>
      <button
        type="button"
        onClick={() => dismiss({ orgId: org.id, key })}
        aria-label="Dismiss"
        className="ml-1 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export default UsageBanner
