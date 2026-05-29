import { clone, create } from '@bufbuild/protobuf'
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

const DEFAULT_POSITION = { x: 0, y: 0, w: 6, h: 6 }

// A tile's grid position, migrating legacy per-breakpoint `layouts`: prefer the
// new single `position`; otherwise derive it from the old lg layout (or the
// first one). This is the single read path for tile placement.
export const tilePosition = (tile: DashboardTile): GridPosition => {
  if (tile.position) return tile.position
  const legacy = tile.layouts.find(layout => layout.breakpoint === 'lg') ?? tile.layouts[0]
  return create(GridPositionSchema, legacy ? { x: legacy.x, y: legacy.y, w: legacy.w, h: legacy.h } : DEFAULT_POSITION)
}

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
  const position = create(GridPositionSchema, { x: base.x, y: bottomY, w: base.w, h: base.h })
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

export const patchDashboardMetadata = (
  dashboard: Dashboard,
  patch: Partial<Pick<Dashboard, 'displayName' | 'description'>>,
): Dashboard => ({
  ...dashboard,
  ...patch,
})
