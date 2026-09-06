import { useAtomValue, useSetAtom } from 'jotai'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useLocation, useSearch } from 'wouter'
import { trackFeature } from '@/analytics/pug'
import { BillingStatus, type PlanOption } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { billingRPCAtom } from '@/api/rpc'
import { Can, useCan } from '@/auth/can'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Badge } from '@/components/ui/badge'
import { loadBillingAtom, pollBillingAfterCheckoutAtom } from '@/data/billing.atoms'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { useBilling } from '@/hooks/use-billing'
import {
  billingSignature,
  formatEvents,
  formatMoney,
  isPastDue,
  statusLabel,
  subStatusLabel,
  TONE_FILL,
  usageFor,
} from '@/lib/billing'
import { useRouteParams } from '@/lib/route-params'
import { toastRPCError } from '@/lib/rpc-error'
import { formatUTCDate, tsToDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import {
  clearCheckoutPending,
  closeCheckoutOverlay,
  markCheckoutPending,
  openCheckoutOverlay,
  takeCheckoutPending,
} from './checkout'
import PlanList from './plan-list'

// Deliberately not muted: on a billing page, "we couldn't load this" must not read as "you have
// none".
const ListError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <p className="text-sm text-negative">
    {message}{' '}
    <button type="button" onClick={onRetry} className="text-link underline-offset-4 hover:underline">
      Try again
    </button>
  </p>
)

const PortalButton = ({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) => (
  <Can action="create" resource="billing">
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="mt-3 inline-flex items-center gap-1.5 text-sm text-link underline-offset-4 hover:underline disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
      {label}
    </button>
  </Can>
)

// Three different dates, and conflating them is the mistake this exists to prevent. `renewsAt` is
// when the provider bills next; `periodEnd` is when the quota window turns over. They are only the
// same by coincidence.
const periodLine = (status: BillingStatus, trialEndsAt: Date | null, renewsAt: Date | null, periodEnd: Date | null) => {
  if (status === BillingStatus.TRIALING && trialEndsAt) return `Trial ends ${formatUTCDate(trialEndsAt)}`
  if (renewsAt) return `Renews ${formatUTCDate(renewsAt)}`
  if (periodEnd) return `Quota resets ${formatUTCDate(periodEnd)}`
  return ''
}

// Denylist, not an allowlist: guessing wrong here toasts a failure at someone who just paid.
const FAILED_CHECKOUT_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'expired'])

