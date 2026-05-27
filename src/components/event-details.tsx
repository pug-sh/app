import { Braces, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { Button } from '@/components/ui/button'
import { PropChip } from '@/components/ui/prop-chip'
import { Toggle } from '@/components/ui/toggle'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { structToEntries } from '@/lib/struct'
import { tsToDate } from '@/lib/timestamp'
import { partitionEventProps } from '@/lib/well-known-events'

export const EventDetails = ({ event }: { event: ActivityEvent }) => {
  const [jsonMode, setJsonMode] = useState(false)
  const { copied, copy } = useCopyToClipboard()
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const { schemaProps, extraProps } = partitionEventProps(event.kind, event.customProperties)

  const json = JSON.stringify(
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
    2,
  )

  return (
    <div className="space-y-2" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <Toggle size="sm" pressed={jsonMode} onPressedChange={setJsonMode}>
          <Braces className="w-3.5 h-3.5" />
        </Toggle>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => copy(json)}
          aria-label="Copy raw JSON"
          title="Copy raw JSON"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
      {jsonMode ? (
        <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {json}
        </pre>
      ) : (
        <>
          {autoProps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">System</p>
              <div className="flex flex-wrap gap-1">
                {autoProps.map(([k, v]) => (
                  <PropChip key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          )}
          {schemaProps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Properties</p>
              <div className="flex flex-wrap gap-1">
                {schemaProps.map(([k, v]) => (
                  <PropChip key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          )}
          {extraProps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Custom</p>
              <div className="flex flex-wrap gap-1">
                {extraProps.map(([k, v]) => (
                  <PropChip key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/40 font-mono">{event.eventId}</p>
        </>
      )}
    </div>
  )
}
