import { atom } from 'jotai'
import { type CatalogTheme, fetchCatalog } from '@/theme/catalog'
import { OFFICIAL_REPOSITORY } from '@/theme/repository'

// The official repository's catalog, for the theme pickers. Fetched when the first picker mounts, again
// on the next mount after none were showing, and kept in memory only. A failed read keeps the themes the
// last good one listed.

export type Catalog = { themes: CatalogTheme[]; status: 'loading' | 'ok' | 'failed' }

const catalogStateAtom = atom<Catalog>({ themes: [], status: 'loading' })

/** The catalog. Reading it from a mounted component loads it. */
export const themeCatalogAtom = atom(
  get => get(catalogStateAtom),
  async (_get, set) => {
    set(catalogStateAtom, catalog => ({ ...catalog, status: 'loading' }))
    const read = await fetchCatalog(OFFICIAL_REPOSITORY)
    set(catalogStateAtom, catalog =>
      read.ok ? { themes: read.themes, status: 'ok' } : { themes: catalog.themes, status: 'failed' },
    )
  },
)
themeCatalogAtom.onMount = load => {
  void load()
}
