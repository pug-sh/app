import { create } from '@bufbuild/protobuf'
import { useEffect, useMemo, useRef } from 'react'
import { type LayoutItem, Responsive, type ResponsiveLayouts, WidthProvider } from 'react-grid-layout/legacy'
import {
  type DashboardTile,
  DashboardTileViewMode,
  ResponsiveGridLayoutSchema,
} from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { BREAKPOINT_KEYS, BREAKPOINTS, COLS, TILE_MIN_H, TILE_MIN_W } from './constants'
import { DashboardTileBody } from './tiles'
import type { TileType } from './types'

import 'react-grid-layout/css/styles.css'
import './grid.css'

const ResponsiveGridLayoutWithWidth = WidthProvider(Responsive)

export type DashboardLayouts = ResponsiveLayouts<keyof typeof BREAKPOINTS>

export type DashboardMode = 'view' | 'edit'

const getTileType = (tile: DashboardTile): TileType => (tile.content.case === 'markdown' ? 'markdown' : 'insight')

const getKindDefaultHeight = (_kind: TileType) => 8
const getKindMinHeight = (kind: TileType) => (kind === 'insight' ? 7 : TILE_MIN_H)

// KPI tiles render a single number (± sparkline), so they get compact sizing
// rather than inheriting the chart min-height that would otherwise force them
// tall and leave a large empty band.
const KPI_DEFAULT_H = 4
// Min 4 (not lower): below this the title + number + delta + sparkline clip.
const KPI_MIN_H = 4
const isKpiTile = (tile: DashboardTile) =>
  tile.content.case === 'insight' && tile.viewMode === DashboardTileViewMode.KPI

const getTileDefaultHeight = (tile: DashboardTile) =>
  isKpiTile(tile) ? KPI_DEFAULT_H : getKindDefaultHeight(getTileType(tile))
const getTileMinHeight = (tile: DashboardTile) => (isKpiTile(tile) ? KPI_MIN_H : getKindMinHeight(getTileType(tile)))

const getLayoutBase = (tile: DashboardTile, breakpoint: keyof typeof BREAKPOINTS, fallbackY: number) => {
  const existing = tile.layouts.find(layout => layout.breakpoint === breakpoint)
  if (existing) {
    const minHeight = getTileMinHeight(tile)
    return {
      ...existing,
      // Take the minimum from the current tile kind, not the stored layout, so a
      // tile whose kind min shrank (e.g. a KPI tile, now min 4) can be resized
      // down past a stale stored minH (older KPI layouts persisted minH: 7).
      h: Math.max(existing.h, minHeight),
      minH: minHeight,
    }
  }

  const width = Math.min(COLS[breakpoint], 6)
  return {
    breakpoint,
    x: 0,
    y: fallbackY,
    w: width,
    h: getTileDefaultHeight(tile),
    minW: TILE_MIN_W,
    maxW: 0,
    minH: getTileMinHeight(tile),
    maxH: 0,
    static: false,
  }
}

const getLayoutsForTiles = (tiles: DashboardTile[]) => {
  const layouts: DashboardLayouts = {}
  for (const breakpoint of BREAKPOINT_KEYS) {
    let nextY = 0
    layouts[breakpoint] = tiles.map(tile => {
      const layout = getLayoutBase(tile, breakpoint, nextY)
      nextY = Math.max(nextY, layout.y + layout.h)
      return {
        i: tile.id,
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h,
        minW: layout.minW || TILE_MIN_W,
        minH: layout.minH || TILE_MIN_H,
        maxW: layout.maxW || undefined,
        maxH: layout.maxH || undefined,
        static: layout.static,
      }
    })
  }
  return layouts
}

const layoutItemToProto = (
  item: LayoutItem,
  breakpoint: keyof typeof BREAKPOINTS,
  existing?: DashboardTile['layouts'][number],
) =>
  create(ResponsiveGridLayoutSchema, {
    breakpoint,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW ?? existing?.minW ?? TILE_MIN_W,
    maxW: item.maxW ?? existing?.maxW ?? 0,
    minH: item.minH ?? existing?.minH ?? TILE_MIN_H,
    maxH: item.maxH ?? existing?.maxH ?? 0,
    static: item.static ?? existing?.static ?? false,
  })

export const withUpdatedLayouts = (tile: DashboardTile, layouts: DashboardLayouts) => {
  const nextLayouts = BREAKPOINT_KEYS.flatMap(breakpoint => {
    const current = layouts[breakpoint]?.find(item => item.i === tile.id)
    if (!current) return []
    const existing = tile.layouts.find(layout => layout.breakpoint === breakpoint)
    return [layoutItemToProto(current, breakpoint, existing)]
  })

  return {
    ...tile,
    layouts: nextLayouts.length > 0 ? nextLayouts : tile.layouts,
  }
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
  const latestLayoutsRef = useRef<DashboardLayouts | null>(null)
  const editable = mode === 'edit'
  const highlightRef = useRef<HTMLDivElement>(null)

  // Bring a just-added/duplicated tile into view so it never lands off-screen.
  useEffect(() => {
    if (highlightTileId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [highlightTileId])

  // react-grid-layout fires onLayoutChange on mount and breakpoint reflow, not just on user
  // edits. Record the latest layout there, but only persist on an explicit drag/resize stop
  // so loading a dashboard never triggers spurious updateTile writes.
  const persistLatestLayouts = () => {
    if (!editable) return
    if (latestLayoutsRef.current) {
      onLayoutsChange?.(latestLayoutsRef.current)
    }
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
    <ResponsiveGridLayoutWithWidth
      className="layout dashboard-grid"
      breakpoints={BREAKPOINTS}
      cols={COLS}
      layouts={layouts}
      rowHeight={24}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isDraggable={editable}
      isResizable={editable}
      draggableCancel="button, a, input, textarea, [contenteditable='true'], [data-no-drag='true'], .react-resizable-handle"
      draggableHandle=".tile-drag-handle"
      onLayoutChange={(_layout, allLayouts) => {
        latestLayoutsRef.current = allLayouts
      }}
      onDragStop={persistLatestLayouts}
      onResizeStop={persistLatestLayouts}
    >
      {tiles.map(tile => (
        <div
          key={tile.id}
          className={[
            'group flex h-full min-h-0 flex-col',
            selectedTileId === tile.id ? 'rounded-lg outline outline-2 outline-primary/40 outline-offset-2' : '',
            highlightTileId === tile.id ? 'rounded-lg outline outline-2 outline-amber-400 outline-offset-2' : '',
          ].join(' ')}
        >
          {/* Selection and the highlight ref live on this inner node, not the grid-item root:
              react-grid-layout clones the root (wrapping it in <DraggableCore>/<Resizable>) and
              overwrites its onMouseDown and ref with its own. Props nested here are never clobbered. */}
          <div
            ref={highlightTileId === tile.id ? highlightRef : undefined}
            className="min-h-0 flex-1"
            onMouseDown={handleTileSelect(tile)}
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
  )
}
