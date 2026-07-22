import { Area } from '@/components/charts/area'
import { useChartStable, useYScale } from '@/components/charts/chart-context'
import { Line } from '@/components/charts/line'
import { DEFAULT_Y_AXIS_ID } from '@/components/charts/y-axis-scales'

// The compare-vs-prior series, held back until the chart's y-scale has stopped moving.
//
// The dashes come from the vendored dash-tail overlay, which measures the path and re-measures only
// on its own deps — never the y-scale for Area, and for Line only while `animate` is on, which we
// turn off. A measurement taken mid-tween paints against the old domain and nothing corrects it, so
// the series shoots off-plot. Switching the overview's selected stat is how to see it.
//
// The gate can't make the axis jump: the shell reads series configs off the *element's props*, so
// this component is in the y-domain from the first render whether or not it renders anything.
const useSettledYDomain = () => {
  const { yDomainTargetByAxis } = useChartStable()
  const yScale = useYScale(DEFAULT_Y_AXIS_ID)
  const target = yDomainTargetByAxis[DEFAULT_Y_AXIS_ID]
  if (!target) return true
  // Exact: buildYScalesFromDomains takes the pre-nice'd endpoints straight through, and the tween
  // snaps to the target on completion rather than easing asymptotically into it.
  const [min, max] = yScale.domain()
  return min === target[0] && max === target[1]
}

type Props = {
  dataKey: string
  // Read off the element by the shell's config scan, not only by the inner series.
  stroke: string
  strokeWidth?: number
}

// dashFromIndex 0 dashes the whole stroke; fillOpacity 0 drops the AreaClosed, leaving a bare
// reference line over the live fill.
export function CompareArea({ dataKey, stroke, strokeWidth = 1.5 }: Props) {
  const settled = useSettledYDomain()
  if (!settled) return null

  return (
    <Area
      dashFromIndex={0}
      dataKey={dataKey}
      fill={stroke}
      fillOpacity={0}
      showHighlight={false}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  )
}

// The shell identifies series by component name, and minification mangles the function name. Not
// interchangeable: "Area" inside a LineChart lands in LINE_DOMAIN_EXCLUDED_NAMES and is dropped
// from the shared y-domain.
CompareArea.displayName = 'Area'

export function CompareLine({ dataKey, stroke, strokeWidth = 1.5 }: Props) {
  const settled = useSettledYDomain()
  if (!settled) return null

  return (
    <Line
      animate={false}
      dashFromIndex={0}
      dataKey={dataKey}
      fadeEdges={false}
      showHighlight={false}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  )
}

CompareLine.displayName = 'Line'
