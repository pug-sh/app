import { useAtomValue, useSetAtom } from 'jotai'
import { Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { resolvedThemeAtom, STORAGE_REFUSED, themeChoiceAtom, themeModeAtom } from '@/data/theme.atoms'
import { cn } from '@/lib/utils'

export const ThemeModeSwitch = ({ className }: { className?: string }) => {
  const setTheme = useSetAtom(themeModeAtom)
  // A pinned mode wins over the member's setting, so the toggle is locked: flipping a setting that
  // changes nothing on screen would read as a bug.
  const pin = useAtomValue(themeChoiceAtom).pin
  const shown = useAtomValue(resolvedThemeAtom)
  const next = shown === 'dark' ? 'light' : 'dark'
  const Icon = shown === 'dark' ? Moon : Sun

  let title = `Switch to ${next} mode`
  if (pin) title = `This project is always ${pin}`

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={pin !== undefined}
      onClick={() => {
        if (!setTheme(next)) toast.error(STORAGE_REFUSED)
      }}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground outline-hidden ring-sidebar-ring transition-colors hover:text-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
        className,
      )}
    >
      <Icon />
    </button>
  )
}
