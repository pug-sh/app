import { createContext, useContext, useEffect, useMemo } from 'react'
import ChartStableContext, { type ChartStableContextValue, useChartStable } from '@/components/charts/chart-context'
import { ChartTooltip as VendoredTooltip } from '@/components/charts/tooltip'
import type { ChartTooltipProps } from '@/components/charts/tooltip/chart-tooltip'
import { XAxis as VendoredXAxis, type XAxisProps } from '@/components/charts/x-axis'
import { PAD_ROW_KEY } from './common'

// The vendored charts format x labels internally with a browser-local,
// granularity-blind formatter and expose no prop for it. Bucket labels have to
// render in the project's reporting zone to match the server's bucket
// boundaries, and vary by granularity or every hour bucket reads "Jul 19".
//
// The labels reach the axis and the tooltip through `dateLabels` on the chart
// context, so re-providing that context is a supported seam — no vendored file
// is touched, and a re-add can't revert it. Both consumers are wrapped below;
// each re-provides independently because they are siblings under the shell, which
// is also what lets them carry different detail for the same bucket.
export type DateLabelFormatters = { axis: (date: Date) => string; tooltip: (date: Date) => string }

const FormatDateLabelContext = createContext<DateLabelFormatters | null>(null)

export const DateLabelProvider = FormatDateLabelContext.Provider

const useDateLabelledContext = (surface: keyof DateLabelFormatters) => {
  const formatters = useContext(FormatDateLabelContext)
  const stable = useChartStable()

  return useMemo(() => {
    if (!formatters) return stable
    const format = formatters[surface]
    // Annotated rather than inferred: a spread stays assignable to the context type
    // even if upstream renames this field, which would silently drop the override
    // back to the browser-local labels. The annotation makes that rename a build error.
    // Mirrors the shell's own derivation, which maps the visible plot data
    // (context `data`) through `xAccessor`.
    // Padding rows exist only to hold the x-domain open; labelling them would put a
    // phantom bucket at each end of the axis.
    const dateLabels: ChartStableContextValue['dateLabels'] = stable.data.map(d =>
      d[PAD_ROW_KEY] ? '' : format(stable.xAccessor(d)),
    )
    return { ...stable, dateLabels }
  }, [stable, formatters, surface])
}

export function XAxis(props: XAxisProps) {
  const value = useDateLabelledContext('axis')

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

// The hover date pill hardcodes its type and padding and exposes no size prop,
// and its 24px rows can't be shrunk directly — TICKER_ITEM_HEIGHT drives the
// scroll offsets, so a shorter row desyncs the stack onto the wrong date.
// Scaling the whole pill sidesteps that: the offsets live inside the scaled box.
const PILL_SCALE_VAR = '--pill-scale'

// The two dimensions charts actually span here: 120px is the dashboard tile's
// min-h, 280px the insights page's h-70; 360/600 wide covers a tile at its
// narrowest up to a half-width one.
const HEIGHT_RANGE = [120, 280]
const WIDTH_RANGE = [360, 600]
const MIN_PILL_SCALE = 0.75

const fit = (value: number, [min, max]: number[]) => Math.min(1, Math.max(0, (value - min) / (max - min)))

// Continuous, not stepped. Driven by whichever dimension is most cramped, so a
// wide-but-short chart shrinks on height alone.
export const pillScale = (width: number, height: number) => {
  const t = Math.min(fit(height, HEIGHT_RANGE), fit(width, WIDTH_RANGE))
  return Math.round((MIN_PILL_SCALE + t * (1 - MIN_PILL_SCALE)) * 100) / 100
}

// The pill is the only element here carrying both classes: the tooltip's series
// dots are rounded-full too, but not overflow-hidden. Anchored bottom so it
// shrinks upward and stays put against the axis.
export const PILL_SCALING =
  '[&_.overflow-hidden.rounded-full]:origin-bottom [&_.overflow-hidden.rounded-full]:scale-[var(--pill-scale,1)]'

export function ChartTooltip(props: ChartTooltipProps) {
  const value = useDateLabelledContext('tooltip')
  const { containerRef, width, height } = useChartStable()

  // Reuses the chart's own measurement instead of observing the container again.
  useEffect(() => {
    containerRef.current?.style.setProperty(PILL_SCALE_VAR, `${pillScale(width, height)}`)
  }, [containerRef, width, height])

  return (
    <ChartStableContext.Provider value={value}>
      <VendoredTooltip {...props} />
    </ChartStableContext.Provider>
  )
}

ChartTooltip.displayName = 'ChartTooltip'
