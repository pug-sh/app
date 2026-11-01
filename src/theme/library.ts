import { BUILTIN_IDS, BUILTINS, type BuiltinId } from './builtin'
import { compileVariant, hashString } from './compile'
import { error, type Issue, type ParseResult, parseThemeText, readableName, type ThemeFamily } from './format'
import { memoize } from './memoize'
import { isUrlTarget } from './reference'
import { ACCESS_MODES, type AccessMode, POLARITIES, type Polarity } from './tokens'

// The theme library: built-ins, installed themes and files fetched by URL, and which one is active. Kept
// as text and re-parsed on load, so a registry change between releases applies to themes kept before it.

export const MAX_INSTALLED = 20

// Installed ids carry their own prefix, so one can never collide with a built-in's.
export type InstalledId = `installed-${string}`
export const isInstalledId = (id: unknown): id is InstalledId => typeof id === 'string' && id.startsWith('installed-')

// A fetched file's id is its URL, which can't collide with either.
export type RemoteId = `https://${string}`
export const isRemoteId = (id: unknown): id is RemoteId => typeof id === 'string' && isUrlTarget(id)

export type InstalledTheme = { id: InstalledId; text: string; hash: string; installedAt: number; source: 'file' }

type EntryInfo = { name: string; author?: string; release?: string; issues: Issue[] }

export type LibraryEntry =
  | (EntryInfo & { id: BuiltinId; builtin: true; family: ThemeFamily })
  // family is null when an installed or fetched theme can't be used: it no longer parses, or it has an
  // error. It stays in the list, but can't be selected.
  | (EntryInfo & { id: InstalledId | RemoteId; builtin: false; family: ThemeFamily | null })

export type UsableEntry = LibraryEntry & { family: ThemeFamily }

// One family object per id, since compileOnce keys on the family alone: installs refuse a duplicate text,
// and a fetched file is keyed by its URL and text, which a newline separates.
const parseInstalledOnce = memoize(parseThemeText)
const parseFetchedOnce = memoize((key: string) => parseThemeText(key.slice(key.indexOf('\n') + 1)))

const modePath = ({ contrast, vision }: AccessMode) => {
  const names = [contrast === 'high' && 'high-contrast', vision === 'colourblind' && 'colourblind'].filter(Boolean)
  return names.length > 0 ? `${names.join('+')}.` : ''
}

/**
 * Validation issues for every variant a family has, in the modes asked for, with paths that say which. A problem a
 * mode shares with an earlier one counts once: colourblind-safe repeats everything standard says about its other tokens.
 */
const validateFamily = (id: string, family: ThemeFamily, modes: AccessMode[]): Issue[] => {
  const seen = new Set<string>()
  return POLARITIES.flatMap(polarity => {
    if (!family.variants[polarity]) return []
    return modes.flatMap(access =>
      compileVariant({ id, builtin: false, family, polarity, access }).report.flatMap(issue => {
        const key = `${polarity} ${issue.rule} ${issue.path} ${issue.message}`
        if (seen.has(key)) return []
        seen.add(key)
        return [{ ...issue, path: `variants.${polarity}.${modePath(access)}${issue.path}` }]
      }),
    )
  })
}

// Event colours by key, whatever order the file listed them in. An object's own keys are unique, so the
// comparison never sees a tie.
const byKey = ([a]: [string, unknown], [b]: [string, unknown]) => (a < b ? -1 : 1)
const eventsByKey = (key: string, value: unknown) => {
  if (key !== 'events' || typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).sort(byKey))
}

// A family's identity for "already installed": its parsed form, so whitespace and key order don't count.
const familyHash = (family: ThemeFamily) => hashString(JSON.stringify(family, eventsByKey))

export type TextCheck =
  | { ok: true; family: ThemeFamily; issues: Issue[]; hash: string }
  | { ok: false; issues: Issue[] }

