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
  /** Content hash of the id, the mode, the vars and the data — any change to what draws changes it. */
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

type CompileInput = { id: string; builtin: boolean; family: ThemeFamily; polarity: Polarity }

export const compileVariant = (input: CompileInput) => {
  const { family, polarity } = input
  const level = family.contrast
  const variant = family.variants[polarity]
  const { tokens, provenance } = resolveTokens(variant, polarity, level, builtinRoots(polarity, level))
  const data = compileDataPalette(variant?.data, polarity, level, tokens.background)
  const report = validateTheme({ tokens, data, polarity, contrast: level })
  const vars = Object.fromEntries(TOKENS.map(t => [`--${t}`, formatColor(tokens[t])])) as CompiledTheme['vars']
  const revision = hashString(JSON.stringify([input.id, polarity, vars, data]))
  const compiled: CompiledTheme = {
    id: input.id,
    builtin: input.builtin,
    polarity,
    contrast: level,
    revision,
    vars,
    tokens,
    provenance,
    data,
    report,
  }
  return compiled
}

// One compile per family and mode. Families are stable objects — built-ins parse once, installed
// themes once per text — so a compiled theme keeps its identity until something it depends on
// changes, and effects keyed on it don't re-run when an unrelated theme is installed. Each family
// object only ever arrives with its own id, so the family is the whole key.
const compiledByFamily = new WeakMap<ThemeFamily, Partial<Record<Polarity, CompiledTheme>>>()
export const compileOnce = (input: CompileInput) => {
  const byMode = compiledByFamily.get(input.family) ?? {}
  compiledByFamily.set(input.family, byMode)
  return (byMode[input.polarity] ??= compileVariant(input))
}
