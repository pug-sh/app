import type { TileOp } from '@/api/genproto/ai/dashboards/v1/assistant_pb'
import {
  type Dashboard,
  type DashboardTile,
  type DashboardTileInput,
  DashboardTileInputSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { protoValidator } from '@/network/transport'
import { appendDraftTile, patchTile, removeDraftTile } from './draft-state'
import { tileToInput } from './upsert-dashboard'

export type AssistantOpSummary =
  | { kind: 'applied'; text: string; tileId: string }
  | { kind: 'flagged'; text: string; tileId: string }
  | { kind: 'failed'; text: string }

// UpdateTile replaces the whole tile, not a field mask: every field but id (the draft's
// stays authoritative) and position (an update never moves a tile) is overwritten.
const tileFieldsFromInput = (input: DashboardTileInput) => ({
  displayName: input.displayName,
  description: input.description,
  content: input.content,
  viewMode: input.viewMode,
  compare: input.compare,
  thresholds: input.thresholds,
  header: input.header,
  visualization: input.visualization,
})

const hasTile = (dashboard: Dashboard, tileId: string) => dashboard.tiles.some(tile => tile.id === tileId)

// Null when the op changed nothing (no tile payload, unknown id, empty oneof), so the caller
// never reports an edit that didn't happen. An add's id only exists once appendDraftTile
// assigns one, which is why it comes back from here rather than from the op.
export const applyOpToDashboard = (dashboard: Dashboard, op: TileOp) => {
  switch (op.op.case) {
    case 'add': {
      const tile = op.op.value.tile
      if (!tile) return null
      const next = appendDraftTile(dashboard, tile)
      const added = next.tiles[next.tiles.length - 1]
      return added ? { dashboard: next, tileId: added.id } : null
    }
    case 'update': {
      const { tileId, tile } = op.op.value
      if (!tile || !hasTile(dashboard, tileId)) return null
      return { dashboard: patchTile(dashboard, tileId, tileFieldsFromInput(tile)), tileId }
    }
    case 'remove': {
      const { tileId } = op.op.value
      if (!hasTile(dashboard, tileId)) return null
      return { dashboard: removeDraftTile(dashboard, tileId), tileId }
    }
    default:
      return null
  }
}

// The assistant's violations are protovalidate messages on DashboardTileInput, which is what save
// sends — so revalidating locally reproduces the server's verdict. Only a definite 'invalid' flags;
// a validator that errors falls through to the transport interceptor rather than blocking save.
export const tileBlocksSave = (tile: DashboardTile) =>
  protoValidator.validate(DashboardTileInputSchema, tileToInput(tile)).kind === 'invalid'

// Returns the same Set when nothing changes so a setState updater bails out.
export const nextFlaggedIds = (current: Set<string>, tileId: string, flagged: boolean) => {
  if (current.has(tileId) === flagged) return current
  const next = new Set(current)
  if (flagged) next.add(tileId)
  else next.delete(tileId)
  return next
}

const tileNameFromOp = (op: TileOp) => {
  if (op.op.case === 'add' || op.op.case === 'update') return op.op.value.tile?.displayName
  return undefined
}

// One transcript row per op, decided from what actually happened: tileId is null when
// applyOpToDashboard changed nothing.
export const summarizeOp = (op: TileOp, tileId: string | null): AssistantOpSummary => {
  if (op.op.case === 'remove') {
    if (!tileId) return { kind: 'failed', text: "Couldn't remove the tile" }
    return { kind: 'applied', text: 'Removed a tile', tileId }
  }
  const name = tileNameFromOp(op)?.trim() || 'Untitled tile'
  if (!tileId) return { kind: 'failed', text: `Couldn't apply "${name}"` }
  if (op.violations.length > 0) {
    return { kind: 'flagged', text: `"${name}" needs a fix: ${op.violations.join('; ')}`, tileId }
  }
  return { kind: 'applied', text: `${op.op.case === 'add' ? 'Added' : 'Updated'} "${name}"`, tileId }
}
