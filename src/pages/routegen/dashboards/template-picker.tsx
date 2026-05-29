import type { ReactElement } from 'react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TEMPLATE_GROUPS, TILE_TEMPLATES, type TileTemplate } from './templates'

type TemplatePickerProps = {
  trigger: ReactElement
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (template: TileTemplate) => void
}

export const TemplatePicker = ({ trigger, open, onOpenChange, onSelect }: TemplatePickerProps) => {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const matches = (template: TileTemplate) =>
    !normalized || `${template.displayName} ${template.description}`.toLowerCase().includes(normalized)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-80 p-2">
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search tile types…"
          className="mb-1 h-8"
        />
        <div className="max-h-80 space-y-3 overflow-auto">
          {TEMPLATE_GROUPS.map(({ label, group }) => {
            const items = TILE_TEMPLATES.filter(template => template.group === group && matches(template))
            if (items.length === 0) return null
            return (
              <div key={group}>
                <div className="mb-1 px-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  {label}
                </div>
                {items.map(template => {
                  const Icon = template.icon
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                      onClick={() => onSelect(template)}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block font-medium text-sm">{template.displayName}</span>
                        <span className="block text-muted-foreground text-xs">{template.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
