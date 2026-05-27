import { clone, create } from '@bufbuild/protobuf'
import {
  type Dashboard,
  DashboardSchema,
  type DashboardTile,
  type DashboardTileInput,
  DashboardTileSchema,
  type ResponsiveGridLayout,
  ResponsiveGridLayoutSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

// Deep clone a server Dashboard for use as the editor draft.
export const cloneForDraft = (source: Dashboard): Dashboard => clone(DashboardSchema, source)

// Replace a tile's fields. Returns a new Dashboard; the input is not mutated.
export const patchTile = (dashboard: Dashboard, tileId: string, patch: Partial<DashboardTile>): Dashboard => ({
  ...dashboard,
  tiles: dashboard.tiles.map(tile => (tile.id === tileId ? ({ ...tile, ...patch } as DashboardTile) : tile)),
})

// Append a new tile built from a template or duplicate. We synthesize a local id
// so the side panel can address it before Upsert assigns the real one.
export const appendDraftTile = (dashboard: Dashboard, input: DashboardTileInput): Dashboard => {
  const localId = `draft-${Math.random().toString(36).slice(2, 10)}`
  const shifted = shiftLayoutsBelowBottom(dashboard.tiles, input.layouts)
  const tile = create(DashboardTileSchema, {
    id: localId,
    dashboardId: dashboard.id,
    displayName: input.displayName,
    description: input.description,
    content: input.content,
    layouts: shifted,
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

export const patchTileLayouts = (dashboard: Dashboard, tileId: string, layouts: ResponsiveGridLayout[]): Dashboard => ({
  ...dashboard,
  tiles: dashboard.tiles.map(tile => (tile.id === tileId ? { ...tile, layouts } : tile)),
})

export const patchDashboardMetadata = (
  dashboard: Dashboard,
  patch: Partial<Pick<Dashboard, 'displayName' | 'description'>>,
): Dashboard => ({
  ...dashboard,
  ...patch,
})

// For each breakpoint in `layouts`, shift y so the new tile lands just below the
// bottommost existing tile at that breakpoint.
const shiftLayoutsBelowBottom = (
  existing: DashboardTile[],
  layouts: ResponsiveGridLayout[],
): ResponsiveGridLayout[] => {
  const bottomY = new Map<string, number>()
  for (const tile of existing) {
    for (const layout of tile.layouts) {
      const prev = bottomY.get(layout.breakpoint) ?? 0
      bottomY.set(layout.breakpoint, Math.max(prev, layout.y + layout.h))
    }
  }
  return layouts.map(layout =>
    create(ResponsiveGridLayoutSchema, {
      ...clone(ResponsiveGridLayoutSchema, layout),
      y: bottomY.get(layout.breakpoint) ?? layout.y,
    }),
  )
}
