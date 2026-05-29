// Dashboards use a SINGLE responsive layout: one breakpoint ("lg") that is
// always active (threshold 0) and scales tile widths to the container. This
// keeps edit mode (config rail open, narrower canvas) and view mode rendering
// the same layout instead of diverging across breakpoints.
export const BREAKPOINTS = { lg: 0 } as const
export const BREAKPOINT_KEYS = Object.keys(BREAKPOINTS) as (keyof typeof BREAKPOINTS)[]
export const COLS = { lg: 12 } as const
export const TILE_MIN_W = 2
export const TILE_MIN_H = 4
export const BREAKDOWN_RESPONSE_LIMIT = 25
export const UNTITLED_DASHBOARD_NAME = 'Untitled dashboard'
