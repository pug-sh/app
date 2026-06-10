import { GripVertical } from 'lucide-react'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { InlineEditableText } from './editor-shared'

// Edit-mode tile header: the grip is the *only* drag handle (matched by
// react-grid-layout's draggableHandle), and the title/description are
// inline-editable in place. When the title is hidden, collapse to just the grip
// plus a muted hint so the editor reflects the hidden state.
export const TileHeaderEdit = ({
  tile,
  onPatch,
  hideTitle,
}: {
  tile: DashboardTile
  onPatch: (patch: Partial<DashboardTile>) => void
  hideTitle?: boolean
}) => (
  <div className="mb-2 flex items-start gap-2 pr-8">
    <span
      className="tile-drag-handle mt-0.5 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
      aria-label="Drag to move tile"
    >
      <GripVertical className="size-4" />
    </span>
    {hideTitle ? (
      <span className="mt-0.5 text-muted-foreground/50 text-xs italic">Title hidden</span>
    ) : (
      <div className="min-w-0 flex-1">
        <InlineEditableText
          value={tile.displayName}
          onChange={next => onPatch({ displayName: next })}
          placeholder="Untitled tile"
          className="font-semibold text-sm outline-hidden"
        />
        <InlineEditableText
          value={tile.description}
          onChange={next => onPatch({ description: next })}
          placeholder="Add a description"
          className="text-muted-foreground text-xs outline-hidden"
        />
      </div>
    )}
  </div>
)
