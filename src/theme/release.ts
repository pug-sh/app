// A theme's release: MAJOR.MINOR.PATCH, three whole numbers without leading zeros, compared as numbers.
// The format takes any; a repository's releases start at major 1 (theme/repository.ts).

export type Release = { major: number; minor: number; patch: number }

export const MAX_RELEASE_LENGTH = 32

/** The grammar as a regex source, for the JSON Schema. */
export const RELEASE_PATTERN = '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
const RELEASE = new RegExp(RELEASE_PATTERN)

export const parseRelease = (text: string): Release | null => {
  if (text.length > MAX_RELEASE_LENGTH) return null
  const match = RELEASE.exec(text)
  if (!match) return null
  const [major, minor, patch] = match.slice(1).map(Number)
  // Past 2^53 two different texts would read as the same number and compare equal.
  if (![major, minor, patch].every(Number.isSafeInteger)) return null
  return { major, minor, patch }
}

/** Negative when a is lower, so sorting with it puts the lowest release first. */
export const compareReleases = (a: Release, b: Release) => a.major - b.major || a.minor - b.minor || a.patch - b.patch

export const formatRelease = ({ major, minor, patch }: Release) => `${major}.${minor}.${patch}`
