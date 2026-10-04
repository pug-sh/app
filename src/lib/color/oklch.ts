// OKLCH maths shared by the theme engine and the series palette. Keep the operation order of the
// hex <-> OKLCH functions: series.json pins their byte-identical hex output, and reordering float
// maths can flip a rounding.

/** A colour in OKLCH. `h` is in degrees, [0, 360); `alpha` is 0–1. */
export type Oklch = { l: number; c: number; h: number; alpha: number }

const RAD = Math.PI / 180

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

export const linearToSrgb = (c: number) => {
  const v = Math.max(0, Math.min(1, c))
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}

export const linearToByte = (c: number) => Math.round(linearToSrgb(c) * 255)

/** `[L, C, H in radians]` — radians because the series fit was written against atan2 output. */
export const hexToOklch = (hex: string): [number, number, number] => {
  const n = hex.replace('#', '')
  const r = srgbToLinear(Number.parseInt(n.slice(0, 2), 16) / 255)
  const g = srgbToLinear(Number.parseInt(n.slice(2, 4), 16) / 255)
  const b = srgbToLinear(Number.parseInt(n.slice(4, 6), 16) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const okl = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const oka = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const okb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [okl, Math.hypot(oka, okb), Math.atan2(okb, oka)]
}

/** Linear sRGB for an OKLCH colour, H in radians. Channels may fall outside [0, 1]. */
export const oklchToLinear = (L: number, C: number, H: number) => {
  const a = C * Math.cos(H)
  const b = C * Math.sin(H)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

// Largest chroma that still fits sRGB at this lightness and hue (radians). Without it, an
// out-of-gamut request is clipped per channel by linearToByte — which silently drops chroma *and*
// shifts hue, still returning a valid hex.
export const fitChroma = (L: number, C: number, H: number) => {
  const fits = (c: number) => oklchToLinear(L, c, H).every(v => v >= -1e-4 && v <= 1 + 1e-4)
  if (fits(C)) return C
  let lo = 0
  let hi = C
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** 6-digit hex, clipping per channel (no gamut fit) — what the standard series fit uses (see fit.ts). */
export const oklchToHex = (L: number, C: number, H: number) => {
  const [r, g, b] = oklchToLinear(L, C, H)
  const hh = (v: number) => linearToByte(v).toString(16).padStart(2, '0')
  return `#${hh(r)}${hh(g)}${hh(b)}`
}

export const normHue = (h: number) => ((h % 360) + 360) % 360

export const linearToOklab = (r: number, g: number, b: number): [number, number, number] => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export const linearToOklch = (r: number, g: number, b: number, alpha = 1): Oklch => {
  const [l, a, bb] = linearToOklab(r, g, b)
  const c = Math.hypot(a, bb)
  return { l, c, h: c < 1e-7 ? 0 : normHue(Math.atan2(bb, a) / RAD), alpha }
}

export const toLinearRgb = (c: Oklch) => oklchToLinear(c.l, c.c, c.h * RAD)

/** Gamut-fitted 6-digit hex. Alpha is dropped. */
export const toHex = (c: Oklch) => {
  const H = c.h * RAD
  return oklchToHex(c.l, fitChroma(c.l, c.c, H), H)
}

export const fromHex = (hex: string): Oklch => {
  const [l, c, h] = hexToOklch(hex)
  return { l, c, h: c < 1e-7 ? 0 : normHue(h / RAD), alpha: 1 }
}
