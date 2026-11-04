import { useAtomValue, useSetAtom } from 'jotai'
import {
  fetchStatusAtom,
  refreshFetchedThemeAtom,
  resolvableLibraryAtom,
  resolvedThemeAtom,
  themeSelectionAtom,
} from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { listingOf } from '@/pages/routegen/settings/gallery-themes'
import ThemeDetails from '@/pages/routegen/settings/theme-details'
import { describeReference, FetchStatusLine, fileName, statusOf } from '@/pages/routegen/settings/theme-status'
import ThemeUpdates from '@/pages/routegen/settings/theme-updates'
import { isInstalledId, isRemoteId } from '@/theme/library'
import { themeFileUrl } from '@/theme/repository'
import { sourceOf } from './names'

// What belongs to your theme in the mode on screen, always visible, so nobody has to open anything to find it: what
// it holds, how its file is doing, why Pug is showing, and its Updates, which come from the catalog, not a tile, so
// they stay when no tile can be drawn. `onSelect` writes to that mode, or to both while there's one choice.
const PersonalStrip = ({ split, onSelect }: { split: boolean; onSelect: (id: string) => void }) => {
  const selection = useAtomValue(themeSelectionAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const catalog = useAtomValue(themeCatalogAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const mode = useAtomValue(resolvedThemeAtom)
  const refresh = useSetAtom(refreshFetchedThemeAtom)

  const selected = selection[split ? mode : 'light']
  const copy = library.find(entry => entry.id === selected)
  const listing = listingOf(catalog.themes, selected)
  const family = copy?.family ?? listing?.theme.family
  // The theme selected for this mode, when it can't be used. Pug is showing in its place.
  const unusable = copy && !copy.family ? copy : undefined
  const reason = unusable?.issues.find(issue => issue.severity === 'error')?.message
  // A file with no variant for this mode, a followed release or a version that dropped it. Pug shows here too.
  const lacking = copy?.family && !copy.family.variants[mode] ? copy : undefined
  const status = statusOf(selected, statuses)
  // A file that never arrived, so no copy stands in. The pick already replaced the old choice: Pug shows.
  const unread = status?.state === 'failed' && !copy
  const retry = () => {
    if (isRemoteId(selected)) void refresh(selected)
  }

  return (
    <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
      <p className="text-xs text-muted-foreground">
        {split ? `Applies in ${mode} mode, in projects without a default` : 'Used in projects without a default'}
      </p>
      {family && (
        <ThemeDetails
          family={family}
          source={sourceOf(selected, listing?.theme.repository, copy)}
          name={copy && isInstalledId(copy.id) ? fileName(copy) : undefined}
        />
      )}
      {status && <FetchStatusLine status={status} onRetry={retry} />}
      {unread && (
        <p className="text-xs text-negative">
          {listing?.theme.family.name ?? describeReference(selected, library)?.name} hasn’t loaded, so Pug is showing
          instead.
        </p>
      )}
      {unusable && (
        <p className="text-xs text-negative">
          {unusable.name} can’t be used, so Pug is showing instead{reason ? `: ${reason}` : '.'}
        </p>
      )}
      {lacking && (
        <p className="text-xs text-negative">
          {fileName(lacking)} has no {mode} version, so Pug is showing instead.
        </p>
      )}
      {listing && (
        <ThemeUpdates
          label={split ? `Your ${mode} theme updates` : 'Your theme updates'}
          releases={listing.theme.releases}
          track={listing.track}
          onChange={track => onSelect(themeFileUrl(listing.theme.repository, listing.theme.slug, track))}
        />
      )}
    </div>
  )
}

export default PersonalStrip
