import { useYScale } from '@/components/charts/chart-context'
import { compactNumber } from '@/lib/format'

// The vendored chart ships no Y axis, but its shell reserves the slot by name:
// chart-child-passthrough.ts sorts children into layers by component name, and
// "YAxis" is in its clip-excluded set alongside Grid and XAxis. That keeps the
// labels out of the series reveal clip — anything else gets cropped, since the
// labels sit at negative x. displayName is set explicitly so the classification
// survives minification, which mangles the function name.
export function YAxis({
  numTicks = 5,
  formatter = compactNumber,
  offset = 8,
}: {
  numTicks?: number
  formatter?: (value: number) => string
  offset?: number
}) {
  const yScale = useYScale()

  // Matches Grid's own `yScale.ticks(numTicksRows)` default, so labels land on
  // the grid lines — d3's ticks() is pure, so both calls agree on the same scale.
  const ticks = yScale.ticks(numTicks)

  return (
    <g>
      {ticks.map(tick => (
        <text
          key={tick}
          x={-offset}
          y={yScale(tick)}
          dy="0.32em"
          textAnchor="end"
          className="fill-muted-foreground/70 text-[11px]"
        >
          {formatter(tick)}
        </text>
      ))}
    </g>
  )
}

YAxis.displayName = 'YAxis'
