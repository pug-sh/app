import type { LibraryEntry } from './library'
import { parseReference } from './reference'
import { POLARITIES, type Polarity } from './tokens'

// Override, then project default, then the member's own. A reference with no usable theme yet is skipped,
// and a pin counts only when the family has that variant.

export type ChoiceSource = 'override' | 'project' | 'personal'

export type ThemeChoice = { selection: Record<Polarity, string>; pin?: Polarity; source: ChoiceSource }

const usableFamily = (target: string, library: LibraryEntry[]) =>
  library.find(entry => entry.id === target)?.family ?? null

export const chooseTheme = (input: {
  override?: string
  projectDefault?: string
  personal: Record<Polarity, string>
  library: LibraryEntry[]
}): ThemeChoice => {
  const candidates: [ChoiceSource, string | undefined][] = [
    ['override', input.override],
    ['project', input.projectDefault],
  ]
  for (const [source, value] of candidates) {
    const reference = value ? parseReference(value) : null
    if (!reference) continue
    const family = usableFamily(reference.target, input.library)
    if (!family) continue
    const selection = { light: reference.target, dark: reference.target }
    if (reference.pin && family.variants[reference.pin]) return { selection, pin: reference.pin, source }
    return { selection, source }
  }
  return { selection: input.personal, source: 'personal' }
}

/** The pin a reference names that its file has no variant for: it's ignored, and an admin should hear so. */
export const ignoredPin = (value: string, library: LibraryEntry[]) => {
  const reference = parseReference(value)
  if (!reference?.pin) return null
  const family = usableFamily(reference.target, library)
  if (!family || family.variants[reference.pin]) return null
  return reference.pin
}

/** The mode a reference's file has no variant for, while members can land in it and see Pug there. */
export const missingMode = (value: string, library: LibraryEntry[]) => {
  const reference = parseReference(value)
  const family = reference && usableFamily(reference.target, library)
  if (!family || (reference.pin && family.variants[reference.pin])) return null
  return POLARITIES.find(polarity => !family.variants[polarity]) ?? null
}
