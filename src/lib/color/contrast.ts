import { linearToOklch, linearToSrgb, type Oklch, srgbToLinear, toLinearRgb } from './oklch'

// Every contrast decision in the theme engine goes through this file. It is WCAG 2: the apca-w3
// package ships under a licence that restricts use. Standard targets and floors are measured per mode
// from Pug, so WCAG's polarity-blindness never sets one mode against the other; high contrast and text
// on filled controls use absolute levels, the same in both modes.

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** WCAG relative luminance, from unquantised linear sRGB. */
export const luminance = (c: Oklch) => {
  const [r, g, b] = toLinearRgb(c).map(clamp01)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** `top` laid over an opaque `ground` at `alpha`, blended in gamma-encoded sRGB as browsers do. */
export const composite = (top: Oklch, ground: Oklch, alpha = top.alpha): Oklch => {
  const t = toLinearRgb(top).map(linearToSrgb)
  const g = toLinearRgb(ground).map(linearToSrgb)
  const [r, gg, b] = t.map((v, i) => srgbToLinear(v * alpha + g[i] * (1 - alpha)))
  return linearToOklch(r, gg, b, 1)
}

/**
 * WCAG 2 contrast ratio, 1–21. A translucent ink is composited onto its ground first; the ground is
 * taken as solid, which holds because the theme parser refuses a see-through surface.
 */
export const contrast = (ink: Oklch, ground: Oklch) => {
  const a = luminance(ink.alpha < 1 ? composite(ink, ground) : ink)
  const b = luminance(ground)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
