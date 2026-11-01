import { Check } from 'lucide-react'
import { type Ref, useId } from 'react'
import { cn } from '@/lib/utils'
import { compiledTheme, type GalleryTheme, modeNote } from '@/pages/routegen/settings/gallery-themes'
import ThemePreview from '@/pages/routegen/settings/theme-preview'
import type { Polarity } from '@/theme/tokens'

// One theme, as you'd see it. A click opens it and writes nothing: the ring and check mark what the slot holds,
// not what's open. `source` is carried once a flat list has lost its group labels.
const ThemeTile = ({
  theme,
  polarity,
  open,
  panelId,
  source,
  onToggle,
  ref,
}: {
  theme: GalleryTheme
  polarity: Polarity
  open: boolean
  panelId: string
  source?: string
  onToggle: () => void
  ref?: Ref<HTMLButtonElement>
}) => {
  const sourceId = useId()
  const { name, family, held } = theme
  const note = modeNote(family)

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={held}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-label={note ? `${name}, ${note}` : name}
      aria-describedby={source ? sourceId : undefined}
      onClick={onToggle}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors',
        // Selected reads by shape as well as colour (a heavier ring and a check), since this page is
        // where colourblind and high-contrast readers come to pick a theme.
        held ? 'border-ring ring-1 ring-ring' : 'border-border hover:border-muted-foreground/50',
        open && 'bg-muted/40',
      )}
    >
      <span className={cn('block h-28 overflow-hidden rounded-md border border-border/50', !family && 'bg-muted')}>
        {family && <ThemePreview compiled={compiledTheme({ ...theme, family }, polarity)} />}
      </span>
      <span className="flex items-center gap-1 px-0.5 text-xs">
        {held && <Check className="size-3 shrink-0" />}
        <span className="truncate font-medium">{name}</span>
        {(note || source) && (
          <span className="ml-auto truncate text-muted-foreground">
            {note}
            {note && source && ' · '}
            {source && <span id={sourceId}>{source}</span>}
          </span>
        )}
      </span>
    </button>
  )
}

export default ThemeTile
