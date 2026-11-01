import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import ThemePreview from '@/pages/routegen/settings/theme-preview'
import { compileOnce } from '@/theme/compile'
import type { UsableEntry } from '@/theme/library'
import type { Polarity } from '@/theme/tokens'

// A theme as a pressable swatch, drawn by ThemePreview from the theme's own compiled variant.
const ThemeSwatch = ({
  entry,
  polarity,
  selected,
  onSelect,
}: {
  entry: UsableEntry
  polarity: Polarity
  selected: boolean
  onSelect: () => void
}) => {
  const compiled = compileOnce({ id: entry.id, builtin: entry.builtin, family: entry.family, polarity })

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-36 flex-col gap-2 rounded-lg border p-1.5 text-left transition-colors',
        // Selected reads by shape as well as colour (a heavier ring and a check), since this page is
        // where colourblind and high-contrast readers come to pick a theme.
        selected ? 'border-ring ring-1 ring-ring' : 'border-border hover:border-muted-foreground/50',
      )}
    >
      <span className="block h-20 overflow-hidden rounded-md">
        <ThemePreview compiled={compiled} />
      </span>
      <span className="flex items-center gap-1 px-0.5 text-xs font-medium">
        {selected && <Check className="size-3 shrink-0" />}
        <span className="truncate">{entry.name}</span>
      </span>
    </button>
  )
}

export default ThemeSwatch
