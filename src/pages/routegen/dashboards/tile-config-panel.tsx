import { X } from 'lucide-react'
import { useState } from 'react'
import type { DashboardTile } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import { Button } from '@/components/ui/button'
import { DataTab } from './panels/data-tab'
import { DisplayTab } from './panels/display-tab'
import { FormatTab } from './panels/format-tab'

type Tab = 'data' | 'display' | 'format'

export type TileConfigPanelProps = {
  tile: DashboardTile
  onClose: () => void
  onPatch: (patch: Partial<DashboardTile>) => void
  onDelete: () => void
  onDuplicate: () => void
}

export const TileConfigPanel = ({ tile, onClose, onPatch, onDelete, onDuplicate }: TileConfigPanelProps) => {
  const [tab, setTab] = useState<Tab>('data')

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-border/60 border-l bg-background">
      <div className="flex items-center justify-between gap-2 border-border/60 border-b px-4 py-3">
        <div className="min-w-0 truncate font-semibold text-sm">{tile.displayName || 'Untitled tile'}</div>
        <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </div>

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
    </aside>
  )
}
