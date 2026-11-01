import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { fetchStatusAtom, refreshFetchedThemeAtom, resolvableLibraryAtom } from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { type GalleryTheme, listingOf } from '@/pages/routegen/settings/gallery-themes'
import ThemeDetails from '@/pages/routegen/settings/theme-details'
import ThemeGallery from '@/pages/routegen/settings/theme-gallery'
import ThemeModeControl from '@/pages/routegen/settings/theme-mode-control'
import { FetchStatusLine, statusOf } from '@/pages/routegen/settings/theme-status'
import {
  type ModeChoice,
  modeFor,
  onlyVariant,
  pinOf,
  type ThemeTarget,
  targetFor,
} from '@/pages/routegen/settings/theme-target'
import ThemeUpdates from '@/pages/routegen/settings/theme-updates'
import type { CatalogTheme } from '@/theme/catalog'
import { formatReference, parseReference } from '@/theme/reference'
import { repositoryLabel, startingTrack, type Track, updateNotice } from '@/theme/repository'
import type { Polarity } from '@/theme/tokens'

// Picks a project's default theme and its mode. Every member's browser loads the result, so the list is shared: no
// installed themes, and the URL's host is disclosed. `current` is the reference saved now.
const ThemePicker = ({
  current,
  saving = false,
  onSave,
}: {
  current?: string
  saving?: boolean
  onSave: (reference: string) => void
}) => {
  const files = useAtomValue(resolvableLibraryAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const [target, setTarget] = useState<ThemeTarget | null>(null)
  const [choice, setChoice] = useState<ModeChoice | null>(null)
  const catalog = useAtomValue(themeCatalogAtom)
  const refresh = useSetAtom(refreshFetchedThemeAtom)

  // What's selected: the pick, or the saved reference until there is one.
  const saved = current ? parseReference(current) : null
  const savedListing = listingOf(catalog.themes, saved?.target)
  const selected = target?.id ?? saved?.target
  const listing = listingOf(catalog.themes, selected)
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
    if (listing) setTarget(readTarget(listing.theme, track))
  }
  // The current choice keeps its track: a theme already picked stays as it is, and the saved one comes back
  // with its track and mode. Any other starts on its newest major line.
  const choose = (theme: GalleryTheme) => {
    if (target && theme.held) return
    if (!theme.listed) {
      if (theme.family) pick({ id: theme.id, family: theme.family })
      return
    }
    const { slug, repository, releases } = theme.listed
    const back = savedListing?.theme.slug === slug && savedListing.theme.repository === repository
    if (back) pick(readTarget(theme.listed, savedListing.track), saved?.pin)
    else pick(readTarget(theme.listed, startingTrack(releases)))
  }
  const chosen = family ? modeFor(family, choice) : (choice ?? 'follow')
  const single = family && onlyVariant(family)
  const shown = family ?? listing?.theme.family
  const status = target && !family ? statusOf(target.id, statuses) : undefined
  const notice = !target && listing ? updateNotice(listing.theme.releases, listing.track) : null

  const save = () => {
    if (target && family) onSave(formatReference({ target: target.id, pin: pinOf(chosen) }))
  }

  return (
    <div className="space-y-4">
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {target && shown && (
        <div className="space-y-3">
          {listing ? (
            <ThemeDetails family={shown} source={repositoryLabel(listing.theme.repository)} />
          ) : (
            <p className="text-sm">{shown.name}</p>
          )}
          {single && (
            <p className="text-xs text-muted-foreground">
              {shown.name} has only a {single} variant.
            </p>
          )}
          <ThemeModeControl
            value={chosen}
            family={family}
            followLabel="Follow each member’s mode"
            onChange={setChoice}
          />
          {listing && <ThemeUpdates releases={listing.theme.releases} track={listing.track} onChange={follow} />}
          {status && <FetchStatusLine status={status} />}
          <div>
            <Button size="sm" disabled={saving || !family} onClick={save}>
              Save default theme
            </Button>
          </div>
        </div>
      )}
      <ThemeGallery
        shared
        held={selected ? { target: selected, family } : null}
        useLabel="Choose this theme"
        onUse={choose}
        onUseFile={file => pick({ id: file.url, family: file.family }, file.pin)}
      />
    </div>
  )
}

export default ThemePicker
