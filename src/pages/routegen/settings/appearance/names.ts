import { listingOf } from '@/pages/routegen/settings/gallery-themes'
import { describeReference } from '@/pages/routegen/settings/theme-status'
import type { CatalogTheme } from '@/theme/catalog'
import { isRemoteId, type LibraryEntry, type RemoteId } from '@/theme/library'
import { parseReference } from '@/theme/reference'
import { repositoryLabel } from '@/theme/repository'

/** Where a held theme comes from, for its byline: its repository, the URL's host, or this browser's library. */
export const sourceOf = (target: string, repository: RemoteId | undefined, copy: LibraryEntry | undefined) => {
  if (repository) return repositoryLabel(repository)
  if (copy?.builtin) return 'Built in'
  return isRemoteId(target) ? new URL(target).host : 'Installed'
}

/** A reference by name. Pug when it can't be read, since that's what paints. */
export const themeName = (reference: string, library: LibraryEntry[], catalog: CatalogTheme[]) => {
  const target = parseReference(reference)?.target
  const listing = listingOf(catalog, target)
  if (listing) return library.find(entry => entry.id === target)?.family?.name ?? listing.theme.family.name
  const described = describeReference(reference, library)
  if (!described) return 'Pug'
  return described.host && described.host !== described.name ? `${described.name} (${described.host})` : described.name
}
