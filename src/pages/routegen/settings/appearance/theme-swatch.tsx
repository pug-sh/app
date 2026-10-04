import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { compileVariant } from '@/theme/compile'
import type { LibraryEntry } from '@/theme/library'
import type { Polarity } from '@/theme/tokens'

// A theme drawn from its own compiled variant — canvas, a card, the three ink tiers and five data
// dots — so it previews themes that aren't active, which a screenshot of the live page couldn't.
const ThemeSwatch = ({
  entry,
  polarity,
  selected,
  onSelect,
}: {
  entry: LibraryEntry
  polarity: Polarity
  selected: boolean
  onSelect: () => void
}) => {
  const { vars, data } = useMemo(() => {
    if (!entry.family) throw new Error(`ThemeSwatch: ${entry.id} has no usable theme`)
    return compileVariant({ id: entry.id, builtin: entry.builtin, family: entry.family, polarity })
  }, [entry, polarity])

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-36 flex-col gap-2 rounded-lg border p-1.5 text-left transition-colors',
        selected ? 'border-ring' : 'border-border hover:border-muted-foreground/50',
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
      <span className="truncate px-0.5 text-xs font-medium">{entry.name}</span>
    </button>
  )
}

export default ThemeSwatch
