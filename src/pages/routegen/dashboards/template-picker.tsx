import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TILE_TEMPLATES, type TileTemplate } from './templates'

type TemplatePickerProps = {
  onSelect: (template: TileTemplate) => void
  onClose: () => void
}

export const TemplatePicker = ({ onSelect, onClose }: TemplatePickerProps) => (
  <div className="rounded-lg border border-border/60 bg-background p-4">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-semibold text-sm">Add a tile</h3>
      <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close picker">
        <X className="size-4" />
      </Button>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {TILE_TEMPLATES.map(template => {
        const Icon = template.icon
        return (
          <button
            key={template.id}
            type="button"
            className="flex flex-col gap-1.5 rounded-md border border-border/60 p-3 text-left transition-colors hover:bg-muted/40"
            onClick={() => onSelect(template)}
          >
            <Icon className="size-4 text-muted-foreground" />
            <div className="font-medium text-sm">{template.displayName}</div>
            <div className="text-muted-foreground text-xs">{template.description}</div>
          </button>
        )
      })}
    </div>
  </div>
)
