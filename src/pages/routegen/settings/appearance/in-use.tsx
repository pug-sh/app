import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { accessModeAtom, resolvableLibraryAtom, resolvedThemeAtom, themeSelectionAtom } from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { cn } from '@/lib/utils'
import { listingOf } from '@/pages/routegen/settings/gallery-themes'
import ThemePreview from '@/pages/routegen/settings/theme-preview'
import { shownPolarity } from '@/pages/routegen/settings/theme-target'
import { compileOnce } from '@/theme/compile'
import { parseReference } from '@/theme/reference'
import { themeName } from './names'
import type { ProjectTheme } from './project-theme'

// The theme the list applies to, as it's on screen, then its details, then where your own theme stands. Nothing here
// picks a target: a theme's own buttons say where it goes.
const InUse = ({
  split,
  project,
  onSplit,
  children,
}: {
  split: boolean
  project: ProjectTheme | null
  onSplit: () => void
  children: ReactNode
}) => {
  const selection = useAtomValue(themeSelectionAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const catalog = useAtomValue(themeCatalogAtom).themes
  const mode = useAtomValue(resolvedThemeAtom)
  const access = useAtomValue(accessModeAtom)
  const name = (reference: string) => themeName(reference, library, catalog)

  // From the copy, then the catalog: a theme the file hasn't reached yet is still drawn.
  const drawn = (reference: string) => {
    const target = parseReference(reference)?.target ?? reference
    const copy = library.find(entry => entry.id === target)
    const family = copy?.family ?? listingOf(catalog, target)?.theme.family
    if (!family) return null
    return compileOnce({
      id: target,
      builtin: copy?.builtin ?? false,
      family,
      polarity: shownPolarity(family, mode),
      access,
    })
  }
  const other = mode === 'light' ? 'dark' : 'light'
  const holds = project?.holds
  const yours = selection[split ? mode : 'light']
  const compiled = drawn(holds ?? yours)

  let caption = split ? `Your theme in ${mode}` : 'Your theme'
  let elsewhere = split ? `In ${other}: ${name(selection[other])}.` : null
  if (holds && split) {
    caption = 'This project'
    elsewhere = `Your theme is ${name(selection.light)} in light and ${name(selection.dark)} in dark. It shows in projects without one of their own.`
  } else if (holds) {
    caption = 'This project'
    elsewhere = `Your theme, ${name(selection.light)}, shows in projects without one of their own.`
  }

  return (
    <>
      <SectionHeader title="In use" />
      <figure className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'h-11 w-17 shrink-0 overflow-hidden rounded-md border border-border/50',
            !compiled && 'bg-muted',
          )}
        >
          {compiled && <ThemePreview compiled={compiled} />}
        </span>
        <figcaption className="min-w-0">
          <span className="block text-xs text-muted-foreground">{caption}</span>
          <span className="block truncate text-sm font-medium">{holds && project ? project.chip : name(yours)}</span>
        </figcaption>
      </figure>
      {children}
      <div className="mt-2 space-y-1">
        {elsewhere && <p className="text-xs text-muted-foreground">{elsewhere}</p>}
        <Button variant="link" size="xs" onClick={onSplit} className="px-0">
          {split ? 'Use one theme for both' : 'Use a different theme for dark'}
        </Button>
      </div>
    </>
  )
}

export default InUse
