import { Loader2, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DashboardGridMode } from './grid-layout'

export const EditBar = ({
  dirtyCount,
  saving,
  gridMode,
  onGridModeChange,
  onSave,
  onDiscard,
}: {
  dirtyCount: number
  saving: boolean
  gridMode: DashboardGridMode
  onGridModeChange: (mode: DashboardGridMode) => void
  onSave: () => void
  onDiscard: () => void
}) => {
  const [confirming, setConfirming] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // Auto-revert the discard confirmation on any pointerdown outside the bar.
  useEffect(() => {
    if (!confirming) return
    const onPointerDown = (event: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) setConfirming(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [confirming])

  const handleDiscardClick = () => {
    // No changes → nothing to lose, exit immediately without confirming.
    if (dirtyCount === 0) {
      onDiscard()
      return
    }
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    onDiscard()
  }

  return (
    <div
      ref={barRef}
      className="sticky top-0 z-30 -mx-1 flex items-center gap-3 rounded-lg border border-warning/25 bg-warning/10 px-4 py-2"
    >
      <span className="flex items-center gap-2 font-medium text-caution text-sm">
        <Pencil className="size-3.5" />
        Editing
      </span>
      <span className="text-caution text-xs">
        {dirtyCount} {dirtyCount === 1 ? 'change' : 'changes'}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-caution text-xs">Grid</span>
        <ToggleGroup
          aria-label="Grid snapping"
          variant="outline"
          size="sm"
          value={[gridMode]}
          onValueChange={value => {
            const nextMode = value[0]
            if (nextMode === 'free' || nextMode === 'columns-12') onGridModeChange(nextMode)
          }}
        >
          <ToggleGroupItem value="free">Free</ToggleGroupItem>
          <ToggleGroupItem value="columns-12">12 columns</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {confirming ? <span className="text-caution text-xs">Discard {dirtyCount} changes?</span> : null}
        <Button
          size="sm"
          variant="ghost"
          className={confirming ? 'text-negative' : undefined}
          onClick={handleDiscardClick}
          disabled={saving}
        >
          {confirming ? 'Confirm discard' : 'Discard'}
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || dirtyCount === 0}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  )
}
