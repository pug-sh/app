import type { TileOp } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import type { Dashboard, DashboardTile, DashboardTileInput } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { appendDraftTile, patchTile, removeDraftTile } from './draft-state'

// The inverse of upsert-dashboard.ts's tileToInput. Position is deliberately
// excluded: an update op should never relocate a tile on the grid, regardless of
// what position (if any) the assistant's tile payload carries.
export const tileInputToPatch = (input: DashboardTileInput): Partial<DashboardTile> => ({
  displayName: input.displayName,
  description: input.description,
  content: input.content,
  viewMode: input.viewMode,
  compare: input.compare,
  thresholds: input.thresholds,
  header: input.header,
  visualization: input.visualization,
})

// Apply one TileOp to a draft, reusing the exact same primitives templates and
// duplication already use. Returns the affected tile id so the caller can flag
// it or offer to jump to it — for `add` this is only known after appendDraftTile
// assigns a local id, so it cannot come from the op itself.
export const applyOpToDashboard = (
  dashboard: Dashboard,
  op: TileOp,
): { dashboard: Dashboard; tileId: string | undefined } => {
  switch (op.op.case) {
    case 'add': {
      const tile = op.op.value.tile
      if (!tile) return { dashboard, tileId: undefined }
      const next = appendDraftTile(dashboard, tile)
      return { dashboard: next, tileId: next.tiles[next.tiles.length - 1]?.id }
    }
    case 'update': {
      const { tileId, tile } = op.op.value
      if (!tile) return { dashboard, tileId: undefined }
      return { dashboard: patchTile(dashboard, tileId, tileInputToPatch(tile)), tileId }
    }
    case 'remove': {
      const { tileId } = op.op.value
      return { dashboard: removeDraftTile(dashboard, tileId), tileId }
    }
    default:
      return { dashboard, tileId: undefined }
  }
}

// Set update helper that returns the SAME reference when nothing changes, so a
// caller can use it directly in a setState updater without an extra equality
// check triggering a spurious re-render.
export const nextFlaggedIds = (current: Set<string>, tileId: string | undefined, flagged: boolean): Set<string> => {
  if (!tileId) return current
  if (current.has(tileId) === flagged) return current
  const next = new Set(current)
  if (flagged) next.add(tileId)
  else next.delete(tileId)
  return next
}

const tileNameFromOp = (op: TileOp): string | undefined => {
  if (op.op.case === 'add' || op.op.case === 'update') return op.op.value.tile?.displayName
  return undefined
}

// One line describing what an op did, for the chat transcript. Deliberately
// takes only the TileOp — the newly-assigned id for an `add` isn't known here,
// see applyOpToDashboard.
export const summarizeOp = (op: TileOp): { text: string; flagged: boolean } => {
  const flagged = op.violations.length > 0
  const name = tileNameFromOp(op)?.trim() || 'Untitled tile'
  switch (op.op.case) {
    case 'add':
      return { text: flagged ? `"${name}" needs a fix` : `Added "${name}"`, flagged }
    case 'update':
      return { text: flagged ? `"${name}" needs a fix` : `Updated "${name}"`, flagged }
    case 'remove':
      return { text: 'Removed a tile', flagged: false }
    default:
      return { text: 'No change', flagged: false }
  }
}
