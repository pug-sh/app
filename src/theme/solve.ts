import { contrast } from '../lib/color/contrast'
import { fitChroma, type Oklch } from '../lib/color/oklch'
import type { Polarity } from './tokens'

/**
 * The lightness, searched from `from` toward the extreme — down in light mode, up in dark — at which
 * `measure` first reaches `target`. Returns the extreme (0 or 1) when the target is out of reach;
 * validation reports the shortfall.
 */
export const bisectLightness = (from: number, polarity: Polarity, target: number, measure: (l: number) => number) => {
  let near = from
  let far = polarity === 'dark' ? 1 : 0
  if (measure(far) <= target) return far
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2
    if (measure(mid) < target) near = mid
    else far = mid
  }
  return far
}

/** Lightness at which an ink of this chroma and hue first reaches `target` contrast on `ground`. */
export const solveLightness = (ground: Oklch, polarity: Polarity, target: number, c: number, h: number) =>
  bisectLightness(ground.l, polarity, target, l => contrast({ l, c, h, alpha: 1 }, ground))

/** A colour at this lightness, its chroma fitted to sRGB there. Hue in degrees. */
export const fitted = (l: number, c: number, h: number) => ({ l, c: fitChroma(l, c, (h * Math.PI) / 180), h, alpha: 1 })

/** solveLightness, for a colour whose chroma has to fit sRGB at the lightness it lands on. */
export const solveFitted = (ground: Oklch, polarity: Polarity, target: number, c: number, h: number) =>
  fitted(
    bisectLightness(ground.l, polarity, target, l => contrast(fitted(l, c, h), ground)),
    c,
    h,
  )
