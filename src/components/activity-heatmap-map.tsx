import { useEffect, useMemo, useRef, useState } from 'react'
import { WorldMap, type CountryContext } from 'react-svg-worldmap'

// react-svg-worldmap renders width = size, height = size * 3/4 (its heightRatio),
// and that 4:3 frame includes large ocean bands + Antarctica. Match it here.
const MAP_HEIGHT_RATIO = 3 / 4

type Props = {
  countries: { iso: string; count: number }[]
}

const countryStyle = ({ countryValue, minValue, maxValue, color }: CountryContext) => {
  const stroke = 'var(--border)'

  if (countryValue === undefined) {
    return {
      fill: 'var(--muted-foreground)',
      fillOpacity: 0.07,
      stroke,
      strokeWidth: 0.5,
      strokeOpacity: 0.3,
      cursor: 'default' as const,
    }
  }

  const value = typeof countryValue === 'number' ? countryValue : minValue
  const range = maxValue - minValue
  const t = range > 0 ? Math.sqrt((value - minValue) / range) : 1

  return {
    fill: color,
    fillOpacity: 0.16 + t * 0.74,
    stroke,
    strokeWidth: 0.5,
    strokeOpacity: 0.35,
    cursor: 'pointer' as const,
  }
}

const ActivityHeatmapMap = ({ countries }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width <= 0 || height <= 0) return
      // Contain: fit the whole map inside the tile so nothing is clipped. The map's
      // fixed 4:3 frame has an oversized bottom band (Antarctica), so a cover/crop
      // fit eats into the northern continents — contain avoids that entirely.
      const next = Math.floor(Math.min(width, height / MAP_HEIGHT_RATIO))
      setSize(prev => (prev === next ? prev : next))
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const data = useMemo(
    () => countries.map(({ iso, count }) => ({ country: iso.toLowerCase(), value: count })),
    [countries],
  )

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden [&_.worldmap__figure-container]:m-0 [&_svg]:max-h-full [&_svg]:max-w-full"
    >
      {size > 0 && (
        <WorldMap
          size={size}
          data={data}
          color="var(--primary)"
          borderColor="var(--border)"
          backgroundColor="transparent"
          strokeOpacity={0.35}
          styleFunction={countryStyle}
          tooltipBgColor="var(--foreground)"
          tooltipTextColor="var(--background)"
          valueSuffix=" events"
        />
      )}
    </div>
  )
}

export default ActivityHeatmapMap
