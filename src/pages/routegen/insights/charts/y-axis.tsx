import { useMemo } from 'react'
import ChartStableContext, { useChartStable } from '@/components/charts/chart-context'
import { YAxis as VendoredYAxis, type YAxisProps } from '@/components/charts/y-axis'
import { Y_AXIS_GAP } from './common'

// The vendored axis right-aligns its labels in a column as wide as margin.left. Handing it a narrower one
// leaves the labels where they were and opens the gap between them and the plot.
export function YAxis(props: YAxisProps) {
  const stable = useChartStable()
  const value = useMemo(
    () => ({ ...stable, margin: { ...stable.margin, left: stable.margin.left - Y_AXIS_GAP } }),
    [stable],
  )

  return (
    <ChartStableContext.Provider value={value}>
      <VendoredYAxis {...props} />
    </ChartStableContext.Provider>
  )
}

// The shell keeps "YAxis" out of the series reveal clip by name, and minification mangles the function's.
YAxis.displayName = 'YAxis'
