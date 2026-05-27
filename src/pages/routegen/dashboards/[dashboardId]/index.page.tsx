import { useAtomValue, useSetAtom } from 'jotai'
import { Clock, LayoutGrid, Loader2, MoreHorizontal, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'wouter'
import type { Dashboard } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DateRangePicker, type TimeRange } from '@/components/date-range-picker'
import Page from '@/components/layout/page'
import LoadingSpinner from '@/components/loading-spinner'
import NoProject from '@/components/no-project'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { readTimeGranularityQueryParams, writeTimeGranularityQueryParams } from '@/hooks/use-filter-query-params'
import { INSIGHTS_PRESETS } from '@/lib/date-presets'
import { useProjectNavigate } from '@/lib/project-path'
import { toastRPCError } from '@/lib/rpc-error'
import { GRANULARITIES } from '../../insights/constants'
import { OptionChip } from '../../insights/controls'
import { UNTITLED_DASHBOARD_NAME } from '../constants'
import { deleteDashboardAtom, fetchDashboardAtom, updateDashboardAtom } from '../dashboard.atoms'
import { DashboardDeleteConfirmation, type DashboardDeleteTarget } from '../delete-confirmation'
import { InlineEditableText } from '../editor-shared'
import { DashboardGrid } from '../grid'
import { DashboardEmptyState } from '../tiles'

const GLOBAL_DASHBOARD_GRANULARITIES = [
  { label: 'Select granularity', value: Granularity.UNSPECIFIED },
  ...GRANULARITIES,
] as const

const DAY_MS = 24 * 60 * 60 * 1000

const getAutoGlobalGranularity = (range: TimeRange | undefined) => {
  if (!range) return Granularity.UNSPECIFIED

  const durationMs = Math.max(0, range.to.getTime() - range.from.getTime())
  if (durationMs <= DAY_MS) return Granularity.HOUR
  if (durationMs <= 90 * DAY_MS) return Granularity.DAY
  if (durationMs <= 365 * DAY_MS) return Granularity.WEEK
  return Granularity.MONTH
}

