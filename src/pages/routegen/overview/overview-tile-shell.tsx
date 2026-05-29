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
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background p-4', className)}>
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        {meta}
      </div>
      <div className={cn('relative min-h-0 flex-1', contentClassName)}>{children}</div>
      <p className="mt-2 shrink-0 font-mono text-[10px] text-muted-foreground">{footer}</p>
    </div>
  )
}