/** Parses and validates a theme file's text, for an install or a fetch: errors make it unusable. */
export const checkThemeText = (text: string, modes = ACCESS_MODES): TextCheck => {
  try {
    const parsed = parseThemeText(text)
    if (!parsed.ok) return { ok: false, issues: parsed.issues }
    const issues = [...parsed.issues, ...validateFamily('candidate', parsed.family, modes)]
    if (issues.some(i => i.severity === 'error')) return { ok: false, issues }
    return { ok: true, family: parsed.family, issues, hash: familyHash(parsed.family) }
  } catch (err) {
    // An engine bug, as in textEntry: the file reads as unusable instead of throwing.
    console.error('theme library: could not compile', err)
    return { ok: false, issues: [error('V13', '', 'This theme couldn’t be compiled')] }
  }
}

// A theme kept as text that can't be used: listed, never selectable, named from its text if possible.
const unusable = (id: InstalledId | RemoteId, text: string, issues: Issue[]): LibraryEntry => ({
  id,
  builtin: false,
  name: readableName(text) ?? 'Unreadable theme',
  family: null,
  issues,
})

const textEntry = (id: InstalledId | RemoteId, text: string, parse: () => ParseResult): LibraryEntry => {
  try {
    const parsed = parse()
    if (!parsed.ok) {
      // It parsed when it was kept, so this build reads it differently: a stricter rule, or a
      // rollback past its version. Its modes fall back to Pug; keep a trace of why.
      console.warn('theme library: could not read', id, parsed.issues)
      return unusable(id, text, parsed.issues)
    }
    const { family } = parsed
    const issues = [...parsed.issues, ...validateFamily(id, family, ACCESS_MODES)]
    const usable = !issues.some(i => i.severity === 'error')
    return {
      id,
      builtin: false,
      name: family.name,
      author: family.author,
      release: family.release,
      family: usable ? family : null,
      issues,
    }
  } catch (err) {
    // A theme the engine can't parse or compile is a bug in the engine, not the file, but it must not
    // take the app down with it, since App reads the library while rendering. It stays listed,
    // unselectable, and its mode falls back to Pug.
    console.error('theme library: could not compile', id, err)
    return unusable(id, text, [error('V13', '', 'This theme couldn’t be compiled')])
  }
}

export const buildLibrary = (installed: InstalledTheme[]): LibraryEntry[] => [
  ...BUILTIN_IDS.map(id => ({ id, builtin: true as const, name: BUILTINS[id].name, family: BUILTINS[id], issues: [] })),
  ...installed.map(theme => textEntry(theme.id, theme.text, () => parseInstalledOnce(theme.text))),
]

/** Theme files fetched by URL, each as its last validated text, as library entries keyed by URL. */
export const remoteEntries = (fetched: { url: RemoteId; text: string }[]) =>
  fetched.map(({ url, text }) => textEntry(url, text, () => parseFetchedOnce(`${url}\n${text}`)))

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

// Hashed again from the text: a hash stored by an earlier build may have been computed differently.
const installedHash = (theme: InstalledTheme) => {
  const parsed = parseInstalledOnce(theme.text)
  return parsed.ok ? familyHash(parsed.family) : theme.hash
}

/** Everything the install flow needs to know about a file, without installing it. */
export const checkInstall = (text: string, installed: InstalledTheme[], now = Date.now()): InstallCheck => {
  const check = checkThemeText(text)
  if (!check.ok) return { ok: false, reason: 'invalid', issues: check.issues }
  const { hash, issues } = check
  if (installed.some(t => installedHash(t) === hash)) return { ok: false, reason: 'duplicate', issues }
  if (installed.length >= MAX_INSTALLED) return { ok: false, reason: 'full', issues }
  const theme: InstalledTheme = { id: `installed-${hash}`, text, hash, installedAt: now, source: 'file' }
  return { ok: true, theme, name: check.family.name, issues }
}
