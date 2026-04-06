import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { EventDetails } from '@/components/event-details'
import HoverSwap from '@/components/hover-swap'
import { getSeriesColor } from '@/lib/event-colors'
import { Badge } from '@/components/ui/badge'
import { structGet, structToEntries } from '@/lib/struct'
import { getWellKnownFields, getHeadlineField } from '@/lib/well-known-events'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

const TimelineEventItem = ({
  event,
  timeLabel,
}: {
  event: ActivityEvent
  timeLabel: { primary: string; secondary: string } | null
}) => {
  const [expanded, setExpanded] = useState(false)
  const autoProps = structToEntries(event.autoProperties)
  const customProps = structToEntries(event.customProperties)
  const wellKnown = getWellKnownFields(event.kind)
  const headlineField = getHeadlineField(event.kind)
  const headlineValue = headlineField ? structGet(event.customProperties, headlineField) : null
  const sourceKeys = wellKnown.length > 0 ? wellKnown : customProps.map(([k]) => k)
  const inlineProps = sourceKeys
    .filter(k => k !== headlineField)
    .flatMap(k => { const v = structGet(event.customProperties, k); return v != null ? [[k, v] as [string, string]] : [] })
    .slice(0, headlineValue ? 2 : 3)
  const hasMore = autoProps.length > 0 || customProps.length > 3
  const colors = getSeriesColor(event.kind)

  return (
    <div
      className={cn('group relative pl-8 border-b border-border/50', hasMore && 'cursor-pointer')}
      onClick={() => hasMore && setExpanded(!expanded)}
    >
      <div className='absolute left-2.75 top-0 bottom-0 w-px bg-border' />
      <div
        className='absolute left-1.5 top-3.5 w-3 h-3 rounded-full border-2 border-background'
        style={{ backgroundColor: colors.dot }}
      />

      <div className={cn('py-2.5 pr-3 transition-colors', hasMore && 'hover:bg-muted/40')}>
        <div className='flex items-center gap-2'>
          <Badge variant='secondary' className='text-[11px] font-medium px-2 py-0.5' style={{ backgroundColor: colors.fill, color: colors.dot }}>
            {event.kind}
          </Badge>
          {timeLabel && (
            <span className='text-xs text-muted-foreground tabular-nums whitespace-nowrap'>
              <HoverSwap primary={timeLabel.primary} secondary={timeLabel.secondary} />
            </span>
          )}
          {(headlineValue || inlineProps.length > 0) && (
            <div className='flex items-center gap-2 overflow-hidden'>
              {headlineValue && (
                <span className='text-[11px] whitespace-nowrap'>
                  <span className='text-muted-foreground'>{headlineField}: </span>
                  <span className='font-mono text-foreground'>{headlineValue}</span>
                </span>
              )}
              {inlineProps.map(([k, v]) => (
                <span key={k} className='text-[11px] text-muted-foreground whitespace-nowrap'>
                  {k}: <span className='font-mono'>{v}</span>
                </span>
              ))}
            </div>
          )}
          {hasMore && (
            <span className='ml-auto'>
              {expanded ? (
                <ChevronDown className='w-3.5 h-3.5 text-muted-foreground' />
              ) : (
                <ChevronRight className='w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity' />
              )}
            </span>
          )}
        </div>

        {expanded && (
          <div className='mt-2'>
            <EventDetails event={event} />
          </div>
        )}
      </div>
    </div>
  )
}

export default TimelineEventItem
