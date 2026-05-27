import { create, equals } from '@bufbuild/protobuf'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Clock, Edit3, LayoutGrid, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'wouter'
import {
  type Dashboard,
  DashboardSchema,
  type DashboardTile,
  DashboardTileSchema,
  ResponsiveGridLayoutSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
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
import { TILE_MIN_H, TILE_MIN_W, UNTITLED_DASHBOARD_NAME } from '../constants'
import { deleteDashboardAtom, fetchDashboardAtom, updateDashboardAtom, upsertDashboardAtom } from '../dashboard.atoms'
import { DashboardDeleteConfirmation, type DashboardDeleteTarget } from '../delete-confirmation'
import { appendDraftTile, cloneForDraft, patchTile, removeDraftTile } from '../draft-state'
import { clearDraftKey, draftAtomFamily } from '../draft-storage'
import { buildDuplicateTileInput } from '../duplicate-tile'
import { InlineEditableText } from '../editor-shared'
import { DashboardGrid, type DashboardLayouts } from '../grid'
import { TemplatePicker } from '../template-picker'
import { TileConfigPanel } from '../tile-config-panel'
import { DashboardEmptyState } from '../tiles'
import { buildUpsertRequest } from '../upsert-dashboard'

const GLOBAL_DASHBOARD_GRANULARITIES = [
  { label: 'Select granularity', value: Granularity.UNSPECIFIED },
  ...GRANULARITIES,
] as const

const DAY_MS = 24 * 60 * 60 * 1000

const formatRelative = (ts: number): string => {
  const elapsed = Date.now() - ts
  const minutes = Math.round(elapsed / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

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
    if (!equals(DashboardTileSchema, left, right)) count++
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
  const [showPicker, setShowPicker] = useState(false)
  const navigate = useProjectNavigate()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
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
      setDashboard(response)
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

  // viewSnapshot equal to current dashboard → safe resume; otherwise the
  // dashboard changed externally and we surface a conflict prompt.
  const resumeBanner = useMemo<'none' | 'resume' | 'conflict'>(() => {
    if (mode !== 'view' || !dashboard || !storedDraft) return 'none'
    return equals(DashboardSchema, storedDraft.viewSnapshot, dashboard) ? 'resume' : 'conflict'
  }, [dashboard, mode, storedDraft])

  const resumeEditing = useCallback(() => {
    if (!storedDraft) return
    setMode('edit')
    setSelectedTileId(storedDraft.draft.tiles[0]?.id ?? null)
  }, [storedDraft])

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

  const handleLayoutsChange = useCallback(
    (layouts: DashboardLayouts) => {
      if (mode !== 'edit' || !storedDraft) return
      // Apply each breakpoint's layout items back onto the matching tile in the draft.
      let next = storedDraft.draft
      for (const breakpoint of Object.keys(layouts) as Array<keyof typeof layouts>) {
        const items = layouts[breakpoint]
        if (!items) continue
        for (const item of items) {
          const id = item.i as string
          const tile = next.tiles.find(t => t.id === id)
          if (!tile) continue
          const otherLayouts = tile.layouts.filter(l => l.breakpoint !== breakpoint)
          const updatedLayout = create(ResponsiveGridLayoutSchema, {
            breakpoint: breakpoint as string,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            minW: item.minW ?? TILE_MIN_W,
            maxW: item.maxW ?? 0,
            minH: item.minH ?? TILE_MIN_H,
            maxH: item.maxH ?? 0,
            static: item.static ?? false,
          })
          next = patchTile(next, id, { layouts: [...otherLayouts, updatedLayout] })
        }
      }
      setStoredDraft({ ...storedDraft, draft: next })
    },
    [mode, setStoredDraft, storedDraft],
  )

  const selectedTile = useMemo(() => {
    if (mode !== 'edit' || !storedDraft) return null
    return storedDraft.draft.tiles.find(tile => tile.id === selectedTileId) ?? null
  }, [mode, selectedTileId, storedDraft])

  const patchSelectedTile = useCallback(
    (patch: Partial<DashboardTile>) => {
      if (!storedDraft || !selectedTileId) return
      setStoredDraft({ ...storedDraft, draft: patchTile(storedDraft.draft, selectedTileId, patch) })
    },
    [selectedTileId, setStoredDraft, storedDraft],
  )

  const removeSelectedTile = useCallback(() => {
    if (!storedDraft || !selectedTileId) return
    setStoredDraft({ ...storedDraft, draft: removeDraftTile(storedDraft.draft, selectedTileId) })
    setSelectedTileId(null)
  }, [selectedTileId, setStoredDraft, storedDraft])

  const duplicateSelectedTile = useCallback(() => {
    if (!storedDraft || !selectedTile) return
    const input = buildDuplicateTileInput(selectedTile)
    const nextDraft = appendDraftTile(storedDraft.draft, input)
    setStoredDraft({ ...storedDraft, draft: nextDraft })
  }, [selectedTile, setStoredDraft, storedDraft])

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
              <Button size="sm" variant="outline" onClick={() => setShowPicker(prev => !prev)}>
                <Plus className="size-4" />
                Add
              </Button>
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

  const handleSelectTemplate = useCallback(
    (template: { build: () => Parameters<typeof appendDraftTile>[1] }) => {
      if (!storedDraft) return
      const tileInput = template.build()
      const nextDraft = appendDraftTile(storedDraft.draft, tileInput)
      setStoredDraft({ ...storedDraft, draft: nextDraft })
      setShowPicker(false)
      setSelectedTileId(nextDraft.tiles[nextDraft.tiles.length - 1]?.id ?? null)
    },
    [setStoredDraft, storedDraft],
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
        {resumeBanner !== 'none' && storedDraft ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium text-amber-900">
                {resumeBanner === 'resume' ? 'Resume editing' : 'Dashboard changed since you started'}
              </span>
              <span className="ml-2 text-amber-700">started {formatRelative(storedDraft.startedAt)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="ghost" onClick={handleDiscard}>
                Discard
              </Button>
              <Button size="sm" onClick={resumeEditing}>
                {resumeBanner === 'resume' ? 'Resume' : 'Resume anyway'}
              </Button>
            </div>
          </div>
        ) : null}

        {mode === 'edit' && showPicker ? (
          <TemplatePicker onClose={() => setShowPicker(false)} onSelect={handleSelectTemplate} />
        ) : null}

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
          <div className="flex min-h-0 gap-4">
            <div className="min-w-0 flex-1">
              <DashboardGrid
                tiles={effectiveDashboard?.tiles ?? []}
                pageRef={pageRef}
                mode={mode}
                selectedTileId={selectedTileId}
                globalTimeRange={globalTimeRange}
                globalGranularity={tileGranularityOverride}
                onLayoutsChange={handleLayoutsChange}
                onSelectTile={mode === 'edit' ? setSelectedTileId : undefined}
                onDuplicateTile={
                  mode === 'edit'
                    ? tile => {
                        if (!storedDraft) return
                        const input = buildDuplicateTileInput(tile)
                        setStoredDraft({ ...storedDraft, draft: appendDraftTile(storedDraft.draft, input) })
                      }
                    : undefined
                }
              />
            </div>
            {mode === 'edit' && selectedTile ? (
              <TileConfigPanel
                key={selectedTile.id}
                tile={selectedTile}
                onClose={() => setSelectedTileId(null)}
                onPatch={patchSelectedTile}
                onDelete={removeSelectedTile}
                onDuplicate={duplicateSelectedTile}
              />
            ) : null}
          </div>
        )}
      </div>
    </Page>
  )
}

export default DashboardDetail
