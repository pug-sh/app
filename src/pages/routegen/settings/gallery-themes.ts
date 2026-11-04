import { shownPolarity } from '@/pages/routegen/settings/theme-target'
import type { CatalogTheme } from '@/theme/catalog'
import { compileOnce } from '@/theme/compile'
import type { ThemeFamily } from '@/theme/format'
import { isRemoteId, type LibraryEntry, type RemoteId } from '@/theme/library'
import { parseThemeFileUrl, repositoryLabel, startingTrack, themeFileUrl } from '@/theme/repository'
import type { AccessMode, Polarity } from '@/theme/tokens'

export type ThemeSource = 'builtin' | 'installed' | RemoteId
/** What a slot holds. The family is null until the file has been read. */
export type Held = { target: string; family: ThemeFamily | null }
export type GalleryTheme = {
  /** `official:${repository}:${slug}`, or the entry's id. Never changes with a track. */
  key: string
  /** What it compiles under, and a library theme's reference. */
  id: string
  builtin: boolean
  source: ThemeSource
  name: string
  /** Null for an installed theme this build can't use. */
  family: ThemeFamily | null
  held: boolean
  /** Built-ins and installed themes. */
  entry?: LibraryEntry
  /** Repository themes. */
  listed?: CatalogTheme
}
export type ThemeFilters = { query: string; source: 'all' | ThemeSource; order: 'grouped' | 'colour' | 'az' }
export type ThemeGroup = { source: ThemeSource; themes: GalleryTheme[]; failed: boolean }

type DrawableTheme = GalleryTheme & { family: ThemeFamily }

export const NO_FILTERS: ThemeFilters = { query: '', source: 'all', order: 'grouped' }

const SIFT_THRESHOLD = 6
const NEUTRAL_CHROMA = 0.06

/** The catalog theme a file belongs to, read against that theme's own repository, and the track the file names. */
export const listingOf = (catalog: CatalogTheme[], target: string | undefined) => {
  if (!target) return null
  for (const theme of catalog) {
    const file = parseThemeFileUrl(theme.repository, target)
    if (file?.slug === theme.slug) return { theme, track: file.track }
  }
  return null
}

const followsListed = (theme: CatalogTheme, target: string | undefined) =>
  target !== undefined && parseThemeFileUrl(theme.repository, target)?.slug === theme.slug

/** Whether a reference's target is this theme: its id, or any file of a repository theme, whatever its track. */
export const isTheme = (theme: GalleryTheme, target: string | undefined) =>
  theme.listed ? followsListed(theme.listed, target) : theme.id === target

// The themes a list offers: built-ins and installed themes, then the catalog. The one a list holds draws its copy,
// which can be an older line than the catalog's latest, and falls back to the catalog's until that copy arrives. A
// theme that can't be used stays, so it stays removable.
export const galleryThemes = ({
  held,
  shared,
  library,
  catalog,
}: {
  held: Held | null
  shared: boolean
  library: LibraryEntry[]
  catalog: CatalogTheme[]
}): GalleryTheme[] => {
  const own = library
    .filter(entry => !isRemoteId(entry.id) && (entry.builtin || !shared))
    .map(entry => ({
      key: entry.id,
      id: entry.id,
      builtin: entry.builtin,
      source: entry.builtin ? ('builtin' as const) : ('installed' as const),
      name: entry.name,
      family: entry.family,
      held: entry.id === held?.target,
      entry,
    }))
  const repository = catalog.map(theme => {
    const followed = held && followsListed(theme, held.target) ? held : null
    const family = followed?.family ?? theme.family
    return {
      key: `official:${theme.repository}:${theme.slug}`,
      id: followed?.family ? followed.target : themeFileUrl(theme.repository, theme.slug, { kind: 'latest' }),
      builtin: false,
      source: theme.repository,
      name: family.name,
      family,
      held: followed !== null,
      listed: theme,
    }
  })
  return [...own, ...repository]
}

