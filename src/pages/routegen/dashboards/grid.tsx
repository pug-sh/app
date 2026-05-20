import { create } from '@bufbuild/protobuf'
import { LayoutGrid } from 'lucide-react'
import { useMemo } from 'react'
import { type LayoutItem, Responsive, type ResponsiveLayouts, WidthProvider } from 'react-grid-layout/legacy'
import { type DashboardTile, ResponsiveGridLayoutSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'
import type { TimeRange } from '@/components/date-range-picker'
import { BREAKPOINT_KEYS, BREAKPOINTS, COLS, TILE_MIN_H, TILE_MIN_W } from './constants'
import { DashboardTileBody } from './tiles'

import 'react-grid-layout/css/styles.css'

const ResponsiveGridLayoutView = WidthProvider(Responsive)

const getLayoutBase = (tile: DashboardTile, breakpoint: keyof typeof BREAKPOINTS, fallbackY: number) => {
  const existing = tile.layouts.find(layout => layout.breakpoint === breakpoint)
  if (existing) return existing

  const width = Math.min(COLS[breakpoint], breakpoint === 'lg' ? 6 : breakpoint === 'md' ? 5 : 4)
  return {
    breakpoint,
    x: 0,
    y: fallbackY,
    w: width,
    h: 8,
    minW: TILE_MIN_W,
    maxW: 0,
    minH: TILE_MIN_H,
    maxH: 0,
    static: false,
  }
}

const getLayoutsForTiles = (tiles: DashboardTile[]) => {
  const layouts: ResponsiveLayouts<keyof typeof BREAKPOINTS> = {}
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

const getDefaultNewTileLayouts = (tiles: DashboardTile[]) => {
  const layouts = getLayoutsForTiles(tiles)
  return BREAKPOINT_KEYS.map(breakpoint => {
    const items = layouts[breakpoint] ?? []
    const nextY = items.reduce((max, item) => Math.max(max, item.y + item.h), 0)
    const width = Math.min(COLS[breakpoint], breakpoint === 'lg' ? 6 : breakpoint === 'md' ? 5 : 4)
    return {
      breakpoint,
      x: 0,
      y: nextY,
      w: width,
      h: 8,
      minW: TILE_MIN_W,
      maxW: 0,
      minH: TILE_MIN_H,
      maxH: 0,
      static: false,
    }
  })
}

export const buildCreatedTileLayouts = (tiles: DashboardTile[]) =>
  getDefaultNewTileLayouts(tiles).map(layout =>
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

export const withUpdatedLayouts = (tile: DashboardTile, layouts: ResponsiveLayouts<keyof typeof BREAKPOINTS>) => {
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
  timeRange,
  editable,
  onEditTile,
  onDeleteTile,
  onLayoutsChange,
}: {
  tiles: DashboardTile[]
  timeRange: TimeRange | undefined
  editable?: boolean
  onEditTile?: (tile: DashboardTile) => void
  onDeleteTile?: (tile: DashboardTile) => void
  onLayoutsChange?: (layouts: ResponsiveLayouts<keyof typeof BREAKPOINTS>) => void
}) => {
  const layouts = useMemo(() => getLayoutsForTiles(tiles), [tiles])

  return (
    <ResponsiveGridLayoutView
      className="layout"
      breakpoints={BREAKPOINTS}
      cols={COLS}
      layouts={layouts}
      rowHeight={24}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isDraggable={!!editable}
      isResizable={!!editable}
      draggableHandle=".tile-drag-handle"
      onLayoutChange={(_layout, allLayouts) => onLayoutsChange?.(allLayouts)}
    >
      {tiles.map(tile => (
        <div key={tile.id} className="group min-h-0">
          <div className="tile-drag-handle mb-2 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <LayoutGrid className="size-3" />
            <span>
              {editable ? 'Drag to arrange' : tile.content.case === 'markdown' ? 'Markdown tile' : 'Insight tile'}
            </span>
          </div>
          <DashboardTileBody
            tile={tile}
            timeRange={timeRange}
            onEdit={editable ? onEditTile : undefined}
            onDelete={editable ? onDeleteTile : undefined}
          />
        </div>
      ))}
    </ResponsiveGridLayoutView>
  )
}
