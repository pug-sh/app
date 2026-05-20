import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

export type TileType = 'insight' | 'markdown'

export type EditorState = { kind: 'create'; type: TileType } | { kind: 'edit'; tile: DashboardTile }
