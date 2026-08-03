import { DISPLAY_GRID_COLUMNS } from './grid-layout'

// Dashboards use a SINGLE responsive layout: one breakpoint ("lg") that is
// always active (threshold 0) and scales tile widths to the container. This
// keeps edit mode (config rail open, narrower canvas) and view mode rendering
// the same layout instead of diverging across breakpoints.
export const BREAKPOINTS = { lg: 0 } as const
export const BREAKPOINT_KEYS = Object.keys(BREAKPOINTS) as (keyof typeof BREAKPOINTS)[]
// The UI renders a standard 12-column dashboard with a real gutter. Positions
// remain stored in the API's original 72-unit coordinate system; grid-layout.ts
// translates at the rendering boundary.
export const COLS = { lg: DISPLAY_GRID_COLUMNS } as const
// Min tile span: 1/6 of the dashboard width, ~9 rows (~160px) tall.
export const TILE_MIN_W = 2
export const TILE_MIN_H = 9
export const BREAKDOWN_RESPONSE_LIMIT = 25
export const UNTITLED_DASHBOARD_NAME = 'Untitled dashboard'
