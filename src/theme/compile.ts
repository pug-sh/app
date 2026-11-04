import type { Oklch } from '../lib/color/oklch'
import { type CssColor, formatColor } from '../lib/color/parse'
import { builtinRoots } from './builtin'
import { type CompiledDataPalette, compileDataPalette } from './data-palette'
import { modeInputs } from './derive'
import type { Issue, ThemeFamily } from './format'
import { type Provenance, resolveTokens } from './resolve'
import {
  type AccessMode,
  type Contrast,
  type Polarity,
  STANDARD_ACCESS,
  TOKENS,
  type TokenName,
  type Vision,
} from './tokens'
import { validateTheme } from './validate'

export type CompiledTheme = {
  id: string
  builtin: boolean
  polarity: Polarity
  /** The level it compiled at: a file marked high contrast is high at every setting. */
  contrast: Contrast
  vision: Vision
  /** Content hash of the id, the mode, the vars and the data: any change to what draws changes it. */
  revision: string
  /** `--token` to canonical oklch, for every registry token. */
  vars: Record<`--${TokenName}`, CssColor>
  tokens: Record<TokenName, Oklch>
  provenance: Record<TokenName, Provenance>
  data: CompiledDataPalette
  report: Issue[]
}

// FNV-1a, 32-bit: a cache key, not a security boundary.
export const hashString = (text: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

type CompileInput = { id: string; builtin: boolean; family: ThemeFamily; polarity: Polarity; access?: AccessMode }

export const compileVariant = (input: CompileInput) => {
  const { family, polarity, access = STANDARD_ACCESS } = input
  const { colors, data: spec, level } = modeInputs(family, polarity, access)
  const { tokens, provenance } = resolveTokens({ colors }, polarity, level, builtinRoots(polarity, level))
  const data = compileDataPalette(spec, polarity, level, tokens.background)
  const report = validateTheme({ tokens, data, polarity, contrast: level, vision: access.vision })
  const vars = Object.fromEntries(TOKENS.map(t => [`--${t}`, formatColor(tokens[t])])) as CompiledTheme['vars']
  const revision = hashString(JSON.stringify([input.id, polarity, vars, data]))
  const compiled: CompiledTheme = {
    id: input.id,
    builtin: input.builtin,
    polarity,
    contrast: level,
    vision: access.vision,
    revision,
    vars,
    tokens,
    provenance,
    data,
    report,
  }
  return compiled
}

// One compile per family, polarity and mode. Families are stable objects (built-ins parse once, installed
// themes once per text), so a compiled theme keeps its identity until something it depends on
// changes, and effects keyed on it don't re-run when an unrelated theme is installed. A family object
// arrives with its own id, so the family is the whole key. Catalog families are the exception: parsed
// on every read of the list, and compiled for tiles under any of their theme's URLs, which is safe
// because a tile reads only `vars`, `data` and `tokens`, none of which depend on the id.
const compiledByFamily = new WeakMap<ThemeFamily, Map<string, CompiledTheme>>()
export const compileOnce = (input: CompileInput) => {
  const { contrast, vision } = input.access ?? STANDARD_ACCESS
  const key = `${input.polarity} ${contrast} ${vision}`
  const compiled = compiledByFamily.get(input.family) ?? new Map<string, CompiledTheme>()
  compiledByFamily.set(input.family, compiled)
  const known = compiled.get(key)
  if (known) return known
  const fresh = compileVariant(input)
  compiled.set(key, fresh)
  return fresh
}
