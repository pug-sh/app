import type { RemoteId } from './library'
import { compareReleases, formatRelease, parseRelease, type Release } from './release'

// The repository convention. A theme repository is a folder on an https host: each release of a theme at
// <repo>/<slug>/<x.y.z>/theme.json, the newest of each major line at <repo>/<slug>/<major>/theme.json, the
// highest at <repo>/<slug>/theme.json, and the catalog at <repo>/list.json. themes.pug.sh is Pug's own.

export const OFFICIAL_REPOSITORY = 'https://themes.pug.sh'

/** Where the official repository serves the format's JSON Schema, and what its theme files name. */
export const SCHEMA_URL = `${OFFICIAL_REPOSITORY}/schema/v1.json`

/** Slugs a repository can't give a theme: the folders it serves its own files from. */
export const RESERVED_SLUGS: readonly string[] = ['schema']

const SLUG = /^[a-z0-9-]{1,64}$/

export const isSlug = (text: string) => SLUG.test(text) && !RESERVED_SLUGS.includes(text)

/** A repository's releases start at major 1. A file hosted anywhere else may use 0. */
export const isRepositoryRelease = (release: Release) => release.major >= 1

/** How a reference follows a theme: its highest release, the newest in one major line, or exactly one. */
export type Track = { kind: 'latest' } | { kind: 'major'; major: number } | { kind: 'exact'; release: string }

/** The file a track names in a repository. */
export const themeFileUrl = (repository: string, slug: string, track: Track) => {
  if (track.kind === 'latest') return `${repository}/${slug}/theme.json` as RemoteId
  if (track.kind === 'major') return `${repository}/${slug}/${track.major}/theme.json` as RemoteId
  return `${repository}/${slug}/${track.release}/theme.json` as RemoteId
}

const MAJOR = /^[1-9][0-9]*$/

/** A repository theme file's slug and track, or null for any other URL, on that host or another. */
export const parseThemeFileUrl = (repository: string, url: string): { slug: string; track: Track } | null => {
  if (!url.startsWith(`${repository}/`)) return null
  const parts = url.slice(repository.length + 1).split('/')
  const [slug] = parts
  if (parts.at(-1) !== 'theme.json' || !isSlug(slug)) return null
  if (parts.length === 2) return { slug, track: { kind: 'latest' } }
  if (parts.length !== 3) return null
  const segment = parts[1]
  if (MAJOR.test(segment)) {
    const major = Number(segment)
    return Number.isSafeInteger(major) ? { slug, track: { kind: 'major', major } } : null
  }
  const release = parseRelease(segment)
  if (!release || !isRepositoryRelease(release)) return null
  return { slug, track: { kind: 'exact', release: segment } }
}

const highestFirst = (releases: string[]) =>
  releases
    .map(parseRelease)
    .filter((release): release is Release => release !== null)
    .sort((a, b) => compareReleases(b, a))

/** The release a track resolves to among a theme's releases, or null when it names none of them. */
export const resolveTrack = (releases: string[], track: Track) => {
  const sorted = highestFirst(releases)
  if (track.kind === 'exact') return sorted.some(r => formatRelease(r) === track.release) ? track.release : null
  const found = track.kind === 'latest' ? sorted[0] : sorted.find(r => r.major === track.major)
  return found ? formatRelease(found) : null
}

/** Each major line, newest first, with the release it resolves to. */
export const majorLines = (releases: string[]) => {
  const lines: { major: number; release: string }[] = []
  for (const release of highestFirst(releases)) {
    if (!lines.some(line => line.major === release.major)) {
      lines.push({ major: release.major, release: formatRelease(release) })
    }
  }
  return lines
}

/** Where a new pick starts: the newest major line, so fixes arrive and a redesign waits for consent. */
export const startingTrack = (releases: string[]): Track => {
  const [highest] = highestFirst(releases)
  return highest ? { kind: 'major', major: highest.major } : { kind: 'latest' }
}

/** The highest release a track won't reach, for the "is out" notice. Null when it reaches the highest. */
export const unreachedRelease = (releases: string[], track: Track) => {
  const [highest] = highestFirst(releases)
  if (!highest || track.kind === 'latest') return null
  if (track.kind === 'major') return highest.major > track.major ? formatRelease(highest) : null
  const pinned = parseRelease(track.release)
  return pinned && compareReleases(highest, pinned) > 0 ? formatRelease(highest) : null
}

/** An official reference in words: "Clay, following 1.x (now 1.1.0)", "Clay, latest (now 2.0.0)", "Clay 1.1.0". */
export const readOfficial = (name: string, track: Track, release?: string) => {
  if (track.kind === 'exact') return `${name} ${track.release}`
  const now = release ? ` (now ${release})` : ''
  if (track.kind === 'major') return `${name}, following ${track.major}.x${now}`
  return `${name}, latest${now}`
}
