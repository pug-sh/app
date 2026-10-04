import { linearToOklch, normHue, type Oklch, srgbToLinear } from './oklch'

// The theme colour grammar: hex, rgb()/rgba(), hsl()/hsla() and oklch(), nothing else. A strict
// grammar rather than a denylist — var(), url(), calc(), color-mix(), relative syntax, `none` and
// named colours fail simply by not matching, so nothing a theme file says can reach CSS as written.

export const MAX_COLOR_LENGTH = 64

const NUM = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)'
const PCT = `${NUM}%`
const ALPHA = `(${NUM}%?)`
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB_MODERN_RE = new RegExp(
  `^rgba?\\(\\s*(${NUM}%?)\\s+(${NUM}%?)\\s+(${NUM}%?)\\s*(?:\\/\\s*${ALPHA}\\s*)?\\)$`,
  'i',
)
const RGB_LEGACY_RE = new RegExp(
  `^rgba?\\(\\s*(${NUM}%?)\\s*,\\s*(${NUM}%?)\\s*,\\s*(${NUM}%?)\\s*(?:,\\s*${ALPHA}\\s*)?\\)$`,
  'i',
)
const HSL_MODERN_RE = new RegExp(
  `^hsla?\\(\\s*(${NUM})(?:deg)?\\s+(${PCT})\\s+(${PCT})\\s*(?:\\/\\s*${ALPHA}\\s*)?\\)$`,
  'i',
)
const HSL_LEGACY_RE = new RegExp(
  `^hsla?\\(\\s*(${NUM})(?:deg)?\\s*,\\s*(${PCT})\\s*,\\s*(${PCT})\\s*(?:,\\s*${ALPHA}\\s*)?\\)$`,
  'i',
)
const OKLCH_RE = new RegExp(
  `^oklch\\(\\s*(${NUM}%?)\\s+(${NUM}%?)\\s+(${NUM})(?:deg)?\\s*(?:\\/\\s*${ALPHA}\\s*)?\\)$`,
  'i',
)

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const pct = (s: string) => Number.parseFloat(s) / 100
const unitOrPct = (s: string, scale: number) => (s.endsWith('%') ? pct(s) : Number.parseFloat(s) / scale)
const parseAlpha = (s: string | undefined) => (s === undefined ? 1 : clamp01(unitOrPct(s, 1)))

const fromRgb = (r: number, g: number, b: number, alpha: number) =>
  linearToOklch(srgbToLinear(clamp01(r)), srgbToLinear(clamp01(g)), srgbToLinear(clamp01(b)), alpha)

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0), f(8), f(4)]
}

/** Parses one theme colour into OKLCH, or null when it isn't in the grammar. */
export const parseColor = (input: string): Oklch | null => {
  if (typeof input !== 'string' || input.length > MAX_COLOR_LENGTH) return null
  const s = input.trim()

  const hex = HEX_RE.exec(s)
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) digits = [...digits].map(d => d + d).join('')
    const byte = (i: number) => Number.parseInt(digits.slice(i, i + 2), 16) / 255
    return fromRgb(byte(0), byte(2), byte(4), digits.length === 8 ? byte(6) : 1)
  }

  const rgb = RGB_MODERN_RE.exec(s) ?? RGB_LEGACY_RE.exec(s)
  if (rgb) {
    const channel = (v: string) => unitOrPct(v, 255)
    return fromRgb(channel(rgb[1]), channel(rgb[2]), channel(rgb[3]), parseAlpha(rgb[4]))
  }

  const hsl = HSL_MODERN_RE.exec(s) ?? HSL_LEGACY_RE.exec(s)
  if (hsl) {
    const [r, g, b] = hslToRgb(normHue(Number.parseFloat(hsl[1])), clamp01(pct(hsl[2])), clamp01(pct(hsl[3])))
    return fromRgb(r, g, b, parseAlpha(hsl[4]))
  }

  const ok = OKLCH_RE.exec(s)
  if (ok) {
    const l = clamp01(unitOrPct(ok[1], 1))
    // CSS Color 4: 100% chroma is 0.4.
    const c = ok[2].endsWith('%') ? pct(ok[2]) * 0.4 : Number.parseFloat(ok[2])
    if (c < 0) return null
    return { l, c, h: c === 0 ? 0 : normHue(Number.parseFloat(ok[3])), alpha: parseAlpha(ok[4]) }
  }

  return null
}

const fixed = (v: number, digits: number) => String(Number(v.toFixed(digits)))

/**
 * Canonical form: `oklch(L C H)` or `oklch(L C H / A)`. Six decimals on L and C so a hex input
 * survives the round trip byte for byte; trailing zeros trimmed, so a value authored as
 * `oklch(0.943 0.005 265)` comes back exactly as written.
 */
export const formatColor = (c: Oklch) => {
  const l = fixed(clamp01(c.l), 6)
  const chroma = fixed(Math.max(0, c.c), 6)
  let h = Number(normHue(c.h).toFixed(3))
  if (h >= 360 || chroma === '0') h = 0
  const body = `${l} ${chroma} ${h}`
  const alpha = clamp01(c.alpha)
  return alpha >= 0.9995 ? `oklch(${body})` : `oklch(${body} / ${fixed(alpha, 3)})`
}

/** Matches formatColor's output and nothing else — the first-paint script trusts only this. */
export const CANONICAL_COLOR_RE =
  /^oklch\((?:0|1|0\.\d{1,6}) \d+(?:\.\d{1,6})? \d{1,3}(?:\.\d{1,3})?(?: \/ (?:0|0\.\d{1,3}))?\)$/
