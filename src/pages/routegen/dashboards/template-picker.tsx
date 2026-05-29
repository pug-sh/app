import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TileSectionHeader } from './editor-shared'
import { TEMPLATE_GROUPS, TILE_TEMPLATES, type TileTemplate } from './templates'

type InlineTemplatePickerProps = {
  onSelect: (template: TileTemplate) => void
  // When provided, render a collapse (×) control — used for the "add another
  // tile" flow. Omitted on an empty dashboard, where the picker is shown
  // directly and there is nothing to collapse back to.
  onCancel?: () => void
}

// Inline add-tile picker: renders the tile templates as a grid of light bordered
// option tiles directly in the canvas flow (no popover). Grouped under the shared
// section-divider headers to match the rest of the editor.
export const InlineTemplatePicker = ({ onSelect, onCancel }: InlineTemplatePickerProps) => {
  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-medium text-sm">Add a tile</span>
        {onCancel ? (
          <Button size="icon-xs" variant="ghost" onClick={onCancel} aria-label="Close">
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="space-y-4">
        {TEMPLATE_GROUPS.map(({ label, group }) => {
          const items = TILE_TEMPLATES.filter(template => template.group === group)
          if (items.length === 0) return null
          return (
            <div key={group}>
              <TileSectionHeader title={label} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map(template => {
                  const Icon = template.icon
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onSelect(template)}
                      className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3 text-left transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-sm">{template.displayName}</span>
                        <span className="mt-0.5 block text-muted-foreground text-xs">{template.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
