import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InsightTileEditor } from './insight-tile-editor'
import { MarkdownTileEditor } from './markdown-tile-editor'
import type { InsightTileInput, MarkdownTileInput, TileType } from './types'

const getTileType = (tile?: DashboardTile) => (tile?.content.case === 'markdown' ? 'markdown' : 'insight')

export const DashboardTileEditor = ({
  tile,
  type = 'insight',
  saving,
  onCancel,
  onCreateInsight,
  onCreateMarkdown,
}: {
  tile?: DashboardTile
  type?: TileType
  saving: boolean
  onCancel: () => void
  onCreateInsight: (input: InsightTileInput) => Promise<void>
  onCreateMarkdown: (input: MarkdownTileInput) => Promise<void>
}) => {
  const tileType = tile ? getTileType(tile) : type

  return tileType === 'markdown' ? (
    <MarkdownTileEditor tile={tile} saving={saving} onDone={onCancel} onSubmit={onCreateMarkdown} />
  ) : (
    <InsightTileEditor tile={tile} saving={saving} onCancel={onCancel} onSubmit={onCreateInsight} />
  )
}
