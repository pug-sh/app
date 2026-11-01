import { useAtomValue, useSetAtom } from 'jotai'
import { useRef, useState } from 'react'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import { Button } from '@/components/ui/button'
import {
  activeOverrideAtom,
  fetchStatusAtom,
  readThemeFileAtom,
  refreshFetchedThemeAtom,
  resolvableLibraryAtom,
  resolvedThemeAtom,
  themeChoiceAtom,
} from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { listingOf } from '@/pages/routegen/settings/gallery-themes'
import ThemeDetails from '@/pages/routegen/settings/theme-details'
import ThemeModeControl from '@/pages/routegen/settings/theme-mode-control'
import { describeReference, FetchStatusLine, fileName, statusOf } from '@/pages/routegen/settings/theme-status'
import { modeFor, onlyVariant, pinOf, targetFor } from '@/pages/routegen/settings/theme-target'
import ThemeUpdates from '@/pages/routegen/settings/theme-updates'
import { missingMode } from '@/theme/choice'
import { isInstalledId, isRemoteId, type RemoteId } from '@/theme/library'
import { formatReference, parseReference } from '@/theme/reference'
import type { Track } from '@/theme/repository'
import type { ProjectTheme } from './project-theme'
import { skippedOverride } from './project-theme'
import { sourceOf } from './slots'

// What belongs to This project, always visible: what it holds, how its file is doing, and the controls that need no
// tile, since a pasted link has none. Each writes at once, after reading a file the catalog doesn't carry: a release's
// own modes decide its pin. A failed read writes nothing, and its reason stays on screen.
const ProjectStrip = ({
  project,
  theme,
  onApply,
}: {
  project: Project
  theme: ProjectTheme
  onApply: (reference: string | null) => void
}) => {
  const override = useAtomValue(activeOverrideAtom)
  const choice = useAtomValue(themeChoiceAtom)
  const mode = useAtomValue(resolvedThemeAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const catalog = useAtomValue(themeCatalogAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const refresh = useSetAtom(refreshFetchedThemeAtom)
  const readFile = useSetAtom(readThemeFileAtom)
  const [reading, setReading] = useState<RemoteId | null>(null)
  const turn = useRef(0)

  const reference = theme.holds ? parseReference(theme.holds) : null
  const target = reference?.target
  const copy = library.find(entry => entry.id === target)
  const listing = listingOf(catalog.themes, target)
  const family = copy?.family ?? listing?.theme.family ?? null
  const single = family && onlyVariant(family)
  const status = theme.holds ? statusOf(theme.holds, statuses) : undefined
  const readingStatus = reading && reading !== target ? statusOf(reading, statuses) : undefined
  const skipped = skippedOverride({ override, choice, library, statuses })

  // The sentence names the theme in use, which isn't what paints in a mode its file doesn't have.
  const painting = choice.source === 'override' ? override : project.defaultTheme
  const lacking =
    choice.source !== 'personal' && painting && missingMode(painting, library) === mode
      ? library.find(entry => entry.id === choice.selection[mode])
      : undefined

  const retry = () => {
    if (isRemoteId(target)) void refresh(target)
  }
  // A later choice replaces an earlier read: only the latest track lands, whichever read finishes last.
  const follow = async (track: Track) => {
    if (!listing) return
    const next = targetFor(listing.theme, track)
    const mine = ++turn.current
    setReading(next.family ? null : next.id)
    const read = next.family ?? (await readFile(next.id))
    if (mine !== turn.current || !read) return
    setReading(null)
    onApply(formatReference({ target: next.id, pin: pinOf(modeFor(read, reference?.pin ?? null)) }))
  }

  return (
    <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
      <p className="text-sm">{theme.sentence}</p>
      {lacking && (
        <p className="text-xs text-negative">
          {fileName(lacking)} has no {mode} version, so Pug is showing instead.
        </p>
      )}
      {skipped && <p className="text-xs text-negative">{skipped}</p>}
      {status && <FetchStatusLine status={status} onRetry={isRemoteId(target) ? retry : undefined} />}
      {readingStatus && <FetchStatusLine status={readingStatus} />}
      {family && target && (
        <ThemeDetails
          family={family}
          source={sourceOf(target, listing?.theme.repository, copy)}
          name={copy && isInstalledId(copy.id) ? fileName(copy) : undefined}
        />
      )}
      {reference && (
        <div className="space-y-1">
          <ThemeModeControl
            value={reference.pin && (!family || family.variants[reference.pin]) ? reference.pin : 'follow'}
            family={family}
            followLabel="Follow my mode"
            onChange={next => onApply(formatReference({ target: reference.target, pin: pinOf(next) }))}
          />
          {family && single && (
            <p className="text-xs text-muted-foreground">
              {family.name} has only a {single} variant.
            </p>
          )}
        </div>
      )}
      {listing && (
        <ThemeUpdates
          label="This project updates"
          releases={listing.theme.releases}
          track={listing.track}
          onChange={follow}
        />
      )}
      {override !== undefined && (
        <Button variant="ghost" size="sm" onClick={() => onApply(null)}>
          {describeReference(project.defaultTheme, library) ? 'Back to project default' : 'Back to your theme'}
        </Button>
      )}
    </div>
  )
}

export default ProjectStrip
