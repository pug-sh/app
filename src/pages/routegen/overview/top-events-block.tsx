import type { EventNameMeta } from '@/api/genproto/common/v1/filter_schema_pb'
import { Badge } from '@/components/ui/badge'
import { getSeriesColor } from '@/lib/event-colors'
import { tsToDate } from '@/lib/timestamp'

const formatCount = (n: bigint) => n.toLocaleString()

const formatLastSeen = (date: Date | null) => {
  if (!date) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const TopEventsBlock = ({ events }: { events: EventNameMeta[] }) => {
  const sorted = [...events].sort((a, b) => Number(b.count - a.count)).slice(0, 10)
  if (sorted.length === 0) return null
  const max = Number(sorted[0].count)

  return (
    <div className="rounded-lg bg-background p-4">
      <h3 className="mb-3 text-sm font-semibold">Top events</h3>
      <ul className="space-y-3">
        {sorted.map(event => {
          const value = Number(event.count)
          const widthPct = max > 0 ? Math.max(2, (value / max) * 100) : 0
          const colors = getSeriesColor(event.name)
          return (
            <li key={event.name} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-xs">
              <div className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge
                    variant="secondary"
                    className="shrink-0 truncate font-mono text-[10px]"
                    style={{ backgroundColor: colors.fill, color: colors.dot }}
                  >
                    {event.name}
                  </Badge>
                </div>
                <div className="h-1.5 rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${widthPct}%`, backgroundColor: colors.line }}
                  />
                </div>
              </div>
              <span className="shrink-0 font-mono tabular-nums">{formatCount(event.count)}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatLastSeen(tsToDate(event.lastSeenAt))}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default TopEventsBlock
