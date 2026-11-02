import { useAtom, useAtomValue } from 'jotai'
import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import SectionHeader from '@/components/section-header'
import { STORAGE_REFUSED, themeChoiceAtom, themeContrastAtom, themeModeAtom, themeVisionAtom } from '@/data/theme.atoms'
import { cn } from '@/lib/utils'

const MODES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

const CONTRASTS = [
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High' },
  { value: 'system', label: 'Match system' },
] as const

const VISIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'colourblind', label: 'Colourblind-safe' },
] as const

// Labelled as groups, since "Standard" means something different in two of them.
const Segments = <T extends string>({
  label,
  options,
  value,
  onChange,
  children,
}: {
  label: string
  options: readonly { value: T; label: string; icon?: LucideIcon }[]
  value: T
  onChange: (value: T) => void
  children?: ReactNode
}) => (
  <div>
    <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5">
      {options.map(({ value: option, label: text, icon: Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === option ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {text}
        </button>
      ))}
    </div>
    {children}
  </div>
)

// What's personal about how a theme looks: these apply to whichever theme is showing, a project's included.
const HowYouSeeIt = () => {
  const [mode, setMode] = useAtom(themeModeAtom)
  const [contrast, setContrast] = useAtom(themeContrastAtom)
  const [vision, setVision] = useAtom(themeVisionAtom)
  const choice = useAtomValue(themeChoiceAtom)

  // A write the browser refused changed nothing: say so, or the click looks like it did nothing.
  const saved = (ok: boolean) => {
    if (!ok) toast.error(STORAGE_REFUSED)
  }

  return (
    <section>
      <SectionHeader title="How you see it" />
      <div className="space-y-4">
        <Segments label="Mode" options={MODES} value={mode} onChange={next => saved(setMode(next))}>
          {choice.pin && <p className="mt-2 text-xs text-muted-foreground">This project is always {choice.pin}.</p>}
        </Segments>
        <Segments label="Contrast" options={CONTRASTS} value={contrast} onChange={next => saved(setContrast(next))} />
        <Segments label="Colour vision" options={VISIONS} value={vision} onChange={next => saved(setVision(next))} />
      </div>
    </section>
  )
}

export default HowYouSeeIt
