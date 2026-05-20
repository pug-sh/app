import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { QueryRequest } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { InsightTileEditor } from './insight-tile-editor'
import { MarkdownTileEditor } from './markdown-tile-editor'
import type { TileType } from './types'

const getTileType = (tile?: DashboardTile) => (tile?.content.case === 'markdown' ? 'markdown' : 'insight')

export const DashboardTileEditor = ({
  tile,
  type = 'insight',
  dashboardTimeRange,
  saving,
  onCancel,
  onCreateInsight,
  onCreateMarkdown,
}: {
  tile?: DashboardTile
  type?: TileType
  dashboardTimeRange?: TimeRange
  saving: boolean
  onCancel: () => void
  onCreateInsight: (input: { displayName: string; description: string; query: QueryRequest }) => Promise<void>
  onCreateMarkdown: (input: { displayName: string; description: string; body: string }) => Promise<void>
}) => {
  const tileType = tile ? getTileType(tile) : type

  return tileType === 'markdown' ? (
    <MarkdownTileEditor tile={tile} saving={saving} onCancel={onCancel} onSubmit={onCreateMarkdown} />
  ) : (
    <InsightTileEditor
      tile={tile}
      dashboardTimeRange={dashboardTimeRange}
      saving={saving}
      onCancel={onCancel}
      onSubmit={onCreateInsight}
    />
  )
}
