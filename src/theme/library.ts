import { BUILTIN_IDS, BUILTINS, type BuiltinId } from './builtin'
import { compileVariant, hashString } from './compile'
import { type Issue, parseThemeText, readableName, type ThemeFamily } from './format'
import { POLARITIES, type Polarity } from './tokens'

// The theme library: the built-ins plus whatever the person installed, and which one is active.
// Installed themes are stored as their original text and re-parsed on load, so a registry change
// between releases (a token this build learned) applies to themes installed before it.

export const MAX_INSTALLED = 20

// Installed ids carry their own prefix, so one can never collide with a built-in's.
export type InstalledId = `installed-${string}`
export const isInstalledId = (id: unknown): id is InstalledId => typeof id === 'string' && id.startsWith('installed-')

export type InstalledTheme = { id: InstalledId; text: string; hash: string; installedAt: number; source: 'file' }

type EntryInfo = { name: string; author?: string; issues: Issue[] }

export type LibraryEntry =
  | (EntryInfo & { id: BuiltinId; builtin: true; family: ThemeFamily })
  // family is null when an installed theme can't be used — it no longer parses, or it has an error.
  // It stays in the list, but can't be selected.
  | (EntryInfo & { id: InstalledId; builtin: false; family: ThemeFamily | null })

export type UsableEntry = LibraryEntry & { family: ThemeFamily }

const parsedTexts = new Map<string, ReturnType<typeof parseThemeText>>()
const parseOnce = (text: string) => {
  let parsed = parsedTexts.get(text)
  if (!parsed) {
    parsed = parseThemeText(text)
    parsedTexts.set(text, parsed)
  }
  return parsed
}

/** Validation issues for every variant a family has, with paths that say which variant. */
export const validateFamily = (id: string, family: ThemeFamily): Issue[] =>
  POLARITIES.flatMap(polarity =>
    family.variants[polarity]
      ? compileVariant({ id, builtin: false, family, polarity }).report.map(i => ({
          ...i,
          path: `variants.${polarity}.${i.path}`,
        }))
      : [],
  )

export const buildLibrary = (installed: InstalledTheme[]): LibraryEntry[] => [
  ...BUILTIN_IDS.map(id => ({ id, builtin: true as const, name: BUILTINS[id].name, family: BUILTINS[id], issues: [] })),
  ...installed.map(theme => {
    const parsed = parseOnce(theme.text)
    if (!parsed.ok) {
      // It parsed when it was installed, so this build reads it differently — a stricter rule, or a
      // rollback past its version. Its modes fall back to Pug; keep a trace of why.
      console.warn('theme library: could not read', theme.id, parsed.issues)
      const name = readableName(theme.text) ?? 'Unreadable theme'
      return { id: theme.id, builtin: false as const, name, family: null, issues: parsed.issues }
    }
    const { family } = parsed
    let issues: Issue[]
    try {
      issues = [...parsed.issues, ...validateFamily(theme.id, family)]
    } catch (err) {
      // A theme the engine can't compile is a bug in the engine, not the file — but it must not take
      // the app down with it. It stays listed, unselectable, and its mode falls back to Pug.
      console.error('theme library: could not compile', theme.id, err)
      issues = [{ severity: 'error', rule: 'V13', path: '', message: 'This theme couldn’t be compiled' }]
    }
    const usable = !issues.some(i => i.severity === 'error')
    return {
      id: theme.id,
      builtin: false as const,
      name: family.name,
      author: family.author,
      family: usable ? family : null,
      issues,
    }
  }),
]

export type ActiveTheme = { id: string; builtin: boolean; family: ThemeFamily; polarity: Polarity }

/**
 * Which theme paints a mode: the selection, else Pug; Pug High Contrast instead of a standard family
 * when the OS asks for more contrast and auto-contrast is on; the built-in for the family's contrast
 * level when the family has no variant for this mode.
 */
export const chooseActive = (input: {
  polarity: Polarity
  selection: Record<Polarity, string>
  autoContrast: boolean
  moreContrast: boolean
  library: LibraryEntry[]
}): ActiveTheme => {
  const { polarity, library } = input
  const usable = (id: string) => library.find((e): e is UsableEntry => e.id === id && e.family !== null)
  const pug = usable('pug')
  if (!pug) throw new Error('theme library: Pug is missing')
  let entry = usable(input.selection[polarity]) ?? pug
  if (input.autoContrast && input.moreContrast && entry.family.contrast === 'standard') {
    entry = usable('pug-high-contrast') ?? entry
  }
  if (!entry.family.variants[polarity]) {
    entry = (entry.family.contrast === 'high' && usable('pug-high-contrast')) || pug
  }
  return { id: entry.id, builtin: entry.builtin, family: entry.family, polarity }
}

export type InstallCheck =
  | { ok: true; theme: InstalledTheme; name: string; issues: Issue[] }
  | { ok: false; reason: 'invalid' | 'duplicate' | 'full'; issues: Issue[] }

/** Everything the install flow needs to know about a file, without installing it. */
export const checkInstall = (text: string, installed: InstalledTheme[], now = Date.now()): InstallCheck => {
  const parsed = parseThemeText(text)
  if (!parsed.ok) return { ok: false, reason: 'invalid', issues: parsed.issues }
  const issues = [...parsed.issues, ...validateFamily('candidate', parsed.family)]
  if (issues.some(i => i.severity === 'error')) return { ok: false, reason: 'invalid', issues }
  // Hashed on the parsed family, so whitespace and key order don't make a second copy.
  const hash = hashString(JSON.stringify(parsed.family))
  if (installed.some(t => t.hash === hash)) return { ok: false, reason: 'duplicate', issues }
  if (installed.length >= MAX_INSTALLED) return { ok: false, reason: 'full', issues }
  const theme: InstalledTheme = { id: `installed-${hash}`, text, hash, installedAt: now, source: 'file' }
  return { ok: true, theme, name: parsed.family.name, issues }
}
