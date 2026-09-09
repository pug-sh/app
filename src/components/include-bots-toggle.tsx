import { Bot } from 'lucide-react'
import { chipActiveClass, chipIdleClass, chipTriggerClass } from '@/lib/chip-styles'
import { cn } from '@/lib/utils'

// Off is the default and the quiet state, so it wears the dashed outline the other optional filters use.
const IncludeBotsToggle = ({
  includeBots,
  onChange,
  className,
}: {
  includeBots: boolean
  onChange: (includeBots: boolean) => void
  className?: string
}) => (
  <button
    type="button"
    onClick={() => onChange(!includeBots)}
    aria-pressed={includeBots}
    title={
      includeBots ? 'Showing traffic tagged as automated at ingest' : 'Traffic tagged as automated at ingest is hidden'
    }
    className={cn(chipTriggerClass, includeBots ? chipActiveClass : chipIdleClass, className)}
  >
    <Bot className="size-3" />
    {includeBots ? 'Bots shown' : 'Bots hidden'}
  </button>
)

export default IncludeBotsToggle
