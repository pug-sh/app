import { listingOf } from '@/pages/routegen/settings/gallery-themes'
import { describeReference } from '@/pages/routegen/settings/theme-status'
import type { CatalogTheme } from '@/theme/catalog'
import type { ChoiceSource } from '@/theme/choice'
import { isRemoteId, type LibraryEntry, type RemoteId } from '@/theme/library'
import { parseReference } from '@/theme/reference'
import { repositoryLabel } from '@/theme/repository'
import type { Polarity } from '@/theme/tokens'

// A slot is one chip: what a theme applied from the list goes to.
export type ThemeSlot = 'yours' | 'dark' | 'project'

export const SLOT_LABEL = { yours: 'Your theme', dark: 'In dark', project: 'This project' } as const

/** The chip that's on screen right now, so the first thing someone sees selected is what they're looking at. */
export const paintingSlot = (source: ChoiceSource, split: boolean, mode: Polarity): ThemeSlot => {
  if (source !== 'personal') return 'project'
  return split && mode === 'dark' ? 'dark' : 'yours'
}

/** The chip in effect. A pick can outlive its chip, as a target on load can name a chip that isn't there. */
export const resolveSlot = ({
  picked,
  painting,
  split,
  hasProject,
}: {
  picked: ThemeSlot | null
  painting: ThemeSlot
  split: boolean
  hasProject: boolean
}) => {
  const slot = picked ?? painting
  if ((slot === 'project' && !hasProject) || (slot === 'dark' && !split)) return 'yours'
  return slot
}

/** The mode a slot's list holds themes for. One choice covers both modes, and a project can pin either. */
export const requiredMode = (slot: ThemeSlot, split: boolean) => {
  if (!split || slot === 'project') return undefined
  return slot === 'dark' ? 'dark' : 'light'
}

export const writesTo = (slot: ThemeSlot, split: boolean) => requiredMode(slot, split) ?? 'both'

/** Where a held theme comes from, for its byline: its repository, the URL's host, or this browser's library. */
export const sourceOf = (target: string, repository: RemoteId | undefined, copy: LibraryEntry | undefined) => {
  if (repository) return repositoryLabel(repository)
  if (copy?.builtin) return 'Built in'
  return isRemoteId(target) ? new URL(target).host : 'Installed'
}

/** A reference as a chip names it. Pug when it can't be read, since that's what paints. */
export const themeName = (reference: string, library: LibraryEntry[], catalog: CatalogTheme[]) => {
  const target = parseReference(reference)?.target
  const listing = listingOf(catalog, target)
  if (listing) return library.find(entry => entry.id === target)?.family?.name ?? listing.theme.family.name
  const described = describeReference(reference, library)
  if (!described) return 'Pug'
  return described.host && described.host !== described.name ? `${described.name} (${described.host})` : described.name
}