const Billing = () => {
  const org = useAtomValue(activeOrgAtom)
  const billingRPC = useAtomValue(billingRPCAtom)
  const { status, usedEvents, error, unsupported, loaded } = useBilling()
  const reloadBilling = useSetAtom(loadBillingAtom)
  const pollAfterCheckout = useSetAtom(pollBillingAfterCheckoutAtom)
  const can = useCan()
  const { projectId } = useRouteParams<{ projectId: string }>()
  const [, navigate] = useLocation()
  const search = useSearch()

  const [plans, setPlans] = useState<{ items: PlanOption[]; error: string | null } | null>(null)
  const [planAttempt, setPlanAttempt] = useState(0)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)

  const orgId = org?.id
  const enabled = !!status?.billingEnabled
  const canReadBilling = can('read', 'billing')
  // The catalog is stale the moment the checkout poll lands a new plan — without this it keeps
  // offering "Choose" on the tier just bought.
  const planKey = billingSignature(status)
  // The catalog exists to be bought from, so the read follows the buy button rather than the page:
  // nothing purchasable, or no permission to start a checkout, and there is nothing to draw.
  const canBrowsePlans = !!status?.purchasable && can('create', 'billing')

  // A confirmed "off", a deployment with no billing service at all, and a role that cannot read
  // billing all leave nothing to render — and a blank body under a tab bar is worse than the general
  // tab. Any other failure keeps its own retry state below. The tab is already dropped from the nav,
  // so this catches a typed or saved URL.
  useEffect(() => {
    if (!loaded || !projectId || (error && !unsupported)) return
    if (!enabled || unsupported || !canReadBilling) navigate(`/p/${projectId}/settings/general`, { replace: true })
  }, [loaded, error, unsupported, enabled, canReadBilling, projectId, navigate])

  // An overlay still open at unmount means the customer navigated away mid-checkout (browser Back);
  // left set, the flag polls on their next visit and toasts "still confirming" at someone who never
  // paid. A completed checkout reloads the page instead, so no cleanup runs and the flag survives.
  useEffect(() => {
    return () => {
      if (closeCheckoutOverlay()) clearCheckoutPending()
    }
  }, [])

  useEffect(() => {
    if (!orgId || !enabled || !canBrowsePlans) return
    let cancelled = false
    ;(async () => {
      try {
        const resp = await billingRPC.listPlans({ orgId })
        if (!cancelled) setPlans({ items: resp.plans, error: null })
      } catch (err) {
        console.error('listPlans failed:', err)
        if (!cancelled) setPlans({ items: [], error: 'Failed to load plans' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, enabled, canBrowsePlans, billingRPC, planAttempt, planKey])

  // The webhook can outlast the poll, and then the plan on screen is still the old one — which
  // reads as a payment that failed.
  const confirmCheckout = useCallback(
    async (before: string) => {
      if (!(await pollAfterCheckout(before)))
        toast.info('Still confirming your payment. This page will update shortly.')
    },
    [pollAfterCheckout],
  )

  // A completed checkout reloads the page at the provider's return_url, which is why the baseline is
  // read on mount as well as awaited in handleSelectPlan. The provider states the outcome in the
  // query it returns with — without reading it, a declined card polls for 17s and is then told its
  // payment is still confirming.
  useEffect(() => {
    const before = takeCheckoutPending()
    if (before === null) return
    const outcome = new URLSearchParams(search).get('status')?.toLowerCase()
    if (outcome && FAILED_CHECKOUT_STATUSES.has(outcome)) {
      toast.error('Your payment did not go through. Your plan is unchanged.')
      return
    }
    confirmCheckout(before)
  }, [confirmCheckout, search])

  const handleSelectPlan = async (plan: PlanOption) => {
    if (!orgId || planKey === null) return
    setCheckingOut(plan.slug)
    try {
      const resp = await billingRPC.createCheckoutSession({ orgId, planSlug: plan.slug })
      trackFeature({ featureId: 'billing.checkout_started', featureName: 'Start checkout' })
      markCheckoutPending(planKey)
      const outcome = await openCheckoutOverlay(resp.checkoutUrl)
      if (outcome.status === 'failed') {
        clearCheckoutPending()
        toast.error(outcome.message)
      } else if (outcome.status === 'closed') {
        // Nothing can have changed if the customer backed out, so don't spend the poll on it.
        clearCheckoutPending()
      } else {
        await confirmCheckout(planKey)
      }
    } catch (err) {
      clearCheckoutPending()
      toastRPCError(err, 'Failed to start checkout')
    } finally {
      setCheckingOut(null)
    }
  }

  const handleOpenPortal = async () => {
    if (!orgId) return
    setOpeningPortal(true)
    try {
      const resp = await billingRPC.createPortalSession({ orgId })
      trackFeature({ featureId: 'billing.portal_opened', featureName: 'Open billing portal' })
      // The tab is opened after an await, so it can be blocked — fall back to this tab.
      if (!window.open(resp.portalUrl, '_blank', 'noopener,noreferrer')) window.location.href = resp.portalUrl
    } catch (err) {
      toastRPCError(err, 'Failed to open the billing portal')
    } finally {
      setOpeningPortal(false)
    }
  }

  if (!loaded) return <LoadingSpinner />
  if (error) {
    return (
      <div className="max-w-2xl">
        <p className="text-sm text-negative">{error}</p>
        <button
          type="button"
          onClick={() => reloadBilling({ force: true })}
          className="mt-2 text-sm text-link underline-offset-4 hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }
  // Not a spinner: that would read as billing still loading rather than not existing here. The
  // effect above is already redirecting off both of these.
  if (!status?.billingEnabled || !canReadBilling) return null

  const usage = usageFor(status.includedEvents, usedEvents)
  const period = periodLine(
    status.status,
    tsToDate(status.trialEndsAt),
    tsToDate(status.currentPeriodEnd),
    tsToDate(status.periodEnd),
  )
  // The free plan is named after its own state, so the badge would just repeat the plan name.
  const badge = statusLabel(status.status) === status.plan?.displayName ? '' : statusLabel(status.status)
  const pastDue = isPastDue(status)
  // The server refuses a second checkout while one subscription is live, and a tier switch belongs
  // in the portal where the card and billing date carry over.
  const liveSubscription = status.manageable && status.subscriptionStatus !== 0

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <SectionHeader title="Plan" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{status.plan?.displayName || '—'}</span>
          {badge && <Badge variant="secondary">{badge}</Badge>}
          {pastDue && <Badge variant="destructive">{subStatusLabel(status.subscriptionStatus)}</Badge>}
          {status.plan?.priceCents !== undefined && status.plan.priceCents > 0n && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatMoney(status.plan.priceCents, status.plan.currency)} / month
            </span>
          )}
        </div>
        {period && <p className="mt-1 text-xs text-muted-foreground">{period}</p>}
        {pastDue && (
          <p className="mt-2 text-xs text-caution">
            We couldn't charge your card. Nothing has changed about your plan or your limits — update your payment
            method to avoid an interruption.
          </p>
        )}

        {status.manageable && (
          <PortalButton label="Manage payment method and invoices" busy={openingPortal} onClick={handleOpenPortal} />
        )}
      </section>

      <section>
        <SectionHeader title="Events this period" description="Across every project in this organization." />
        <div className="text-2xl tabular-nums">
          {/* Null is "the meter has no answer for this period", which must never render as 0 —
              that would tell an org it has sent nothing when nobody has counted yet. */}
          {usedEvents === null ? (
            <span className="text-muted-foreground">Not measured yet</span>
          ) : (
            formatEvents(usedEvents)
          )}
          {usage && <span className="text-muted-foreground"> / {formatEvents(usage.included)}</span>}
          {usedEvents !== null && <span className="ml-2 text-sm text-muted-foreground">events</span>}
        </div>
        {usage ? (
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Events used this billing period"
            aria-valuenow={usage.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={cn('h-full rounded-full', TONE_FILL[usage.tone])} style={{ width: `${usage.percent}%` }} />
          </div>
        ) : (
          status.includedEvents === undefined && (
            <p className="mt-2 text-xs text-muted-foreground">This plan has no event limit.</p>
          )
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Counted in UTC and refreshed periodically, so this can lag the events page by up to an hour.
        </p>
        {usage?.tone === 'over' && (
          <p className="mt-1 text-xs text-negative">
            You're over the included events for this plan. Nothing is being dropped — every event is still collected.
          </p>
        )}
      </section>

      {canBrowsePlans && (
        <section>
          <SectionHeader
            title="Plans"
            description={
              liveSubscription
                ? 'Switch tiers from the billing portal — your card and billing date carry over.'
                : 'Changing plans takes effect immediately.'
            }
          />
          {plans === null ? (
            <LoadingSpinner />
          ) : plans.error ? (
            <ListError
              message={plans.error}
              onRetry={() => {
                setPlans(null)
                setPlanAttempt(n => n + 1)
              }}
            />
          ) : (
            <>
              <PlanList
                plans={plans.items}
                currentSlug={status.plan?.slug}
                busySlug={checkingOut}
                readOnly={liveSubscription}
                onSelect={handleSelectPlan}
              />
              {liveSubscription && (
                <PortalButton
                  label="Change plan in the billing portal"
                  busy={openingPortal}
                  onClick={handleOpenPortal}
                />
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

export default Billing
