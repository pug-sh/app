import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type DetailTooltipProps = {
  detail?: string
  children: ReactNode
  className?: string
}

export const DetailTooltip = ({ detail, children, className }: DetailTooltipProps) => {
  const triggerClassName = cn('inline-flex min-w-0 max-w-full', className)

  if (!detail) {
    return <span className={triggerClassName}>{children}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={triggerClassName} />}>{children}</TooltipTrigger>
      <TooltipContent side="top" align="start">
        {detail}
      </TooltipContent>
    </Tooltip>
  )
}
