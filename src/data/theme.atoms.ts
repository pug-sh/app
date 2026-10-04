import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { trackEvent } from '@/analytics/pug'
import { type CompiledTheme, compileVariant } from '@/theme/compile'
import type { Issue, ThemeFamily } from '@/theme/format'
import {
  type ActiveTheme,
  buildLibrary,
  checkInstall,
  chooseActive,
  type InstallCheck,
  type InstalledTheme,
} from '@/theme/library'
import type { Polarity } from '@/theme/tokens'

export type ThemeMode = 'light' | 'dark' | 'system'

// Storage is untrusted input: another build, an older shape after a rollback, or a hand edit can put
// anything under these keys, and cross-tab sync delivers it straight into the atoms. So each key is a
// raw storage atom, and the exported atom reads it through a guard — a bad value degrades to the
// default instead of throwing inside App's render. getOnInit: App renders before storage loads on
// mount, and jotai 3 won't re-render it for that.
const storedModeAtom = atomWithStorage<unknown>('pug:theme', 'system', undefined, { getOnInit: true })
const storedSelectionAtom = atomWithStorage<unknown>('pug:theme-selection', { light: 'pug', dark: 'pug' }, undefined, {
  getOnInit: true,
})
const storedAutoContrastAtom = atomWithStorage<unknown>('pug:theme-auto-contrast', true, undefined, { getOnInit: true })
const storedInstalledAtom = atomWithStorage<unknown>('pug:themes', [], undefined, { getOnInit: true })

/** Light, dark or follow the OS. Anything else in storage reads as following the OS, as it always did. */
export const themeModeAtom = atom(
  (get): ThemeMode => {
    const mode = get(storedModeAtom)
    return mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system'
  },
  (_get, set, mode: ThemeMode) => set(storedModeAtom, mode),
)

/** Which theme paints each mode. An id that's gone falls back to Pug at resolution, not here. */
export const themeSelectionAtom = atom(
  (get): Record<Polarity, string> => {
    const raw = get(storedSelectionAtom) as Partial<Record<Polarity, unknown>> | null
    const idFor = (polarity: Polarity) => {
      const id = raw?.[polarity]
      return typeof id === 'string' ? id : 'pug'
    }
    return { light: idFor('light'), dark: idFor('dark') }
  },
  (_get, set, selection: Record<Polarity, string>) => set(storedSelectionAtom, selection),
)

/** Swap in Pug High Contrast when the OS asks for more contrast. Only an explicit false turns it off. */
export const autoContrastAtom = atom(
  get => get(storedAutoContrastAtom) !== false,
  (_get, set, on: boolean) => set(storedAutoContrastAtom, on),
)

// An installed entry needs its id and its text; anything else about it can be defaulted.
const asInstalledTheme = (value: unknown): InstalledTheme | null => {
  const entry = value as Partial<Record<keyof InstalledTheme, unknown>> | null
  if (typeof entry?.id !== 'string' || typeof entry.text !== 'string') return null
  return {
    id: entry.id,
    text: entry.text,
    hash: typeof entry.hash === 'string' ? entry.hash : '',
    installedAt: typeof entry.installedAt === 'number' ? entry.installedAt : 0,
    source: 'file',
  }
}

/** Installed theme files, as their original text — re-parsed on load (theme/library.ts). */
export const installedThemesAtom = atom(
  (get): InstalledTheme[] => {
    const raw = get(storedInstalledAtom)
    if (!Array.isArray(raw)) return []
    return raw.map(asInstalledTheme).filter((theme): theme is InstalledTheme => theme !== null)
  },
  (_get, set, themes: InstalledTheme[]) => set(storedInstalledAtom, themes),
)

// An OS-level preference, kept live via matchMedia. Nothing listens while no atom reads it — light
// and dark mode never ask the OS — so mounting reads the query again before listening.
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

// The concrete light/dark in effect. Only for code that genuinely branches on the mode — checkout,
// the share-card plate, the auth glow. Anything that caches colours keys on themeRevisionAtom.
export const resolvedThemeAtom = atom<Polarity>(get => {
  const mode = get(themeModeAtom)
  if (mode !== 'system') return mode
  return get(systemDarkAtom) ? 'dark' : 'light'
})

export const themeLibraryAtom = atom(get => buildLibrary(get(installedThemesAtom)))

// One compile per family and mode. Families are stable objects — built-ins parse once, installed
// themes once per text — so the compiled theme keeps its identity until something it depends on
// changes, and effects keyed on it don't re-run when an unrelated theme is installed.
const compiledByFamily = new WeakMap<ThemeFamily, Partial<Record<Polarity, CompiledTheme>>>()
const compileOnce = (active: ActiveTheme) => {
  const byMode = compiledByFamily.get(active.family) ?? {}
  compiledByFamily.set(active.family, byMode)
  byMode[active.polarity] ??= compileVariant(active)
  return byMode[active.polarity] as CompiledTheme
}

export const compiledThemeAtom = atom(get =>
  compileOnce(
    chooseActive({
      polarity: get(resolvedThemeAtom),
      selection: get(themeSelectionAtom),
      autoContrast: get(autoContrastAtom),
      moreContrast: get(systemMoreContrastAtom),
      library: get(themeLibraryAtom),
    }),
  ),
)

/** Content hash of the active theme — the memo key for anything that caches colours. */
export const themeRevisionAtom = atom(get => get(compiledThemeAtom).revision)

/** DiceBear disc colours for the active theme, as bare hex — a leading '#' emits fill="##…". */
export const avatarPaletteAtom = atom(get => get(compiledThemeAtom).data.avatars.map(hex => hex.slice(1)))

export type InstallResult = InstallCheck | { ok: false; reason: 'storage'; issues: Issue[] }

/** Installs a theme file after checking it. Every refusal comes back as a result; nothing throws. */
export const installThemeAtom = atom(null, (get, set, text: string): InstallResult => {
  const previous = get(installedThemesAtom)
  const check = checkInstall(text, previous)
  if (!check.ok) return check
  try {
    set(installedThemesAtom, [...previous, check.theme])
  } catch {
    // atomWithStorage updates memory before it writes storage. Put memory back, so this session
    // doesn't show a theme the next load won't have.
    try {
      set(installedThemesAtom, previous)
    } catch {
      // Storage still refusing — memory is already back to `previous`.
    }
    return { ok: false, reason: 'storage', issues: [] }
  }
  trackEvent('theme_installed', { source: 'file' })
  return check
})

/** Removes an installed theme; a mode that was showing it falls back to Pug. */
export const removeThemeAtom = atom(null, (get, set, id: string) => {
  set(
    installedThemesAtom,
    get(installedThemesAtom).filter(t => t.id !== id),
  )
  const selection = get(themeSelectionAtom)
  if (selection.light === id || selection.dark === id) {
    set(themeSelectionAtom, {
      light: selection.light === id ? 'pug' : selection.light,
      dark: selection.dark === id ? 'pug' : selection.dark,
    })
  }
})

/** Chooses the theme for one mode and reports which — a built-in by id, anything installed as 'custom'. */
export const selectThemeAtom = atom(null, (get, set, { polarity, id }: { polarity: Polarity; id: string }) => {
  set(themeSelectionAtom, { ...get(themeSelectionAtom), [polarity]: id })
  const builtin = get(themeLibraryAtom).some(entry => entry.id === id && entry.builtin)
  trackEvent('theme_selected', { theme: builtin ? id : 'custom', mode: polarity })
})
