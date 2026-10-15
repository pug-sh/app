import type { Release } from './release'

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
