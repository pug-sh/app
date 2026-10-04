import { contrast } from '../lib/color/contrast'
import type { Oklch } from '../lib/color/oklch'
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
