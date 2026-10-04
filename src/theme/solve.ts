import { contrast } from '../lib/color/contrast'
import type { Oklch } from '../lib/color/oklch'
import type { Polarity } from './tokens'

/**
 * Lightness at which an ink of this chroma and hue first reaches `target` contrast on `ground` —
 * below the ground in light mode, above it in dark. Returns the extreme (0 or 1) when the target is
 * out of reach; validation reports the shortfall.
 */
export const solveLightness = (ground: Oklch, polarity: Polarity, target: number, c: number, h: number) => {
  const at = (l: number) => contrast({ l, c, h, alpha: 1 }, ground)
  let near = ground.l
  let far = polarity === 'dark' ? 1 : 0
  if (at(far) <= target) return far
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2
    if (at(mid) < target) near = mid
    else far = mid
  }
  return far
}
