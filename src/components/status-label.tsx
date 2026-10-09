import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TONE_DOT = {
  positive: 'bg-success',
  caution: 'bg-warning',
  // Not bg-destructive: that fill is held deep for white button text, and a dot of it sinks on dark.
  negative: 'bg-negative',
  neutral: 'bg-muted-foreground/40',
}

const StatusLabel = ({ tone, children }: { tone: keyof typeof TONE_DOT; children: ReactNode }) => (
  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
    <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone])} />
    {children}
  </span>
)

export default StatusLabel
