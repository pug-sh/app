import { cn } from '@/lib/utils'
import type { ModeChoice } from '@/pages/routegen/settings/theme-target'
import type { ThemeFamily } from '@/theme/format'

// How a saved theme takes its mode: each member's own, or pinned. A pin the file lacks is disabled.
const ThemeModeControl = ({
  value,
  family,
  followLabel,
  onChange,
}: {
  value: ModeChoice
  family: ThemeFamily | null
  followLabel: string
  onChange: (mode: ModeChoice) => void
}) => {
  const choices: [ModeChoice, string][] = [
    ['follow', followLabel],
    ['light', 'Always light'],
    ['dark', 'Always dark'],
  ]

  return (
    <div role="group" aria-label="Mode for this theme" className="inline-flex rounded-lg border border-border p-0.5">
      {choices.map(([choice, label]) => (
        <button
          key={choice}
          type="button"
          aria-pressed={value === choice}
          disabled={choice !== 'follow' && !family?.variants[choice]}
          onClick={() => onChange(choice)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40',
            value === choice ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default ThemeModeControl
