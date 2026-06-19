import { useAtomValue } from 'jotai'
import { ChevronDown, ChevronUp, Loader2, Radio, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import HoverSwap from '@/components/hover-swap'
import LiveVisitorMap from '@/components/live-map/visitor-map'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { formatRelative } from '@/hooks/use-relative-time'
import { getSeriesColor } from '@/lib/event-colors'
import {
  countryBreakdown,
  dedupeVisitors,
  describeEvent,
  deviceBreakdown,
  isMobileVisitor,
  LIVE_WINDOW_OPTIONS,
  latestKindCounts,
} from '@/lib/live-visitors'
import { structGet } from '@/lib/struct'
import { formatDateTime } from '@/lib/timestamp'
import LiveFilterBar, { type DeviceFilter } from './live-filter-bar'
import { useLiveEvents } from './use-live-events'
import VisitorRow from './visitor-row'

// Stable empty journey for unselected rows — avoids a fresh [] allocation per render.
const EMPTY_JOURNEY: ActivityEvent[] = []

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

const windowLabel = (ms: number) => LIVE_WINDOW_OPTIONS.find(o => o.ms === ms)?.label ?? '5m'

const matchesSearch = (visitor: ActivityEvent, query: string) => {
  const auto = visitor.autoProperties
  const { kind, detail } = describeEvent(visitor)
  const haystack = [kind, detail, structGet(auto, '$city'), structGet(auto, '$region'), structGet(auto, '$country')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

const LiveVisitorsPage = () => {
  const project = useAtomValue(activeProjectAtom)
  const { events, loading, error, lastUpdated, windowMs, setWindowMs, arrivals, reload } = useLiveEvents()

  const [selectedDistinctId, setSelectedDistinctId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Filters
  const [selectedKinds, setSelectedKinds] = useState<ReadonlySet<string>>(() => new Set())
  const [device, setDevice] = useState<DeviceFilter>('all')
  const [country, setCountry] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const allVisitors = useMemo(() => dedupeVisitors(events), [events])
  // The journey list only renders for the expanded (selected) row, so build it for that one
  // visitor instead of grouping all events into per-visitor arrays every poll.
  const selectedJourney = useMemo(
    () => (selectedDistinctId ? events.filter(e => e.distinctId === selectedDistinctId) : EMPTY_JOURNEY),
    [events, selectedDistinctId],
  )
  const kindCounts = useMemo(() => latestKindCounts(allVisitors), [allVisitors])
  const countries = useMemo(() => countryBreakdown(allVisitors), [allVisitors])
  const devices = useMemo(() => deviceBreakdown(allVisitors), [allVisitors])

  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    return allVisitors.filter(v => {
      if (selectedKinds.size > 0 && !selectedKinds.has(v.kind || 'event')) return false
      const auto = v.autoProperties
      const mobile = isMobileVisitor(auto)
      if (device === 'mobile' && !mobile) return false
      if (device === 'desktop' && mobile) return false
      if (country && structGet(auto, '$country')?.toUpperCase() !== country.toUpperCase()) return false
      if (query && !matchesSearch(v, query)) return false
      return true
    })
  }, [allVisitors, selectedKinds, device, country, query])

  const hasActiveFilters = selectedKinds.size > 0 || device !== 'all' || country !== null || query !== ''

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

  const select = (id: string) => setSelectedDistinctId(prev => (prev === id ? null : id))

  if (!project) return <NoProject title="Live" icon={Radio} />

  const focus = selectedVisitor ? describeEvent(selectedVisitor) : selectedSnapshot.current

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
            />

            <aside className="absolute bottom-4 left-4 z-10 flex max-h-[26rem] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-background/80 shadow-lg ring-1 ring-border/40 backdrop-blur-md">
              {/* Live count + freshness — the single source of "is this still ticking" */}
              <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                <div className="flex items-baseline gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <LiveDot />
                    {filtered.length}
                    {hasActiveFilters && allVisitors.length !== filtered.length && (
                      <span className="font-normal text-muted-foreground"> / {allVisitors.length}</span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">live now</span>
                  {arrivals > 0 && (
                    <span className="text-[11px] font-medium text-emerald-500 tabular-nums">+{arrivals}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
                    className="text-muted-foreground/70 hover:text-foreground"
                  >
                    {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                </div>
              </div>

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
                      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
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
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
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
                    <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
                      {filtered.map(visitor => (
                        <VisitorRow
                          key={visitor.distinctId}
                          visitor={visitor}
                          journey={visitor.distinctId === selectedDistinctId ? selectedJourney : EMPTY_JOURNEY}
                          selected={visitor.distinctId === selectedDistinctId}
                          onClick={() => select(visitor.distinctId)}
                        />
                      ))}
                    </ul>
                  )}

                  {error && <div className="border-t border-border/30 px-4 py-2 text-xs text-destructive">{error}</div>}
                </>
              )}
            </aside>
          </>
        )}
      </div>
    </>
  )
}

export default LiveVisitorsPage
