import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type LayoutItem, Responsive, type ResponsiveLayouts, WidthProvider } from 'react-grid-layout/legacy'
import { type DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { useIsMobile } from '@/hooks/use-mobile'
import { BREAKPOINTS, COLS, TILE_MIN_H, TILE_MIN_W } from './constants'
import { tilePosition } from './draft-state'
import { DashboardTileBody } from './tiles'
import type { TileType } from './types'

import 'react-grid-layout/css/styles.css'
import './grid.css'

const ResponsiveGridLayoutWithWidth = WidthProvider(Responsive)

// Fine uniform grid with a high column count (COLS.lg), so one column ≈ the visual
// gap (~18px). Horizontally, margin is 0 and a gap between tiles is just an empty
// column track — adjacent tiles with no empty track sit flush.
//
// Vertically the grid auto-compacts (compactType 'vertical', below): dragging a tile
// onto another reflows the displaced tile UP into the vacated slot — a true swap —
// instead of only ever shoving it down. Compaction removes the empty ROW tracks that
// used to space stacked tiles, so vertical breathing room moves to a margin: the row
// PITCH is split into a short tile row (GRID_ROW_HEIGHT) plus a gutter (GRID_V_GUTTER).
// Because the pitch stays 18px, every stored tile position lands exactly where it
// always did — each tile is simply GRID_V_GUTTER px shorter, and that shaved strip is
// the gap to the tile below.
const GRID_PITCH = 18
const GRID_V_GUTTER = 14
const GRID_ROW_HEIGHT = GRID_PITCH - GRID_V_GUTTER

export type DashboardLayouts = ResponsiveLayouts<keyof typeof BREAKPOINTS>

export type DashboardMode = 'view' | 'edit'

const getTileType = (tile: DashboardTile): TileType => (tile.content.case === 'markdown' ? 'markdown' : 'insight')

// Min heights in fine rows (~18px each). Charts need real height; KPI tiles are
// compact (single number ± sparkline); markdown sits in between.
const getKindMinHeight = (kind: TileType) => (kind === 'insight' ? 15 : TILE_MIN_H)
const KPI_MIN_H = 9
const isKpiTile = (tile: DashboardTile) =>
  tile.content.case === 'insight' && tile.viewMode === DashboardTileViewMode.KPI

const getTileMinHeight = (tile: DashboardTile) => (isKpiTile(tile) ? KPI_MIN_H : getKindMinHeight(getTileType(tile)))

// Build react-grid-layout's single-breakpoint layout from each tile's stored
// position. Min width/height come from the tile kind, not storage, so a tile whose
// kind min shrank (e.g. a KPI tile) can still be resized down past a stale min.
const getLayoutsForTiles = (tiles: DashboardTile[]): DashboardLayouts => ({
  lg: tiles.map(tile => {
    const pos = tilePosition(tile)
    const minH = getTileMinHeight(tile)
    return {
      i: tile.id,
      x: pos.x,
      y: pos.y,
      w: pos.w,
      h: Math.max(pos.h, minH),
      minW: TILE_MIN_W,
      minH,
      static: false,
    }
  }),
})

// Faint snap-grid behind tiles in edit mode: one line per fine column/row, so the
// snap targets — and where a tile will sit flush vs leave a gap — are visible.
const GridGuides = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [columnWidth, setColumnWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setColumnWidth(el.clientWidth / COLS.lg)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden
      className="dashboard-grid-guides pointer-events-none absolute inset-0"
      style={columnWidth > 0 ? { backgroundSize: `${columnWidth}px ${GRID_PITCH}px` } : undefined}
    />
  )
}

