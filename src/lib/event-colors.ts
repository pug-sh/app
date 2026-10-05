import { resolveKind } from '@/lib/event-aliases'
import { type CompiledDataPalette, compileDataPalette, type SeriesColor } from '@/theme/data-palette'
import { PUG_CANVAS } from '@/theme/fit'
import type { Polarity } from '@/theme/tokens'

// The lookup over whichever palette the active theme compiled. The tables themselves live in
// theme/data-palette.ts. These are JS inline styles and SVG fills, not CSS variables, so App pushes
// the active theme's palette in during render (setSeriesPalette); consumers that memoize a derived
// palette key their memo on themeRevisionAtom, because this module mutation can't invalidate a useMemo.

export type { SeriesColor } from '@/theme/data-palette'

const pugPalettes: Partial<Record<Polarity, CompiledDataPalette>> = {}

/** Pug's own data palette, whatever theme is active — for surfaces that stay Pug, like the sign-in pages. */
export const pugDataPalette = (polarity: Polarity) =>
  (pugPalettes[polarity] ??= compileDataPalette(undefined, polarity, 'standard', PUG_CANVAS[polarity]))

let palette = pugDataPalette(
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
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

// Distinct color by position, for breakdown splits (OS, traffic source, …). Their values carry no
// semantic identity and must stay separable within one chart, so index assignment beats hashing.
export const indexedColorIn = (source: CompiledDataPalette, index: number): SeriesColor =>
  source.categorical[index % source.categorical.length]

/** A series name's colour in an explicit palette. getSeriesColor is this over the active theme's. */
export const seriesColorIn = (source: CompiledDataPalette, seriesName: string, fallbackIndex = 0): SeriesColor => {
  if (!seriesName || GENERIC_LABEL_RE.test(seriesName)) return indexedColorIn(source, fallbackIndex)

  const canonical = resolveKind(seriesName)
  if (!canonical) return indexedColorIn(source, fallbackIndex)

  const mapped = source.events[canonical]
  if (mapped) return mapped

  // Unmapped (custom) event — deterministic by name, identical for every user and view. Borrow the
  // matching family's hue; otherwise hash into the categorical palette.
  const family = source.families.find(f => f.prefixes.some(p => canonical.startsWith(p)))
  if (family) return family.palette[hashString(canonical) % family.palette.length]
  return indexedColorIn(source, hashString(canonical))
}

export const getSeriesColor = (seriesName: string, fallbackIndex = 0) =>
  seriesColorIn(palette, seriesName, fallbackIndex)

export const getIndexedColor = (index: number) => indexedColorIn(palette, index)

const HEX6 = /^#[0-9a-f]{6}$/i

// Line and dot at 60% alpha, for a reference series drawn against a live one. Alpha rather than a
// lighter hex so it recedes on either canvas; a color that isn't a plain hex passes through.
export const fadedSeriesColor = (sc: SeriesColor): SeriesColor =>
  HEX6.test(sc.line) ? { ...sc, line: `${sc.line}99`, dot: `${sc.dot}99` } : sc
