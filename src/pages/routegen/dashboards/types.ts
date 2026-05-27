import type { DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { InsightQuerySpec } from '@/api/genproto/shared/insights/v1/insights_pb'

export type TileType = 'insight' | 'markdown'

export type EditorState = { kind: 'create'; type: TileType } | { kind: 'edit'; tile: DashboardTile }

export type InsightTileInput = {
  displayName: string
  description: string
  spec: InsightQuerySpec
  viewMode: DashboardTileViewMode
}

export type MarkdownTileInput = {
  displayName: string
  description: string
  body: string
}