export const DashboardGrid = ({
  tiles,
  mode = 'view',
  selectedTileId,
  highlightTileId,
  onDuplicateTile,
  onSelectTile,
  onPatchTile,
  onLayoutsChange,
  globalTimeRange,
  globalGranularity,
  renderTile,
}: {
  tiles: DashboardTile[]
  mode?: DashboardMode
  // The currently-selected tile id (drives a focus ring in edit mode).
  selectedTileId?: string | null
  // A just-added tile to briefly highlight and scroll into view.
  highlightTileId?: string | null
  onDuplicateTile?: (tile: DashboardTile) => void
  onSelectTile?: (tileId: string) => void
  onPatchTile?: (tileId: string, patch: Partial<DashboardTile>) => void
  onLayoutsChange?: (layouts: DashboardLayouts) => void
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
  // Override how each tile's body renders. Defaults to the editable DashboardTileBody;
  // the public/read-only viewer passes a body that renders pre-computed results.
  renderTile?: (tile: DashboardTile) => ReactNode
}) => {
  const layouts = useMemo(() => getLayoutsForTiles(tiles), [tiles])
  const editable = mode === 'edit'
  const isMobile = useIsMobile()
  const highlightRef = useRef<HTMLDivElement>(null)

  // Bring a just-added/duplicated tile into view so it never lands off-screen.
  useEffect(() => {
    if (highlightTileId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [highlightTileId])

  // Persist only on an explicit drag/resize stop, never on mount/reflow, so loading
  // a dashboard never triggers spurious writes. RGL hands the stop callback the
  // final layout array directly — we deliberately do NOT read it from onLayoutChange
  // via a ref, because RGL fires the stop callback *before* that final onLayoutChange,
  // so the ref would still hold the pre-edit layout.
  const persistLayout = (layout: readonly LayoutItem[]) => {
    if (!editable) return
    onLayoutsChange?.({ lg: layout })
  }

  const handleTileSelect = (tile: DashboardTile) => (event: React.MouseEvent) => {
    if (!editable || !onSelectTile) return
    const target = event.target as HTMLElement | null
    // Don't steal presses on the resize handle, controls, or editable text.
    if (
      target?.closest(
        '.react-resizable-handle, button, a, input, textarea, [contenteditable="true"], [data-no-drag="true"]',
      )
    )
      return
    onSelectTile(tile.id)
  }

  // The inner tile node, shared by the desktop grid and the mobile stack.
  // Selection, the highlight ref, and the click handler live here — not on the
  // grid-item root: react-grid-layout clones the root (wrapping it in
  // <DraggableCore>/<Resizable>) and overwrites its onMouseDown and ref with its
  // own. Props nested here are never clobbered.
  const renderTileContent = (tile: DashboardTile) => (
    <div
      ref={highlightTileId === tile.id ? highlightRef : undefined}
      onMouseDown={handleTileSelect(tile)}
      className={[
        'min-h-0 flex-1',
        selectedTileId === tile.id ? 'rounded-lg outline outline-2 outline-primary/40 outline-offset-2' : '',
        highlightTileId === tile.id ? 'rounded-lg outline outline-2 outline-amber-400 outline-offset-2' : '',
      ].join(' ')}
    >
      {renderTile ? (
        renderTile(tile)
      ) : (
        <DashboardTileBody
          tile={tile}
          editing={editable}
          onPatch={editable && onPatchTile ? patch => onPatchTile(tile.id, patch) : undefined}
          globalTimeRange={globalTimeRange}
          globalGranularity={globalGranularity}
          onDuplicate={editable ? onDuplicateTile : undefined}
        />
      )}
    </div>
  )

  // Narrow viewports can't honor the proportional 72-column layout — a half-width
  // tile would be ~180px, a KPI ~60px. Stack every tile full-width in reading
  // order (top-to-bottom, then left-to-right) at its authored height, bypassing
  // react-grid-layout entirely. Keyed off the viewport (not the grid container),
  // so opening the edit config rail never trips it; drag/resize is desktop-only.
  if (isMobile) {
    const ordered = [...tiles].sort((a, b) => {
      const pa = tilePosition(a)
      const pb = tilePosition(b)
      return pa.y - pb.y || pa.x - pb.x
    })
    return (
      <div className="flex flex-col gap-4">
        {ordered.map(tile => {
          const pos = tilePosition(tile)
          const height = Math.max(pos.h, getTileMinHeight(tile)) * GRID_PITCH
          return (
            <div key={tile.id} className="group flex flex-col" style={{ height }}>
              {renderTileContent(tile)}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative">
      {editable ? <GridGuides /> : null}
      <ResponsiveGridLayoutWithWidth
        className="layout dashboard-grid"
        breakpoints={BREAKPOINTS}
        cols={COLS}
        layouts={layouts}
        rowHeight={GRID_ROW_HEIGHT}
        margin={[0, GRID_V_GUTTER]}
        containerPadding={[0, 0]}
        compactType="vertical"
        isDraggable={editable}
        isResizable={editable}
        draggableCancel="button, a, input, textarea, [contenteditable='true'], [data-no-drag='true'], .react-resizable-handle"
        draggableHandle=".tile-drag-handle"
        onDragStop={layout => persistLayout(layout)}
        onResizeStop={layout => persistLayout(layout)}
      >
        {tiles.map(tile => (
          // Cards fill their cell (no inset). Horizontally a gap is an empty column
          // track; vertical spacing is the grid's row gutter (see GRID_PITCH).
          <div key={tile.id} className="group flex h-full min-h-0 flex-col">
            {renderTileContent(tile)}
          </div>
        ))}
      </ResponsiveGridLayoutWithWidth>
    </div>
  )
}
