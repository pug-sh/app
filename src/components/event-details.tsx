import { Toggle } from '@/components/ui/toggle'
import { structToEntries, structGet } from '@/lib/struct'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { tsToDate } from '@/lib/timestamp'
import { getWellKnownFields } from '@/lib/well-known-events'
import { Braces } from 'lucide-react'
import { useState } from 'react'

export const EventDetails = ({ event }: { event: ActivityEvent }) => {
  const [jsonMode, setJsonMode] = useState(false)
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const wellKnownFields = getWellKnownFields(event.kind)
  const knownProps = wellKnownFields.length > 0
    ? wellKnownFields.flatMap(k => { const v = structGet(event.customProperties, k); return v != null ? [[k, v] as [string, string]] : [] })
    : structToEntries(event.customProperties)
  const sectionLabel = wellKnownFields.length > 0 ? 'Properties' : 'Custom'

  const PropChip = ({ k, v }: { k: string; v: string }) => (
    <span className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'>
      <span className='text-muted-foreground'>{k}</span>
      <span className='font-mono'>{v}</span>
    </span>
  )

  return (
    <div className='space-y-2' onClick={e => e.stopPropagation()}>
      <Toggle size='sm' pressed={jsonMode} onPressedChange={setJsonMode}>
        <Braces className='w-3.5 h-3.5' />
      </Toggle>
      {jsonMode ? (
        <pre className='text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all'>
          {JSON.stringify(
            {
              event_id: event.eventId,
              kind: event.kind,
              distinct_id: event.distinctId,
              session_id: event.sessionId || undefined,
              occur_time: d?.toISOString(),
              auto_properties: event.autoProperties,
              custom_properties: event.customProperties,
            },
            null,
            2
          )}
        </pre>
      ) : (
        <>
          {autoProps.length > 0 && (
            <div>
              <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>System</p>
              <div className='flex flex-wrap gap-1'>
                {autoProps.map(([k, v]) => <PropChip key={k} k={k} v={v} />)}
              </div>
            </div>
          )}
          {knownProps.length > 0 && (
            <div>
              <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>{sectionLabel}</p>
              <div className='flex flex-wrap gap-1'>
                {knownProps.map(([k, v]) => <PropChip key={k} k={k} v={v} />)}
              </div>
            </div>
          )}
          <p className='text-[10px] text-muted-foreground/40 font-mono'>{event.eventId}</p>
        </>
      )}
    </div>
  )
}
