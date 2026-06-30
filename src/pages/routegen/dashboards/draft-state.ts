import { clone, create, equals } from '@bufbuild/protobuf'
import {
  type Dashboard,
  DashboardSchema,
  type DashboardTile,
  type DashboardTileInput,
  DashboardTileSchema,
  type GridPosition,
  GridPositionSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

export const cloneForDraft = (source: Dashboard): Dashboard => clone(DashboardSchema, source)

const DEFAULT_POSITION = { x: 0, y: 0, w: 36, h: 18 }

// A tile's grid position in fine-grid units. The single read path for tile
// placement; falls back to a default for any tile that lacks a position.
export const tilePosition = (tile: DashboardTile): GridPosition =>
  tile.position ?? create(GridPositionSchema, DEFAULT_POSITION)

export const patchTile = (dashboard: Dashboard, tileId: string, patch: Partial<DashboardTile>): Dashboard => ({
  ...dashboard,
  tiles: dashboard.tiles.map(tile => (tile.id === tileId ? ({ ...tile, ...patch } as DashboardTile) : tile)),
})

// Append a new tile built from a template or duplicate. We synthesize a local id
// so the side panel can address it before Upsert assigns the real one. The tile
// is dropped directly below the bottommost existing tile.
export const appendDraftTile = (dashboard: Dashboard, input: DashboardTileInput): Dashboard => {
  const localId = `draft-${Math.random().toString(36).slice(2, 10)}`
  const bottomY = dashboard.tiles.reduce((max, tile) => {
    const pos = tilePosition(tile)
    return Math.max(max, pos.y + pos.h)
  }, 0)
  const base = input.position ?? create(GridPositionSchema, DEFAULT_POSITION)
  // Drop the tile below the lowest one, leaving a one-track gap (unless the board
  // is empty). x stays at the template's column so new tiles stack cleanly.
  const y = dashboard.tiles.length > 0 ? bottomY + 1 : 0
  const position = create(GridPositionSchema, { x: base.x, y, w: base.w, h: base.h })
  const tile = create(DashboardTileSchema, {
    id: localId,
    dashboardId: dashboard.id,
    displayName: input.displayName,
    description: input.description,
    content: input.content,
    position,
    viewMode: input.viewMode,
    compare: input.compare,
    thresholds: input.thresholds,
    header: input.header,
    visualization: input.visualization,
  })
  return { ...dashboard, tiles: [...dashboard.tiles, tile] }
}

export const removeDraftTile = (dashboard: Dashboard, tileId: string): Dashboard => ({
  ...dashboard,
  tiles: dashboard.tiles.filter(tile => tile.id !== tileId),
})

export type DashboardMetaPatch = Partial<
  Pick<Dashboard, 'displayName' | 'description' | 'defaultTimeRange' | 'defaultGranularity'>
>

export const patchDashboardMetadata = (dashboard: Dashboard, patch: DashboardMetaPatch): Dashboard => ({
  ...dashboard,
  ...patch,
})

// Count the fields that differ between two dashboards (name, description, and
// each added/removed/changed tile). Drives the dirty-count badge in edit mode.
export const countDashboardChanges = (a: Dashboard, b: Dashboard): number => {
  let count = 0
  if (a.displayName !== b.displayName) count++
  if (a.description !== b.description) count++
  if (a.defaultTimeRange !== b.defaultTimeRange) count++
  if (a.defaultGranularity !== b.defaultGranularity) count++

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
