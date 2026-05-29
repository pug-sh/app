import { useEffect, useMemo, useRef, useState } from 'react'
import { type LayoutItem, Responsive, type ResponsiveLayouts, WidthProvider } from 'react-grid-layout/legacy'
import { type DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { BREAKPOINTS, COLS, TILE_MIN_H, TILE_MIN_W } from './constants'
import { tilePosition } from './draft-state'
import { DashboardTileBody } from './tiles'
import type { TileType } from './types'

import 'react-grid-layout/css/styles.css'
import './grid.css'

const ResponsiveGridLayoutWithWidth = WidthProvider(Responsive)

// Grid metrics. The react-grid-layout margin is 0 so tiles occupy whole integer
// cells edge-to-edge — continuous layouts are possible. The visual gap between
// cards is a per-card inset (GRID_GAP, applied as p-2 below), not structural
// margin. Row height folds in the old row pitch (24px row + 16px margin) so tiles
// migrated from the legacy per-breakpoint layouts keep the same rendered size.
const GRID_ROW_HEIGHT = 40
const GRID_GAP = 16

export type DashboardLayouts = ResponsiveLayouts<keyof typeof BREAKPOINTS>

export type DashboardMode = 'view' | 'edit'

const getTileType = (tile: DashboardTile): TileType => (tile.content.case === 'markdown' ? 'markdown' : 'insight')

const getKindMinHeight = (kind: TileType) => (kind === 'insight' ? 7 : TILE_MIN_H)

// KPI tiles render a single number (± sparkline), so they get a compact min
// height rather than inheriting the chart min that would force them tall and
// leave a large empty band. Min 4 (not lower): below this the title + number +
// delta + sparkline clip.
const KPI_MIN_H = 4
const isKpiTile = (tile: DashboardTile) =>
  tile.content.case === 'insight' && tile.viewMode === DashboardTileViewMode.KPI

const getTileMinHeight = (tile: DashboardTile) => (isKpiTile(tile) ? KPI_MIN_H : getKindMinHeight(getTileType(tile)))

// Build react-grid-layout's single-breakpoint layout from each tile's stored
// position (migrated from legacy per-breakpoint layouts by tilePosition). Min
// width/height come from the tile kind, not storage, so a tile whose kind min
// shrank (e.g. a KPI tile) can still be resized down past a stale persisted min.
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

// Snap-grid guide overlay shown behind tiles in edit mode. Cells are uniform
// (margin 0): --col-w is the measured column width (canvas / cols) and --row-h
// the row height. Within every cell a pair of lines is drawn at the card inset
// and at (cell - inset) — exactly where card borders land — so gaps read as
// double lines and tiles snap onto them whether spaced or placed continuously.
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
      style={
        columnWidth > 0
          ? ({
              backgroundSize: `${columnWidth}px ${GRID_ROW_HEIGHT}px`,
              '--col-w': `${columnWidth}px`,
              '--row-h': `${GRID_ROW_HEIGHT}px`,
              '--inset': `${GRID_GAP / 2}px`,
            } as React.CSSProperties)
          : undefined
      }
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
}) => {
  const layouts = useMemo(() => getLayoutsForTiles(tiles), [tiles])
  const editable = mode === 'edit'
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

  return (
    <div className="relative">
      {editable ? <GridGuides /> : null}
      <ResponsiveGridLayoutWithWidth
        className="layout dashboard-grid"
        breakpoints={BREAKPOINTS}
        cols={COLS}
        layouts={layouts}
        rowHeight={GRID_ROW_HEIGHT}
        margin={[0, 0]}
        containerPadding={[0, 0]}
        isDraggable={editable}
        isResizable={editable}
        draggableCancel="button, a, input, textarea, [contenteditable='true'], [data-no-drag='true'], .react-resizable-handle"
        draggableHandle=".tile-drag-handle"
        onDragStop={layout => persistLayout(layout)}
        onResizeStop={layout => persistLayout(layout)}
      >
        {tiles.map(tile => (
          // The grid item is the whole cell; p-2 insets the card so adjacent
          // cards show a GRID_GAP (16px) gap without any structural margin.
          <div key={tile.id} className="group flex h-full min-h-0 flex-col p-2">
            {/* Selection, the highlight ref, and the click handler live on this
              inner node, not the grid-item root: react-grid-layout clones the root
              (wrapping it in <DraggableCore>/<Resizable>) and overwrites its
              onMouseDown and ref with its own. Props nested here are never clobbered. */}
            <div
              ref={highlightTileId === tile.id ? highlightRef : undefined}
              onMouseDown={handleTileSelect(tile)}
              className={[
                'min-h-0 flex-1',
                selectedTileId === tile.id ? 'rounded-lg outline outline-2 outline-primary/40 outline-offset-2' : '',
                highlightTileId === tile.id ? 'rounded-lg outline outline-2 outline-amber-400 outline-offset-2' : '',
              ].join(' ')}
            >
              <DashboardTileBody
                tile={tile}
                editing={editable}
                onPatch={editable && onPatchTile ? patch => onPatchTile(tile.id, patch) : undefined}
                globalTimeRange={globalTimeRange}
                globalGranularity={globalGranularity}
                onDuplicate={editable ? onDuplicateTile : undefined}
              />
            </div>
          </div>
        ))}
      </ResponsiveGridLayoutWithWidth>
    </div>
  )
}
