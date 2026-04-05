export type SeriesColor = {
  line: string
  fill: string
  dot: string
}

const color = (hex: string): SeriesColor => ({
  line: hex,
  fill: hex + '1a',
  dot: hex,
})

// ── Semantic color map ──────────────────────────────────────────────────────
// Maps exact event names to colors. Events in the same semantic group share
// a hue so they're visually related on charts.
// Add new events here as the taxonomy grows.

const EVENT_COLORS: Record<string, SeriesColor> = {
  // navigation — blue
  page_view:            color('#2563eb'),
  scroll:               color('#3b82f6'),

  // interactions — cyan
  click:                color('#0891b2'),
  dead_click:           color('#f87171'),
  rage_click:           color('#dc2626'),

  // app lifecycle — indigo
  app_open:             color('#4f46e5'),
  app_close:            color('#818cf8'),

  // commerce — emerald
  add_to_cart:          color('#10b981'),
  checkout_started:     color('#059669'),
  checkout_completed:   color('#34d399'),

  // search — violet
  search:               color('#7c3aed'),

  // auth — slate
  login:                color('#475569'),
  logout:               color('#64748b'),
  signup:               color('#334155'),

  // forms — teal
  form_start:           color('#0d9488'),
  form_submit:          color('#0f766e'),

  // video — amber
  video_play:           color('#d97706'),
  video_pause:          color('#f59e0b'),

  // notifications — pink
  notification_received: color('#db2777'),
  notification_clicked:  color('#ec4899'),

  // errors — red (distinct from rage/dead click which are orange-red)
  error_occurred:       color('#b91c1c'),

  // sharing — orange
  share:                color('#ea580c'),
}

// Fallback palette for unmapped events — visually distinct from the semantic
// colors above so unknown events don't accidentally look related.
const FALLBACK_COLORS: SeriesColor[] = [
  color('#2563eb'),
  color('#059669'),
  color('#d97706'),
  color('#7c3aed'),
  color('#db2777'),
  color('#0891b2'),
  color('#ea580c'),
  color('#4f46e5'),
  color('#dc2626'),
  color('#0d9488'),
  color('#475569'),
  color('#84cc16'),
]

// ── Lookup ──────────────────────────────────────────────────────────────────

const GENERIC_LABEL_RE = /^(step|cohort|series)\s+\d+$/i

const hashString = (value: string): number => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export const getSeriesColor = (seriesName: string, fallbackIndex = 0): SeriesColor => {
  if (!seriesName || GENERIC_LABEL_RE.test(seriesName)) {
    return FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
  }

  const mapped = EVENT_COLORS[seriesName]
  if (mapped) return mapped

  // Unmapped event — deterministic fallback from hash
  const idx = hashString(seriesName) % FALLBACK_COLORS.length
  return FALLBACK_COLORS[idx]
}

// Re-export for DataTable (should migrate to getSeriesColor)
export const SERIES_COLORS = FALLBACK_COLORS
