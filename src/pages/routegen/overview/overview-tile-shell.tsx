import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  footer: string
  meta?: ReactNode
  children: ReactNode
  contentClassName?: string
  className?: string
}

export function OverviewTileShell({ title, footer, meta, children, contentClassName, className }: Props) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background p-4',
        className,
      )}
    >
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <h3 className="truncate text-base font-medium tracking-[-0.01em]">{title}</h3>
        {meta}
      </div>
      <div className={cn('relative min-h-0 flex-1', contentClassName)}>{children}</div>
      <p className="mt-2 shrink-0 text-xs text-muted-foreground/70">{footer}</p>
    </div>
  )
}
