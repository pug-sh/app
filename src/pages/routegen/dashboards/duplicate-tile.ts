import { clone, create } from '@bufbuild/protobuf'
import {
  type DashboardTile,
  type DashboardTileInput,
  DashboardTileInputSchema,
  GridPositionSchema,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
  ThresholdRuleSchema,
  TileHeaderSchema,
  VisualizationOptionsSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { tilePosition } from './draft-state'

// Build an input for a duplicate of `source`. The position carries the source's
// size; appendDraftTile drops it below the bottommost tile, so the y here is just
// a sensible starting point.
export const buildDuplicateTileInput = (source: DashboardTile): DashboardTileInput => {
  const pos = tilePosition(source)
  return create(DashboardTileInputSchema, {
    id: '',
    displayName: source.displayName,
    description: source.description,
    content:
      source.content.case === 'markdown'
        ? { case: 'markdown', value: clone(MarkdownTileContentSchema, source.content.value) }
        : source.content.case === 'insight'
          ? { case: 'insight', value: clone(InsightTileContentSchema, source.content.value) }
          : { case: undefined },
    position: create(GridPositionSchema, { x: pos.x, y: pos.y + pos.h, w: pos.w, h: pos.h }),
    viewMode: source.viewMode,
    compare: source.compare,
    thresholds: source.thresholds.map(t => clone(ThresholdRuleSchema, t)),
    header: source.header ? clone(TileHeaderSchema, source.header) : undefined,
    visualization: source.visualization ? clone(VisualizationOptionsSchema, source.visualization) : undefined,
  })
}
