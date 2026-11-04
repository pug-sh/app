import type { CatalogTheme } from '@/theme/catalog'
import type { ThemeFamily } from '@/theme/format'
import { resolveTrack, type Track, themeFileUrl } from '@/theme/repository'
import { POLARITIES, type Polarity } from '@/theme/tokens'

// A file and its family. Null until it's been read: the catalog carries only each theme's latest file.
export type ThemeTarget = { id: string; family: ThemeFamily | null }
export type ModeChoice = 'follow' | Polarity

// The one variant a single-variant family has.
export const onlyVariant = (family: ThemeFamily) => {
  const variants = POLARITIES.filter(polarity => family.variants[polarity])
  return variants.length === 1 ? variants[0] : null
}

// The mode a file is saved with: what was chosen, as long as the file has it, else its one variant, or its
// other mode would show Pug, else each member's own.
export const modeFor = (family: ThemeFamily, choice: ModeChoice | null) => {
  if (choice === 'follow' || (choice && family.variants[choice])) return choice
  return onlyVariant(family) ?? 'follow'
}

// The mode to draw a theme in: the one asked for, or the one it has.
export const shownPolarity = (family: ThemeFamily, mode: Polarity) =>
  family.variants[mode] ? mode : (onlyVariant(family) ?? mode)

export const pinOf = (mode: ModeChoice) => (mode === 'follow' ? undefined : mode)

// A track that stops short of the latest names a file the catalog doesn't carry, and its modes decide what
// can be saved, so its family stays null and the caller reads it first.
export const targetFor = (theme: CatalogTheme, track: Track) => {
  const id = themeFileUrl(theme.repository, theme.slug, track)
  const latest = resolveTrack(theme.releases, track) === resolveTrack(theme.releases, { kind: 'latest' })
  return { id, family: latest ? theme.family : null }
}
