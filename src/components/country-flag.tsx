import { type ReactNode, useState } from 'react'
import { DetailTooltip } from '@/components/detail-tooltip'
import { formatLocationLabel, formatLocationPrimary } from '@/lib/location'
import { isCountryCode, twemojiFlagSrc } from '@/lib/twemoji'
import { cn } from '@/lib/utils'

type CountryFlagProps = {
  code?: string
  className?: string
  size?: number
}

export const CountryFlag = ({ code, className, size = 16 }: CountryFlagProps) => {
  const [failed, setFailed] = useState(false)
  if (!isCountryCode(code) || failed) return null

  return (
    <img
      src={twemojiFlagSrc(code)}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('inline-block shrink-0', className)}
      style={{ width: size, height: Math.round(size * 0.75) }}
    />
  )
}

type LocationLabelProps = {
  city?: string
  country?: string
  className?: string
  flagSize?: number
  suffix?: ReactNode
}

export const LocationLabel = ({ city, country, className, flagSize = 16, suffix }: LocationLabelProps) => {
  const primary = formatLocationPrimary(city, country)
  if (!primary) return null

  const fullLabel = formatLocationLabel(city, country)
  const title = fullLabel !== primary ? fullLabel : undefined

  return (
    <DetailTooltip detail={title} className={cn('items-center gap-1.5', className)}>
      <CountryFlag code={country} size={flagSize} />
      <span className="truncate">{primary}</span>
      {suffix}
    </DetailTooltip>
  )
}
