import { useAtomValue } from 'jotai'
import { Link } from 'wouter'
import { trackFeature } from '@/analytics/pug'
import { useCan } from '@/auth/can'
import { isDemoSessionAtom } from '@/auth/demo'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { useBilling } from '@/hooks/use-billing'
import { formatEvents, TONE_FILL, TONE_TEXT, usageFor } from '@/lib/billing'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const UsageMeter = ({ href }: { href: string }) => {
  const { setOpenMobile } = useSidebar()
  const isDemo = useAtomValue(isDemoSessionAtom)
  const { status, usedEvents } = useBilling()
  const can = useCan()
  const usage = usageFor(status?.includedEvents, usedEvents)

  // Gated on the same permission as the page it links to, or it links into a redirect.
  if (isDemo || !status?.billingEnabled || !usage || !can('read', 'billing')) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          render={<Link href={href} />}
          // The tooltip portals to document.body, so it carries its own marker — the one on the
          // button below cannot reach it.
          tooltip={{
            children: `${formatEvents(usage.used)} of ${formatEvents(usage.included)} events`,
            render: <div data-pug-no-capture />,
          }}
          className="group-data-[collapsible=icon]:justify-center"
          // Autocapture would otherwise file every click under this org's own usage numbers.
          data-pug-no-capture
          onClick={() => {
            // On mobile the sidebar is a sheet over the page, so a click that commits a page
            // dismisses it — same as every nav link above.
            setOpenMobile(false)
            trackFeature({ featureId: 'billing.meter', featureName: 'Sidebar usage meter' })
          }}
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            <span className={cn('size-2 rounded-full', TONE_FILL[usage.tone])} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Events</span>
              <span className={cn('text-xs tabular-nums', TONE_TEXT[usage.tone])}>
                {compactNumber(usage.used)} / {compactNumber(usage.included)}
              </span>
            </span>
            <span
              className="h-1 w-full overflow-hidden rounded-full bg-sidebar-accent"
              role="progressbar"
              aria-label="Events used this billing period"
              aria-valuenow={usage.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                className={cn('block h-full rounded-full', TONE_FILL[usage.tone])}
                style={{ width: `${usage.percent}%` }}
              />
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export default UsageMeter
