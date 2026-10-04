import type { Oklch } from '../lib/color/oklch'
import { type CssColor, formatColor } from '../lib/color/parse'
import { builtinRoots } from './builtin'
import { type CompiledDataPalette, compileDataPalette } from './data-palette'
import type { Issue, ThemeFamily } from './format'
import { type Provenance, resolveTokens } from './resolve'
import { type Contrast, type Polarity, TOKENS, type TokenName } from './tokens'
import { validateTheme } from './validate'

export type CompiledTheme = {
  id: string
  builtin: boolean
  polarity: Polarity
  contrast: Contrast
  /** Content hash of vars + data: equal themes share it, so it's a safe memo key. */
  revision: string
  /** `--token` → canonical oklch, for every registry token. */
  vars: Record<`--${TokenName}`, CssColor>
  tokens: Record<TokenName, Oklch>
  provenance: Record<TokenName, Provenance>
  data: CompiledDataPalette
  report: Issue[]
}

// FNV-1a, 32-bit — a cache key, not a security boundary.
export const hashString = (text: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export const compileVariant = (input: { id: string; builtin: boolean; family: ThemeFamily; polarity: Polarity }) => {
  const { family, polarity } = input
  const level = family.contrast
  const variant = family.variants[polarity]
  const { tokens, provenance } = resolveTokens(variant, polarity, level, builtinRoots(polarity, level))
  const data = compileDataPalette(variant?.data, polarity, level, tokens.background)
  const report = validateTheme({ tokens, data, polarity, contrast: level })
  const vars = Object.fromEntries(TOKENS.map(t => [`--${t}`, formatColor(tokens[t])])) as CompiledTheme['vars']
  const revision = hashString(JSON.stringify([input.id, polarity, vars, data]))
  const compiled: CompiledTheme = { ...input, contrast: level, revision, vars, tokens, provenance, data, report }
  return compiled
}
