import { useState } from 'react'
import type { GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { PropertyPickerList } from '@/components/event-filters'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// A labelled property picker sized to sit in a row of OptionChips. Shared by the insight-type
// control rows (top-k, map) so the chips in one row stay one shape.
export const InsightPropertyChip = ({
  label,
  value,
  placeholder,
  schema,
  schemaError,
  onSelect,
}: {
  label: string
  value: string
  placeholder: string
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  onSelect: (name: string) => void
}) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7 hover:bg-muted/40 transition-colors">
        <span className="px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-xs">{label}</span>
        <span className={cn('px-2 h-full flex items-center', value ? 'font-mono' : 'text-muted-foreground')}>
          {value || placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <PropertyPickerList
          schema={schema}
          schemaError={schemaError}
          placeholder={`${placeholder}...`}
          mode={{ kind: 'pick' }}
          onSelect={name => {
            onSelect(name)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
