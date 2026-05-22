export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const
export const BREAKPOINT_KEYS = Object.keys(BREAKPOINTS) as (keyof typeof BREAKPOINTS)[]
export const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 } as const
export const TILE_MIN_W = 2
export const TILE_MIN_H = 4
export const BREAKDOWN_RESPONSE_LIMIT = 25
export const UNTITLED_DASHBOARD_NAME = 'Untitled dashboard'
