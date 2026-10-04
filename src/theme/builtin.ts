import type { Oklch } from '../lib/color/oklch'
import { parseThemeObject, type ThemeFamily, type ThemeFile } from './format'
import { pug } from './presets/pug'
import type { Contrast, Polarity, TokenName } from './tokens'

// The built-in themes, parsed once at load. A built-in that doesn't parse is a programming error,
// so it throws rather than reporting.

const FILES = { pug } satisfies Record<string, ThemeFile>

export type BuiltinId = keyof typeof FILES
export const BUILTIN_IDS = Object.keys(FILES) as BuiltinId[]

export const BUILTINS = Object.fromEntries(
  Object.entries(FILES).map(([id, file]) => {
    const parsed = parseThemeObject(file)
    if (!parsed.ok) throw new Error(`built-in theme ${id} does not parse: ${JSON.stringify(parsed.issues)}`)
    return [id, parsed.family]
  }),
) as Record<BuiltinId, ThemeFamily>

/**
 * The family an unset root falls back to: Pug, or Pug High Contrast for a high-contrast family.
 * Pug High Contrast arrives in Task 13; until then a high-contrast family falls back to Pug's roots.
 */
const referenceFamily = (level: Contrast): ThemeFamily => {
  const high = (BUILTINS as Partial<Record<string, ThemeFamily>>)['pug-high-contrast']
  return level === 'high' && high ? high : BUILTINS.pug
}

export const builtinRoots = (polarity: Polarity, level: Contrast) =>
  referenceFamily(level).variants[polarity]?.colors as Record<TokenName, Oklch>
