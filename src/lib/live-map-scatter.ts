import type { MapEntry } from '@/lib/live-map-markers'

// Sunflower offsets are in abstract cells. A cell maps to an on-screen gap (cellPxForZoom) via the
// web-mercator scale (world = TILE_PX·2^zoom px), then ramps from 0 below SCATTER_RAMP_LO so faces sit
// on their real coordinate when zoomed out and only fan apart as you zoom in. At DECLUSTER_ZOOM the fan
// is full and crowded cities decluster into individual faces.
//
// The on-screen gap grows with zoom: tight at the metro-overview zoom (CELL_PX_BASE) so a coastal city's
// fan doesn't spill into the water, and +CELL_PX_PER_ZOOM px per level past DECLUSTER_ZOOM so faces
// separate further for clicking the deeper you go.
const CELL_PX_BASE = 12
const CELL_PX_PER_ZOOM = 6
const TILE_PX = 512
export const DECLUSTER_ZOOM = 6
const SCATTER_RAMP_LO = 3.5

const cellPxForZoom = (zoom: number) => CELL_PX_BASE + CELL_PX_PER_ZOOM * Math.max(0, zoom - DECLUSTER_ZOOM)

export const scatterCellDeg = (zoom: number) => {
  const constantPx = (cellPxForZoom(zoom) * 360) / (TILE_PX * 2 ** zoom)
  const ramp = Math.min(1, Math.max(0, (zoom - SCATTER_RAMP_LO) / (DECLUSTER_ZOOM - SCATTER_RAMP_LO)))
  return constantPx * ramp
}

export const displayPos = (entry: MapEntry, cell: number): [number, number] =>
  entry.type === 'visitor'
    ? [entry.lng + entry.offsetLng * cell, entry.lat + entry.offsetLat * cell]
    : [entry.lng, entry.lat]
