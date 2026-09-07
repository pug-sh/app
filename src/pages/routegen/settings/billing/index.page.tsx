import { useAtomValue, useSetAtom } from 'jotai'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useLocation, useSearch } from 'wouter'
import { trackFeature } from '@/analytics/pug'
import { BillingStatus, type PlanOption, SubscriptionStatus } from '@/api/genproto/dashboard/billing/v1/billing_pb'
import { billingRPCAtom } from '@/api/rpc'
import { Can, useCan } from '@/auth/can'
import LoadingSpinner from '@/components/loading-spinner'
import SectionHeader from '@/components/section-header'
import { Badge } from '@/components/ui/badge'
import { confirmCheckoutAtom, loadBillingAtom, pollBillingAfterCheckoutAtom } from '@/data/billing.atoms'
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
import { formatLocalDate, formatUTCDate, tsToDate, validDate } from '@/lib/timestamp'
import { cn } from '@/lib/utils'
import {
  clearCheckoutPending,
  closeCheckoutOverlay,
  markCheckoutPending,
  openCheckoutOverlay,
  takeCheckoutPending,
} from './checkout'
import PlanList from './plan-list'

// Not muted: "we couldn't load this" must not read as "you have none".
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

// Stands in for the bar, which needs both halves — without it a trialing org has no number
// anywhere on the page.
const QuotaNote = ({ includedEvents }: { includedEvents: bigint | undefined }) => (
  <p className="mt-2 text-xs text-muted-foreground">
    {includedEvents === undefined
      ? 'This plan has no event limit.'
      : `${formatEvents(Number(includedEvents))} events included this period.`}
  </p>
)

// `renewsAt` is the provider's next bill, `periodEnd` the quota turnover; they coincide only by
// accident. Only the quota window is a UTC boundary, which is why the formatters differ.
const periodLine = (status: BillingStatus, trialEndsAt: Date | null, renewsAt: Date | null, periodEnd: Date | null) => {
  if (status === BillingStatus.TRIALING && trialEndsAt) return `Trial ends ${formatLocalDate(trialEndsAt)}`
  if (renewsAt) return `Renews ${formatLocalDate(renewsAt)}`
  if (periodEnd) return `Quota resets ${formatUTCDate(periodEnd)}`
  return ''
}

// A denylist: guessing wrong here toasts a failure at someone who just paid.
const FAILED_CHECKOUT_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'expired'])

const Billing = () => {
  const org = useAtomValue(activeOrgAtom)
  const billingRPC = useAtomValue(billingRPCAtom)
  const { status, usedEvents, meterError, error, unsupported, loaded } = useBilling()
  const reloadBilling = useSetAtom(loadBillingAtom)
  const pollAfterCheckout = useSetAtom(pollBillingAfterCheckoutAtom)
  const confirmWithProvider = useSetAtom(confirmCheckoutAtom)
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
  // The catalog goes stale the moment the poll lands a new plan.
  const planKey = billingSignature(status)
  // The read follows the buy button, not the page: an unbuyable catalog has nothing to draw.
  const canBrowsePlans = !!status?.purchasable && can('create', 'billing')

  // Billing off, no billing service, or a role that cannot read it. Any other failure retries below.
  useEffect(() => {
    if (!loaded || !projectId || (error && !unsupported)) return
    if (!enabled || unsupported || !canReadBilling) navigate(`/p/${projectId}/settings/general`, { replace: true })
  }, [loaded, error, unsupported, enabled, canReadBilling, projectId, navigate])

  // An overlay open at unmount means they navigated away mid-checkout, and a left-set flag would
  // toast "still confirming" at someone who never paid. A completed checkout reloads instead.
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

  const confirmCheckout = useCallback(
    async (org: string, before: string, sessionId: string) => {
      try {
        if (await confirmWithProvider(sessionId)) return
      } catch (err) {
        // Paid and unplaceable without a person — "updating shortly" would be false.
        toastRPCError(err, "We couldn't confirm your payment. Please contact support.")
        return
      }
      if (!(await pollAfterCheckout({ orgId: org, before })))
        toast.info('Still confirming your payment. This page will update shortly.')
    },
    [confirmWithProvider, pollAfterCheckout],
  )

  // The provider states the outcome in the query it returns with; unread, a declined card polls for
  // 17.5s and is then told its payment is still confirming.
  useEffect(() => {
    // Both halves below are answered against the org, which has not bootstrapped on first render.
    if (!orgId) return
    const pending = takeCheckoutPending()
    if (pending === null) return
    // Another tab moved the session's org while this one was at the provider: confirming would send
    // the wrong org's id. Put it back, so switching to the org that started it still confirms.
    if (pending.orgId && pending.orgId !== orgId) {
      markCheckoutPending(pending)
      return
    }
    const outcome = new URLSearchParams(search).get('status')?.toLowerCase()
    if (outcome && FAILED_CHECKOUT_STATUSES.has(outcome)) {
      toast.error('Your payment did not go through. Your plan is unchanged.')
      return
    }
    confirmCheckout(orgId, pending.signature, pending.sessionId)
  }, [confirmCheckout, search, orgId])

  const handleSelectPlan = async (plan: PlanOption) => {
    if (!orgId || planKey === null) return
    setCheckingOut(plan.slug)
    try {
      const resp = await billingRPC.createCheckoutSession({ orgId, planSlug: plan.slug })
      trackFeature({ featureId: 'billing.checkout_started', featureName: 'Start checkout' })
      markCheckoutPending({ orgId, signature: planKey, sessionId: resp.sessionId })
      const outcome = await openCheckoutOverlay(resp.checkoutUrl)
      if (outcome.status === 'failed') {
        clearCheckoutPending()
        toast.error(outcome.message)
      } else if (outcome.status === 'closed') {
        clearCheckoutPending()
      } else if (outcome.status === 'redirect') {
        await confirmCheckout(orgId, planKey, resp.sessionId)
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
      // noopener/noreferrer return null even on success, which a blocked popup is indistinguishable
      // from — sever the opener by hand instead.
      const tab = window.open(resp.portalUrl, '_blank')
      if (tab) tab.opener = null
      else window.location.href = resp.portalUrl
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
  // Not a spinner, which would read as still loading; the effect above is already redirecting.
  if (!status?.billingEnabled || !canReadBilling) return null

  const usage = usageFor(status.includedEvents, usedEvents)
  const period = periodLine(
    status.status,
    validDate(tsToDate(status.trialEndsAt)),
    validDate(tsToDate(status.currentPeriodEnd)),
    validDate(tsToDate(status.periodEnd)),
  )
  // The free plan is named after its own state, so the badge would repeat the plan name.
  const badge = statusLabel(status.status) === status.plan?.displayName ? '' : statusLabel(status.status)
  const pastDue = isPastDue(status)
  // The duplicate is only refused at ConfirmCheckout, after the card is charged, so this is what
  // prevents paying twice rather than a mirror of a refusal.
  const liveSubscription = status.manageable && status.subscriptionStatus !== SubscriptionStatus.UNSPECIFIED

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
          {usedEvents === null ? (
            <span className="text-muted-foreground">{meterError ? 'Count unavailable' : 'Not measured yet'}</span>
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
          <QuotaNote includedEvents={status.includedEvents} />
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
