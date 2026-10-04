import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { compileOnce } from '@/theme/compile'
import type { UsableEntry } from '@/theme/library'
import type { Polarity } from '@/theme/tokens'

// A theme drawn from its own compiled variant — canvas, a card, the three ink tiers and five data
// dots — so it previews themes that aren't active, which a screenshot of the live page couldn't.
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
  const { vars, data } = compileOnce({ id: entry.id, builtin: entry.builtin, family: entry.family, polarity })

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-36 flex-col gap-2 rounded-lg border p-1.5 text-left transition-colors',
        // Selected reads by shape as well as colour — a heavier ring and a check — since this page is
        // where colourblind and high-contrast readers come to pick a theme.
        selected ? 'border-ring ring-1 ring-ring' : 'border-border hover:border-muted-foreground/50',
      )}
    >
      <span aria-hidden className="flex h-20 rounded-md p-2" style={{ background: vars['--background'] }}>
        <span className="flex flex-1 flex-col gap-1.5 rounded-sm p-2" style={{ background: vars['--card'] }}>
          <span className="h-1.5 w-3/4 rounded-full" style={{ background: vars['--foreground'] }} />
          <span className="h-1.5 w-1/2 rounded-full" style={{ background: vars['--muted-foreground'] }} />
          <span className="h-1.5 w-1/3 rounded-full" style={{ background: vars['--faint'] }} />
          <span className="mt-auto flex gap-1">
            {data.categorical.slice(0, 5).map((color, i) => (
              <span key={i} className="size-2 rounded-full" style={{ background: color.dot }} />
            ))}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-1 px-0.5 text-xs font-medium">
        {selected && <Check className="size-3 shrink-0" />}
        <span className="truncate">{entry.name}</span>
      </span>
    </button>
  )
}

export default ThemeSwatch
