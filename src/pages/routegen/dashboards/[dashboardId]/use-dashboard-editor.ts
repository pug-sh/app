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

// Undo/redo history caps: bound the snapshot stack so a long edit session can't grow
// it without limit, and coalesce a burst of edits to the same target (e.g. typing a
// name, which fires per keystroke) within this window into a single undo step.
const HISTORY_LIMIT = 50
const HISTORY_COALESCE_MS = 500

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

  // Undo/redo over the working draft. The whole draft is a small, cloneable proto
  // message, so history is just a stack of snapshots; it lives in refs (no need to
  // survive reloads) with canUndo/canRedo mirrored to state for any UI. Every draft
  // mutation funnels through commitDraft below, so this is the single capture point.
  const pastRef = useRef<Dashboard[]>([])
  const futureRef = useRef<Dashboard[]>([])
  const coalesceRef = useRef<{ key: string; at: number } | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncHistory = useCallback(() => {
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const resetHistory = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
    coalesceRef.current = null
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  // Apply a mutation to the working draft and record it for undo. A coalesceKey
  // collapses a rapid burst of edits to the same target (typing a title fires per
  // keystroke) into one step; structural actions (add/remove/duplicate/layout) pass
  // no key, so each is its own step. The snapshot push happens here in the event
  // handler — never inside the setStoredDraft updater — so StrictMode's
  // double-invoked updaters can't double-record.
  const commitDraft = useCallback(
    (updater: (draft: Dashboard) => Dashboard, coalesceKey?: string) => {
      if (!storedDraft) return
      const now = Date.now()
      const last = coalesceRef.current
      const coalesce =
        coalesceKey !== undefined && last !== null && last.key === coalesceKey && now - last.at < HISTORY_COALESCE_MS
      if (!coalesce) {
        pastRef.current.push(cloneForDraft(storedDraft.draft))
        if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
        futureRef.current = []
      }
      coalesceRef.current = coalesceKey === undefined ? null : { key: coalesceKey, at: now }
      setStoredDraft({ ...storedDraft, draft: updater(storedDraft.draft) })
      syncHistory()
    },
    [storedDraft, setStoredDraft, syncHistory],
  )

  const undo = useCallback(() => {
    if (mode !== 'edit' || !storedDraft || pastRef.current.length === 0) return
    const previous = pastRef.current.pop()
    if (!previous) return
    futureRef.current.push(cloneForDraft(storedDraft.draft))
    coalesceRef.current = null
    setStoredDraft({ ...storedDraft, draft: previous })
    syncHistory()
  }, [mode, storedDraft, setStoredDraft, syncHistory])

  const redo = useCallback(() => {
    if (mode !== 'edit' || !storedDraft || futureRef.current.length === 0) return
    const next = futureRef.current.pop()
    if (!next) return
    pastRef.current.push(cloneForDraft(storedDraft.draft))
    coalesceRef.current = null
    setStoredDraft({ ...storedDraft, draft: next })
    syncHistory()
  }, [mode, storedDraft, setStoredDraft, syncHistory])

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
      const key = `meta:${Object.keys(patch).join(',')}`
      commitDraft(draft => patchDashboardMetadata(draft, patch), key)
    },
    [commitDraft],
  )

  const enterEditMode = useCallback(
    (opts?: { focusName?: boolean }) => {
      if (!dashboard || !canEdit) return
      setStoredDraft({
        draft: cloneForDraft(dashboard),
        viewSnapshot: cloneForDraft(dashboard),
        startedAt: Date.now(),
      })
      resetHistory()
      setMode('edit')
      setSelectedTileId(dashboard.tiles[0]?.id ?? null)
      setAutoFocusName(opts?.focusName ?? false)
    },
    [dashboard, canEdit, setStoredDraft, resetHistory],
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
    resetHistory()
    setMode('edit')
    setSelectedTileId(storedDraft.draft.tiles[0]?.id ?? null)
  }, [storedDraft, canEdit, resetHistory])

  const handleLayoutsChange = useCallback(
    (layouts: DashboardLayouts) => {
      if (mode !== 'edit') return
      const items = layouts.lg
      if (!items) return
      // Single uniform layout: write each item's geometry back as the tile's
      // canonical grid position. One drag/resize stop = one undo step (no key).
      commitDraft(draft => {
        let next = draft
        for (const item of items) {
          const id = item.i as string
          if (!next.tiles.some(tile => tile.id === id)) continue
          next = patchTile(next, id, {
            position: create(GridPositionSchema, { x: item.x, y: item.y, w: item.w, h: item.h }),
          })
        }
        return next
      })
    },
    [mode, commitDraft],
  )

  const selectedTile = useMemo(() => {
    if (mode !== 'edit' || !storedDraft) return null
    return storedDraft.draft.tiles.find(tile => tile.id === selectedTileId) ?? null
  }, [mode, selectedTileId, storedDraft])

  const patchSelectedTile = useCallback(
    (patch: Partial<DashboardTile>) => {
      if (!selectedTileId) return
      const key = `tile:${selectedTileId}:${Object.keys(patch).join(',')}`
      commitDraft(draft => patchTile(draft, selectedTileId, patch), key)
    },
    [selectedTileId, commitDraft],
  )

  // The Data tab keeps its own local editor state that only re-seeds on a tile switch
  // (see data-tab.tsx), so an undo that reverted the insight spec would leave the open
  // panel out of sync — and its next edit would clobber the undo. Data-tab edits therefore
  // apply silently: they mutate the draft (so they still save) and invalidate redo, but
  // record no undo step, so undo simply steps over them. The equals guard drops the no-op
  // spec the tab re-emits on mount, so selecting a tile neither writes nor clears redo.
  const patchSelectedTileSilent = useCallback(
    (patch: Partial<DashboardTile>) => {
      if (!storedDraft || !selectedTileId) return
      const nextDraft = patchTile(storedDraft.draft, selectedTileId, patch)
      if (equals(DashboardSchema, storedDraft.draft, nextDraft)) return
      coalesceRef.current = null
      futureRef.current = []
      setStoredDraft({ ...storedDraft, draft: nextDraft })
      syncHistory()
    },
    [selectedTileId, storedDraft, setStoredDraft, syncHistory],
  )

  const removeSelectedTile = useCallback(() => {
    if (!selectedTileId) return
    commitDraft(draft => removeDraftTile(draft, selectedTileId))
    setSelectedTileId(null)
  }, [selectedTileId, commitDraft])

  const handlePatchTile = useCallback(
    (tileId: string, patch: Partial<DashboardTile>) => {
      const key = `tile:${tileId}:${Object.keys(patch).join(',')}`
      commitDraft(draft => patchTile(draft, tileId, patch), key)
    },
    [commitDraft],
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
      commitDraft(() => nextDraft)
      if (newId) focusNewTile(newId)
    },
    [commitDraft, focusNewTile, storedDraft],
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
      commitDraft(() => nextDraft)
      setShowPicker(false)
      if (newId) focusNewTile(newId)
    },
    [commitDraft, focusNewTile, storedDraft, templateContext],
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
    onUndo: undo,
    onRedo: redo,
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
    undo,
    redo,
    canUndo,
    canRedo,
    selectTile,
    deselectTile,
    patchSelectedTile,
    patchSelectedTileSilent,
    removeSelectedTile,
    handlePatchTile,
    duplicateTile,
    duplicateSelectedTile,
    handleSelectTemplate,
    templateContext,
  }
}
