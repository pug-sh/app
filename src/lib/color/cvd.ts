import { clamp01, linearToOklab, type Oklch, toLinearRgb } from './oklch'

// Colour-vision-deficiency simulation (Machado, Oliveira & Fernandes 2009, severity 1.0), applied in
// linear sRGB. Used by the colourblind-safe preset's acceptance test.

export type Deficiency = 'protan' | 'deutan' | 'tritan'

const MACHADO: Record<Deficiency, number[]> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
}

const oklabOf = (c: Oklch, kind?: Deficiency) => {
  const [r, g, b] = toLinearRgb(c).map(clamp01)
  if (!kind) return linearToOklab(r, g, b)
  const m = MACHADO[kind]
  const [sr, sg, sb] = [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ].map(clamp01)
  return linearToOklab(sr, sg, sb)
}

/** OKLab distance as seen with `kind` (or normal vision when omitted). */
export const deltaE = (a: Oklch, b: Oklch, kind?: Deficiency) => {
  const [l1, a1, b1] = oklabOf(a, kind)
  const [l2, a2, b2] = oklabOf(b, kind)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** The smallest distance between two colours across normal vision and all three deficiencies. */
export const worstDeltaE = (a: Oklch, b: Oklch) =>
  Math.min(deltaE(a, b), deltaE(a, b, 'protan'), deltaE(a, b, 'deutan'), deltaE(a, b, 'tritan'))
