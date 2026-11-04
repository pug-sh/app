import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  activeOverrideAtom,
  fetchStatusAtom,
  resolvableLibraryAtom,
  resolvedThemeAtom,
  STORAGE_REFUSED,
  selectThemeAtom,
  setProjectOverrideAtom,
  themeChoiceAtom,
  themeSelectionAtom,
} from '@/data/theme.atoms'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { type GalleryTheme, startingFile } from '@/pages/routegen/settings/gallery-themes'
import ThemeGallery from '@/pages/routegen/settings/theme-gallery'
import { modeFor, pinOf } from '@/pages/routegen/settings/theme-target'
import type { CheckedFile } from '@/pages/routegen/settings/theme-url-field'
import { formatReference, parseReference } from '@/theme/reference'
import HowYouSeeIt from './how-you-see-it'
import InUse from './in-use'
import PersonalStrip from './personal-strip'
import ProjectStrip from './project-strip'
import { projectTheme } from './project-theme'
import { paintingSlot, requiredMode, resolveSlot, type ThemeSlot, writesTo } from './slots'

const Appearance = () => {
  const choice = useAtomValue(themeChoiceAtom)
  const resolved = useAtomValue(resolvedThemeAtom)
  const selection = useAtomValue(themeSelectionAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const project = useAtomValue(activeProjectAtom)
  const override = useAtomValue(activeOverrideAtom)
  const statuses = useAtomValue(fetchStatusAtom)
  const selectTheme = useSetAtom(selectThemeAtom)
  const setOverride = useSetAtom(setProjectOverrideAtom)
  // The chip someone clicked. Until then the target follows whatever is painting, so a file that lands late moves it.
  const [picked, setPicked] = useState<ThemeSlot | null>(null)
  // Once the two differ, In dark stays until the page reloads, so it doesn't vanish under the cursor when both match.
  const [keptSplit, setKeptSplit] = useState(false)
  const differ = selection.light !== selection.dark
  if (differ && !keptSplit) setKeptSplit(true)
  const split = differ || keptSplit

  const slot = resolveSlot({
    picked,
    painting: paintingSlot(choice.source, split, resolved),
    split,
    hasProject: Boolean(project),
  })
  const theme = project ? projectTheme({ project, override, choice, library, statuses }) : null
  const heldReference = slot === 'project' ? theme?.holds : selection[slot === 'dark' ? 'dark' : 'light']
  const heldTarget = heldReference && (parseReference(heldReference)?.target ?? heldReference)
  const held = heldTarget
    ? { target: heldTarget, family: library.find(entry => entry.id === heldTarget)?.family ?? null }
    : null

  // A write the browser refused changed nothing: say so, or the click looks like it did nothing.
  const saved = (ok: boolean) => {
    if (!ok) toast.error(STORAGE_REFUSED)
  }
  const select = (id: string) => saved(selectTheme({ polarity: writesTo(slot, split), id }))
  const applyToProject = (reference: string | null) => {
    if (project) saved(setOverride({ projectId: project.id, reference }))
  }
  // A theme that isn't held draws the catalog's latest, so a new pick for This project needs no read.
  const use = (chosen: GalleryTheme) => {
    if (slot !== 'project') {
      select(startingFile(chosen))
      return
    }
    if (!chosen.family) return
    applyToProject(formatReference({ target: startingFile(chosen), pin: pinOf(modeFor(chosen.family, null)) }))
  }
  const useFile = (file: CheckedFile) => {
    if (slot !== 'project') {
      select(file.url)
      return
    }
    applyToProject(formatReference({ target: file.url, pin: pinOf(modeFor(file.family, file.pin ?? null)) }))
  }
  const toggleSplit = () => {
    if (!split) {
      setKeptSplit(true)
      setPicked('dark')
      return
    }
    const ok = selectTheme({ polarity: 'both', id: selection.light })
    saved(ok)
    if (!ok) return
    setKeptSplit(false)
    setPicked('yours')
  }

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <InUse slot={slot} split={split} project={theme} onSlot={setPicked} onSplit={toggleSplit} />
        {slot === 'project' && project && theme ? (
          <ProjectStrip project={project} theme={theme} onApply={applyToProject} />
        ) : (
          <PersonalStrip slot={slot} split={split} onSelect={select} />
        )}
      </section>

      <HowYouSeeIt />

      <ThemeGallery
        held={held}
        requires={requiredMode(slot, split)}
        useLabel={slot === 'dark' ? 'Use for dark' : 'Use this theme'}
        heldLabel="In use"
        onUse={use}
        onUseFile={useFile}
      />
    </div>
  )
}

export default Appearance
