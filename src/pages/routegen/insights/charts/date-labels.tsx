import { type MotionStyle, motion, useSpring } from 'motion/react'
import { createContext, useContext, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useChartConfig } from '@/components/charts/chart-config-context'
import ChartStableContext, {
  ChartProvider,
  type ChartStableContextValue,
  useChartHover,
  useChartStable,
} from '@/components/charts/chart-context'
import { ChartTooltip as VendoredTooltip } from '@/components/charts/tooltip'
import type { ChartTooltipProps } from '@/components/charts/tooltip/chart-tooltip'
import { DateTicker } from '@/components/charts/tooltip/date-ticker'
import { TooltipContent } from '@/components/charts/tooltip/tooltip-content'
import { XAxis as VendoredXAxis, type XAxisProps } from '@/components/charts/x-axis'
import { edgeBucketHover, PAD_ROW_KEY } from './common'
import { AXIS_LABEL_PX_PER_CHAR, pickAxisTicks } from './helpers'

// Re-provides the context's dateLabels so buckets read in the reporting zone and by granularity. Not upstream's
// label props: the axis needs the context anyway, for its clamped xScale and tick rows.
export type DateLabelFormatters = {
  axis: (date: Date) => string
  tooltip: (date: Date) => string
  title: (date: Date) => string
}

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

// The axis centres each label on its bucket, so the last one hung half a label past the plot and only a
// wide right margin kept it unclipped. Clamping where labels land keeps them inside the chart instead.
const keepLabelsInside = ({ xScale, dateLabels, innerWidth, margin }: ChartStableContextValue) => {
  const half = (dateLabels.reduce((max, label) => Math.max(max, label.length), 0) * AXIS_LABEL_PX_PER_CHAR) / 2
  const min = half - margin.left
  const max = innerWidth + margin.right - half
  return Object.assign((date: Date) => Math.min(Math.max(xScale(date), min), max), xScale)
}

// The axis is handed only the rows that get a tick, and asked for all of them, so its own layout
// scorer never runs. The rest are holes rather than a shorter array: the axis skips a missing row,
// and indices stay aligned with the hover state it reads them against.
export function XAxis({ numTicks = 5, ...props }: Omit<XAxisProps, 'labels' | 'numTicks'> & { numTicks?: number }) {
  const labelled = useDateLabelledContext('axis')
  const value = useMemo(() => {
    const xScale = keepLabelsInside(labelled)
    const { data, dateLabels, xAccessor } = labelled
    const ticks = pickAxisTicks(
      dateLabels,
      data.map(d => xScale(xAccessor(d))),
      numTicks,
    )
    const tickRows: typeof data = new Array(data.length)
    for (const index of ticks) tickRows[index] = data[index]
    return { ...labelled, xScale, data: tickRows }
  }, [labelled, numTicks])

  return (
    <ChartStableContext.Provider value={value}>
      <VendoredXAxis {...props} numTicks={value.data.length} />
    </ChartStableContext.Provider>
  )
}

// The shell files "XAxis" with its own axes by name, and minification mangles the function's.
XAxis.displayName = 'XAxis'

// The hover date pill hardcodes its type and padding and exposes no size prop. Its 24px rows
// drive the scroll offsets (TICKER_ITEM_HEIGHT), so the type and padding shrink around them.
const PILL_SCALE_VAR = '--pill-scale'

// The two dimensions charts actually span here: 120px is the dashboard tile's
// min-h, 280px the insights page's h-70; 360/600 wide covers a tile at its
// narrowest up to a half-width one.
const HEIGHT_RANGE = [120, 280]
const WIDTH_RANGE = [360, 600]
// PILL_SCALING's vertical padding reaches 0 here, leaving the bare 24px row.
const MIN_PILL_SCALE = 0.75

const fit = (value: number, [min, max]: number[]) => Math.min(1, Math.max(0, (value - min) / (max - min)))

// Continuous, not stepped. Driven by whichever dimension is most cramped, so a
// wide-but-short chart shrinks on height alone.
export const pillScale = (width: number, height: number) => {
  const t = Math.min(fit(height, HEIGHT_RANGE), fit(width, WIDTH_RANGE))
  return Math.round((MIN_PILL_SCALE + t * (1 - MIN_PILL_SCALE)) * 100) / 100
}

// Never a `scale` or `zoom`: the ticker sizes its columns with getBoundingClientRect, which counts
// an ancestor transform, so a column shrinks twice and clips its label. Only the pill has both classes.
export const PILL_SCALING =
  '[&_.overflow-hidden.rounded-full]:px-[calc(var(--pill-scale,1)*1rem)] [&_.overflow-hidden.rounded-full]:py-[calc((var(--pill-scale,1)_-_0.75)*1rem)] [&_.overflow-hidden.rounded-full_span]:text-[length:max(0.75rem,calc(var(--pill-scale,1)*0.875rem))]'

// Draws the box's content itself because upstream titles it browser-local, a day off the bucket's in some zones.
export function ChartTooltip({ rows, children, ...props }: Omit<ChartTooltipProps, 'content' | 'dateLabels'>) {
  const formatters = useContext(FormatDateLabelContext)
  const value = useDateLabelledContext('tooltip')
  const hover = useChartHover()
  // Mapped here too: the bar chart's snap lands a commit late, after these springs would have started at the padding.
  const tooltipData = edgeBucketHover(hover.tooltipData, value)
  const { containerRef, width, height } = value

  // Reuses the chart's own measurement instead of observing the container again.
  useEffect(() => {
    containerRef.current?.style.setProperty(PILL_SCALE_VAR, `${pillScale(width, height)}`)
  }, [containerRef, width, height])

  return (
    <ChartProvider value={{ ...value, ...hover, tooltipData }}>
      <VendoredTooltip
        {...props}
        content={({ point }) => (
          <TooltipContent rows={rows?.(point) ?? []} title={formatters?.title(value.xAccessor(point))}>
            {children}
          </TooltipContent>
        )}
        rows={rows}
        showDatePill={false}
      />
      <DatePill />
    </ChartProvider>
  )
}

// Upstream's pill centres on the hovered bucket and never clamps, so at either end of the chart the tile
// clipped part of it. This forks its tracker to add the clamp.
function DatePill() {
  const { tooltipData } = useChartHover()
  const { dateLabels } = useChartStable()
  if (!tooltipData || dateLabels.length === 0) return null
  return <TrackedDatePill index={tooltipData.index} x={tooltipData.x} />
}

// Mounted per hover, as upstream does, so the spring starts at the pointer instead of sliding in.
function TrackedDatePill({ index, x }: { index: number; x: number }) {
  const { containerRef, dateLabels, margin, width } = useChartStable()
  const { tooltipSpring } = useChartConfig()
  const target = x + margin.left
  const discrete = dateLabels.length > 60
  const left = useSpring(target, tooltipSpring)
  if (!discrete) left.set(target)

  const container = containerRef.current
  if (!container) return null

  // Clamped in CSS so it follows the spring and the ticker's animated width frame by frame:
  // `translate` percentages resolve against the pill's own width.
  return createPortal(
    <motion.div
      className="pointer-events-none absolute z-50"
      style={
        {
          '--pill-x': discrete ? target : left,
          left: 'calc(var(--pill-x) * 1px)',
          translate: `clamp(calc(var(--pill-x) * -1px), -50%, calc(${width}px - var(--pill-x) * 1px - 100%))`,
          bottom: 4,
        } as MotionStyle
      }
    >
      <DateTicker currentIndex={index} labels={dateLabels} visible />
    </motion.div>,
    container,
  )
}
