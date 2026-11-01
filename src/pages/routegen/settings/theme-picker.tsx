import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  fetchStatusAtom,
  refreshFetchedThemeAtom,
  resolvableLibraryAtom,
  resolvedThemeAtom,
  themeLibraryAtom,
} from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import ThemeSwatch from '@/pages/routegen/settings/appearance/theme-swatch'
import ThemeDetails from '@/pages/routegen/settings/theme-details'
import ThemeModeControl from '@/pages/routegen/settings/theme-mode-control'
import { FetchStatusLine, statusOf } from '@/pages/routegen/settings/theme-status'
import {
  type ModeChoice,
  modeFor,
  onlyVariant,
  pinOf,
  shownPolarity,
  type ThemeTarget,
  targetFor,
} from '@/pages/routegen/settings/theme-target'
import ThemeUpdates from '@/pages/routegen/settings/theme-updates'
import ThemeUrlField from '@/pages/routegen/settings/theme-url-field'
import type { CatalogTheme } from '@/theme/catalog'
import type { ThemeFamily } from '@/theme/format'
import type { UsableEntry } from '@/theme/library'
import { formatReference, parseReference } from '@/theme/reference'
import {
  parseDefaultThemeFile,
  repositoryLabel,
  startingTrack,
  type Track,
  themeFileUrl,
  updateNotice,
} from '@/theme/repository'
import type { Polarity } from '@/theme/tokens'

// Picks a theme reference and its mode. `shared` is a project's default, which every member's browser
// loads: no installed themes, and the URL's host is disclosed. `current` is the reference saved now.
const ThemePicker = ({
  shared,
  current,
  followLabel,
  saveLabel,
  saving = false,
  onSave,
}: {
  shared: boolean
  current?: string
  followLabel: string
  saveLabel: string
  saving?: boolean
  onSave: (reference: string) => void
}) => {
  const library = useAtomValue(themeLibraryAtom)
  const files = useAtomValue(resolvableLibraryAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const mode = useAtomValue(resolvedThemeAtom)
  const [target, setTarget] = useState<ThemeTarget | null>(null)
  const [choice, setChoice] = useState<ModeChoice | null>(null)
  const catalog = useAtomValue(themeCatalogAtom)
  const refresh = useSetAtom(refreshFetchedThemeAtom)

  // What's selected: the pick, or the saved reference until there is one.
  const saved = current ? parseReference(current) : null
  const savedFile = saved && parseDefaultThemeFile(saved.target)
  const selected = target?.id ?? saved?.target
  const followed = target ? parseDefaultThemeFile(target.id) : savedFile
  const official = followed && catalog.themes.find(theme => theme.slug === followed.slug)
  const family = target?.family ?? files.find(entry => entry.id === selected)?.family ?? null

  const pick = (next: ThemeTarget, pin?: Polarity) => {
    setTarget(next)
    setChoice(pin ?? null)
  }
  const readTarget = (theme: CatalogTheme, track: Track) => {
    const next = targetFor(theme, track)
    if (!next.family) void refresh(next.id)
    return next
  }
  const follow = (track: Track) => {
    if (official) setTarget(readTarget(official, track))
  }
  // The current choice keeps its track: a theme already picked stays as it is, and the saved one comes back
  // with its track and mode. Any other starts on its newest major line.
  const choose = (theme: CatalogTheme) => {
    if (target && followed?.slug === theme.slug) return
    if (savedFile?.slug === theme.slug) pick(readTarget(theme, savedFile.track), saved?.pin)
    else pick(readTarget(theme, startingTrack(theme.releases)))
  }
  const previewMode = (preview: ThemeFamily) => shownPolarity(preview, mode)
  const entries = library.filter((entry): entry is UsableEntry => entry.family !== null && (entry.builtin || !shared))
  const chosen = family ? modeFor(family, choice) : (choice ?? 'follow')
  const single = family && onlyVariant(family)
  const shown = family ?? official?.family
  const status = target && !family ? statusOf(target.id, statuses) : undefined
  const notice = !target && followed && official ? updateNotice(official.releases, followed.track) : null

  const save = () => {
    if (target && family) onSave(formatReference({ target: target.id, pin: pinOf(chosen) }))
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Themes" className="flex flex-wrap gap-3">
        {entries.map(entry => (
          <ThemeSwatch
            key={entry.id}
            entry={entry}
            polarity={previewMode(entry.family)}
            selected={selected === entry.id}
            onSelect={() => pick(entry)}
          />
        ))}
        {catalog.themes.map(theme => {
          const isSelected = followed?.slug === theme.slug
          const drawn = (isSelected && family) || theme.family
          return (
            <ThemeSwatch
              key={`official:${theme.slug}`}
              entry={{
                id: themeFileUrl(theme.repository, theme.slug, { kind: 'latest' }),
                builtin: false,
                name: drawn.name,
                family: drawn,
                issues: [],
              }}
              polarity={previewMode(drawn)}
              selected={isSelected}
              onSelect={() => choose(theme)}
            />
          )
        })}
      </div>
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {catalog.status === 'failed' && <p className="text-xs text-muted-foreground">Couldn’t load the theme list.</p>}
      <ThemeUrlField disclosure={shared} onUse={file => pick({ id: file.url, family: file.family }, file.pin)} />
      {target && shown && (
        <div className="space-y-3">
          {official ? (
            <ThemeDetails family={shown} source={repositoryLabel(official.repository)} />
          ) : (
            <p className="text-sm">{shown.name}</p>
          )}
          {single && (
            <p className="text-xs text-muted-foreground">
              {shown.name} has only a {single} variant.
            </p>
          )}
          <ThemeModeControl value={chosen} family={family} followLabel={followLabel} onChange={setChoice} />
          {official && followed && (
            <ThemeUpdates releases={official.releases} track={followed.track} onChange={follow} />
          )}
          {status && <FetchStatusLine status={status} />}
          <div>
            <Button size="sm" disabled={saving || !family} onClick={save}>
              {saveLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ThemePicker
