import type { TimeRangePreset } from '@/api/genproto/common/v1/time_pb'
import type { DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'

export type TileType = 'insight' | 'markdown'

export type EditorState = { kind: 'create'; type: TileType } | { kind: 'edit'; tile: DashboardTile }

export type InsightTileInput = {
  displayName: string
  description: string
  query: QueryRequest
  defaultTimeRange: TimeRangePreset
  viewMode: DashboardTileViewMode
}

export type MarkdownTileInput = {
  displayName: string
  description: string
  body: string
}
