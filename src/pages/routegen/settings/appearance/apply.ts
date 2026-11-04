import { type GalleryTheme, isTheme } from '@/pages/routegen/settings/gallery-themes'
import type { ThemeFamily } from '@/theme/format'
import { POLARITIES, type Polarity } from '@/theme/tokens'

/** Where a theme goes: this project, in this browser, or your own theme in both modes or one. */
export type Destination = 'project' | 'both' | Polarity

/** What decides where a theme goes. `projectHolds` is the target of this project's theme, when it has one. */
export type Placement = {
  hasProject: boolean
  projectHolds?: string
  split: boolean
  mode: Polarity
  selection: Record<Polarity, string>
}

export type ApplyButton = { id: Destination; label: string; held: boolean }

const otherMode = (mode: Polarity): Polarity => (mode === 'light' ? 'dark' : 'light')
const label = (held: boolean, use: string, done: string) => (held ? done : use)

/** The destination on screen: a project's own theme shows over yours, and once split, yours is per mode. */
export const mainDestination = ({ projectHolds, split, mode }: Placement): Destination => {
  if (projectHolds !== undefined) return 'project'
  return split ? mode : 'both'
}

export const mainLabel = (placement: Placement) => {
  const destination = mainDestination(placement)
  if (destination === 'project') return 'Use in this project'
  return destination === 'both' ? 'Use this theme' : `Use for ${destination}`
}

/** A theme's buttons, the one that changes what's on screen first. The rest go where the screen can't show. */
export const applyButtons = (theme: GalleryTheme & { family: ThemeFamily }, placement: Placement) => {
  const { hasProject, projectHolds, split, mode, selection } = placement
  const own = projectHolds !== undefined
  const mine = (polarity: Polarity) => isTheme(theme, selection[polarity])

  const inProject = own && isTheme(theme, projectHolds)
  const project: ApplyButton = {
    id: 'project',
    label: own ? label(inProject, 'Use in this project', 'In use') : 'Only in this project',
    held: inProject,
  }
  const both: ApplyButton = {
    id: 'both',
    label: own
      ? label(mine('light'), 'Make it my theme', 'Your theme')
      : label(mine('light'), 'Use this theme', 'In use'),
    held: mine('light'),
  }
  const perMode = (polarity: Polarity): ApplyButton => {
    const held = mine(polarity)
    if (own) return { id: polarity, label: label(held, `Make it my ${polarity} theme`, `Your ${polarity} theme`), held }
    const done = polarity === mode ? 'In use' : `Your ${polarity} theme`
    return { id: polarity, label: label(held, `Use for ${polarity}`, done), held }
  }

  const modes = own ? POLARITIES : [mode, otherMode(mode)]
  const personal = split ? modes.filter(polarity => theme.family.variants[polarity]).map(perMode) : [both]
  if (own) return [project, ...personal]
  return hasProject ? [...personal, project] : personal
}

/** Where a theme went that the screen can't show, once one of its buttons holds it there. */
export const unseenHint = (buttons: ApplyButton[], placement: Placement, projectShowing: boolean) => {
  const held = (id: Destination) => buttons.some(button => button.id === id && button.held)
  const { projectHolds, split, mode } = placement
  if (projectHolds !== undefined) {
    const yours = buttons.some(button => button.id !== 'project' && button.held)
    if (!yours || !projectShowing || held('project')) return null
    return 'This project uses its own theme. Yours shows in projects without one.'
  }
  if (!split || held(mode)) return null
  const other = otherMode(mode)
  return held(other) ? `You’ll see it in ${other} mode.` : null
}
