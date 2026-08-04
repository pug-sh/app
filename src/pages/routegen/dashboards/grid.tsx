import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type LayoutItem, Responsive, type ResponsiveLayouts, WidthProvider } from 'react-grid-layout/legacy'
import { type DashboardTile, DashboardTileViewMode } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { useIsMobile } from '@/hooks/use-mobile'
import { BREAKPOINTS, TILE_MIN_H } from './constants'
import { tilePosition } from './draft-state'
import {
  type DashboardGridMode,
  DISPLAY_GRID_COLUMNS,
  gridPositionForStorage,
  STORED_GRID_COLUMNS,
  storedPositionForGrid,
} from './grid-layout'
import { DashboardTileBody } from './tiles'
import type { TileType } from './types'

import 'react-grid-layout/css/styles.css'
import './grid.css'

const ResponsiveGridLayoutWithWidth = WidthProvider(Responsive)

// Both modes retain the same 18px vertical pitch and native 72-unit storage.
// Free mode is the original fine-grained canvas: 72 horizontal snap points and
// no imposed horizontal gutter. The standard mode renders those coordinates on
// 12 columns with a fixed gutter, translating only at the component boundary.
const GRID_PITCH = 18
const GRID_CONFIG = {
  free: {
    columns: STORED_GRID_COLUMNS,
    horizontalGap: 0,
    verticalGap: 14,
    minWidth: 12,
  },
  'columns-12': {
    columns: DISPLAY_GRID_COLUMNS,
    horizontalGap: 16,
    verticalGap: 16,
    minWidth: 2,
  },
} as const satisfies Record<
  DashboardGridMode,
  { columns: number; horizontalGap: number; verticalGap: number; minWidth: number }
>

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
const getLayoutsForTiles = (tiles: DashboardTile[], gridMode: DashboardGridMode): DashboardLayouts => ({
  lg: tiles.map(tile => {
    const pos = storedPositionForGrid(tilePosition(tile), gridMode)
    const minH = getTileMinHeight(tile)
    return {
      i: tile.id,
      x: pos.x,
      y: pos.y,
      w: pos.w,
      h: Math.max(pos.h, minH),
      minW: GRID_CONFIG[gridMode].minWidth,
      minH,
      static: false,
    }
  }),
})

// Faint snap-grid behind tiles in edit mode: one line per active column/row, so
// switching modes also makes the change in available snap targets visible.
const GridGuides = ({ gridMode }: { gridMode: DashboardGridMode }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [columnWidth, setColumnWidth] = useState(0)
  const config = GRID_CONFIG[gridMode]

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setColumnWidth((el.clientWidth + config.horizontalGap) / config.columns)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [config.columns, config.horizontalGap])

  return (
    <div
      ref={ref}
      aria-hidden
      data-grid-mode={gridMode}
      className="dashboard-grid-guides pointer-events-none absolute inset-0"
      style={
        gridMode === 'free' && columnWidth > 0 ? { backgroundSize: `${columnWidth}px ${GRID_PITCH}px` } : undefined
      }
    >
      {gridMode === 'columns-12' ? (
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
            columnGap: config.horizontalGap,
          }}
        >
          {Array.from({ length: config.columns }, (_, index) => (
            <span key={index} className="dashboard-grid-guide-column" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const DashboardGrid = ({
  tiles,
  mode = 'view',
  gridMode = 'free',
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
  gridMode?: DashboardGridMode
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
  const layouts = useMemo(() => getLayoutsForTiles(tiles, gridMode), [tiles, gridMode])
  const editable = mode === 'edit'
  const isMobile = useIsMobile()
  const highlightRef = useRef<HTMLDivElement>(null)
  const gridConfig = GRID_CONFIG[gridMode]

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
    onLayoutsChange?.({
      lg: layout.map(item => ({ ...item, ...gridPositionForStorage(item, gridMode) })),
    })
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
      {editable ? <GridGuides gridMode={gridMode} /> : null}
      <ResponsiveGridLayoutWithWidth
        key={gridMode}
        className="layout dashboard-grid"
        breakpoints={BREAKPOINTS}
        cols={{ lg: gridConfig.columns }}
        layouts={layouts}
        rowHeight={GRID_PITCH - gridConfig.verticalGap}
        margin={[gridConfig.horizontalGap, gridConfig.verticalGap]}
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
          // Cards fill their cell; react-grid-layout supplies the fixed gutter.
          <div key={tile.id} className="group flex h-full min-h-0 flex-col">
            {renderTileContent(tile)}
          </div>
        ))}
      </ResponsiveGridLayoutWithWidth>
    </div>
  )
}
