import { atom, type Getter, type Setter } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { trackEvent } from '@/analytics/pug'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { chooseTheme } from '@/theme/choice'
import { compileOnce } from '@/theme/compile'
import type { Issue } from '@/theme/format'
import {
  buildLibrary,
  checkInstall,
  checkThemeText,
  chooseActive,
  type InstallCheck,
  type InstalledTheme,
  isInstalledId,
  isRemoteId,
  type LibraryEntry,
  type RemoteId,
  remoteEntries,
} from '@/theme/library'
import { parseReference } from '@/theme/reference'
import { type FetchFailure, fetchThemeText } from '@/theme/remote'
import { OFFICIAL_REPOSITORY, parseThemeFileUrl } from '@/theme/repository'
import type { Polarity } from '@/theme/tokens'

export type ThemeMode = 'light' | 'dark' | 'system'

type StoredAtom = ReturnType<typeof atomWithStorage<unknown>>

/** What to tell someone whose browser refused to save a theme setting. */
export const STORAGE_REFUSED = 'Couldn’t save that in this browser. Storage is full or blocked.'

// A full quota, a blocked profile or a full disk refuses a write by throwing, after atomWithStorage
// has already moved memory, so the session would show what the next load won't have. Every theme
// setting is written through here (the fetched-file cache, being a cache, is not): the writes land in
// order, and when storage refuses one, all of them are put back. True when everything was saved, false
// when nothing changed.
const persist = (get: Getter, set: Setter, writes: [StoredAtom, unknown][]) => {
  const before = writes.map(([stored]) => [stored, get(stored)] as const)
  try {
    for (const [stored, value] of writes) set(stored, value)
    return true
  } catch {
    for (const [stored, value] of before) {
      try {
        set(stored, value)
      } catch {
        // Storage still refusing; memory is back regardless.
      }
    }
    return false
  }
}

// Storage is untrusted input: another build, an older shape after a rollback, or a hand edit can put
// anything under these keys, and cross-tab sync delivers it straight into the atoms. So every key is a
// raw storage atom read through a guard (a bad value degrades to the default instead of throwing
// inside App's render) and written through persist. getOnInit: App renders before storage loads on
// mount, and jotai 3 won't re-render it for that.
const guardedStorage = <T>(key: string, initial: T, guard: (stored: unknown) => T) => {
  const stored: StoredAtom = atomWithStorage<unknown>(key, initial, undefined, { getOnInit: true })
  const guarded = atom(
    get => guard(get(stored)),
    (get, set, value: T) => persist(get, set, [[stored, value]]),
  )
  return { stored, guarded }
}

