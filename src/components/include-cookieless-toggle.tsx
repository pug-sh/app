import { Cookie } from 'lucide-react'
import { chipActiveClass, chipIdleClass, chipTriggerClass } from '@/lib/chip-styles'
import { cn } from '@/lib/utils'

// Off is the default and the quiet state, so it wears the other optional filters' dashed outline.
// `personBased` picks the consequence: a rotating id inflates a count, but a funnel can only drop off.
const IncludeCookielessToggle = ({
  includeCookieless,
  personBased,
  onChange,
  className,
}: {
  includeCookieless: boolean
  personBased: boolean
  onChange: (includeCookieless: boolean) => void
  className?: string
}) => {
  const countedTitle = personBased
    ? 'Counting visitors who declined cookies. Their id never recurs after the day it was issued, so they can only read as drop-off — retention and funnel rates fall.'
    : 'Counting visitors who declined cookies. Their id rotates daily, so one person counts once per day.'
  return (
    <button
      type="button"
      onClick={() => onChange(!includeCookieless)}
      aria-pressed={includeCookieless}
      title={includeCookieless ? countedTitle : 'Visitors who declined cookies are excluded from user counts'}
      className={cn(chipTriggerClass, includeCookieless ? chipActiveClass : chipIdleClass, className)}
    >
      <Cookie className="size-3" />
      {includeCookieless ? 'Cookieless counted' : 'Cookieless excluded'}
    </button>
  )
}

export default IncludeCookielessToggle
