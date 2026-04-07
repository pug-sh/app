export type SeriesColor = {
  line: string
  fill: string
  dot: string
}

/** Expects a 6-char hex color (e.g. '#2563eb'). Derives fill by appending alpha. */
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

  // interactions — cyan (click) + red (degraded: dead/rage)
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

  // errors — dark red (same hue family as rage/dead click but darker)
  error_occurred:       color('#b91c1c'),

  // sharing — orange
  share:                color('#ea580c'),
}

// Fallback palette for unmapped events — broad hue range for variety.
// Most colors are shared with the semantic map for palette coherence.
const FALLBACK_COLORS: SeriesColor[] = [
  color('#3b6cf0'),
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

export const getSeriesColor = (seriesName: string, fallbackIndex = 0): SeriesColor => {
  if (!seriesName || GENERIC_LABEL_RE.test(seriesName)) {
    return FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
  }

  const mapped = EVENT_COLORS[seriesName]
  if (mapped) return mapped

  // Unmapped event — neutral gray in single-event contexts (no index),
  // indexed fallback in multi-series charts so custom events are distinguishable
  return fallbackIndex > 0
    ? FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
    : color('#94a3b8')
}
