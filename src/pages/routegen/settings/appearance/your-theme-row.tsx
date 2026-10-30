import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import {
  fetchStatusAtom,
  resolvableLibraryAtom,
  STORAGE_REFUSED,
  selectThemeAtom,
  themeSelectionAtom,
} from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import OfficialThemeDetails from '@/pages/routegen/settings/official-theme-details'
import { FetchStatusLine, statusOf } from '@/pages/routegen/settings/theme-status'
import ThemeUpdates from '@/pages/routegen/settings/theme-updates'
import ThemeUrlField from '@/pages/routegen/settings/theme-url-field'
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
  // A write the browser refused changed nothing: say so, or the click looks like it did nothing.
  const select = (id: string) => {
    if (!selectTheme({ polarity, id })) toast.error(STORAGE_REFUSED)
  }

  const themes = rowThemes({ polarity, selected, library, catalog: catalog.themes })
  // The theme selected for this mode, when it can't be used. Pug is showing in its place.
  const unusable = library.find(entry => entry.id === selected && !entry.family)
  const reason = unusable?.issues.find(issue => issue.severity === 'error')?.message
  const status = statusOf(selected, statuses)
  const followed = parseThemeFileUrl(OFFICIAL_REPOSITORY, selected)
  const following = followed && themes.find(theme => theme.selected && theme.official?.slug === followed.slug)

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{ROW_TITLE[polarity]}</p>
      {/* A labelled group, so a screen reader says which mode a swatch sets: both rows hold a "Pug". */}
      <div role="group" aria-label={ROW_TITLE[polarity]} className="flex flex-wrap gap-3">
        {themes.map(({ entry, selected: isSelected, official }) => (
          <ThemeSwatch
            key={entry.id}
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
      {status && <FetchStatusLine status={status} />}
      {unusable && (
        <p className="mt-2 text-xs text-negative">
          {unusable.name} can’t be used, so Pug is showing instead{reason ? `: ${reason}` : '.'}
        </p>
      )}
      {followed && following?.official && (
        <div className="mt-3 space-y-2">
          <OfficialThemeDetails family={following.entry.family} />
          <ThemeUpdates
            releases={following.official.releases}
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
