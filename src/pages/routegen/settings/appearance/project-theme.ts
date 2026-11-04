import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import type { FetchStatus } from '@/data/theme.atoms'
import { describeReference, MODE, statusOf } from '@/pages/routegen/settings/theme-status'
import type { ThemeChoice } from '@/theme/choice'
import type { LibraryEntry } from '@/theme/library'
import { isUrlTarget, parseReference } from '@/theme/reference'

/** What This project holds, the short form its chip shows, and the sentence under the chips. */
export type ProjectTheme = { holds?: string; chip: string; sentence: string }

export const projectTheme = ({
  project,
  override,
  choice,
  library,
  statuses,
}: {
  project: Project
  override?: string
  choice: ThemeChoice
  library: LibraryEntry[]
  statuses: Record<string, FetchStatus>
}): ProjectTheme => {
  const holds = override ?? (project.defaultTheme || undefined)
  const projectDefault = describeReference(project.defaultTheme, library)
  const defaultStatus = statusOf(project.defaultTheme, statuses)

  if (choice.source === 'override') {
    const using = override === undefined ? null : describeReference(override, library)
    const name = using?.name ?? library.find(entry => entry.id === choice.selection.light)?.name
    return { holds, chip: `${name}`, sentence: `Using ${name} in this project.` }
  }
  if (choice.source === 'project' && projectDefault) {
    return {
      holds,
      chip: `Default: ${projectDefault.name}`,
      sentence: `Project default: ${projectDefault.name}, ${MODE[choice.pin ?? 'follow']}`,
    }
  }
  if (projectDefault?.host && defaultStatus?.state !== 'failed') {
    return { holds, chip: 'Loading…', sentence: 'Loading this project’s theme…' }
  }
  if (project.defaultTheme !== '') {
    return {
      holds,
      chip: 'Couldn’t load',
      sentence: 'Couldn’t load this project’s theme. Showing your theme instead.',
    }
  }
  return { holds, chip: 'Same as your theme', sentence: 'No project default, using your theme' }
}

/**
 * The line for an override chooseTheme skipped, naming what paints in its place: never Pug here, since the project's
 * default or the member's own theme takes over.
 */
export const skippedOverride = ({
  override,
  choice,
  library,
  statuses,
}: {
  override?: string
  choice: ThemeChoice
  library: LibraryEntry[]
  statuses: Record<string, FetchStatus>
}) => {
  if (override === undefined || choice.source === 'override') return null
  const target = parseReference(override)?.target ?? override
  const copy = library.find(entry => entry.id === target)
  const name = describeReference(override, library)?.name ?? target
  const who = choice.source === 'project' ? 'the project default' : 'your theme'
  if (copy ? !copy.family : !isUrlTarget(target)) return `${name} can’t be used, so ${who} is showing instead.`
  if (!copy && statusOf(override, statuses)?.state === 'failed') {
    return `${name} hasn’t loaded, so ${who} is showing instead.`
  }
  return null
}
