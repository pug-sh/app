import { create } from '@bufbuild/protobuf'
import { useAtomValue, useSetAtom } from 'jotai'
import { BarChart3, Clock, FileText, LayoutGrid, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ResponsiveLayouts } from 'react-grid-layout/legacy'
import { useParams } from 'wouter'
import {
  type Dashboard,
  DashboardsServiceCreateTileRequestSchema,
  DashboardTileViewMode,
  MarkdownTileContentSchema,
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
import { DEFAULT_DASHBOARD_TIME_RANGE_PRESET, INSIGHTS_PRESETS } from '@/lib/date-presets'
import { useProjectNavigate } from '@/lib/project-path'
import { toastRPCError } from '@/lib/rpc-error'
import { GRANULARITIES } from '../../insights/constants'
import { OptionChip } from '../../insights/controls'
import { UNTITLED_DASHBOARD_NAME } from '../constants'
import { createInsightTile, createMarkdownTile } from '../create-tile-actions'
import {
  appendDashboardTile,
  createDashboardTileAtom,
  deleteDashboardAtom,
  deleteDashboardTileAtom,
  fetchDashboardAtom,
  removeDashboardTile,
  updateDashboardAtom,
  updateDashboardTileAtom,
} from '../dashboard.atoms'
import { DashboardDeleteConfirmation, type DashboardDeleteTarget } from '../delete-confirmation'
import { InlineEditableText } from '../editor-shared'
import { buildCreatedTileLayouts, DashboardGrid } from '../grid'
import { DashboardTileEditor } from '../tile-editor'
import { DashboardEmptyState } from '../tiles'
import type { EditorState, InsightTileInput, MarkdownTileInput } from '../types'
import { persistTileLayouts, updateInsightTile, updateMarkdownTile } from '../update-tile-actions'

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
  const createTile = useSetAtom(createDashboardTileAtom)
  const deleteDashboard = useSetAtom(deleteDashboardAtom)
  const deleteTile = useSetAtom(deleteDashboardTileAtom)
  const updateDashboard = useSetAtom(updateDashboardAtom)
  const updateTile = useSetAtom(updateDashboardTileAtom)
  const navigate = useProjectNavigate()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const dashboardRef = useRef<Dashboard | null>(null)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DashboardDeleteTarget | null>(null)
  const [savingDashboard, setSavingDashboard] = useState(false)
  const [savingTile, setSavingTile] = useState(false)
  const initialGlobalOverrides = useMemo(() => readTimeGranularityQueryParams(), [])
  const [globalTimeRange, setGlobalTimeRange] = useState<TimeRange | undefined>(() => initialGlobalOverrides.timeRange)
  const [globalGranularity, setGlobalGranularity] = useState(() => {
    if (initialGlobalOverrides.granularity !== undefined) return initialGlobalOverrides.granularity
    return getAutoGlobalGranularity(initialGlobalOverrides.timeRange)
  })
  dashboardRef.current = dashboard

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

  const handleCreateInsight = async (input: InsightTileInput) => {
    if (!dashboard) return
    await createInsightTile({ dashboard, createTile, setDashboard, setEditor, setSavingTile, input })
  }

  const handleCreateMarkdown = async (input: MarkdownTileInput) => {
    if (!dashboard) return
    await createMarkdownTile({ dashboard, createTile, setDashboard, setEditor, setSavingTile, input })
  }

  const handleAddTextNote = async () => {
    if (!dashboard) return

    setSavingTile(true)
    try {
      const tile = await createTile(
        create(DashboardsServiceCreateTileRequestSchema, {
          dashboardId: dashboard.id,
          displayName: 'Text note',
          description: '',
          content: {
            case: 'markdown',
            value: create(MarkdownTileContentSchema, { body: 'Write a note' }),
          },
          layouts: buildCreatedTileLayouts(dashboard.tiles, 'markdown'),
          viewMode: DashboardTileViewMode.UNSPECIFIED,
          defaultTimeRange: DEFAULT_DASHBOARD_TIME_RANGE_PRESET,
        }),
      )
      if (tile) {
        setDashboard(current => (current ? appendDashboardTile(current, tile) : current))
        setEditor({ kind: 'edit', tile })
      }
    } catch (err) {
      toastRPCError(err, 'Failed to add text note')
    } finally {
      setSavingTile(false)
    }
  }

  const handleUpdateInsight = async (input: InsightTileInput) => {
    if (!dashboard || editor?.kind !== 'edit') return
    await updateInsightTile({ dashboard, editor, updateTile, setDashboard, setEditor, setSavingTile, input })
  }

  const handleUpdateMarkdown = async (input: MarkdownTileInput) => {
    if (!dashboard || editor?.kind !== 'edit') return
    await updateMarkdownTile({ dashboard, editor, updateTile, setDashboard, setSavingTile, input })
  }

  const handleLayoutsChange = async (layouts: ResponsiveLayouts<string>) => {
    const currentDashboard = dashboardRef.current
    if (!currentDashboard) return
    await persistTileLayouts({ dashboard: currentDashboard, layouts, updateTile, setDashboard })
  }

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
      setSavingTile(true)
      try {
        await deleteTile({
          id: deleteTarget.tileId,
          dashboardId: dashboard.id,
        })
        setDashboard(current => (current ? removeDashboardTile(current, deleteTarget.tileId) : current))
        setEditor(current => (current?.kind === 'edit' && current.tile.id === deleteTarget.tileId ? null : current))
        setDeleteTarget(null)
      } catch (err) {
        toastRPCError(err, 'Failed to delete tile')
      } finally {
        setSavingTile(false)
      }
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
  }, [dashboard, deleteDashboard, deleteTarget, deleteTile, navigate])

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
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
              <Plus className="size-4" />
              Add
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => setEditor({ kind: 'create', type: 'insight' })}>
                <BarChart3 className="size-4" />
                Chart
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddTextNote} disabled={savingTile}>
                <FileText className="size-4" />
                Text note
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      handleAddTextNote,
      handleGlobalTimeRangeChange,
      requestDeleteDashboard,
      savingDashboard,
      savingTile,
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
      <div className="space-y-6">
        {deleteTarget ? (
          <DashboardDeleteConfirmation
            target={deleteTarget}
            deleting={savingDashboard || savingTile}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleConfirmDelete}
          />
        ) : null}

        {editor ? (
          <DashboardTileEditor
            key={editor.kind === 'edit' ? editor.tile.id : `create-${editor.type}`}
            tile={editor.kind === 'edit' ? editor.tile : undefined}
            type={editor.kind === 'create' ? editor.type : undefined}
            saving={savingTile}
            onCancel={() => setEditor(null)}
            onCreateInsight={editor.kind === 'edit' ? handleUpdateInsight : handleCreateInsight}
            onCreateMarkdown={editor.kind === 'edit' ? handleUpdateMarkdown : handleCreateMarkdown}
          />
        ) : null}

        {dashboard.tiles.length === 0 ? (
          <div className="space-y-4">
            <DashboardEmptyState title="No tiles yet" description="Add a chart or text note." />
          </div>
        ) : (
          <DashboardGrid
            tiles={dashboard.tiles}
            editable
            globalTimeRange={globalTimeRange}
            globalGranularity={tileGranularityOverride}
            onEditTile={tile =>
              setEditor({
                kind: 'edit',
                tile,
              })
            }
            onDeleteTile={tile =>
              setDeleteTarget({
                type: 'tile',
                tileId: tile.id,
                displayName: tile.displayName || 'Untitled tile',
              })
            }
            onLayoutsChange={handleLayoutsChange}
          />
        )}

        {savingTile ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Saving tile changes...
          </div>
        ) : null}
      </div>
    </Page>
  )
}

export default DashboardDetail
