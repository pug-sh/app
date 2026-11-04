import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { fetchStatusAtom, readThemeFileAtom, resolvableLibraryAtom } from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { listingOf } from '@/pages/routegen/settings/gallery-themes'
import ThemeModeControl from '@/pages/routegen/settings/theme-mode-control'
import { FetchStatusLine, statusOf } from '@/pages/routegen/settings/theme-status'
import { modeFor, onlyVariant, pinOf, targetFor } from '@/pages/routegen/settings/theme-target'
import ThemeUpdates from '@/pages/routegen/settings/theme-updates'
import type { RemoteId } from '@/theme/library'
import { formatReference, parseReference } from '@/theme/reference'
import type { Track } from '@/theme/repository'

// How the saved default takes its mode and follows its releases, each saving at once. A release the catalog doesn't
// carry is read first, since its own modes decide the pin, and the read lands only if it's still the latest and the
// default hasn't moved since it began. A failed read saves nothing, and its reason stays on screen.
const DefaultThemeControls = ({
  current,
  saving,
  onSave,
}: {
  current: string
  saving: boolean
  onSave: (reference: string) => void
}) => {
  const library = useAtomValue(resolvableLibraryAtom)
  const catalog = useAtomValue(themeCatalogAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const readFile = useSetAtom(readThemeFileAtom)
  const store = useStore()
  const [reading, setReading] = useState<RemoteId | null>(null)
  const turn = useRef(0)
  // A save ends any read in flight, so its line goes with it.
  useEffect(() => setReading(null), [current])

  const reference = parseReference(current)
  if (!reference) return null
  const listing = listingOf(catalog.themes, reference.target)
  const family = library.find(entry => entry.id === reference.target)?.family ?? listing?.theme.family ?? null
  const single = family && onlyVariant(family)
  const readingStatus = reading && reading !== reference.target ? statusOf(reading, statuses) : undefined

  // A pin on a file's only variant may be the file's, not a choice, so a file with both modes drops it.
  const chosen = reference.pin && reference.pin !== single ? reference.pin : null
  const follow = async (track: Track) => {
    if (!listing) return
    const next = targetFor(listing.theme, track)
    const mine = ++turn.current
    const before = store.get(activeProjectAtom)?.defaultTheme
    setReading(next.family ? null : next.id)
    const read = next.family ?? (await readFile(next.id))
    if (mine !== turn.current || store.get(activeProjectAtom)?.defaultTheme !== before || !read) return
    setReading(null)
    onSave(formatReference({ target: next.id, pin: pinOf(modeFor(read, chosen)) }))
  }

  return (
    <div className="space-y-2">
      <ThemeModeControl
        value={reference.pin && (!family || family.variants[reference.pin]) ? reference.pin : 'follow'}
        family={family}
        followLabel="Follow each member’s mode"
        disabled={saving}
        onChange={next => onSave(formatReference({ target: reference.target, pin: pinOf(next) }))}
      />
      {family && single && (
        <p className="text-xs text-muted-foreground">
          {family.name} has only a {single} variant.
        </p>
      )}
      {listing && (
        <ThemeUpdates releases={listing.theme.releases} track={listing.track} disabled={saving} onChange={follow} />
      )}
      {readingStatus && <FetchStatusLine status={readingStatus} />}
    </div>
  )
}

export default DefaultThemeControls
