import * as React from 'react'
import * as RechartsPrimitive from 'recharts'
import { cn } from '@/lib/utils'

export type ChartConfig = {
  [k: string]: {
    label?: React.ReactNode
    color?: string
  }
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

const useChart = () => {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }
  return context
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        data-chart={chartId}
        className={cn(
          'flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke="#fff"]]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-reference-line_[stroke="#ccc"]]:stroke-border [&_.recharts-sector[stroke="#fff"]]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none',
          className,
        )}
        style={
          Object.entries(config).reduce<React.CSSProperties>((acc, [key, item]) => {
            if (item.color) (acc as Record<string, string>)[`--color-${key}`] = item.color
            return acc
          }, {}) as React.CSSProperties
        }
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = 'Chart'

export const ChartTooltip = RechartsPrimitive.Tooltip

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    active?: boolean
    payload?: Array<Record<string, unknown>>
    label?: string | number
    labelFormatter?: (label: string | number | undefined, payload: Array<Record<string, unknown>>) => React.ReactNode
    formatter?: (
      value: number | string | undefined,
      name: string | undefined,
      item: Record<string, unknown>,
      index: number,
      payload: unknown,
    ) => React.ReactNode
    hideLabel?: boolean
  }
>(({ active, payload, className, label, labelFormatter, formatter, hideLabel = false }, ref) => {
  const { config } = useChart()

  if (!active || !payload?.length) return null

  const renderedLabel = hideLabel ? null : labelFormatter ? labelFormatter(label, payload) : (label as React.ReactNode)

  return (
    <div
      ref={ref}
      className={cn(
        'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-popover px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {renderedLabel ? <div className="font-medium text-foreground">{renderedLabel}</div> : null}
      <div className="grid gap-1">
        {payload.map((item, index) => {
          const datum = item as Record<string, any>
          const key = String(datum.dataKey ?? '')
          const itemConfig = config[key]
          const indicatorColor = datum.color || datum.payload?.fill || `var(--color-${key})`
          const defaultName: React.ReactNode = itemConfig?.label || datum.name || key
          const value = datum.value as number | string | undefined

          return (
            <div key={`${key}-${index}`} className="flex w-full items-center gap-2">
              <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: indicatorColor }} />
              {formatter ? (
                formatter(value, datum.name as string | undefined, datum, index, datum.payload)
              ) : (
                <>
                  <span className="text-muted-foreground">{defaultName}</span>
                  <span className="ml-auto font-mono tabular-nums text-foreground">
                    {typeof value === 'number' ? value.toLocaleString() : String(value ?? '')}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
ChartTooltipContent.displayName = 'ChartTooltip'

export { useChart }
