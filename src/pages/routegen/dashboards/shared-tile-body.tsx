import type { RenderedTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { emptyReadsAsZero } from '../insights/helpers'
import { InsightTileView } from './insight-tile-view'
import { DashboardMarkdownTile, TileShell } from './tiles'

// Read-only body for a server-pre-rendered tile on the public shared dashboard.
// Markdown renders the same as the authenticated view; insight tiles render the
// pre-computed QueryResponse through InsightTileView (no fetching).
export const SharedTileBody = ({
  renderedTile,
  granularity,
  timeZone,
  timeRange,
}: {
  renderedTile: RenderedTile
  granularity: Granularity
  timeZone: string
  // The range the viewer picked. The server resolves a default one itself and doesn't say which.
  timeRange?: TimeRange
}) => {
  const tile = renderedTile.tile
  if (!tile) return null

  if (tile.content.case === 'markdown') {
    return <DashboardMarkdownTile tile={tile} />
  }

  const spec = tile.content.case === 'insight' ? tile.content.value.spec : undefined
  const outcome = renderedTile.outcome

  return (
    <TileShell tile={tile}>
      <InsightTileView
        tile={tile}
        spec={spec}
        result={outcome.case === 'result' ? outcome.value.result : { case: undefined, value: undefined }}
        error={outcome.case === 'errorMessage' ? outcome.value : null}
        granularity={granularity}
        timeZone={timeZone}
        fillRange={timeRange && emptyReadsAsZero(spec) ? timeRange : undefined}
        compact
      />
    </TileShell>
  )
}
