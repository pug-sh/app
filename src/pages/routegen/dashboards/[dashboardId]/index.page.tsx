import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutGrid } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { trackEvent } from '@/analytics/pug'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { readTimeGranularityQueryParams, writeTimeGranularityQueryParams } from '@/hooks/use-filter-query-params'
import { isDashboardTimeRangePreset, resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { autoGranularity, clampGranularity, clampRange, resolveTileGranularity } from '@/lib/granularity'
import { useProjectNavigate } from '@/lib/project-path'
import { useRouteParams } from '@/lib/route-params'
import { toastRPCError } from '@/lib/rpc-error'
import { UNTITLED_DASHBOARD_NAME } from '../constants'
import { deleteDashboardAtom, fetchDashboardAtom, setDashboardVisibilityAtom } from '../dashboard.atoms'
import { type DashboardDeleteTarget } from '../delete-confirmation'
import { DashboardEmptyState } from '../tiles'
import { DashboardCanvas } from './dashboard-canvas'
import { DashboardHeader } from './dashboard-header'
import { useDashboardEditor } from './use-dashboard-editor'

const DashboardDetail = () => {
  const { dashboardId } = useRouteParams<{ dashboardId: string }>()
  const project = useAtomValue(activeProjectAtom)
  const fetchDashboard = useSetAtom(fetchDashboardAtom)
  const deleteDashboard = useSetAtom(deleteDashboardAtom)
  const setVisibility = useSetAtom(setDashboardVisibilityAtom)
  const navigate = useProjectNavigate()

  // Dashboard data
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    if (!dashboardId) return
    setLoading(true)
    setError(null)
    try {
      const nextDashboard = await fetchDashboard(dashboardId)
      setDashboard(nextDashboard)
    } catch (err) {
      console.error('fetchDashboard failed:', err)
      setError('Failed to load dashboard')
      setDashboard(null)
    } finally {
      setLoading(false)
    }
  }, [dashboardId, fetchDashboard])

  useEffect(() => {
    if (project) loadDashboard()
  }, [loadDashboard, project])

  // "Which dashboard was opened", which page_view can't answer: sanitizeUrl masks the id out of
  // $url (a shared dashboard's id is a bearer credential), so the id has to ride as a property
  // instead. The ref guard fires once per distinct dashboard id, so a refetch or StrictMode's
  // double-effect (same id) is collapsed, while navigating to another dashboard (new id) re-fires —
  // it dedups on the id itself, no remount required.
  const trackedViewRef = useRef<string | null>(null)
  useEffect(() => {
    if (!dashboard || trackedViewRef.current === dashboard.id) return
    trackedViewRef.current = dashboard.id
    trackEvent('dashboard_viewed', { dashboardId: dashboard.id })
  }, [dashboard])

  // Global time + granularity controls, mirrored to the URL query string.
  const initialGlobalOverrides = useMemo(() => readTimeGranularityQueryParams(), [])
  const [globalTimeRange, setGlobalTimeRange] = useState<TimeRange | undefined>(() => initialGlobalOverrides.timeRange)
  const [globalGranularity, setGlobalGranularity] = useState(() => {
    if (initialGlobalOverrides.granularity !== undefined) return initialGlobalOverrides.granularity
    return autoGranularity(initialGlobalOverrides.timeRange)
  })

  useEffect(() => {
    writeTimeGranularityQueryParams({ timeRange: globalTimeRange, granularity: globalGranularity })
  }, [globalGranularity, globalTimeRange])

  // Seed the global range/granularity from the dashboard's saved default the first time it
  // loads — but only when the user didn't arrive with an explicit range in the URL (a
  // shared/bookmarked link wins), and only once per dashboard (so it never clobbers a pick
  // made afterward, including after a save). With no saved default the controls stay empty
  // and each tile falls back to its own range.
  const seededDashboardIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!dashboard || seededDashboardIdRef.current === dashboard.id) return
    seededDashboardIdRef.current = dashboard.id
    if (initialGlobalOverrides.timeRange || !isDashboardTimeRangePreset(dashboard.defaultTimeRange)) return
    const range = resolveDashboardTimeRangePreset(dashboard.defaultTimeRange)
    setGlobalTimeRange(range)
    // Keep a URL granularity if present; else honor the saved default granularity (clamped to
    // the range's cap), else derive it from the range ("Auto").
    if (initialGlobalOverrides.granularity === undefined) {
      setGlobalGranularity(
        dashboard.defaultGranularity === Granularity.UNSPECIFIED
          ? autoGranularity(range)
          : clampGranularity(dashboard.defaultGranularity, range),
      )
    }
  }, [dashboard, initialGlobalOverrides])

  const handleGlobalTimeRangeChange = useCallback((range: TimeRange | undefined) => {
    const clamped = clampRange(range)
    setGlobalTimeRange(clamped)
    setGlobalGranularity(g => clampGranularity(g, clamped))
  }, [])

  // Resolve "Auto" to a concrete granularity before handing it to tiles — otherwise tiles fall back
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

  return (
    <Page title={dashboard.displayName} description={dashboard.description} header={header}>
      <DashboardCanvas
        editor={editor}
        globalTimeRange={globalTimeRange}
        tileGranularityOverride={tileGranularityOverride}
        deleteTarget={deleteTarget}
        deleting={deleting}
        onCancelDelete={() => setDeleteTarget(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </Page>
  )
}

export default DashboardDetail
