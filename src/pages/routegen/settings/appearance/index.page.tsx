import { useAtom, useAtomValue } from 'jotai'
import { Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import SectionHeader from '@/components/section-header'
import { Switch } from '@/components/ui/switch'
import { autoContrastAtom, STORAGE_REFUSED, type ThemeMode, themeChoiceAtom, themeModeAtom } from '@/data/theme.atoms'
import { themeCatalogAtom } from '@/data/theme-catalog.atoms'
import { cn } from '@/lib/utils'
import { POLARITIES } from '@/theme/tokens'
import InstalledThemes from './installed-themes'
import ThisProject from './this-project'
import YourThemeRow from './your-theme-row'

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const Appearance = () => {
  const [mode, setMode] = useAtom(themeModeAtom)
  const [autoContrast, setAutoContrast] = useAtom(autoContrastAtom)
  const pin = useAtomValue(themeChoiceAtom).pin
  const catalogFailed = useAtomValue(themeCatalogAtom).status === 'failed'
  // A write the browser refused changed nothing: say so, or the click looks like it did nothing.
  const saved = (ok: boolean) => {
    if (!ok) toast.error(STORAGE_REFUSED)
  }

  return (
    <div className="max-w-3xl space-y-8">
      <ThisProject />

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
        {pin && <p className="mt-2 text-xs text-muted-foreground">This project is always {pin}.</p>}
      </section>

      <section>
        <SectionHeader title="Your theme" description="Used in projects without a default" />
        <div className="space-y-5">
          {POLARITIES.map(polarity => (
            <YourThemeRow key={polarity} polarity={polarity} />
          ))}
        </div>
        {catalogFailed && <p className="mt-2 text-xs text-muted-foreground">Couldn’t reach themes.pug.sh.</p>}
      </section>

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