const modeStore = guardedStorage(
  'pug:theme',
  'system',
  (stored): ThemeMode => (stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'),
)

/** Light, dark or follow the OS. Anything else in storage reads as following the OS, as it always did. */
export const themeModeAtom = modeStore.guarded

const selectionStore = guardedStorage('pug:theme-selection', { light: 'pug', dark: 'pug' }, stored => {
  const raw = stored as Partial<Record<Polarity, unknown>> | null
  const idFor = (polarity: Polarity) => {
    const id = raw?.[polarity]
    return typeof id === 'string' ? id : 'pug'
  }
  return { light: idFor('light'), dark: idFor('dark') }
})

/** Which theme paints each mode. An id that's gone falls back to Pug at resolution, not here. */
export const themeSelectionAtom = selectionStore.guarded

/** Swap in Pug High Contrast when the OS asks for more contrast. Only an explicit false turns it off. */
export const autoContrastAtom = guardedStorage('pug:theme-auto-contrast', true, stored => stored !== false).guarded

// An installed entry needs an installed-theme id and its text; anything else about it can be defaulted.
const asInstalledTheme = (value: unknown): InstalledTheme | null => {
  const entry = value as Partial<Record<keyof InstalledTheme, unknown>> | null
  if (!isInstalledId(entry?.id) || typeof entry.text !== 'string') return null
  return {
    id: entry.id,
    text: entry.text,
    hash: typeof entry.hash === 'string' ? entry.hash : '',
    installedAt: typeof entry.installedAt === 'number' ? entry.installedAt : 0,
    source: 'file',
  }
}

const installedStore = guardedStorage<InstalledTheme[]>('pug:themes', [], stored => {
  if (!Array.isArray(stored)) return []
  // Each id once: a repeat would put two entries under one id into the library.
  const seen = new Set<string>()
  return stored.map(asInstalledTheme).filter((theme): theme is InstalledTheme => {
    if (theme === null || seen.has(theme.id)) return false
    seen.add(theme.id)
    return true
  })
})

/** Installed theme files, as their original text, re-parsed on load (theme/library.ts). */
export const installedThemesAtom = installedStore.guarded

const asRecord = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

// ---- Per-project overrides ----

// Rebuilt rather than trusted: only plain project ids holding a readable reference survive, so a
// "__proto__" key in storage can't reach a prototype.
const PROJECT_ID = /^[a-z0-9]{1,64}$/i
const overridesStore = guardedStorage<Record<string, string>>(
  'pug:theme-project-overrides',
  {},
  stored =>
    Object.fromEntries(
      Object.entries(asRecord(stored)).filter(
        ([id, value]) => PROJECT_ID.test(id) && typeof value === 'string' && parseReference(value) !== null,
      ),
    ) as Record<string, string>,
)

/** This browser's theme per project, as references, overriding each project's default. */
export const projectOverridesAtom = overridesStore.guarded

// ---- Theme files fetched by URL ----

const MAX_FETCHED = 10

const fetchedStore = guardedStorage<Record<RemoteId, string>>(
  'pug:theme-remote',
  {},
  stored =>
    Object.fromEntries(
      Object.entries(asRecord(stored)).filter(([url, text]) => isRemoteId(url) && typeof text === 'string'),
    ) as Record<RemoteId, string>,
)

/** The last validated text of each fetched theme file, by URL, the least recently fetched first. */
export const fetchedThemesAtom = fetchedStore.guarded

export type FetchStatus =
  | { state: 'loading' }
  | { state: 'ok'; warnings: number }
  | { state: 'failed'; reason: FetchFailure | 'invalid'; status?: number; issues?: Issue[] }

/** How the last fetch of each URL went this session: what the settings pages report. */
export const fetchStatusAtom = atom<Record<string, FetchStatus>>({})

// The cache with this URL's text moved last, trimmed to the MAX_FETCHED most recent.
const withFetched = (cache: Record<RemoteId, string>, url: RemoteId, text: string) =>
  Object.fromEntries([...Object.entries(cache).filter(([key]) => key !== url), [url, text]].slice(-MAX_FETCHED))

const inFlight = new Map<string, Promise<void>>()

/**
 * Fetches a theme file and keeps it when it validates; a failed fetch never replaces a cached copy.
 * Concurrent calls for one URL share one fetch.
 */
export const refreshFetchedThemeAtom = atom(null, (get, set, url: RemoteId) => {
  const running = inFlight.get(url)
  if (running) return running
  const report = (status: FetchStatus) => set(fetchStatusAtom, statuses => ({ ...statuses, [url]: status }))
  const run = (async () => {
    report({ state: 'loading' })
    const fetched = await fetchThemeText(url)
    if (!fetched.ok) {
      report({ state: 'failed', reason: fetched.reason, status: fetched.status })
      return
    }
    const check = checkThemeText(fetched.text)
    if (!check.ok) {
      report({ state: 'failed', reason: 'invalid', issues: check.issues })
      return
    }
    report({ state: 'ok', warnings: check.issues.length })
    try {
      set(fetchedStore.stored, withFetched(get(fetchedThemesAtom), url, fetched.text))
    } catch {
      // A cache, not a setting: a refused write has already moved memory, so the copy serves this session.
    }
  })().finally(() => inFlight.delete(url))
  inFlight.set(url, run)
  return run
})

// The stored list as it is, entries this build can't read included. Installs and removals write onto
// it, so a theme another build stored (a newer shape, say) survives them.
const storedList = (get: Getter): unknown[] => {
  const raw = get(installedStore.stored)
  return Array.isArray(raw) ? raw : []
}

const hasId = (entry: unknown, id: string) =>
  typeof entry === 'object' && entry !== null && (entry as { id?: unknown }).id === id

// An OS-level preference, kept live via matchMedia. Nothing listens while no atom reads it (light
// and dark mode never ask the OS), so mounting reads the query again before listening.
const mediaAtom = (query: string) => {
  const media = atom(typeof window !== 'undefined' && window.matchMedia(query).matches)
  media.onMount = set => {
    const mq = window.matchMedia(query)
    const handler = () => set(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }
  return media
}

const systemDarkAtom = mediaAtom('(prefers-color-scheme: dark)')
const systemMoreContrastAtom = mediaAtom('(prefers-contrast: more)')

export const themeLibraryAtom = atom(get => buildLibrary(get(installedThemesAtom)))

const fetchedEntriesAtom = atom(get =>
  remoteEntries(Object.entries(get(fetchedThemesAtom)).map(([url, text]) => ({ url: url as RemoteId, text }))),
)

/** Everything a reference can name: built-ins, installed themes and the fetched files. */
export const resolvableLibraryAtom = atom(get => [...get(themeLibraryAtom), ...get(fetchedEntriesAtom)])

/** This browser's override for the active project. */
export const activeOverrideAtom = atom(get => {
  const project = get(activeProjectAtom)
  const overrides = get(projectOverridesAtom)
  if (!project || !Object.hasOwn(overrides, project.id)) return undefined
  return overrides[project.id]
})

/**
 * The theme files to keep fresh: the active project's default and this browser's override for it, and the
 * member's own light and dark choices.
 */
export const activeThemeUrlsAtom = atom(get => {
  const selection = get(themeSelectionAtom)
  const targets = [get(activeProjectAtom)?.defaultTheme, get(activeOverrideAtom), selection.light, selection.dark].map(
    value => value && parseReference(value)?.target,
  )
  return [...new Set(targets.filter(isRemoteId))]
})

/** Which theme the active project shows in this browser, and whether it pins the mode. */
export const themeChoiceAtom = atom(get =>
  chooseTheme({
    override: get(activeOverrideAtom),
    projectDefault: get(activeProjectAtom)?.defaultTheme,
    personal: get(themeSelectionAtom),
    library: get(resolvableLibraryAtom),
  }),
)

// The light or dark in effect, a project's pin before the mode. Only for code that branches on the mode
// (checkout, the share-card plate, the auth glow); anything that caches colours keys on themeRevisionAtom.
export const resolvedThemeAtom = atom<Polarity>(get => {
  const pin = get(themeChoiceAtom).pin
  if (pin) return pin
  const mode = get(themeModeAtom)
  if (mode !== 'system') return mode
  return get(systemDarkAtom) ? 'dark' : 'light'
})

export const compiledThemeAtom = atom(get =>
  compileOnce(
    chooseActive({
      polarity: get(resolvedThemeAtom),
      selection: get(themeChoiceAtom).selection,
      autoContrast: get(autoContrastAtom),
      moreContrast: get(systemMoreContrastAtom),
      library: get(resolvableLibraryAtom),
    }),
  ),
)

/** Content hash of the active theme: the memo key for anything that caches colours. */
export const themeRevisionAtom = atom(get => get(compiledThemeAtom).revision)

/** DiceBear disc colours for the active theme, as bare hex: a leading '#' emits fill="##…". */
export const avatarPaletteAtom = atom(get => get(compiledThemeAtom).data.avatars.map(hex => hex.slice(1)))

export type InstallResult = InstallCheck | { ok: false; reason: 'storage'; issues: Issue[] }

/** Installs a theme file after checking it. A refusal, storage's included, comes back as a result. */
export const installThemeAtom = atom(null, (get, set, text: string): InstallResult => {
  const check = checkInstall(text, get(installedThemesAtom))
  if (!check.ok) return check
  if (!persist(get, set, [[installedStore.stored, [...storedList(get), check.theme]]])) {
    return { ok: false, reason: 'storage', issues: [] }
  }
  trackEvent('theme_installed', { source: 'file' })
  return check
})

/**
 * Removes an installed theme: a mode that was showing it falls back to Pug, and a project override naming it
 * goes. False when storage refused.
 */
export const removeThemeAtom = atom(null, (get, set, id: string) => {
  const writes: [StoredAtom, unknown][] = []
  const selection = get(themeSelectionAtom)
  if (selection.light === id || selection.dark === id) {
    writes.push([
      selectionStore.stored,
      { light: selection.light === id ? 'pug' : selection.light, dark: selection.dark === id ? 'pug' : selection.dark },
    ])
  }
  const overrides = Object.entries(asRecord(get(overridesStore.stored)))
  const kept = overrides.filter(([, value]) => typeof value !== 'string' || parseReference(value)?.target !== id)
  if (kept.length < overrides.length) writes.push([overridesStore.stored, Object.fromEntries(kept)])
  writes.push([installedStore.stored, storedList(get).filter(entry => !hasId(entry, id))])
  return persist(get, set, writes)
})

// What analytics may say about a theme: a built-in's id, an official theme's slug and how it's followed,
// or 'custom'. Never a URL.
const analyticsTheme = (target: string, library: LibraryEntry[]) => {
  const official = parseThemeFileUrl(OFFICIAL_REPOSITORY, target)
  if (official) return { theme: official.slug, track: official.track.kind }
  return { theme: library.some(entry => entry.id === target && entry.builtin) ? target : 'custom' }
}

/** Chooses the theme for one mode, by id or by URL, and reports which. False when storage refused. */
export const selectThemeAtom = atom(null, (get, set, { polarity, id }: { polarity: Polarity; id: string }) => {
  if (!persist(get, set, [[selectionStore.stored, { ...get(themeSelectionAtom), [polarity]: id }]])) return false
  trackEvent('theme_selected', { ...analyticsTheme(id, get(themeLibraryAtom)), mode: polarity, scope: 'personal' })
  return true
})

/**
 * Sets this browser's theme for one project as a reference, or clears it with null. Written onto the stored
 * entries, so ones another build stored survive. False when storage refused.
 */
export const setProjectOverrideAtom = atom(
  null,
  (get, set, { projectId, reference }: { projectId: string; reference: string | null }) => {
    const next = { ...asRecord(get(overridesStore.stored)) }
    if (reference === null) delete next[projectId]
    else next[projectId] = reference
    if (!persist(get, set, [[overridesStore.stored, next]])) return false
    const parsed = reference === null ? null : parseReference(reference)
    if (parsed) {
      trackEvent('theme_selected', {
        ...analyticsTheme(parsed.target, get(themeLibraryAtom)),
        mode: parsed.pin ?? 'both',
        scope: 'project',
      })
    }
    return true
  },
)
