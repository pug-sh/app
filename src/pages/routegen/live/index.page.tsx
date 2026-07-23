import { useAtomValue } from 'jotai'
import { ChevronDown, ChevronUp, Loader2, Radio, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import HoverSwap from '@/components/hover-swap'
import {
  countKinds,
  countryBreakdown,
  dedupeVisitors,
  describeEvent,
  deviceBreakdown,
  EMPTY_JOURNEY,
  eventIdentity,
  isMobileVisitor,
  LIVE_WINDOW_OPTIONS,
  sessionStats,
} from '@/components/live-map/live-visitors'
import LiveVisitorMap from '@/components/live-map/visitor-map'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { formatRelative } from '@/hooks/use-relative-time'
import { getSeriesColor } from '@/lib/event-colors'
import { structGet } from '@/lib/struct'
import { formatDateTime } from '@/lib/timestamp'
import LiveFilterBar, { type DeviceFilter, WindowToggle } from './live-filter-bar'
import { useLiveEvents } from './use-live-events'
import VisitorRow from './visitor-row'

const LIVE_MAP_VIEWPORT_PADDING = {
  left: 16,
  right: 16,
  top: 76,
  bottom: 16,
}

const LiveDot = () => (
  <span className="relative flex size-2">
    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
    <span className="relative inline-flex size-2 rounded-full bg-success" />
  </span>
)

const windowLabel = (ms: number) => LIVE_WINDOW_OPTIONS.find(o => o.ms === ms)?.label ?? '5m'

// Built once per poll rather than per keystroke: this resolves an identity and an event headline,
// which is dozens of property lookups per visitor, and the search box is not debounced.
const searchHaystack = (visitor: ActivityEvent) => {
  const auto = visitor.autoProperties
  const { kind, detail } = describeEvent(visitor)
  // The full distinct id as well as the label the row shows, so a pasted id still finds its visitor.
  return [
    eventIdentity(visitor).label,
    visitor.distinctId,
    kind,
    detail,
    structGet(auto, '$city'),
    structGet(auto, '$region'),
    structGet(auto, '$country'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const LiveVisitorsPage = () => {
  const project = useAtomValue(activeProjectAtom)
  const { events, loading, error, lastUpdated, windowMs, setWindowMs, arrivals, reload } = useLiveEvents()

  const [selectedDistinctId, setSelectedDistinctId] = useState<string | null>(null)
  // Minimized by default: the map is the page, the panel is the readout on top of it.
  const [collapsed, setCollapsed] = useState(true)
  // The map's popover places itself around this panel rather than under it.
  const panelRef = useRef<HTMLElement>(null)
  const [rowHovered, setRowHovered] = useState<string | null>(null)
  const [mapHovered, setMapHovered] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)

  // Filters
  const [selectedKinds, setSelectedKinds] = useState<ReadonlySet<string>>(() => new Set())
  const [device, setDevice] = useState<DeviceFilter>('all')
  const [country, setCountry] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const allVisitors = useMemo(() => dedupeVisitors(events), [events])
  // Only ever needed for one visitor at a time, so resolve it on demand rather than grouping the
  // whole feed into per-visitor arrays each poll.
  const journeyFor = useCallback((distinctId: string) => events.filter(e => e.distinctId === distinctId), [events])
  const selectedJourney = useMemo(
    () => (selectedDistinctId ? journeyFor(selectedDistinctId) : EMPTY_JOURNEY),
    [journeyFor, selectedDistinctId],
  )
  const stats = useMemo(() => sessionStats(events), [events])
  const kindCounts = useMemo(() => countKinds(allVisitors), [allVisitors])
  const countries = useMemo(() => countryBreakdown(allVisitors), [allVisitors])
  const devices = useMemo(() => deviceBreakdown(allVisitors), [allVisitors])

  const haystacks = useMemo(() => new Map(allVisitors.map(v => [v.distinctId, searchHaystack(v)])), [allVisitors])

  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    return allVisitors.filter(v => {
      if (selectedKinds.size > 0 && !selectedKinds.has(v.kind || 'event')) return false
      const auto = v.autoProperties
      const mobile = isMobileVisitor(auto)
      if (device === 'mobile' && !mobile) return false
      if (device === 'desktop' && mobile) return false
      if (country && structGet(auto, '$country')?.toUpperCase() !== country.toUpperCase()) return false
      if (query && !haystacks.get(v.distinctId)?.includes(query)) return false
      return true
    })
  }, [allVisitors, haystacks, selectedKinds, device, country, query])

  const hasActiveFilters = selectedKinds.size > 0 || device !== 'all' || country !== null || query !== ''

  const syncScrollCue = useCallback(() => {
    const list = listRef.current
    setMoreBelow(!!list && list.scrollHeight - list.scrollTop - list.clientHeight > 8)
  }, [])
  // Coalesced to a frame: the raw handler fires far faster than paint, and it reads layout.
  const scrollFrame = useRef(0)
  const onListScroll = useCallback(() => {
    if (scrollFrame.current) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0
      syncScrollCue()
    })
  }, [syncScrollCue])
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), [])
  useEffect(syncScrollCue, [syncScrollCue, filtered.length, collapsed, selectedDistinctId])

  const clearAll = () => {
    setSelectedKinds(new Set())
    setDevice('all')
    setCountry(null)
    setSearch('')
  }

  const toggleKind = (kind: string) =>
    setSelectedKinds(prev => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  // Selection persists across polls. Snapshot the last-seen event so the focus bar can keep
  // showing a visitor that has since dropped out of the window.
  const selectedVisitor = useMemo(
    () => allVisitors.find(v => v.distinctId === selectedDistinctId) ?? null,
    [allVisitors, selectedDistinctId],
  )
  const selectedSnapshot = useRef<{ kind: string; detail: string } | null>(null)
  useEffect(() => {
    if (selectedVisitor) selectedSnapshot.current = describeEvent(selectedVisitor)
  }, [selectedVisitor])
  const selectedLeft = selectedDistinctId !== null && !selectedVisitor

  // Minimized, the panel is a one-row readout — whoever is pinned, else the most recent activity.
  // Not the hovered marker: that already opens the popover, and following it would strobe.
  const minimizedVisitor = selectedVisitor ?? filtered[0] ?? null

  const select = (id: string) => setSelectedDistinctId(prev => (prev === id ? null : id))

  if (!project) return <NoProject title="Live" icon={Radio} />

  const focus = selectedVisitor ? describeEvent(selectedVisitor) : selectedSnapshot.current
  // Project-scoped profile route for the map popover's "View profile" link. Built here in the
  // React tree because each marker renders in a detached root with no router/project context.
  const profileHref = (distinctId: string) => `/p/${project.id}/profiles/${encodeURIComponent(distinctId)}`

  return (
    <>
      <span className="sr-only">Live</span>
      <div className="absolute inset-0 overflow-hidden bg-muted/10">
        {/* Full-screen states only before the first response. After that the map stays mounted
            across window changes and polls — unmounting it would rebuild the MapLibre instance
            (style, tiles, world fit) from scratch. */}
        {!lastUpdated && !error ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !lastUpdated && error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <LiveVisitorMap
              visitors={filtered}
              selectedDistinctId={selectedDistinctId}
              viewportPadding={LIVE_MAP_VIEWPORT_PADDING}
              onSelectVisitor={select}
              profileHref={profileHref}
              journeyFor={journeyFor}
              highlightedDistinctId={rowHovered}
              onHoverVisitor={setMapHovered}
              avoidRef={panelRef}
            />

            <aside
              ref={panelRef}
              className="absolute bottom-4 left-4 z-10 flex max-h-[min(34rem,calc(100dvh-9rem))] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-background/80 shadow-lg ring-1 ring-border/40 backdrop-blur-md"
            >
              {/* Live count + freshness — the single source of "is this still ticking" */}
              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
                <div className="flex min-w-0 items-center gap-2">
                  <LiveDot />
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-base tabular-nums text-foreground">{filtered.length}</span>
                    {hasActiveFilters && allVisitors.length !== filtered.length && (
                      <span className="text-xs tabular-nums text-faint">of {allVisitors.length}</span>
                    )}
                    {/* Minimized, the chips below take over this label's job — and say it better, since
                        "live now" and a 15m window disagree about what "now" means. */}
                    {!collapsed && <span className="text-sm text-muted-foreground">live now</span>}
                  </span>
                  {arrivals > 0 && <span className="text-xs font-medium text-positive tabular-nums">+{arrivals}</span>}
                  {/* The window rides next to the count it qualifies: 33 is meaningless without it. */}
                  {collapsed && (
                    <span className="shrink-0 pl-0.5">
                      <WindowToggle windowMs={windowMs} onChange={setWindowMs} />
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {loading && <Loader2 className="size-3 animate-spin" />}
                  {lastUpdated && (
                    <HoverSwap
                      primary={`Updated ${formatRelative(lastUpdated)}`}
                      secondary={formatDateTime(lastUpdated)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setCollapsed(c => !c)}
                    aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
                    className="text-faint hover:text-foreground"
                  >
                    {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Journey withheld on purpose: a minimized panel that unfolds when its one visitor
                  happens to be the pinned one isn't minimized. */}
              {collapsed && minimizedVisitor && (
                <ul className="px-2 pb-2">
                  <VisitorRow
                    visitor={minimizedVisitor}
                    journey={EMPTY_JOURNEY}
                    stat={stats.get(minimizedVisitor.distinctId)}
                    selected={minimizedVisitor.distinctId === selectedDistinctId}
                    highlighted={minimizedVisitor.distinctId === mapHovered}
                    onClick={() => select(minimizedVisitor.distinctId)}
                    onHover={setRowHovered}
                  />
                </ul>
              )}

              {!collapsed && (
                <>
                  <LiveFilterBar
                    windowMs={windowMs}
                    onWindowChange={setWindowMs}
                    search={search}
                    onSearchChange={setSearch}
                    kinds={kindCounts}
                    selectedKinds={selectedKinds}
                    onToggleKind={toggleKind}
                    onClearKinds={() => setSelectedKinds(new Set())}
                    device={device}
                    onDeviceChange={setDevice}
                    devices={devices}
                    countries={countries}
                    selectedCountry={country}
                    onCountryChange={setCountry}
                    hasActiveFilters={hasActiveFilters}
                    onClearAll={clearAll}
                  />

                  {selectedDistinctId && focus && (
                    <div className="flex items-center justify-between gap-2 border-b border-border/30 bg-primary/5 px-4 py-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: getSeriesColor(focus.kind).dot }}
                        />
                        <span className="truncate">
                          {selectedLeft ? 'Left · last did ' : 'Focused on '}
                          <span className="font-medium text-foreground">{focus.kind}</span>
                          {focus.detail && <span className="text-muted-foreground"> {focus.detail}</span>}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedDistinctId(null)}
                        className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" /> Reset
                      </button>
                    </div>
                  )}

                  {allVisitors.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
                      No activity in the last {windowLabel(windowMs)}.
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
                      No visitors match these filters.
                      <button type="button" onClick={clearAll} className="text-xs text-primary hover:underline">
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* The ul has to stay the flex child — a wrapper broke the min-h-0/flex-1 chain
                          and collapsed it. */}
                      <ul
                        ref={listRef}
                        onScroll={onListScroll}
                        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2"
                      >
                        {filtered.map(visitor => (
                          <VisitorRow
                            key={visitor.distinctId}
                            visitor={visitor}
                            journey={visitor.distinctId === selectedDistinctId ? selectedJourney : EMPTY_JOURNEY}
                            stat={stats.get(visitor.distinctId)}
                            selected={visitor.distinctId === selectedDistinctId}
                            highlighted={visitor.distinctId === mapHovered}
                            onClick={() => select(visitor.distinctId)}
                            onHover={setRowHovered}
                          />
                        ))}
                      </ul>
                      {/* Zero-height anchor so the fade lands over the last rows without taking part
                          in the flex sizing above it. */}
                      <div className="relative h-0 shrink-0">
                        {moreBelow && (
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background/90 to-transparent" />
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Outside the collapse: a minimized panel still has to say the feed stopped. */}
              {error && <div className="border-t border-border/30 px-4 py-2 text-xs text-negative">{error}</div>}
            </aside>
          </>
        )}
      </div>
    </>
  )
}

export default LiveVisitorsPage
