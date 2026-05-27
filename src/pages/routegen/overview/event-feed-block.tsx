import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { TimeRangePreset, TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import type { TimeRange } from '@/components/date-range-picker'
import ProjectLink from '@/components/project-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { resolveDashboardTimeRangePreset } from '@/lib/date-presets'
import { getSeriesColor } from '@/lib/event-colors'
import { toProtoTimeRange } from '@/lib/timestamp'

type Props = {
  globalTimeRange: TimeRange | undefined
}

const EventFeedBlock = ({ globalTimeRange }: Props) => {
  const activityRPC = useAtomValue(activityRPCAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!headers) return
    setLoading(true)
    setError(null)
    try {
      const effectiveTimeRange = globalTimeRange ?? resolveDashboardTimeRangePreset(TimeRangePreset.LAST_30_DAYS)
      const resp = await activityRPC.getEventExplorer(
        {
          timeRange: create(TimeRangeSchema, toProtoTimeRange(effectiveTimeRange)),
          pageToken: '',
        },
        { headers },
      )
      setEvents(resp.events.slice(0, 25))
    } catch (err) {
      console.error('activity.getEventExplorer failed:', err)
      setError('Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [activityRPC, globalTimeRange, headers])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <h3 className="mb-3 text-sm font-semibold">Live event feed</h3>
      {loading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : error ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events in the selected range.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-border/50 overflow-y-auto">
          {events.map(event => {
            const colors = getSeriesColor(event.kind)
            return (
              <li key={event.eventId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-xs">
                <ProjectLink
                  href={`/profiles/${encodeURIComponent(event.distinctId)}/events`}
                  className="min-w-0 truncate font-mono text-primary hover:underline underline-offset-4"
                >
                  {event.distinctId}
                </ProjectLink>
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px]"
                  style={{ backgroundColor: colors.fill, color: colors.dot }}
                >
                  {event.kind}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default EventFeedBlock
