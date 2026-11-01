import { useAtomValue } from 'jotai'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { compiledThemeAtom, resolvableLibraryAtom, resolvedThemeAtom, themeSelectionAtom } from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { cn } from '@/lib/utils'
import { listingOf } from '@/pages/routegen/settings/gallery-themes'
import ThemePreview from '@/pages/routegen/settings/theme-preview'
import { shownPolarity } from '@/pages/routegen/settings/theme-target'
import { type CompiledTheme, compileOnce } from '@/theme/compile'
import type { ThemeFamily } from '@/theme/format'
import { parseReference } from '@/theme/reference'
import type { Polarity } from '@/theme/tokens'
import type { ProjectTheme } from './project-theme'
import { SLOT_LABEL, type ThemeSlot, themeName } from './slots'

const Chip = ({
  slot,
  name,
  compiled,
  selected,
  onSelect,
}: {
  slot: ThemeSlot
  name: string
  compiled: CompiledTheme | null
  selected: boolean
  onSelect: () => void
}) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onSelect}
    className={cn(
      'flex min-w-0 items-center gap-2 rounded-lg border p-1.5 text-left transition-colors',
      selected ? 'border-ring ring-1 ring-ring' : 'border-border hover:border-muted-foreground/50',
    )}
  >
    <span
      className={cn('h-11 w-17 shrink-0 overflow-hidden rounded-md border border-border/50', !compiled && 'bg-muted')}
    >
      {compiled && <ThemePreview compiled={compiled} />}
    </span>
    <span className="min-w-0">
      <span className="block text-xs text-muted-foreground">{SLOT_LABEL[slot]}</span>
      <span className="block truncate text-sm font-medium">{name}</span>
    </span>
  </button>
)

// What's applied, and which chip a pick goes to. One choice covers light and dark, and splitting them is the exception.
const InUse = ({
  slot,
  split,
  project,
  onSlot,
  onSplit,
}: {
  slot: ThemeSlot
  split: boolean
  project: ProjectTheme | null
  onSlot: (slot: ThemeSlot) => void
  onSplit: () => void
}) => {
  const selection = useAtomValue(themeSelectionAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const catalog = useAtomValue(themeCatalogAtom).themes
  const mode = useAtomValue(resolvedThemeAtom)
  const painted = useAtomValue(compiledThemeAtom)

  // From the copy, then the catalog: a theme the file hasn't reached yet is still drawn.
  const drawn = (reference: string, polarity: (family: ThemeFamily) => Polarity) => {
    const target = parseReference(reference)?.target ?? reference
    const copy = library.find(entry => entry.id === target)
    const family = copy?.family ?? listingOf(catalog, target)?.theme.family
    if (!family) return null
    return compileOnce({ id: target, builtin: copy?.builtin ?? false, family, polarity: polarity(family) })
  }
  const sameInBoth = selection.light === selection.dark

  return (
    <>
      <SectionHeader title="In use" description="Pick one, then choose a theme below" />
      <div
        role="group"
        aria-label="Where a theme applies"
        className={cn('grid gap-2 sm:grid-cols-2', split && project && 'sm:grid-cols-3')}
      >
        <Chip
          slot="yours"
          name={themeName(selection.light, library, catalog)}
          compiled={drawn(selection.light, family => (split ? 'light' : shownPolarity(family, mode)))}
          selected={slot === 'yours'}
          onSelect={() => onSlot('yours')}
        />
        {split && (
          <Chip
            slot="dark"
            name={sameInBoth ? 'Same as light' : themeName(selection.dark, library, catalog)}
            compiled={drawn(selection.dark, family => shownPolarity(family, 'dark'))}
            selected={slot === 'dark'}
            onSelect={() => onSlot('dark')}
          />
        )}
        {project && (
          <Chip
            slot="project"
            name={project.chip}
            compiled={painted}
            selected={slot === 'project'}
            onSelect={() => onSlot('project')}
          />
        )}
      </div>
      <Button variant="link" size="xs" onClick={onSplit} className="mt-1 px-0">
        {split ? 'Use one theme for both' : 'Use a different theme for dark'}
      </Button>
    </>
  )
}

export default InUse
