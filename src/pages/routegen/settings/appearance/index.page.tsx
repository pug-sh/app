import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  activeOverrideAtom,
  fetchStatusAtom,
  refreshFetchedThemeAtom,
  resolvableLibraryAtom,
  resolvedThemeAtom,
  STORAGE_REFUSED,
  selectThemeAtom,
  setProjectOverrideAtom,
  themeChoiceAtom,
  themeSelectionAtom,
} from '@/data/theme.atoms'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { type GalleryTheme, isTheme, startingFile } from '@/pages/routegen/settings/gallery-themes'
import ThemeGallery from '@/pages/routegen/settings/theme-gallery'
import type { ThemeActions } from '@/pages/routegen/settings/theme-panel'
import { FetchStatusLine, statusOf } from '@/pages/routegen/settings/theme-status'
import { modeFor, pinOf } from '@/pages/routegen/settings/theme-target'
import type { ThemeFamily } from '@/theme/format'
import { isRemoteId } from '@/theme/library'
import { formatReference, parseReference } from '@/theme/reference'
import type { Polarity } from '@/theme/tokens'
import { applyButtons, type Destination, mainDestination, mainLabel, type Placement, unseenHint } from './apply'
import HowYouSeeIt from './how-you-see-it'
import InUse from './in-use'
import PersonalStrip from './personal-strip'
import ProjectStrip from './project-strip'
import { projectTheme } from './project-theme'

const Appearance = () => {
  const choice = useAtomValue(themeChoiceAtom)
  const mode = useAtomValue(resolvedThemeAtom)
  const selection = useAtomValue(themeSelectionAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const project = useAtomValue(activeProjectAtom)
  const override = useAtomValue(activeOverrideAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const selectTheme = useSetAtom(selectThemeAtom)
  const setOverride = useSetAtom(setProjectOverrideAtom)
  const refresh = useSetAtom(refreshFetchedThemeAtom)
  // Once the two differ, the split stays until the page reloads, so it doesn't vanish under the cursor when both match.
  const [keptSplit, setKeptSplit] = useState(false)
  const differ = selection.light !== selection.dark
  if (differ && !keptSplit) setKeptSplit(true)
  const split = differ || keptSplit

  // A project with a theme of its own shows it over yours, so the list applies to it there, and every click shows.
  const theme = project ? projectTheme({ project, override, choice, library, statuses }) : null
  const heldReference = theme?.holds ?? selection[split ? mode : 'light']
  const heldTarget = parseReference(heldReference)?.target ?? heldReference
  const held = { target: heldTarget, family: library.find(entry => entry.id === heldTarget)?.family ?? null }
  const placement: Placement = {
    hasProject: Boolean(project),
    projectHolds: theme?.holds === undefined ? undefined : heldTarget,
    split,
    mode,
    selection,
  }
  const own = placement.projectHolds !== undefined

  // A write the browser refused changed nothing: say so, or the click looks like it did nothing.
  const saved = (ok: boolean) => {
    if (!ok) toast.error(STORAGE_REFUSED)
    return ok
  }
  const select = (polarity: Polarity | 'both', id: string) => saved(selectTheme({ polarity, id }))
  const applyToProject = (reference: string | null) => {
    if (project) saved(setOverride({ projectId: project.id, reference }))
  }
  // Your theme is the mode, so a pin has nothing to say there. A project's takes the file's one variant, if that's all.
  const apply = (destination: Destination, target: string, family: ThemeFamily, pin?: Polarity) => {
    if (destination !== 'project') {
      select(destination, target)
      return
    }
    applyToProject(formatReference({ target, pin: pinOf(modeFor(family, pin ?? null)) }))
  }
  const toggleSplit = () => {
    if (!split) {
      setKeptSplit(true)
      return
    }
    if (select('both', selection[mode])) setKeptSplit(false)
  }

  // A theme that isn't held draws the catalog's latest, so a new pick needs no read.
  const actions = (chosen: GalleryTheme): ThemeActions => {
    const { family } = chosen
    if (!family) return { buttons: [] }
    const buttons = applyButtons({ ...chosen, family }, placement)
    const hint = unseenHint(buttons, placement, choice.source !== 'personal')
    const status = chosen.held ? statusOf(heldReference, statuses) : undefined
    const painting = isTheme(chosen, choice.selection[mode])
    const paints = library.find(entry => entry.id === choice.selection[mode])?.family
    const lacking = painting && paints && !paints.variants[mode]
    return {
      buttons: buttons.map(button => ({
        id: button.id,
        label: button.label,
        disabled: button.held,
        onClick: () => apply(button.id, startingFile(chosen), family),
      })),
      note: (
        <>
          {lacking && (
            <p className="text-xs text-negative">
              {chosen.name} has no {mode} version, so Pug is showing instead.
            </p>
          )}
          {status && (
            <FetchStatusLine
              status={status}
              onRetry={isRemoteId(heldTarget) ? () => void refresh(heldTarget) : undefined}
            />
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </>
      ),
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <InUse split={split} project={theme} onSplit={toggleSplit}>
          {own && project && theme ? (
            <ProjectStrip project={project} theme={theme} onApply={applyToProject} />
          ) : (
            <PersonalStrip split={split} onSelect={id => select(split ? mode : 'both', id)} />
          )}
        </InUse>
      </section>

      <HowYouSeeIt />

      <ThemeGallery
        held={held}
        requires={!own && split ? mode : undefined}
        fileLabel={mainLabel(placement)}
        actions={actions}
        onUseFile={file => apply(mainDestination(placement), file.url, file.family, file.pin)}
      />
    </div>
  )
}

export default Appearance
