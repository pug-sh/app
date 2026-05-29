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
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5">
        <h3 className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
        {meta}
      </div>
      <div className={cn('relative min-h-0 flex-1 border-t border-border/40 bg-muted/15', contentClassName)}>
        {children}
      </div>
      <p className="shrink-0 border-t border-border/40 px-4 py-2 font-mono text-[10px] text-muted-foreground">{footer}</p>
    </div>
  )
}
