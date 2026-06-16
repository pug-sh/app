import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutGrid } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'wouter'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { readTimeGranularityQueryParams, writeTimeGranularityQueryParams } from '@/hooks/use-filter-query-params'
import { autoGranularity, clampGranularity } from '@/lib/granularity'
import { useProjectNavigate } from '@/lib/project-path'
import { toastRPCError } from '@/lib/rpc-error'
import { UNTITLED_DASHBOARD_NAME } from '../constants'
import { deleteDashboardAtom, fetchDashboardAtom, setDashboardVisibilityAtom } from '../dashboard.atoms'
import { type DashboardDeleteTarget } from '../delete-confirmation'
import { DashboardEmptyState } from '../tiles'
import { DashboardCanvas } from './dashboard-canvas'
import { DashboardHeader } from './dashboard-header'
import { useDashboardEditor } from './use-dashboard-editor'

const DashboardDetail = () => {
  const { dashboardId } = useParams<{ dashboardId: string }>()
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

  const handleGlobalTimeRangeChange = useCallback((range: TimeRange | undefined) => {
    setGlobalTimeRange(range)
    setGlobalGranularity(g => clampGranularity(g, range))
  }, [])

  const tileGranularityOverride = globalGranularity === Granularity.UNSPECIFIED ? undefined : globalGranularity

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
