import {
  Activity,
  BarChart3,
  Flame,
  Gauge,
  LineChart,
  type LucideIcon,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'

// Curated monochrome glyph set for dashboard tile headers. The icon is stored by
// key on tile.header.icon and rendered through this map, so the stored value stays
// a stable string and the glyph inherits the surrounding text color instead of the
// fixed multicolor of an emoji.
export const TILE_ICONS: Record<string, LucideIcon> = {
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  activity: Activity,
  bar: BarChart3,
  line: LineChart,
  users: Users,
  target: Target,
  gauge: Gauge,
  zap: Zap,
  flame: Flame,
}

export const TILE_ICON_KEYS = Object.keys(TILE_ICONS)
