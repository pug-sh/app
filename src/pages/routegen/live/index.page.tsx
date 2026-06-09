import { create } from '@bufbuild/protobuf'
import { Facehash } from 'facehash'
import { useAtomValue } from 'jotai'
import { Globe, Laptop, Loader2, Monitor, Radio, Smartphone, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EventFilterSchema } from '@/api/genproto/common/v1/filters_pb'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import LiveVisitorMap from '@/components/live-visitor-map'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { formatRelative } from '@/hooks/use-relative-time'
import { LIVE_AVATAR_COLORS } from '@/lib/live-map-markers'
import {
  countryBreakdown,
  dedupeVisitors,
  deviceBreakdown,
  formatCountryName,
  formatPagePath,
  isMobileVisitor,
  LIVE_PAGE_SIZE,
  LIVE_POLL_MS,
  liveTimeRange,
} from '@/lib/live-visitors'
import { structGet } from '@/lib/struct'
import { formatDateTime, toProtoTimeRange, tsToDate } from '@/lib/timestamp'

const LIVE_MAP_VIEWPORT_PADDING = {
  left: 16,
  right: 16,
  top: 76,
  bottom: 16,
}

const LiveDot = () => (
  <span className="relative flex size-2">
    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
  </span>
)

type VisitorRowProps = {
  visitor: ActivityEvent
  selected: boolean
  onClick: () => void
}

const VisitorRow = ({ visitor, selected, onClick }: VisitorRowProps) => {
  const lastSeen = tsToDate(visitor.occurTime)
  const auto = visitor.autoProperties
  const page = formatPagePath(structGet(auto, '$url'))
  const country = structGet(auto, '$country')
  const city = structGet(auto, '$city')
  const region = structGet(auto, '$region')
  const browser = structGet(auto, '$browser')
  const device = structGet(auto, '$device')
  const mobile = isMobileVisitor(auto)
  const DeviceIcon = mobile ? Smartphone : device ? Laptop : Monitor
  const locality = [city, region].filter(Boolean).join(', ')
  const countryName = country ? formatCountryName(country) : null

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`group flex w-full gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
          selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'
        }`}
      >
        <Facehash
          name={visitor.distinctId}
          size={36}
          showInitial={false}
          intensity3d="dramatic"
          interactive={false}
          colors={LIVE_AVATAR_COLORS}
          className="shrink-0 rounded-full ring-1 ring-border/40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{page}</span>
            {lastSeen && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                <HoverSwap primary={formatRelative(lastSeen)} secondary={formatDateTime(lastSeen)} />
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {locality ? (
              <>
                {locality}
                {countryName && <span className="text-muted-foreground/60"> · {countryName}</span>}
              </>
            ) : (
              countryName || '—'
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
            {browser && <span className="truncate">{browser}</span>}
            {browser && <span className="text-muted-foreground/30">·</span>}
            <span className="inline-flex items-center gap-1">
              <DeviceIcon className="size-3 shrink-0" />
              {device || (mobile ? 'Mobile' : 'Desktop')}
            </span>
          </div>
        </div>
      </button>
    </li>
  )
}

const LiveVisitorsPage = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const activityRPC = useAtomValue(activityRPCAtom)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedDistinctId, setSelectedDistinctId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!headers) return
    setError(null)
    try {
      const range = liveTimeRange()
      const resp = await activityRPC.getEventExplorer(
        {
          timeRange: create(TimeRangeSchema, toProtoTimeRange(range)),
          pageSize: LIVE_PAGE_SIZE,
          pageToken: '',
          events: [create(EventFilterSchema, { kind: 'page_view' })],
        },
        { headers },
      )
      setEvents(resp.events)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('activity.getEventExplorer failed:', err)
      setError('Failed to load live visitors')
    } finally {
      setLoading(false)
    }
  }, [activityRPC, headers])

  useEffect(() => {
    if (!project) return
    setLoading(true)
    load()
    const id = window.setInterval(load, LIVE_POLL_MS)
    return () => window.clearInterval(id)
  }, [load, project])

  const allVisitors = useMemo(() => dedupeVisitors(events), [events])
  const visitorCount = allVisitors.length
  const countryCount = useMemo(() => countryBreakdown(allVisitors).length, [allVisitors])
  const devices = useMemo(() => deviceBreakdown(allVisitors), [allVisitors])

  const selectedVisitor = useMemo(
    () => allVisitors.find(v => v.distinctId === selectedDistinctId) ?? null,
    [allVisitors, selectedDistinctId],
  )
  const selectedPage = selectedVisitor ? formatPagePath(structGet(selectedVisitor.autoProperties, '$url')) : null
  const isRefreshing = loading && events.length > 0

  if (!project) return <NoProject title="Live" icon={Radio} />

  return (
    <>
      <span className="sr-only">Live</span>
      <div className="absolute inset-0 overflow-hidden bg-muted/10">
        {loading && events.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error && events.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <LiveVisitorMap
              visitors={allVisitors}
              selectedDistinctId={selectedDistinctId}
              viewportPadding={LIVE_MAP_VIEWPORT_PADDING}
              onSelectVisitor={id => setSelectedDistinctId(prev => (prev === id ? null : id))}
            />

            <aside className="absolute bottom-4 left-4 z-10 flex max-h-[22rem] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-background/80 shadow-lg ring-1 ring-border/40 backdrop-blur-md">
              {/* Live count + freshness — the single source of "is this still ticking" */}
              <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                <div className="flex items-baseline gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <LiveDot />
                    {visitorCount}
                  </span>
                  <span className="text-sm text-muted-foreground">live now</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {isRefreshing && <Loader2 className="size-3 animate-spin" />}
                  {lastUpdated && (
                    <HoverSwap
                      primary={`Updated ${formatRelative(lastUpdated)}`}
                      secondary={formatDateTime(lastUpdated)}
                    />
                  )}
                </div>
              </div>

              {/* Composition strip — at-a-glance device + geo mix */}
              {visitorCount > 0 && (
                <div className="flex items-center gap-4 border-y border-border/30 bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Monitor className="size-3" />
                    {devices.desktop} desktop
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Smartphone className="size-3" />
                    {devices.mobile} mobile
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Globe className="size-3" />
                    {countryCount} {countryCount === 1 ? 'country' : 'countries'}
                  </span>
                </div>
              )}

              {selectedVisitor && (
                <div className="flex items-center justify-between gap-2 border-b border-border/30 bg-primary/5 px-4 py-2">
                  <span className="truncate text-[11px] text-muted-foreground">
                    Focused on <span className="font-medium text-foreground">{selectedPage}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDistinctId(null)}
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" /> Reset
                  </button>
                </div>
              )}

              {allVisitors.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
                  No active visitors right now.
                </div>
              ) : (
                <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
                  {allVisitors.map(visitor => (
                    <VisitorRow
                      key={visitor.distinctId}
                      visitor={visitor}
                      selected={visitor.distinctId === selectedDistinctId}
                      onClick={() =>
                        setSelectedDistinctId(prev => (prev === visitor.distinctId ? null : visitor.distinctId))
                      }
                    />
                  ))}
                </ul>
              )}

              {error && events.length > 0 && (
                <div className="border-t border-border/30 px-4 py-2 text-xs text-destructive">{error}</div>
              )}
            </aside>
          </>
        )}
      </div>
    </>
  )
}

export default LiveVisitorsPage
