import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import SectionHeader from '@/components/section-header'
import { Switch } from '@/components/ui/switch'
import {
  autoContrastAtom,
  STORAGE_REFUSED,
  selectThemeAtom,
  type ThemeMode,
  themeLibraryAtom,
  themeModeAtom,
  themeSelectionAtom,
} from '@/data/theme.atoms'
import { cn } from '@/lib/utils'
import { POLARITIES } from '@/theme/tokens'
import InstalledThemes from './installed-themes'
import ThemeSwatch from './theme-swatch'

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const ROW_TITLE = { light: 'Light theme', dark: 'Dark theme' } as const

const Appearance = () => {
  const [mode, setMode] = useAtom(themeModeAtom)
  const [autoContrast, setAutoContrast] = useAtom(autoContrastAtom)
  const selection = useAtomValue(themeSelectionAtom)
  const library = useAtomValue(themeLibraryAtom)
  const selectTheme = useSetAtom(selectThemeAtom)
  // A write the browser refused changed nothing — say so, or the click looks like it did nothing.
  const saved = (ok: boolean) => {
    if (!ok) toast.error(STORAGE_REFUSED)
  }

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <SectionHeader title="Mode" />
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
      </section>

      {POLARITIES.map(polarity => {
        // The theme selected for this mode, when it can't be used — Pug is showing in its place.
        const unusable = library.find(entry => entry.id === selection[polarity] && !entry.family)
        const reason = unusable?.issues.find(issue => issue.severity === 'error')?.message
        return (
          <section key={polarity}>
            <SectionHeader title={ROW_TITLE[polarity]} />
            {/* A labelled group, so a screen reader says which mode a swatch sets — both rows hold a "Pug". */}
            <div role="group" aria-label={ROW_TITLE[polarity]} className="flex flex-wrap gap-3">
              {library
                .filter(entry => entry.family?.variants[polarity])
                .map(entry => (
                  <ThemeSwatch
                    key={entry.id}
                    entry={entry}
                    polarity={polarity}
                    selected={selection[polarity] === entry.id}
                    onSelect={() => saved(selectTheme({ polarity, id: entry.id }))}
                  />
                ))}
            </div>
            {unusable && (
              <p className="mt-2 text-xs text-negative">
                {unusable.name} can’t be used, so Pug is showing instead{reason ? ` — ${reason}` : '.'}
              </p>
            )}
          </section>
        )
      })}

      <section>
        <SectionHeader title="High contrast" />
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={autoContrast} onCheckedChange={on => saved(setAutoContrast(on))} />
          Use High Contrast when my system asks for more contrast
        </label>
      </section>

      <InstalledThemes />
    </div>
  )
}

export default Appearance
