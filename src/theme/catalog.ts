import type { ThemeFamily } from './format'
import { checkThemeText, type RemoteId } from './library'
import { compareReleases, parseRelease } from './release'
import { fetchCapped } from './remote'
import { isRepositoryRelease, isSlug } from './repository'

// A repository's catalog, list.json: each theme's slug, its releases and its latest file. Read as
// untrusted input, entry by entry, so a bad entry costs only itself.

const MAX_LIST_BYTES = 512 * 1024
const LIST_VERSION = 1

type ListedTheme = { slug: string; releases: string[]; family: ThemeFamily }
/** A theme in a catalog, and the repository that listed it: its files are built from that address. */
export type CatalogTheme = ListedTheme & { repository: RemoteId }
type ListRead = { ok: true; themes: ListedTheme[] } | { ok: false }

const asObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

// A theme's usable releases, highest first.
const releasesOf = (value: unknown) => {
  if (!Array.isArray(value)) return []
  const releases = value.flatMap(text => {
    const release = typeof text === 'string' ? parseRelease(text) : null
    return release && isRepositoryRelease(release) ? [{ text: text as string, release }] : []
  })
  return releases.sort((a, b) => compareReleases(b.release, a.release)).map(({ text }) => text)
}

/** Reads list.json. A list in a newer format is refused; an entry this build can't use is left out. */
export const parseList = (text: string): ListRead => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false }
  }
  const list = asObject(json)
  const version = list?.version
  if (!list || typeof version !== 'number' || version < 1 || version > LIST_VERSION || !Array.isArray(list.themes)) {
    return { ok: false }
  }
  const themes: ListedTheme[] = []
  for (const value of list.themes) {
    const entry = asObject(value)
    const slug = entry?.slug
    if (!entry || typeof slug !== 'string' || !isSlug(slug) || themes.some(theme => theme.slug === slug)) continue
    const releases = releasesOf(entry.releases)
    const latest = asObject(entry.latest)
    if (releases.length === 0 || !latest) continue
    const check = checkThemeText(JSON.stringify(latest))
    if (check.ok) themes.push({ slug, releases, family: check.family })
  }
  return { ok: true, themes }
}

/** Fetches and reads a repository's list.json. */
export const fetchCatalog = async (repository: RemoteId) => {
  const fetched = await fetchCapped(`${repository}/list.json`, MAX_LIST_BYTES)
  const read: ListRead = fetched.ok ? parseList(fetched.text) : { ok: false }
  if (!read.ok) return read
  return { ok: true as const, themes: read.themes.map((theme): CatalogTheme => ({ ...theme, repository })) }
}
