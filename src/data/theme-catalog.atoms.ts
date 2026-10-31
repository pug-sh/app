import { atom } from 'jotai'
import { type CatalogTheme, fetchCatalog } from '@/theme/catalog'
import { OFFICIAL_REPOSITORY } from '@/theme/repository'

// The official repository's catalog, for the theme pickers. Fetched when the first picker mounts, again
// on the next mount after none were showing, and kept in memory only. A failed read keeps the themes the
// last good one listed.

type Catalog = { themes: CatalogTheme[]; status: 'loading' | 'ok' | 'failed' }

const catalogStateAtom = atom<Catalog>({ themes: [], status: 'loading' })
const latestReadAtom = atom(0)

/** The catalog. Reading it from a mounted component loads it. */
export const themeCatalogAtom = atom(
  get => get(catalogStateAtom),
  async (get, set) => {
    const reading = get(latestReadAtom) + 1
    set(latestReadAtom, reading)
    set(catalogStateAtom, catalog => ({ ...catalog, status: 'loading' }))
    const read = await fetchCatalog(OFFICIAL_REPOSITORY)
    // A remount started a newer read while this one hung, and that one decides.
    if (get(latestReadAtom) !== reading) return
    set(catalogStateAtom, catalog =>
      read.ok ? { themes: read.themes, status: 'ok' } : { themes: catalog.themes, status: 'failed' },
    )
  },
)
themeCatalogAtom.onMount = load => {
  void load()
}
