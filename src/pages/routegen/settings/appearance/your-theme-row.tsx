import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import {
  fetchStatusAtom,
  refreshFetchedThemeAtom,
  resolvableLibraryAtom,
  STORAGE_REFUSED,
  selectThemeAtom,
  themeSelectionAtom,
} from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import OfficialThemeDetails from '@/pages/routegen/settings/official-theme-details'
import { describeReference, FetchStatusLine, fileName, statusOf } from '@/pages/routegen/settings/theme-status'
import ThemeUpdates from '@/pages/routegen/settings/theme-updates'
import ThemeUrlField from '@/pages/routegen/settings/theme-url-field'
import { isRemoteId } from '@/theme/library'
import { OFFICIAL_REPOSITORY, parseThemeFileUrl, startingTrack, themeFileUrl } from '@/theme/repository'
import type { Polarity } from '@/theme/tokens'
import { rowThemes } from './row-themes'
import ThemeSwatch from './theme-swatch'

const ROW_TITLE = { light: 'Light theme', dark: 'Dark theme' } as const

// One of a member's own rows: its swatches, how the file it names is doing, the Updates buttons when it
// follows an official theme, and a URL field for a theme hosted anywhere else. Every choice saves at once.
const YourThemeRow = ({ polarity }: { polarity: Polarity }) => {
  const selected = useAtomValue(themeSelectionAtom)[polarity]
  const library = useAtomValue(resolvableLibraryAtom)
  const catalog = useAtomValue(themeCatalogAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const selectTheme = useSetAtom(selectThemeAtom)
  const refresh = useSetAtom(refreshFetchedThemeAtom)
  // A write the browser refused changed nothing: say so, or the click looks like it did nothing.
  const select = (id: string) => {
    if (!selectTheme({ polarity, id })) toast.error(STORAGE_REFUSED)
  }
  const retry = () => {
    if (isRemoteId(selected)) void refresh(selected)
  }

  const themes = rowThemes({ polarity, selected, library, catalog: catalog.themes })
  const copy = library.find(entry => entry.id === selected)
  // The theme selected for this mode, when it can't be used. Pug is showing in its place.
  const unusable = copy && !copy.family ? copy : undefined
  const reason = unusable?.issues.find(issue => issue.severity === 'error')?.message
  // A file with no variant for this mode, a followed release or a version that dropped it. Pug shows here too.
  const lacking = copy?.family && !copy.family.variants[polarity] ? copy : undefined
  const status = statusOf(selected, statuses)
  const followed = parseThemeFileUrl(OFFICIAL_REPOSITORY, selected)
  // From the catalog, not the swatches: a theme with no swatch in this mode still needs its Updates buttons.
  const listed = followed && catalog.themes.find(theme => theme.slug === followed.slug)
  // A file that never arrived, so no copy stands in. The pick already replaced the old choice: Pug shows.
  const unread = status?.state === 'failed' && !copy

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{ROW_TITLE[polarity]}</p>
      {/* A labelled group, so a screen reader says which mode a swatch sets: both rows hold a "Pug". */}
      <div role="group" aria-label={ROW_TITLE[polarity]} className="flex flex-wrap gap-3">
        {themes.map(({ entry, selected: isSelected, official }) => (
          <ThemeSwatch
            // Not the entry's id, which is a URL that changes with the track: the focused button would be replaced.
            key={official ? `official:${official.slug}` : entry.id}
            entry={entry}
            polarity={polarity}
            selected={isSelected}
            onSelect={() => {
              if (!official) select(entry.id)
              else if (!isSelected) {
                select(themeFileUrl(OFFICIAL_REPOSITORY, official.slug, startingTrack(official.releases)))
              }
            }}
          />
        ))}
      </div>
      {status && <FetchStatusLine status={status} onRetry={retry} />}
      {unread && (
        <p className="mt-2 text-xs text-negative">
          {listed?.family.name ?? describeReference(selected, library)?.name} hasn’t loaded, so Pug is showing instead.
        </p>
      )}
      {unusable && (
        <p className="mt-2 text-xs text-negative">
          {unusable.name} can’t be used, so Pug is showing instead{reason ? `: ${reason}` : '.'}
        </p>
      )}
      {lacking && (
        <p className="mt-2 text-xs text-negative">
          {fileName(lacking)} has no {polarity} variant, so Pug is showing instead.
        </p>
      )}
      {followed && listed && (
        <div className="mt-3 space-y-2">
          <OfficialThemeDetails family={copy?.family ?? listed.family} />
          <ThemeUpdates
            label={`${ROW_TITLE[polarity]} updates`}
            releases={listed.releases}
            track={followed.track}
            onChange={track => select(themeFileUrl(OFFICIAL_REPOSITORY, followed.slug, track))}
          />
        </div>
      )}
      <div className="mt-3">
        <ThemeUrlField
          disclosure={false}
          label={`${ROW_TITLE[polarity]} URL`}
          requires={polarity}
          onUse={file => select(file.url)}
        />
      </div>
    </div>
  )
}

export default YourThemeRow
