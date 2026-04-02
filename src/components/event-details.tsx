import { Toggle } from '@/components/ui/toggle'
import { structToEntries } from '@/lib/struct'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { tsToDate } from '@/lib/timestamp'
import { Braces } from 'lucide-react'
import { useState } from 'react'

export const EventDetails = ({ event }: { event: ActivityEvent }) => {
  const [jsonMode, setJsonMode] = useState(false)
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const customProps = structToEntries(event.customProperties)

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
                {autoProps.map(([k, v]) => (
                  <span key={k} className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'>
                    <span className='text-muted-foreground'>{k}</span>
                    <span className='font-mono'>{v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {customProps.length > 0 && (
            <div>
              <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>Custom</p>
              <div className='flex flex-wrap gap-1'>
                {customProps.map(([k, v]) => (
                  <span key={k} className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'>
                    <span className='text-muted-foreground'>{k}</span>
                    <span className='font-mono'>{v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className='text-[10px] text-muted-foreground/40 font-mono'>{event.eventId}</p>
        </>
      )}
    </div>
  )
}
