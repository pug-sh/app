import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Clock, Edit3, LayoutGrid, Loader2, MoreHorizontal, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'wouter'
import type { Dashboard, DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
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
import { deleteDashboardAtom, fetchDashboardAtom, updateDashboardAtom, upsertDashboardAtom } from '../dashboard.atoms'
import { DashboardDeleteConfirmation, type DashboardDeleteTarget } from '../delete-confirmation'
import { cloneForDraft } from '../draft-state'
import { clearDraftKey, draftAtomFamily } from '../draft-storage'
import { InlineEditableText } from '../editor-shared'
import { DashboardGrid } from '../grid'
import { DashboardEmptyState } from '../tiles'
import { buildUpsertRequest } from '../upsert-dashboard'

const GLOBAL_DASHBOARD_GRANULARITIES = [
  { label: 'Select granularity', value: Granularity.UNSPECIFIED },
  ...GRANULARITIES,
] as const

const DAY_MS = 24 * 60 * 60 * 1000

// Loose tile equality: proto JSON serialization is stable enough for a dirty
// count surface (not a security-sensitive equality check).
const tilesEqual = (a: DashboardTile, b: DashboardTile): boolean => JSON.stringify(a) === JSON.stringify(b)

const countChanges = (a: Dashboard, b: Dashboard): number => {
  let count = 0
  if (a.displayName !== b.displayName) count++
  if (a.description !== b.description) count++

  const aById = new Map(a.tiles.map(tile => [tile.id, tile]))
  const bById = new Map(b.tiles.map(tile => [tile.id, tile]))
  for (const id of new Set([...aById.keys(), ...bById.keys()])) {
    const left = aById.get(id)
    const right = bById.get(id)
    if (!left || !right) {
      count++
      continue
    }
    if (!tilesEqual(left, right)) count++
  }
  return count
}

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
  const upsertDashboard = useSetAtom(upsertDashboardAtom)
  const [saving, setSaving] = useState(false)
  const navigate = useProjectNavigate()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  // Edit-mode state: 'view' vs 'edit', the selected tile (for the side panel
  // in a later task), and the localStorage-backed draft for this dashboard.
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const draftAtom = useMemo(() => draftAtomFamily(dashboardId ?? '__no-dashboard__'), [dashboardId])
  const [storedDraft, setStoredDraft] = useAtom(draftAtom)
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

  const enterEditMode = useCallback(() => {
    if (!dashboard) return
    setStoredDraft({
      draft: cloneForDraft(dashboard),
      viewSnapshot: cloneForDraft(dashboard),
      startedAt: Date.now(),
    })
    setMode('edit')
    setSelectedTileId(dashboard.tiles[0]?.id ?? null)
  }, [dashboard, setStoredDraft])

  const exitEditMode = useCallback(() => {
    if (!dashboardId) return
    setStoredDraft(null)
    clearDraftKey(dashboardId)
    setMode('view')
    setSelectedTileId(null)
  }, [dashboardId, setStoredDraft])

  const effectiveDashboard = mode === 'edit' && storedDraft ? storedDraft.draft : dashboard

  const dirtyCount = useMemo(() => {
    if (!storedDraft) return 0
    return countChanges(storedDraft.viewSnapshot, storedDraft.draft)
  }, [storedDraft])

  const handleSave = useCallback(async () => {
    if (!storedDraft || !dashboardId) return
    setSaving(true)
    try {
      const response = await upsertDashboard(buildUpsertRequest(storedDraft.draft))
      if (response) setDashboard(response)
      setStoredDraft(null)
      clearDraftKey(dashboardId)
      setMode('view')
      setSelectedTileId(null)
    } catch (err) {
      toastRPCError(err, 'Failed to save dashboard')
    } finally {
      setSaving(false)
    }
  }, [dashboardId, setStoredDraft, storedDraft, upsertDashboard])

  const handleDiscard = useCallback(() => {
    exitEditMode()
  }, [exitEditMode])

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
          {mode === 'view' ? (
            <Button size="sm" variant="outline" onClick={enterEditMode}>
              <Edit3 className="size-4" />
              Edit
            </Button>
          ) : (
            <>
              <span className="text-muted-foreground text-xs">
                {dirtyCount} {dirtyCount === 1 ? 'change' : 'changes'}
              </span>
              <Button size="sm" variant="ghost" onClick={handleDiscard} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || dirtyCount === 0}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          )}
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
      dirtyCount,
      enterEditMode,
      globalGranularity,
      globalTimeRange,
      handleDiscard,
      handleGlobalTimeRangeChange,
      handleSave,
      mode,
      requestDeleteDashboard,
      saving,
      savingDashboard,
    ],
  )

  const pageHeader = useMemo(
    () => (
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <InlineEditableText
              value={displayNameDraft}
              onChange={setDisplayNameDraft}
              onBlur={persistDashboardMeta}
              placeholder={UNTITLED_DASHBOARD_NAME}
              disabled={savingDashboard || mode === 'edit'}
              className="min-h-12 flex-1 text-3xl font-semibold tracking-tight outline-hidden"
            />
            {mode === 'edit' ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-[10px] text-amber-900 uppercase tracking-wider">
                Editing
              </span>
            ) : null}
          </div>
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

        {effectiveDashboard && effectiveDashboard.tiles.length === 0 ? (
          <div className="space-y-4">
            <DashboardEmptyState title="No tiles yet" description="Add a tile from the toolbar after clicking Edit." />
          </div>
        ) : (
          <DashboardGrid
            tiles={effectiveDashboard?.tiles ?? []}
            pageRef={pageRef}
            mode={mode}
            selectedTileId={selectedTileId}
            globalTimeRange={globalTimeRange}
            globalGranularity={tileGranularityOverride}
            onLayoutsChange={handleLayoutsChange}
            onSelectTile={mode === 'edit' ? setSelectedTileId : undefined}
          />
        )}
      </div>
    </Page>
  )
}

export default DashboardDetail
