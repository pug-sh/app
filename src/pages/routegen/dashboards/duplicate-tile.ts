import { clone, create } from '@bufbuild/protobuf'
import {
  type DashboardTile,
  type DashboardTileInput,
  DashboardTileInputSchema,
  InsightTileContentSchema,
  MarkdownTileContentSchema,
  ResponsiveGridLayoutSchema,
  ThresholdRuleSchema,
  TileHeaderSchema,
  VisualizationOptionsSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

// y-shifted layouts so the clone lands directly below the source in every breakpoint.
export const buildDuplicateTileInput = (source: DashboardTile): DashboardTileInput => {
  const layouts = source.layouts.map(layout =>
    create(ResponsiveGridLayoutSchema, {
      ...clone(ResponsiveGridLayoutSchema, layout),
      y: layout.y + layout.h,
    }),
  )

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
    layouts,
    viewMode: source.viewMode,
    compare: source.compare,
    thresholds: source.thresholds.map(t => clone(ThresholdRuleSchema, t)),
    header: source.header ? clone(TileHeaderSchema, source.header) : undefined,
    visualization: source.visualization ? clone(VisualizationOptionsSchema, source.visualization) : undefined,
  })
}
