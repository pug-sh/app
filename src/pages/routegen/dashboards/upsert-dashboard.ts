import { clone, create } from '@bufbuild/protobuf'
import {
  type Dashboard,
  type DashboardsServiceUpsertRequest,
  DashboardsServiceUpsertRequestSchema,
  type DashboardTile,
  type DashboardTileInput,
  DashboardTileInputSchema,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { tilePosition } from './draft-state'

// Strip server-assigned fields and copy the rest into a DashboardTileInput.
// Local-only draft ids (prefixed "draft-") are sent as empty so the server
// inserts them; real ids are sent through for the update path.
export const tileToInput = (tile: DashboardTile): DashboardTileInput =>
  create(DashboardTileInputSchema, {
    id: tile.id.startsWith('draft-') ? '' : tile.id,
    displayName: tile.displayName,
    description: tile.description,
    content:
      tile.content.case === 'insight'
        ? { case: 'insight', value: clone(InsightTileContentSchema, tile.content.value) }
        : tile.content.case === 'markdown'
          ? { case: 'markdown', value: clone(MarkdownTileContentSchema, tile.content.value) }
          : { case: undefined },
    position: tilePosition(tile),
    viewMode: tile.viewMode,
    compare: tile.compare,
    thresholds: tile.thresholds,
    header: tile.header,
    visualization: tile.visualization,
  })

export const buildUpsertRequest = (draft: Dashboard): DashboardsServiceUpsertRequest =>
  create(DashboardsServiceUpsertRequestSchema, {
    id: draft.id,
    displayName: draft.displayName,
    description: draft.description,
    defaultTimeRange: draft.defaultTimeRange,
    defaultGranularity: draft.defaultGranularity,
    tiles: draft.tiles.map(tileToInput),
  })