const DashboardDetail = () => {
  const { dashboardId } = useParams<{ dashboardId: string }>()
  const project = useAtomValue(activeProjectAtom)
  const fetchDashboard = useSetAtom(fetchDashboardAtom)
  const deleteDashboard = useSetAtom(deleteDashboardAtom)
  const updateDashboard = useSetAtom(updateDashboardAtom)
  const navigate = useProjectNavigate()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DashboardDeleteTarget | null>(null)
  const [savingDashboard, setSavingDashboard] = useState(false)
  const initialGlobalOverrides = useMemo(() => readTimeGranularityQueryParams(), [])
  const [globalTimeRange, setGlobalTimeRange] = useState<TimeRange | undefined>(() => initialGlobalOverrides.timeRange)
  const [globalGranularity, setGlobalGranularity] = useState(() => {
    if (initialGlobalOverrides.granularity !== undefined) return initialGlobalOverrides.granularity
    return getAutoGlobalGranularity(initialGlobalOverrides.timeRange)
  })

  const tileGranularityOverride = globalGranularity === Granularity.UNSPECIFIED ? undefined : globalGranularity

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
    if (project) {
      loadDashboard()
    }
  }, [loadDashboard, project])

  useEffect(() => {
    setDisplayNameDraft(dashboard?.displayName ?? '')
    setDescriptionDraft(dashboard?.description ?? '')
  }, [dashboard?.description, dashboard?.displayName])

  useEffect(() => {
    writeTimeGranularityQueryParams({ timeRange: globalTimeRange, granularity: globalGranularity })
  }, [globalGranularity, globalTimeRange])

  const persistDashboardMeta = useCallback(async () => {
    if (!dashboard) return

    const nextDisplayName = displayNameDraft.trim()
    const nextDescription = descriptionDraft.trim()
    if (!nextDisplayName) {
      setDisplayNameDraft(dashboard.displayName)
      toastRPCError(new Error('Dashboard name is required'), 'Invalid dashboard')
      return
    }

    if (nextDisplayName === dashboard.displayName && nextDescription === dashboard.description) return

    setSavingDashboard(true)
    try {
      const nextDashboard = await updateDashboard({
        id: dashboard.id,
        displayName: nextDisplayName,
        description: nextDescription,
        defaultTimeRange: dashboard.defaultTimeRange,
        defaultGranularity: dashboard.defaultGranularity,
      })
      if (nextDashboard) setDashboard(nextDashboard)
    } catch (err) {
      setDisplayNameDraft(dashboard.displayName)
      setDescriptionDraft(dashboard.description)
      toastRPCError(err, 'Failed to update dashboard')
    } finally {
      setSavingDashboard(false)
    }
  }, [dashboard, descriptionDraft, displayNameDraft, updateDashboard])

  const handleGlobalTimeRangeChange = useCallback((range: TimeRange | undefined) => {
    setGlobalTimeRange(range)
    setGlobalGranularity(getAutoGlobalGranularity(range))
  }, [])

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

    if (deleteTarget.type === 'tile') {
      // Tile deletion is reintroduced via draft state in Task 24.
      setDeleteTarget(null)
      return
    }

    setSavingDashboard(true)
    try {
      await deleteDashboard(deleteTarget.dashboardId)
      setDeleteTarget(null)
      navigate('/dashboards', { replace: true })
    } catch (err) {
      toastRPCError(err, 'Failed to delete dashboard')
      setSavingDashboard(false)
    }
  }, [dashboard, deleteDashboard, deleteTarget, navigate])

  const handleLayoutsChange = useCallback(() => {
    // No-op — layout persistence reintroduced via draft state in Task 16.
    // Dragging is disabled while editable=false so this should not fire, but
    // keep the prop satisfied so DashboardGrid's typing stays the same.
  }, [])

  const pageActions = useMemo(
    () =>
      dashboard ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DateRangePicker
            value={globalTimeRange}
            onChange={handleGlobalTimeRangeChange}
            presets={INSIGHTS_PRESETS}
            allowUnset
            unsetLabel="Select time"
          />
          <OptionChip
            label="granularity"
            icon={Clock}
            options={GLOBAL_DASHBOARD_GRANULARITIES}
            value={globalGranularity}
            onChange={setGlobalGranularity}
          />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" />}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem variant="destructive" onClick={requestDeleteDashboard} disabled={savingDashboard}>
                <Trash2 className="size-4" />
                Delete dashboard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null,
    [
      dashboard,
      globalGranularity,
      globalTimeRange,
      handleGlobalTimeRangeChange,
      requestDeleteDashboard,
      savingDashboard,
    ],
  )

  const pageHeader = useMemo(
    () => (
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <InlineEditableText
            value={displayNameDraft}
            onChange={setDisplayNameDraft}
            onBlur={persistDashboardMeta}
            placeholder={UNTITLED_DASHBOARD_NAME}
            disabled={savingDashboard}
            className="min-h-12 text-3xl font-semibold tracking-tight outline-hidden"
          />
          <InlineEditableText
            value={descriptionDraft}
            onChange={setDescriptionDraft}
            onBlur={persistDashboardMeta}
            placeholder="Add a short description for what this dashboard tracks"
            disabled={savingDashboard}
            multiline
            className="min-h-8 max-w-3xl text-sm text-muted-foreground outline-hidden"
          />
          {savingDashboard ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Saving dashboard details...
            </div>
          ) : null}
        </div>
        <div className="shrink-0">{pageActions}</div>
      </div>
    ),
    [descriptionDraft, displayNameDraft, pageActions, persistDashboardMeta, savingDashboard],
  )

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

  return (
    <Page title={dashboard.displayName} description={dashboard.description} header={pageHeader}>
      <div ref={pageRef} className="space-y-6">
        {deleteTarget ? (
          <DashboardDeleteConfirmation
            target={deleteTarget}
            deleting={savingDashboard}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleConfirmDelete}
          />
        ) : null}

        {dashboard.tiles.length === 0 ? (
          <div className="space-y-4">
            <DashboardEmptyState title="No tiles yet" description="Editing UI returns in a follow-up commit." />
          </div>
        ) : (
          <DashboardGrid
            tiles={dashboard.tiles}
            pageRef={pageRef}
            mode="view"
            globalTimeRange={globalTimeRange}
            globalGranularity={tileGranularityOverride}
            onLayoutsChange={handleLayoutsChange}
          />
        )}
      </div>
    </Page>
  )
}

export default DashboardDetail
