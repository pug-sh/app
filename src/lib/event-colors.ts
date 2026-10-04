import { resolveKind } from '@/lib/event-aliases'
import { type CompiledDataPalette, compileDataPalette, type SeriesColor } from '@/theme/data-palette'
import { PUG_CANVAS } from '@/theme/fit'

// The lookup over whichever palette the active theme compiled. The tables themselves live in
// theme/data-palette.ts. These are JS inline styles and SVG fills, not CSS variables, so App pushes
// the active theme's palette in during render (setSeriesPalette); consumers that memoize a derived
// palette key their memo on themeRevisionAtom, because this module mutation can't invalidate a useMemo.

export type { SeriesColor } from '@/theme/data-palette'

const pugPalette = (dark: boolean) => {
  const polarity = dark ? 'dark' : 'light'
  return compileDataPalette(undefined, polarity, 'standard', PUG_CANVAS[polarity])
}

let palette: CompiledDataPalette = pugPalette(
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
)

export const setSeriesPalette = (next: CompiledDataPalette) => {
  palette = next
}

// Deterministic 32-bit string hash — depends only on the name, so the chosen color is identical for
// every user, session, and view.
const hashString = (s: string): number => {
  let h = 0
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

const GENERIC_LABEL_RE = /^(step|cohort|series)\s+\d+$/i

export const getSeriesColor = (seriesName: string, fallbackIndex = 0): SeriesColor => {
  const categorical = palette.categorical
  if (!seriesName || GENERIC_LABEL_RE.test(seriesName)) return categorical[fallbackIndex % categorical.length]

  const canonical = resolveKind(seriesName)
  if (!canonical) return categorical[fallbackIndex % categorical.length]

  const mapped = palette.events[canonical]
  if (mapped) return mapped

  // Unmapped (custom) event — deterministic by name, identical for every user and view. Borrow the
  // matching family's hue; otherwise hash into the categorical palette.
  const family = palette.families.find(f => f.prefixes.some(p => canonical.startsWith(p)))
  if (family) return family.palette[hashString(canonical) % family.palette.length]
  return categorical[hashString(canonical) % categorical.length]
}

// Distinct color by position, for breakdown splits (OS, traffic source, …). Their values carry no
// semantic identity and must stay separable within one chart, so index assignment beats hashing.
export const getIndexedColor = (index: number): SeriesColor => palette.categorical[index % palette.categorical.length]

const HEX6 = /^#[0-9a-f]{6}$/i

// Line and dot at 60% alpha, for a reference series drawn against a live one. Alpha rather than a
// lighter hex so it recedes on either canvas; a color that isn't a plain hex passes through.
export const fadedSeriesColor = (sc: SeriesColor): SeriesColor =>
  HEX6.test(sc.line) ? { ...sc, line: `${sc.line}99`, dot: `${sc.dot}99` } : sc

/** Transitional: Pug's palette for a mode. Removed in Task 8, once App pushes the compiled theme. */
export const setSeriesColorScheme = (isDark: boolean) => setSeriesPalette(pugPalette(isDark))