// Under the entry's real id and `builtin`: compileOnce memoizes on the family alone and keeps the first id it's
// given, and what paints reads that id.
export const compiledTheme = (theme: DrawableTheme, polarity: Polarity, access: AccessMode) =>
  compileOnce({
    id: theme.id,
    builtin: theme.builtin,
    family: theme.family,
    polarity: shownPolarity(theme.family, polarity),
    access,
  })

/** Whether a file hand-tunes this version. Both at once is always computed. */
export const tunedIn = (family: ThemeFamily, polarity: Polarity, { contrast, vision }: AccessMode) => {
  const modes = family.variants[polarity]?.modes
  if (contrast === 'high') return vision === 'standard' && Boolean(modes?.['high-contrast'])
  return vision === 'colourblind' && Boolean(modes?.colourblind)
}

export const modeNote = (family: ThemeFamily | null) => {
  if (!family) return 'Can’t be used'
  if (!family.variants.dark) return 'Light only'
  if (!family.variants.light) return 'Dark only'
  return null
}

export const sourceLabel = (source: ThemeSource) => {
  if (source === 'builtin') return 'Built in'
  if (source === 'installed') return 'Installed'
  return repositoryLabel(source)
}

/** The file a new pick saves: a repository theme starts on its newest major line. */
export const startingFile = (theme: GalleryTheme) => {
  if (!theme.listed) return theme.id
  const { repository, slug, releases } = theme.listed
  return themeFileUrl(repository, slug, startingTrack(releases))
}

export const canSift = (themes: GalleryTheme[]) => themes.length > SIFT_THRESHOLD

/** The filters that apply: no control that's gone can hide a theme. */
export const liveFilters = (themes: GalleryTheme[], filters: ThemeFilters) => {
  if (!canSift(themes)) return NO_FILTERS
  const known = filters.source === 'all' || themes.some(theme => theme.source === filters.source)
  return known ? filters : { ...filters, source: 'all' as const }
}

export const isFlat = ({ query, source, order }: ThemeFilters) =>
  query.trim() !== '' || source !== 'all' || order !== 'grouped'

const matches = (theme: GalleryTheme, query: string) =>
  [theme.name, theme.family?.description, theme.family?.author].some(text => text?.toLowerCase().includes(query))

// Hues first, then near-neutrals by lightness, then a theme with nothing to compare.
const colourRank = (theme: GalleryTheme, polarity: Polarity, access: AccessMode) => {
  if (!theme.family) return [2, 0]
  const { h, c, l } = compiledTheme({ ...theme, family: theme.family }, polarity, access).tokens.primary
  return c < NEUTRAL_CHROMA ? [1, l] : [0, h]
}

export const siftThemes = (themes: GalleryTheme[], filters: ThemeFilters, polarity: Polarity, access: AccessMode) => {
  const query = filters.query.trim().toLowerCase()
  const kept = themes.filter(
    theme => (filters.source === 'all' || theme.source === filters.source) && matches(theme, query),
  )
  const byName = (a: GalleryTheme, b: GalleryTheme) => a.name.localeCompare(b.name)
  if (filters.order === 'az') return kept.toSorted(byName)
  if (filters.order !== 'colour') return kept
  return kept
    .map(theme => ({ theme, rank: colourRank(theme, polarity, access) }))
    .toSorted((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || byName(a.theme, b.theme))
    .map(({ theme }) => theme)
}

// Built in, Installed, then the repositories as given. What a slot holds sorts first, so a collapsed group can't
// hide it. A group shows once it has something to say: its themes, or that its repository failed.
export const groupThemes = (themes: GalleryTheme[], repositories: { address: RemoteId; failed: boolean }[]) => {
  const groups: { source: ThemeSource; failed: boolean }[] = [
    { source: 'builtin', failed: false },
    { source: 'installed', failed: false },
    ...repositories.map(({ address, failed }) => ({ source: address, failed })),
  ]
  return groups.flatMap(({ source, failed }): ThemeGroup[] => {
    const members = themes.filter(theme => theme.source === source)
    if (members.length === 0 && !failed) return []
    return [{ source, failed, themes: [...members.filter(t => t.held), ...members.filter(t => !t.held)] }]
  })
}
