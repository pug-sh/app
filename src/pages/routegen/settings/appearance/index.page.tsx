import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import SectionHeader from '@/components/section-header'
import { Switch } from '@/components/ui/switch'
import {
  autoContrastAtom,
  resolvableLibraryAtom,
  resolvedThemeAtom,
  STORAGE_REFUSED,
  selectThemeAtom,
  type ThemeMode,
  themeChoiceAtom,
  themeModeAtom,
  themeSelectionAtom,
} from '@/data/theme.atoms'
import { cn } from '@/lib/utils'
import { type GalleryTheme, startingFile } from '@/pages/routegen/settings/gallery-themes'
import ThemeGallery from '@/pages/routegen/settings/theme-gallery'
import { parseReference } from '@/theme/reference'
import InUse from './in-use'
import PersonalStrip from './personal-strip'
import { paintingSlot, requiredMode, resolveSlot, type ThemeSlot, writesTo } from './slots'
import ThisProject from './this-project'

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const LABEL = 'mb-2 text-xs font-medium text-muted-foreground'

const Appearance = () => {
  const [mode, setMode] = useAtom(themeModeAtom)
  const [autoContrast, setAutoContrast] = useAtom(autoContrastAtom)
  const choice = useAtomValue(themeChoiceAtom)
  const resolved = useAtomValue(resolvedThemeAtom)
  const selection = useAtomValue(themeSelectionAtom)
  const library = useAtomValue(resolvableLibraryAtom)
  const selectTheme = useSetAtom(selectThemeAtom)
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
    hasProject: false,
  })
  const heldReference = selection[slot === 'dark' ? 'dark' : 'light']
  const heldTarget = parseReference(heldReference)?.target ?? heldReference
  const held = { target: heldTarget, family: library.find(entry => entry.id === heldTarget)?.family ?? null }

  // A write the browser refused changed nothing: say so, or the click looks like it did nothing.
  const saved = (ok: boolean) => {
    if (!ok) toast.error(STORAGE_REFUSED)
  }
  const select = (id: string) => saved(selectTheme({ polarity: writesTo(slot, split), id }))
  const use = (theme: GalleryTheme) => select(startingFile(theme))
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
      <ThisProject />

      <section>
        <InUse slot={slot} split={split} onSlot={setPicked} onSplit={toggleSplit} />
        <PersonalStrip slot={slot} split={split} onSelect={select} />
      </section>

      <section>
        <SectionHeader title="How you see it" />
        <div className="space-y-4">
          <div>
            <p className={LABEL}>Mode</p>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {MODES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => saved(setMode(value))}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    mode === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
            {choice.pin && <p className="mt-2 text-xs text-muted-foreground">This project is always {choice.pin}.</p>}
          </div>
          <div>
            <p className={LABEL}>High contrast</p>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={autoContrast} onCheckedChange={on => saved(setAutoContrast(on))} />
              Use High Contrast when my system asks for more contrast
            </label>
          </div>
        </div>
      </section>

      <ThemeGallery
        held={held}
        requires={requiredMode(slot, split)}
        useLabel={slot === 'dark' ? 'Use for dark' : 'Use this theme'}
        heldLabel="In use"
        onUse={use}
        onUseFile={file => select(file.url)}
      />
    </div>
  )
}

export default Appearance
