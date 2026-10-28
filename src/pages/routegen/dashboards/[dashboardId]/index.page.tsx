import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutGrid } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trackEvent, trackFeature } from '@/analytics/pug'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import type { ActiveFilter } from '@/components/event-filters/filter-model'
import { filterViolation } from '@/components/event-filters/filter-validation'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { activeProjectAtom } from '@/data/workspace.atoms'
import {
  readPropFiltersParam,
  readTimeGranularityQueryParams,
  writePropFiltersParam,
  writeTimeGranularityQueryParams,
} from '@/hooks/use-filter-query-params'
import { isDashboardTimeRangePreset, resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { autoGranularity, clampGranularity, clampRange, resolveTileGranularity } from '@/lib/granularity'
import { useProjectNavigate } from '@/lib/project-path'
import { useRouteParams } from '@/lib/route-params'
import { toastRPCError } from '@/lib/rpc-error'
import { UNTITLED_DASHBOARD_NAME } from '../constants'
import { deleteDashboardAtom, fetchDashboardAtom, setDashboardVisibilityAtom } from '../dashboard.atoms'
import { DashboardFilterBar } from '../dashboard-filter-bar'
import { type DashboardDeleteTarget } from '../delete-confirmation'
import { DashboardEmptyState } from '../tiles'
import { DashboardCanvas } from './dashboard-canvas'
import { DashboardHeader } from './dashboard-header'
import { useDashboardEditor } from './use-dashboard-editor'

// "Auto" derives from the range; an explicit saved pick is clamped to that range's cap. The two
// helpers use deliberately different ladders, so this must not collapse into one call.
const resolveDefaultGranularity = (dashboard: Dashboard, range: TimeRange) => {
  if (dashboard.defaultGranularity === Granularity.UNSPECIFIED) return autoGranularity(range)
  return clampGranularity(dashboard.defaultGranularity, range)
}

const DashboardDetail = () => {
  const { dashboardId } = useRouteParams<{ dashboardId: string }>()
  const project = useAtomValue(activeProjectAtom)
  const fetchDashboard = useSetAtom(fetchDashboardAtom)
  const deleteDashboard = useSetAtom(deleteDashboardAtom)
  const setVisibility = useSetAtom(setDashboardVisibilityAtom)
  const navigate = useProjectNavigate()

  // Global time and granularity controls, mirrored to the URL query string.
  const initialGlobalOverrides = useMemo(() => readTimeGranularityQueryParams(), [])
  const [globalTimeRange, setGlobalTimeRange] = useState<TimeRange | undefined>(() => initialGlobalOverrides.timeRange)
  const [globalGranularity, setGlobalGranularity] = useState(() => {
    if (initialGlobalOverrides.granularity !== undefined) return initialGlobalOverrides.granularity
    return autoGranularity(initialGlobalOverrides.timeRange)
  })

  useEffect(() => {
    writeTimeGranularityQueryParams({ timeRange: globalTimeRange, granularity: globalGranularity })
  }, [globalGranularity, globalTimeRange])

  // Dashboard data
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed the global range/granularity from the dashboard's saved default the first time it
  // loads, but only when the user didn't arrive with an explicit range in the URL (a
  // shared/bookmarked link wins), and only once per dashboard (so it never clobbers a pick
  // made afterward, including after a save). With no saved default the controls stay empty
  // and each tile falls back to its own range.
  const seededDashboardIdRef = useRef<string | null>(null)
  const seedGlobalControls = useCallback(
    (loaded: Dashboard) => {
      if (seededDashboardIdRef.current === loaded.id) return
      seededDashboardIdRef.current = loaded.id
      if (initialGlobalOverrides.timeRange || !isDashboardTimeRangePreset(loaded.defaultTimeRange)) return
      const range = resolveDashboardTimeRangePreset(loaded.defaultTimeRange)
      setGlobalTimeRange(range)
      // Keep a URL granularity if present; else honor the saved default granularity (clamped to
      // the range's cap), else derive it from the range ("Auto").
      if (initialGlobalOverrides.granularity === undefined) {
        setGlobalGranularity(resolveDefaultGranularity(loaded, range))
      }
    },
    [initialGlobalOverrides],
  )

  const loadDashboard = useCallback(async () => {
    if (!dashboardId) return
    setLoading(true)
    setError(null)
    try {
      const nextDashboard = await fetchDashboard(dashboardId)
      // Batched with setDashboard: seeding after the tiles mounted made every tile query twice.
      if (nextDashboard) seedGlobalControls(nextDashboard)
      setDashboard(nextDashboard)
    } catch (err) {
      console.error('fetchDashboard failed:', err)
      setError('Failed to load dashboard')
      setDashboard(null)
    } finally {
      setLoading(false)
    }
  }, [dashboardId, fetchDashboard, seedGlobalControls])

  useEffect(() => {
    if (project) loadDashboard()
  }, [loadDashboard, project])

  // page_view can't say which dashboard was opened (sanitizeUrl masks the id out of $url), so the id
  // rides as a property. The ref keeps a refetch or a save from sending it again.
  const trackedViewRef = useRef<string | null>(null)
  useEffect(() => {
    if (!dashboard || trackedViewRef.current === dashboard.id) return
    trackedViewRef.current = dashboard.id
    trackEvent('dashboard_viewed', { dashboardId: dashboard.id })
  }, [dashboard])

  // Global filters, mirrored to the URL query string.
  const [restoredFilters] = useState(() => {
    const { filters, dropped } = readPropFiltersParam()
    const violations = filters.map(filterViolation)
    return {
      filters: filters.filter((_, i) => !violations[i]),
      dropped,
      refused: filters.flatMap((filter, i) => (violations[i] ? [`${filter.property}: ${violations[i]}`] : [])),
    }
  })
  const [globalFilters, setGlobalFilters] = useState(restoredFilters.filters)
  useEffect(() => {
    const { dropped, refused } = restoredFilters
    if (dropped + refused.length > 0) {
      toast.warning('Could not restore some dashboard filters from URL', {
        id: 'dashboard-filter-parse-warning',
        description: refused.join('. ') || undefined,
      })
    }
  }, [restoredFilters])
  useEffect(() => {
    writePropFiltersParam(globalFilters)
  }, [globalFilters])
  const handleGlobalFiltersChange = (filters: ActiveFilter[]) => {
    // An emptied in chip is a removal; any other filter that can't run is refused, keeping the one it replaced.
    const next = filters.filter(filter => filter.kind !== 'multi' || filter.values.length > 0)
    for (const filter of next) {
      const violation = filterViolation(filter)
      if (violation) {
        toast.error(`Could not apply the ${filter.property} filter`, { description: violation })
        return
      }
    }
    if (next.length > globalFilters.length) {
      trackFeature({ featureId: 'dashboard.filters', featureName: 'Dashboard filters' })
    }
    setGlobalFilters(next)
  }

  // Clearing the range restores the dashboard's saved default. The seed above only runs once
  // per id, so without this tiles drop to the hardcoded 7-day fallback and never come back.
  const handleGlobalTimeRangeChange = useCallback(
    (range: TimeRange | undefined) => {
      if (!range && dashboard && isDashboardTimeRangePreset(dashboard.defaultTimeRange)) {
        const restored = resolveDashboardTimeRangePreset(dashboard.defaultTimeRange)
        setGlobalTimeRange(restored)
        setGlobalGranularity(resolveDefaultGranularity(dashboard, restored))
        return
      }
      const clamped = clampRange(range)
      setGlobalTimeRange(clamped)
      setGlobalGranularity(g => clampGranularity(g, clamped))
    },
    [dashboard],
  )

  // Resolve "Auto" to a concrete granularity before handing it to tiles; otherwise tiles fall back
  // to their own saved granularity against the global range, which may exceed its cap.
  const tileGranularityOverride = resolveTileGranularity(globalGranularity, globalTimeRange)

  // Edit/draft state machine (selection, tile mutations, save/discard/resume).
  const editor = useDashboardEditor({ dashboardId, dashboard, setDashboard })

  // Sharing flow (view-mode only; operates on the saved dashboard, not the draft).
  const [sharing, setSharing] = useState(false)

  const handleTogglePublic = useCallback(
    async (next: boolean) => {
      if (!dashboard) return
      setSharing(true)
      try {
        setDashboard(await setVisibility({ dashboard, isPublic: next }))
      } catch (err) {
        toastRPCError(err, 'Failed to update sharing')
      } finally {
        setSharing(false)
      }
    },
    [dashboard, setVisibility],
  )

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState<DashboardDeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)

  const requestDeleteDashboard = useCallback(() => {
    if (!dashboard) return
    setDeleteTarget({
      type: 'dashboard',
      dashboardId: dashboard.id,
      displayName: dashboard.displayName || UNTITLED_DASHBOARD_NAME,
    })
  }, [dashboard])

  const handleConfirmDelete = useCallback(async () => {
    if (!dashboard || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteDashboard(deleteTarget.dashboardId)
      setDeleteTarget(null)
      navigate('/dashboards', { replace: true })
    } catch (err) {
      toastRPCError(err, 'Failed to delete dashboard')
      setDeleting(false)
    }
  }, [dashboard, deleteDashboard, deleteTarget, navigate])

  if (!project) return <NoProject title="Dashboards" icon={LayoutGrid} />

  if (loading) {
    return (
      <Page title="Dashboards" description="Loading dashboard">
        <LoadingSpinner />
      </Page>
    )
  }

  if (error) {
    return (
      <Page title="Dashboards" description="Dashboard unavailable">
        <DashboardEmptyState title={error} description="Try reloading this dashboard." />
      </Page>
    )
  }

  if (!dashboard) {
    return (
      <Page title="Dashboards" description="Dashboard unavailable">
        <DashboardEmptyState title="Dashboard not found" description="This dashboard may have been removed." />
      </Page>
    )
  }

  const header = (
    <DashboardHeader
      dashboard={dashboard}
      editing={editor.mode === 'edit'}
      meta={editor.effectiveDashboard}
      autoFocusName={editor.autoFocusName}
      onPatchMeta={editor.patchDraftMeta}
      globalTimeRange={globalTimeRange}
      globalGranularity={globalGranularity}
      onTimeRangeChange={handleGlobalTimeRangeChange}
      onGranularityChange={setGlobalGranularity}
      onEdit={() => editor.enterEditMode()}
      onRequestDelete={requestDeleteDashboard}
      deleting={deleting}
      shareId={dashboard.shareId}
      sharing={sharing}
      onTogglePublic={handleTogglePublic}
    />
  )

  const tiles = editor.effectiveDashboard?.tiles ?? []

  return (
    <Page title={dashboard.displayName} description={dashboard.description} header={header}>
      {tiles.some(tile => tile.content.case === 'insight') ? (
        <DashboardFilterBar tiles={tiles} filters={globalFilters} onChange={handleGlobalFiltersChange} />
      ) : null}
      <DashboardCanvas
        editor={editor}
        globalTimeRange={globalTimeRange}
        tileGranularityOverride={tileGranularityOverride}
        globalFilters={globalFilters}
        deleteTarget={deleteTarget}
        deleting={deleting}
        onCancelDelete={() => setDeleteTarget(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </Page>
  )
}

const DashboardDetailRoute = () => {
  const { dashboardId } = useRouteParams<{ dashboardId: string }>()
  return <DashboardDetail key={dashboardId} />
}

export default DashboardDetailRoute
