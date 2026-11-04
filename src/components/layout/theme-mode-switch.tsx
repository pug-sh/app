import { useAtom, useAtomValue } from 'jotai'
import { Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { STORAGE_REFUSED, themeChoiceAtom, themeModeAtom } from '@/data/theme.atoms'
import { cn } from '@/lib/utils'

const THEME_MODES = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Monitor },
] as const

export const ThemeModeSwitch = ({ className }: { className?: string }) => {
  const [theme, setTheme] = useAtom(themeModeAtom)
  // A pinned mode wins over the member's setting, so the pin is shown, locked: flipping a setting that
  // changes nothing on screen would read as a bug.
  const pin = useAtomValue(themeChoiceAtom).pin
  const shown = pin ?? theme

  return (
    <div
      role="group"
      aria-label="Theme"
      title={pin ? `This project is always ${pin}` : undefined}
      className={cn('flex items-center gap-0.5', className)}
    >
      {THEME_MODES.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          title={label}
          aria-pressed={shown === mode}
          disabled={pin !== undefined}
          onClick={() => {
            if (!setTheme(mode)) toast.error(STORAGE_REFUSED)
          }}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-hidden ring-sidebar-ring transition-colors hover:text-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-sidebar-accent aria-pressed:text-foreground aria-pressed:shadow-[0_0_0_1px_var(--sidebar-border),0_1px_2px_0_rgb(0_0_0/0.05)] [&_svg]:size-4"
        >
          <Icon />
        </button>
      ))}
    </div>
  )
}
