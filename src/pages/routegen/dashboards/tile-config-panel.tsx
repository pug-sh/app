import { PanelRightClose, PanelRightOpen, X } from 'lucide-react'
import { useState } from 'react'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { InlineEditableText } from './editor-shared'
import { DataTab } from './panels/data-tab'
import { DisplayTab } from './panels/display-tab'
import { FormatTab } from './panels/format-tab'

type Tab = 'data' | 'display' | 'format'

export type TileConfigPanelProps = {
  tile: DashboardTile | null
  collapsed: boolean
  onToggleCollapse: () => void
  onClose: () => void
  onPatch: (patch: Partial<DashboardTile>) => void
  onDelete: () => void
  onDuplicate: () => void
}

export const TileConfigPanel = ({
  tile,
  collapsed,
  onToggleCollapse,
  onClose,
  onPatch,
  onDelete,
  onDuplicate,
}: TileConfigPanelProps) => {
  const [tab, setTab] = useState<Tab>('data')

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 shrink-0 flex-col items-center border-border/60 border-l bg-background py-3">
        <Button size="icon-xs" variant="ghost" onClick={onToggleCollapse} aria-label="Expand panel">
          <PanelRightOpen className="size-4" />
        </Button>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-border/60 border-l bg-background">
      <div className="flex items-center justify-between gap-2 border-border/60 border-b px-4 py-3">
        {tile ? (
          <div className="min-w-0 flex-1">
            <InlineEditableText
              value={tile.displayName}
              onChange={next => onPatch({ displayName: next })}
              placeholder="Untitled tile"
              className="font-semibold text-sm outline-hidden"
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1 truncate font-semibold text-sm">Tile settings</div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon-xs" variant="ghost" onClick={onToggleCollapse} aria-label="Collapse panel">
            <PanelRightClose className="size-4" />
          </Button>
          {tile ? (
            <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Deselect tile">
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {tile ? (
        <>
          <div className="flex border-border/60 border-b px-2">
            {(['data', 'display', 'format'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  'px-3 py-2 font-medium text-xs uppercase tracking-wider transition-colors',
                  tab === t
                    ? 'border-primary border-b-2 text-foreground'
                    : 'border-transparent border-b-2 text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {tab === 'data' ? <DataTab tile={tile} onPatch={onPatch} /> : null}
            {tab === 'display' ? <DisplayTab tile={tile} onPatch={onPatch} /> : null}
            {tab === 'format' ? <FormatTab tile={tile} onPatch={onPatch} /> : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-border/60 border-t px-4 py-2">
            <Button size="sm" variant="ghost" onClick={onDuplicate}>
              Duplicate
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-muted-foreground text-sm">
          Select a tile to edit its data, display, and format.
        </div>
      )}
    </aside>
  )
}
