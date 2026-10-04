import { contrast } from '../lib/color/contrast'
import { fitChroma, hexToOklch, type Oklch, oklchToHex } from '../lib/color/oklch'
import { solveLightness } from './solve'
import type { Contrast, Polarity } from './tokens'

// The per-mode fit for event colours. On Pug's canvas the standard fit reproduces Pug's series palette
// exactly — series.json pins it, and Pug's pixel identity depends on it. On any other canvas the band
// moves so its anchor keeps the contrast it has against Pug's canvas. Note the light path still caps
// lightness and clips per channel without fitChroma: a known issue kept on purpose to hold Pug's
// identity, to be changed as its own visual change — not an oversight to fix in passing.

// Mirrors the Pug preset's backgrounds; presets/pug.test.ts pins the two together.
export const PUG_CANVAS: Record<Polarity, Oklch> = {
  light: { l: 0.943, c: 0.005, h: 265, alpha: 1 },
  dark: { l: 0.215, c: 0.013, h: 265, alpha: 1 },
}

// The light cap sits below the dark one because mid-lightness colors on white read as more
// saturated than lifted ones on a dark ground.
const DARK_CHROMA_CAP = 0.165
const LIGHT_CHROMA_CAP = 0.14
const ANCHOR: Record<Polarity, number> = { dark: 0.54, light: 0.52 }
const HIGH_DATA_CONTRAST = 4.5

const grey = (l: number): Oklch => ({ l, c: 0, h: 0, alpha: 1 })

/** How far the standard band moves on `canvas`. Rounded, so Pug's own canvas gives exactly 0. */
export const bandShift = (polarity: Polarity, canvas: Oklch) => {
  const target = contrast(grey(ANCHOR[polarity]), PUG_CANVAS[polarity])
  const anchor = solveLightness(canvas, polarity, target, 0, 0)
  // `|| 0` folds the -0 Pug's light canvas yields into 0, so the shift there reads exactly 0.
  return Math.round((anchor - ANCHOR[polarity]) * 1e4) / 1e4 || 0
}

// Memoize a hex→hex transform for the session. Every hex a fit sees is a palette colour or a theme's,
// so the caches stay small.
const memoizeHex = (transform: (hex: string) => string) => {
  const cache = new Map<string, string>()
  return (hex: string) => {
    const cached = cache.get(hex)
    if (cached !== undefined) return cached
    const out = transform(hex)
    cache.set(hex, out)
    return out
  }
}

// Dark canvas: lift lightness into a legible band, taming extreme chroma. The band is deliberately
// shallow — every point of lift spent is chroma the hue can no longer hold.
const standardDark = (shift: number) =>
  memoizeHex(hex => {
    const [L, C, H] = hexToOklch(hex)
    const lifted = Math.min(1, 0.54 + shift + 0.22 * L)
    return oklchToHex(lifted, fitChroma(lifted, Math.min(C, DARK_CHROMA_CAP), H), H)
  })

// Light canvas: cap lightness so pale shades read on white, and cap chroma so the most vivid hues
// don't shout. A hue already under both caps passes through untouched.
const standardLight = (shift: number) =>
  memoizeHex(hex => {
    const [L, C, H] = hexToOklch(hex)
    const cap = 0.52 + shift
    if (L <= cap && C <= LIGHT_CHROMA_CAP) return hex
    return oklchToHex(Math.min(L, cap), Math.min(C, LIGHT_CHROMA_CAP), H)
  })

// High contrast: the band starts where a grey first reaches 4.5:1 on the canvas, gamut-fitted. New in
// the theme engine, so no identity constraint holds it to the old clipping.
const highDark = (start: number) =>
  memoizeHex(hex => {
    const [L, C, H] = hexToOklch(hex)
    const lifted = Math.min(1, start + 0.2 * L)
    return oklchToHex(lifted, fitChroma(lifted, Math.min(C, 0.15), H), H)
  })

const highLight = (cap: number) =>
  memoizeHex(hex => {
    const [L, C, H] = hexToOklch(hex)
    if (L <= cap && C <= LIGHT_CHROMA_CAP) return hex
    const l = Math.min(L, cap)
    return oklchToHex(l, fitChroma(l, Math.min(C, LIGHT_CHROMA_CAP), H), H)
  })

const transforms = new Map<string, (hex: string) => string>()

/**
 * The event-colour fit for a mode, contrast level and canvas: 6-digit hex in, 6-digit hex out.
 * `canvas` defaults to Pug's for that mode.
 */
export const fitFor = (polarity: Polarity, level: Contrast, canvas: Oklch = PUG_CANVAS[polarity]) => {
  const knob =
    level === 'high'
      ? Math.round(solveLightness(canvas, polarity, HIGH_DATA_CONTRAST, 0, 0) * 1e4) / 1e4
      : bandShift(polarity, canvas)
  const key = `${polarity}|${level}|${knob}`
  let fit = transforms.get(key)
  if (!fit) {
    if (level === 'high') fit = polarity === 'dark' ? highDark(knob) : highLight(knob)
    else fit = polarity === 'dark' ? standardDark(knob) : standardLight(knob)
    transforms.set(key, fit)
  }
  return fit
}
