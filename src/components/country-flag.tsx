import { type ReactNode, useState } from 'react'
import { DetailTooltip, TooltipInline, TooltipInlineItem, tooltipPanelContent } from '@/components/detail-tooltip'
import { formatCountryName, formatLocationLabel, formatLocationPrimary, regionAddsDetail } from '@/lib/location'
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
      className={cn('inline-block shrink-0 saturate-[0.65] opacity-[0.85]', className)}
      style={{ width: size, height: Math.round(size * 0.75) }}
    />
  )
}

// Bespoke location tooltip: an inline spec line — city, region, then the country
// carrying its flag (the flag sits with the country it represents, not the city).
const LocationTooltip = ({ city, region, country }: { city?: string; region?: string; country?: string }) => {
  const countryName = country ? formatCountryName(country) : undefined
  const hasFlag = isCountryCode(country)
  const showRegion = regionAddsDetail(city, region)
  const items: ReactNode[] = []

  if (city) {
    items.push(<TooltipInlineItem key="city" label={city} />)
  }
  if (showRegion) {
    items.push(<TooltipInlineItem key="region" label={<span className="text-muted-foreground">{region}</span>} />)
  }
  if (countryName) {
    items.push(
      <TooltipInlineItem
        key="country"
        icon={hasFlag ? <CountryFlag code={country} size={16} /> : undefined}
        label={<span className="text-muted-foreground">{countryName}</span>}
      />,
    )
  }

  if (!items.length) return null
  return <TooltipInline items={items} />
}

type LocationLabelProps = {
  city?: string
  region?: string
  country?: string
  className?: string
  flagSize?: number
  suffix?: ReactNode
}

export const LocationLabel = ({ city, region, country, className, flagSize = 16, suffix }: LocationLabelProps) => {
  const primary = formatLocationPrimary(city, country)
  if (!primary) return null

  // Only show the tooltip when it adds detail beyond the trigger (extra region or
  // country); otherwise it would just echo the visible label.
  const showTooltip = formatLocationLabel(city, region, country) !== primary

  return (
    <DetailTooltip
      detail={showTooltip ? <LocationTooltip city={city} region={region} country={country} /> : undefined}
      contentClassName={tooltipPanelContent}
      className={cn('items-center gap-1.5', className)}
    >
      <CountryFlag code={country} size={flagSize} />
      <span className="truncate">{primary}</span>
      {suffix}
    </DetailTooltip>
  )
}
