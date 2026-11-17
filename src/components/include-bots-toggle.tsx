import { Bot, Lock } from 'lucide-react'
import { chipActiveClass, chipIdleClass, chipTriggerClass } from '@/lib/chip-styles'
import { cn } from '@/lib/utils'

const titleFor = (includeBots: boolean, forced: boolean) => {
  if (forced) return 'This query reads data only bots carry, so it always includes bots'
  if (includeBots) return 'Showing traffic tagged as automated at ingest'
  return 'Traffic tagged as automated at ingest is hidden'
}

// Off is the default and the quiet state, so it wears the dashed outline the other optional filters use.
// A forced chip stays focusable (aria-disabled, not disabled) so its title still explains why.
const IncludeBotsToggle = ({
  includeBots,
  onChange,
  forced = false,
  className,
}: {
  includeBots: boolean
  onChange: (includeBots: boolean) => void
  forced?: boolean
  className?: string
}) => {
  const shown = includeBots || forced
  const Icon = forced ? Lock : Bot
  return (
    <button
      type="button"
      onClick={() => {
        if (!forced) onChange(!includeBots)
      }}
      aria-disabled={forced || undefined}
      aria-pressed={shown}
      title={titleFor(includeBots, forced)}
      className={cn(chipTriggerClass, shown ? chipActiveClass : chipIdleClass, forced && 'cursor-default', className)}
    >
      <Icon className="size-3" />
      {shown ? 'Bots shown' : 'Bots hidden'}
    </button>
  )
}

export default IncludeBotsToggle
