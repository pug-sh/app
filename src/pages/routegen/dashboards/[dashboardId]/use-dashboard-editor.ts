import { create, equals } from '@bufbuild/protobuf'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  type Dashboard,
  DashboardSchema,
  type DashboardTile,
  GridPositionSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { canAtom } from '@/auth/permissions'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import { fetchFilterSchemaAtom, filterSchemaAtom } from '../../events/filter-schema.atoms'
import { pendingEditDashboardIdAtom, upsertDashboardAtom } from '../dashboard.atoms'
import {
  appendDraftTile,
  cloneForDraft,
  countDashboardChanges,
  type DashboardMetaPatch,
  patchDashboardMetadata,
  patchTile,
  removeDraftTile,
} from '../draft-state'
import { clearDraftKey, draftAtomFamily } from '../draft-storage'
import { buildDuplicateTileInput } from '../duplicate-tile'
import type { DashboardLayouts } from '../grid'
import { buildTemplateContext, type TileTemplate } from '../templates'
import { buildUpsertRequest } from '../upsert-dashboard'
import { useEditorShortcuts } from '../use-editor-shortcuts'

// The dashboard edit state machine: holds the working draft (persisted to
// localStorage so it survives reloads), tracks selection/highlight UI state, and
// owns every tile/metadata mutation plus save/discard/resume. The page renders
// what this returns; it does not manage edit state itself.
export const useDashboardEditor = ({
  dashboardId,
  dashboard,
  setDashboard,
}: {
  dashboardId: string | undefined
  dashboard: Dashboard | null
  setDashboard: (dashboard: Dashboard | null) => void
}) => {
  const upsertDashboard = useSetAtom(upsertDashboardAtom)
  // Editing is gated to dashboard:update (UX-only; the server re-checks on save). Guarding
  // every entry point here — not just the buttons — keeps a viewer out of edit mode even via
  // the auto-edit-on-open and resume-draft paths.
  const canEdit = useAtomValue(canAtom)('update', 'dashboard')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [autoFocusName, setAutoFocusName] = useState(false)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [highlightTileId, setHighlightTileId] = useState<string | null>(null)
  const draftAtom = useMemo(() => draftAtomFamily(dashboardId ?? '__no-dashboard__'), [dashboardId])
  const [storedDraft, setStoredDraft] = useAtom(draftAtom)
  const [pendingEditId, setPendingEditId] = useAtom(pendingEditDashboardIdAtom)

  // Resolve the project's events so suggested templates can seed real,
  // project-specific events (and gate tiles like Revenue). activeProjectAtom
  // starts null and resolves asynchronously, so the fetch is keyed on it — a
  // one-shot mount guard would latch before the project arrived and never fetch,
  // leaving every suggested template seeding an empty tile. Fetch only when the
  // project is known and the schema isn't already loaded.
  const activeProject = useAtomValue(activeProjectAtom)
  const fetchFilterSchema = useSetAtom(fetchFilterSchemaAtom)
  const filterSchema = useAtomValue(filterSchemaAtom)
  useEffect(() => {
    if (activeProject && !filterSchema) fetchFilterSchema()
  }, [activeProject, filterSchema, fetchFilterSchema])
  const templateContext = useMemo(() => buildTemplateContext(filterSchema), [filterSchema])

  const patchDraftMeta = useCallback(
    (patch: DashboardMetaPatch) => {
      setStoredDraft(current =>
        current ? { ...current, draft: patchDashboardMetadata(current.draft, patch) } : current,
      )
    },
    [setStoredDraft],
  )

  const enterEditMode = useCallback(
    (opts?: { focusName?: boolean }) => {
      if (!dashboard || !canEdit) return
      setStoredDraft({
        draft: cloneForDraft(dashboard),
        viewSnapshot: cloneForDraft(dashboard),
        startedAt: Date.now(),
      })
      setMode('edit')
      setSelectedTileId(dashboard.tiles[0]?.id ?? null)
      setAutoFocusName(opts?.focusName ?? false)
    },
    [dashboard, canEdit, setStoredDraft],
  )

  const exitEditMode = useCallback(() => {
    if (!dashboardId) return
    setStoredDraft(null)
    clearDraftKey(dashboardId)
    setMode('view')
    setSelectedTileId(null)
  }, [dashboardId, setStoredDraft])

  // A freshly created dashboard records its id in pendingEditDashboardIdAtom; once
  // it has loaded here, open straight into edit mode with the name field focused.
  useEffect(() => {
    if (!dashboard || pendingEditId !== dashboard.id) return
    setPendingEditId(null)
    if (mode === 'view') enterEditMode({ focusName: true })
  }, [dashboard, pendingEditId, mode, enterEditMode, setPendingEditId])

  const effectiveDashboard = mode === 'edit' && storedDraft ? storedDraft.draft : dashboard

  const dirtyCount = useMemo(() => {
    if (!storedDraft) return 0
    return countDashboardChanges(storedDraft.viewSnapshot, storedDraft.draft)
  }, [storedDraft])

  const handleSave = useCallback(async () => {
    if (!storedDraft || !dashboardId) return
    if (!storedDraft.draft.displayName.trim()) {
      toast.error('Dashboard name is required')
      return
    }
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
  }, [dashboardId, setDashboard, setStoredDraft, storedDraft, upsertDashboard])

  const handleDiscard = useCallback(() => {
    exitEditMode()
  }, [exitEditMode])

  // viewSnapshot equal to current dashboard → safe resume; otherwise the
  // dashboard changed externally and we surface a conflict prompt.
  const resumeBanner = useMemo<'none' | 'resume' | 'conflict'>(() => {
    if (!canEdit || mode !== 'view' || !dashboard || !storedDraft) return 'none'
    return equals(DashboardSchema, storedDraft.viewSnapshot, dashboard) ? 'resume' : 'conflict'
  }, [dashboard, canEdit, mode, storedDraft])

  const resumeEditing = useCallback(() => {
    if (!storedDraft || !canEdit) return
    setMode('edit')
    setSelectedTileId(storedDraft.draft.tiles[0]?.id ?? null)
  }, [storedDraft, canEdit])

  const handleLayoutsChange = useCallback(
    (layouts: DashboardLayouts) => {
      if (mode !== 'edit' || !storedDraft) return
      // Single uniform layout: write each item's geometry back as the tile's
      // canonical grid position.
      const items = layouts.lg
      if (!items) return
      let next = storedDraft.draft
      for (const item of items) {
        const id = item.i as string
        if (!next.tiles.some(tile => tile.id === id)) continue
        next = patchTile(next, id, {
          position: create(GridPositionSchema, { x: item.x, y: item.y, w: item.w, h: item.h }),
        })
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

  const handlePatchTile = useCallback(
    (tileId: string, patch: Partial<DashboardTile>) => {
      setStoredDraft(current => (current ? { ...current, draft: patchTile(current.draft, tileId, patch) } : current))
    },
    [setStoredDraft],
  )

  // Selecting a tile reveals the config rail so its settings are visible even if
  // the rail was previously collapsed.
  const selectTile = useCallback((tileId: string) => {
    setSelectedTileId(tileId)
    setRailCollapsed(false)
  }, [])

  const deselectTile = useCallback(() => setSelectedTileId(null), [])

  const highlightTimerRef = useRef<number | null>(null)
  const focusNewTile = useCallback(
    (tileId: string) => {
      selectTile(tileId)
      setHighlightTileId(tileId)
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = window.setTimeout(
        () => setHighlightTileId(current => (current === tileId ? null : current)),
        1200,
      )
    },
    [selectTile],
  )

  useEffect(
    () => () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    },
    [],
  )

  const duplicateTile = useCallback(
    (tile: DashboardTile) => {
      if (!storedDraft) return
      const nextDraft = appendDraftTile(storedDraft.draft, buildDuplicateTileInput(tile))
      const newId = nextDraft.tiles[nextDraft.tiles.length - 1]?.id
      setStoredDraft({ ...storedDraft, draft: nextDraft })
      if (newId) focusNewTile(newId)
    },
    [focusNewTile, setStoredDraft, storedDraft],
  )

  const duplicateSelectedTile = useCallback(() => {
    if (selectedTile) duplicateTile(selectedTile)
  }, [duplicateTile, selectedTile])

  const handleSelectTemplate = useCallback(
    (template: TileTemplate) => {
      if (!storedDraft) return
      const tileInput = template.build(templateContext)
      const nextDraft = appendDraftTile(storedDraft.draft, tileInput)
      const newId = nextDraft.tiles[nextDraft.tiles.length - 1]?.id
      setStoredDraft({ ...storedDraft, draft: nextDraft })
      setShowPicker(false)
      if (newId) focusNewTile(newId)
    },
    [focusNewTile, setStoredDraft, storedDraft, templateContext],
  )

  const handleEscapeDeselect = useCallback(() => {
    // Esc closes the inline add-tile picker first if it's open; otherwise it
    // clears the current tile selection.
    if (showPicker) {
      setShowPicker(false)
      return
    }
    setSelectedTileId(null)
  }, [showPicker])

  const openPicker = useCallback(() => setShowPicker(true), [])

  useEditorShortcuts({
    active: mode === 'edit',
    dirty: dirtyCount > 0,
    onSave: handleSave,
    onDeselect: handleEscapeDeselect,
    onAdd: openPicker,
  })

  return {
    mode,
    saving,
    showPicker,
    setShowPicker,
    autoFocusName,
    selectedTileId,
    selectedTile,
    railCollapsed,
    setRailCollapsed,
    highlightTileId,
    storedDraft,
    effectiveDashboard,
    dirtyCount,
    resumeBanner,
    patchDraftMeta,
    enterEditMode,
    handleSave,
    handleDiscard,
    resumeEditing,
    handleLayoutsChange,
    selectTile,
    deselectTile,
    patchSelectedTile,
    removeSelectedTile,
    handlePatchTile,
    duplicateTile,
    duplicateSelectedTile,
    handleSelectTemplate,
    templateContext,
  }
}
