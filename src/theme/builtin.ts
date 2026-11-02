import type { Oklch } from '../lib/color/oklch'
import { parseThemeObject, type ThemeFamily, type ThemeFile } from './format'
import { pug } from './presets/pug'
import type { AccessMode, Contrast, Polarity, TokenName } from './tokens'

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

/** The `data-theme` value that selects Pug in a mode. A version 2 paint cache can still name the first three. */
export const paintKey = ({ contrast, vision }: AccessMode) => {
  if (contrast === 'high') return vision === 'colourblind' ? 'pug-high-contrast-colourblind' : 'pug-high-contrast'
  return vision === 'colourblind' ? 'pug-colourblind' : 'pug'
}

/** Where an unset root falls back to: Pug, or Pug's high-contrast block at that level. */
export const builtinRoots = (polarity: Polarity, level: Contrast) => {
  const variant = BUILTINS.pug.variants[polarity]
  return (level === 'high' ? variant?.modes?.['high-contrast'] : variant)?.colors as Record<TokenName, Oklch>
}
