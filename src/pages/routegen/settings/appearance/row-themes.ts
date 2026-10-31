import type { CatalogTheme } from '@/theme/catalog'
import { isRemoteId, type LibraryEntry, type RemoteId, type UsableEntry } from '@/theme/library'
import { OFFICIAL_REPOSITORY, parseThemeFileUrl, themeFileUrl } from '@/theme/repository'
import type { Polarity } from '@/theme/tokens'

type RowTheme = { entry: UsableEntry; selected: boolean; official?: { slug: string; releases: string[] } }

// The swatches one of a member's own rows offers: built-ins and installed themes, then the catalog's
// official themes, each only in a mode it has. The official theme the row follows draws its fetched copy,
// which can be an older line than the catalog's latest; a theme from any other URL shows once fetched.
export const rowThemes = ({
  polarity,
  selected,
  library,
  catalog,
}: {
  polarity: Polarity
  selected: string
  library: LibraryEntry[]
  catalog: CatalogTheme[]
}): RowTheme[] => {
  const hasMode = (entry: LibraryEntry): entry is UsableEntry => Boolean(entry.family?.variants[polarity])
  const own = library
    .filter(entry => !isRemoteId(entry.id))
    .filter(hasMode)
    .map(entry => ({ entry, selected: entry.id === selected }))
  const followed = parseThemeFileUrl(OFFICIAL_REPOSITORY, selected)
  const fetched = library.find((entry): entry is UsableEntry => entry.id === selected && entry.family !== null)
  const official = catalog.flatMap(theme => {
    const following = followed?.slug === theme.slug
    // A followed release can lack this mode. Its swatch is the catalog's then, while the latest has the mode.
    const family = following && fetched?.family.variants[polarity] ? fetched.family : theme.family
    if (!family.variants[polarity]) return []
    // Following means the row's selection parsed as this theme's file URL.
    const id = following ? (selected as RemoteId) : themeFileUrl(OFFICIAL_REPOSITORY, theme.slug, { kind: 'latest' })
    const entry: UsableEntry = { id, builtin: false, name: family.name, family, issues: [] }
    return [{ entry, selected: following, official: { slug: theme.slug, releases: theme.releases } }]
  })
  // A file the catalog doesn't claim still paints: from any other URL, or a followed theme while list.json
  // hasn't answered, can't be reached, or no longer lists it.
  const unclaimed = fetched && isRemoteId(selected) && hasMode(fetched) && !official.some(theme => theme.selected)
  return [...own, ...official, ...(unclaimed ? [{ entry: fetched, selected: true }] : [])]
}
