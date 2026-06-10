import { Plus } from 'lucide-react'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { DashboardDeleteConfirmation, type DashboardDeleteTarget } from '../delete-confirmation'
import { EditBar } from '../edit-bar'
import { DashboardGrid } from '../grid'
import { InlineTemplatePicker } from '../template-picker'
import { TileConfigPanel } from '../tile-config-panel'
import { DashboardEmptyState } from '../tiles'
import { ResumeBanner } from './resume-banner'
import type { useDashboardEditor } from './use-dashboard-editor'

// Everything below the page header: the edit bar, resume/delete prompts, the tile
// grid itself, and the edit-mode add-tile picker + config rail. Driven entirely by
// the editor hook plus the global time controls.
export const DashboardCanvas = ({
  editor,
  globalTimeRange,
  tileGranularityOverride,
  deleteTarget,
  deleting,
  onCancelDelete,
  onConfirmDelete,
}: {
  editor: ReturnType<typeof useDashboardEditor>
  globalTimeRange: TimeRange | undefined
  tileGranularityOverride: Granularity | undefined
  deleteTarget: DashboardDeleteTarget | null
  deleting: boolean
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) => {
  const {
    mode,
    dirtyCount,
    saving,
    handleSave,
    handleDiscard,
    resumeBanner,
    storedDraft,
    resumeEditing,
    effectiveDashboard,
    selectedTileId,
    selectedTile,
    highlightTileId,
    railCollapsed,
    setRailCollapsed,
    showPicker,
    setShowPicker,
    handleLayoutsChange,
    selectTile,
    deselectTile,
    handlePatchTile,
    duplicateTile,
    handleSelectTemplate,
    patchSelectedTile,
    removeSelectedTile,
    duplicateSelectedTile,
    templateContext,
  } = editor

  const tileCount = effectiveDashboard?.tiles.length ?? 0

  return (
    <div className="space-y-6">
      {mode === 'edit' ? (
        <EditBar dirtyCount={dirtyCount} saving={saving} onSave={handleSave} onDiscard={handleDiscard} />
      ) : null}

      {resumeBanner !== 'none' && storedDraft ? (
        <ResumeBanner
          kind={resumeBanner}
          startedAt={storedDraft.startedAt}
          onDiscard={handleDiscard}
          onResume={resumeEditing}
        />
      ) : null}

      {deleteTarget ? (
        <DashboardDeleteConfirmation
          target={deleteTarget}
          deleting={deleting}
          onCancel={onCancelDelete}
          onConfirm={onConfirmDelete}
        />
      ) : null}

      {mode === 'view' && tileCount === 0 ? (
        <DashboardEmptyState title="No tiles yet" description="Click Edit to start adding tiles." />
      ) : (
        <div className="flex min-h-0 gap-4">
          <div className="min-w-0 flex-1 space-y-4">
            {tileCount > 0 ? (
              <DashboardGrid
                tiles={effectiveDashboard?.tiles ?? []}
                mode={mode}
                selectedTileId={selectedTileId}
                highlightTileId={highlightTileId}
                globalTimeRange={globalTimeRange}
                globalGranularity={tileGranularityOverride}
                onLayoutsChange={handleLayoutsChange}
                onSelectTile={mode === 'edit' ? selectTile : undefined}
                onPatchTile={mode === 'edit' ? handlePatchTile : undefined}
                onDuplicateTile={mode === 'edit' ? duplicateTile : undefined}
              />
            ) : null}
            {mode === 'edit' ? (
              tileCount === 0 ? (
                <InlineTemplatePicker onSelect={handleSelectTemplate} context={templateContext} />
              ) : showPicker ? (
                <InlineTemplatePicker
                  onSelect={handleSelectTemplate}
                  onCancel={() => setShowPicker(false)}
                  context={templateContext}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 border-dashed py-6 text-primary text-sm transition-colors hover:bg-primary/5"
                >
                  <Plus className="size-4" />
                  Add tile
                </button>
              )
            ) : null}
          </div>
          {mode === 'edit' && tileCount > 0 ? (
            <TileConfigPanel
              key={selectedTile?.id ?? '__none__'}
              tile={selectedTile}
              collapsed={railCollapsed}
              onToggleCollapse={() => setRailCollapsed(value => !value)}
              onClose={deselectTile}
              onPatch={patchSelectedTile}
              onDelete={removeSelectedTile}
              onDuplicate={duplicateSelectedTile}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
