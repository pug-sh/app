import { createContext, useContext, useMemo } from 'react'
import ChartStableContext, { useChartStable } from '@/components/charts/chart-context'
import { ChartTooltip as VendoredTooltip } from '@/components/charts/tooltip'
import type { ChartTooltipProps } from '@/components/charts/tooltip/chart-tooltip'
import { XAxis as VendoredXAxis, type XAxisProps } from '@/components/charts/x-axis'

// The vendored charts format x labels internally with a browser-local,
// granularity-blind formatter and expose no prop for it. Bucket labels have to
// render in the project's reporting zone to match the server's bucket
// boundaries, and vary by granularity or every hour bucket reads "Jul 19".
//
// The labels reach the axis and the tooltip through `dateLabels` on the chart
// context, so re-providing that context is a supported seam — no vendored file
// is touched, and a re-add can't revert it. Both consumers are wrapped below;
// each re-provides independently because they are siblings under the shell.
const FormatDateLabelContext = createContext<((date: Date) => string) | null>(null)

export const DateLabelProvider = FormatDateLabelContext.Provider

const useDateLabelledContext = () => {
  const format = useContext(FormatDateLabelContext)
  const stable = useChartStable()

  return useMemo(() => {
    if (!format) return stable
    // Mirrors the shell's own derivation, which maps the visible plot data
    // (context `data`) through `xAccessor`.
    return { ...stable, dateLabels: stable.data.map(d => format(stable.xAccessor(d))) }
  }, [stable, format])
}

export function XAxis(props: XAxisProps) {
  const value = useDateLabelledContext()

  return (
    <ChartStableContext.Provider value={value}>
      <VendoredXAxis {...props} />
    </ChartStableContext.Provider>
  )
}

// The shell sorts children into layers by component name and "XAxis" is in its
// clip-excluded set. Set explicitly because minification mangles the name, and
// an unrecognised one puts the labels inside the series reveal clip.
XAxis.displayName = 'XAxis'

export function ChartTooltip(props: ChartTooltipProps) {
  const value = useDateLabelledContext()

  return (
    <ChartStableContext.Provider value={value}>
      <VendoredTooltip {...props} />
    </ChartStableContext.Provider>
  )
}

ChartTooltip.displayName = 'ChartTooltip'
