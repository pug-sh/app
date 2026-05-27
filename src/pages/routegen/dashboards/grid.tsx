import { create } from '@bufbuild/protobuf'
import { type RefObject, useMemo, useRef } from 'react'
import { type LayoutItem, Responsive, type ResponsiveLayouts } from 'react-grid-layout/legacy'
import { type DashboardTile, ResponsiveGridLayoutSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { Granularity } from '@/api/genproto/shared/insights/v1/insights_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { BREAKPOINT_KEYS, BREAKPOINTS, COLS, TILE_MIN_H, TILE_MIN_W } from './constants'
import { withPageWidth } from './page-width-provider'
import { DashboardTileBody } from './tiles'
import type { TileType } from './types'

import 'react-grid-layout/css/styles.css'
import './grid.css'

export type DashboardLayouts = ResponsiveLayouts<keyof typeof BREAKPOINTS>

export type DashboardMode = 'view' | 'edit'

const getTileType = (tile: DashboardTile): TileType => (tile.content.case === 'markdown' ? 'markdown' : 'insight')

const getKindDefaultHeight = (_kind: TileType) => 8
const getKindMinHeight = (kind: TileType) => (kind === 'insight' ? 7 : TILE_MIN_H)
const getTileDefaultHeight = (tile: DashboardTile) => getKindDefaultHeight(getTileType(tile))
const getTileMinHeight = (tile: DashboardTile) => getKindMinHeight(getTileType(tile))

const getLayoutBase = (tile: DashboardTile, breakpoint: keyof typeof BREAKPOINTS, fallbackY: number) => {
  const existing = tile.layouts.find(layout => layout.breakpoint === breakpoint)
  if (existing) {
    const minHeight = getTileMinHeight(tile)
    return {
      ...existing,
      h: Math.max(existing.h, minHeight),
      minH: Math.max(existing.minH || TILE_MIN_H, minHeight),
    }
  }

  const width = Math.min(COLS[breakpoint], breakpoint === 'lg' ? 6 : breakpoint === 'md' ? 5 : 4)
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

const getDefaultNewTileLayouts = (tiles: DashboardTile[], kind: TileType = 'insight') => {
  const layouts = getLayoutsForTiles(tiles)
  return BREAKPOINT_KEYS.map(breakpoint => {
    const items = layouts[breakpoint] ?? []
    const nextY = items.reduce((max, item) => Math.max(max, item.y + item.h), 0)
    const width = Math.min(COLS[breakpoint], breakpoint === 'lg' ? 6 : breakpoint === 'md' ? 5 : 4)
    const defaultHeight = getKindDefaultHeight(kind)
    const minHeight = getKindMinHeight(kind)
    return {
      breakpoint,
      x: 0,
      y: nextY,
      w: width,
      h: defaultHeight,
      minW: TILE_MIN_W,
      maxW: 0,
      minH: minHeight,
      maxH: 0,
      static: false,
    }
  })
}

export const buildCreatedTileLayouts = (tiles: DashboardTile[], kind: TileType = 'insight') =>
  getDefaultNewTileLayouts(tiles, kind).map(layout =>
    create(ResponsiveGridLayoutSchema, {
      breakpoint: layout.breakpoint,
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: layout.h,
      minW: layout.minW,
      maxW: layout.maxW,
      minH: layout.minH,
      maxH: layout.maxH,
      static: layout.static,
    }),
  )

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
  pageRef,
  mode = 'view',
  selectedTileId,
  onEditTile,
  onDeleteTile,
  onSelectTile,
  onLayoutsChange,
  globalTimeRange,
  globalGranularity,
}: {
  tiles: DashboardTile[]
  pageRef: RefObject<HTMLElement | null>
  mode?: DashboardMode
  // The currently-selected tile id (drives a focus ring in edit mode).
  selectedTileId?: string | null
  onEditTile?: (tile: DashboardTile) => void
  onDeleteTile?: (tile: DashboardTile) => void
  onSelectTile?: (tileId: string) => void
  onLayoutsChange?: (layouts: DashboardLayouts) => void
  globalTimeRange?: TimeRange
  globalGranularity?: Granularity
}) => {
  const layouts = useMemo(() => getLayoutsForTiles(tiles), [tiles])
  const latestLayoutsRef = useRef<DashboardLayouts | null>(null)
  const editable = mode === 'edit'

  const ResponsiveGridLayoutView = useMemo(() => withPageWidth(Responsive, pageRef), [pageRef])

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
    // Don't steal clicks on the resize handle, tile-menu controls, or text input.
    if (target?.closest('.react-resizable-handle, button, a, input, textarea, [data-no-drag="true"]')) return
    onSelectTile(tile.id)
  }

  return (
    <ResponsiveGridLayoutView
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
            editable ? 'cursor-grab active:cursor-grabbing' : '',
            selectedTileId === tile.id ? 'rounded-lg outline outline-2 outline-primary/40 outline-offset-2' : '',
          ].join(' ')}
          onMouseDown={handleTileSelect(tile)}
        >
          <div className="min-h-0 flex-1">
            <DashboardTileBody
              tile={tile}
              globalTimeRange={globalTimeRange}
              globalGranularity={globalGranularity}
              onEdit={editable ? onEditTile : undefined}
              onDelete={editable ? onDeleteTile : undefined}
            />
          </div>
        </div>
      ))}
    </ResponsiveGridLayoutView>
  )
}
