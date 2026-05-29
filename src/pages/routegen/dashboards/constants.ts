// Dashboards use a SINGLE responsive layout: one breakpoint ("lg") that is
// always active (threshold 0) and scales tile widths to the container. This
// keeps edit mode (config rail open, narrower canvas) and view mode rendering
// the same layout instead of diverging across breakpoints.
export const BREAKPOINTS = { lg: 0 } as const
export const BREAKPOINT_KEYS = Object.keys(BREAKPOINTS) as (keyof typeof BREAKPOINTS)[]
// Fine grid: a high column count so one column ≈ the visual gap (~18px). Gaps are
// empty tracks; continuous tiles are simply adjacent (no empty track between them).
export const COLS = { lg: 72 } as const
// Min tile span in fine units: ~1/6 width, ~9 rows (~160px) tall.
export const TILE_MIN_W = 12
export const TILE_MIN_H = 9
export const BREAKDOWN_RESPONSE_LIMIT = 25
export const UNTITLED_DASHBOARD_NAME = 'Untitled dashboard'
