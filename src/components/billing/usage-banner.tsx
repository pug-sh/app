import { useAtomValue, useSetAtom } from 'jotai'
import { X } from 'lucide-react'
import { trackFeature } from '@/analytics/pug'
import { useCan } from '@/auth/can'
import { isDemoSessionAtom } from '@/auth/demo'
import ProjectLink from '@/components/project-link'
import { dismissedUsageBannerAtom } from '@/data/billing.atoms'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { useBilling } from '@/hooks/use-billing'
import {
  BANNER_BOX,
  BANNER_TEXT,
  type BannerTone,
  formatEvents,
  isPastDue,
  type Usage,
  usageBannerKey,
  usageFor,
} from '@/lib/billing'
import { cn } from '@/lib/utils'

const bannerAlert = (pastDue: boolean, usage: Usage | null): { tone: BannerTone; message: string } | null => {
  if (pastDue) {
    return { tone: 'past_due', message: 'Your last payment failed. Update your payment method to keep this plan.' }
  }
  if (!usage || usage.tone === 'normal') return null
  if (usage.tone === 'over') {
    return {
      tone: 'over',
      message: `You're over the ${formatEvents(usage.included)} events included in this plan — ${formatEvents(usage.used)} so far this period. Nothing is being dropped.`,
    }
  }
  return {
    tone: 'caution',
    message: `You've used ${usage.percent}% of the ${formatEvents(usage.included)} events included in this plan.`,
  }
}

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

  // A quota drives a banner, never a rejected event, or "over your limit" reads as an outage.
  const pastDue = isPastDue(status)
  const alert = bannerAlert(pastDue, usage)
  if (!alert) return null

  const key = usageBannerKey(status, alert.tone)
  if (dismissed[org.id] === key) return null

  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-center gap-x-2 border-b px-4 py-1.5 text-center text-xs',
        BANNER_BOX[alert.tone],
      )}
      // Arrives after the RPC, so without this a screen reader never learns a card was declined.
      role="status"
      // Autocapture would otherwise file every click under this org's own usage numbers.
      data-pug-no-capture
    >
      <span className={BANNER_TEXT[alert.tone]}>{alert.message}</span>
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
