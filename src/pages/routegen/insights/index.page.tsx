import {
  Granularity,
  InsightType,
  AggregationType,
  type Series,
} from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { DateRangePicker, fmtDate, INSIGHTS_PRESETS, type TimeRange } from '@/components/date-range-picker'
import { EventChip, FilterBuilder, FilterChip, type ActiveFilter } from '@/components/event-filters'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { fetchFilterSchemaAtom, filterSchemaAtom, filterSchemaErrorAtom } from '../events/filter-schema.atoms'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import { cn } from '@/lib/utils'
import { useAtomValue, useSetAtom } from 'jotai'
import { type LucideIcon, BarChart3, Clock, Loader2, Ruler, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// ── Constants ───────────────────────────────────────────────────────────────

const SERIES_COLORS = [
  { line: '#5b5bd6', fill: 'rgba(91,91,214,0.08)', dot: '#5b5bd6' },
  { line: '#e5484d', fill: 'rgba(229,72,77,0.08)', dot: '#e5484d' },
  { line: '#30a46c', fill: 'rgba(48,164,108,0.08)', dot: '#30a46c' },
  { line: '#e38c18', fill: 'rgba(227,140,24,0.08)', dot: '#e38c18' },
  { line: '#6e56cf', fill: 'rgba(110,86,207,0.08)', dot: '#6e56cf' },
]

const GRANULARITIES = [
  { label: 'Hour', value: Granularity.HOUR },
  { label: 'Day', value: Granularity.DAY },
  { label: 'Week', value: Granularity.WEEK },
  { label: 'Month', value: Granularity.MONTH },
] as const

const AGGREGATIONS = [
  { label: 'Total events', value: AggregationType.TOTAL },
  { label: 'Unique users', value: AggregationType.UNIQUE_USERS },
  { label: 'Avg per user', value: AggregationType.PER_USER_AVG },
] as const

type ViewMode = 'line' | 'bar-grouped' | 'bar-stacked' | 'table'

const VIEW_MODES: readonly { label: string; value: ViewMode }[] = [
  { label: 'Line', value: 'line' },
  { label: 'Bar (grouped)', value: 'bar-grouped' },
  { label: 'Bar (stacked)', value: 'bar-stacked' },
  { label: 'Table', value: 'table' },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

const tsToDate = (ts: Timestamp | undefined): Date | null => {
  if (!ts) return null
  try {
    return timestampDate(ts)
  } catch {
    return null
  }
}

const formatAxisDate = (d: Date, granularity: Granularity): string => {
  if (granularity === Granularity.HOUR)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (granularity === Granularity.MONTH) return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatTooltipDate = (d: Date, granularity: Granularity): string => {
  if (granularity === Granularity.HOUR)
    return fmtDate(d) + ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (granularity === Granularity.WEEK) {
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    return fmtDate(d) + ' – ' + fmtDate(end)
  }
  if (granularity === Granularity.MONTH) {
    const thisYear = new Date().getFullYear()
    return d.toLocaleDateString('en-US', { month: 'long', ...(d.getFullYear() !== thisYear && { year: 'numeric' }) })
  }
  return fmtDate(d)
}

const formatNum = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

const niceMax = (v: number): number => {
  if (v <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

// ── Option Chip ─────────────────────────────────────────────────────────────

const OptionChip = <T extends string | number>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
}: {
  label: string
  icon?: LucideIcon
  options: readonly { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) => {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className='inline-flex items-center text-xs border border-border rounded-md overflow-hidden h-7 cursor-pointer hover:bg-muted/40 transition-colors'>
        <span className='px-2 text-muted-foreground bg-muted/50 h-full flex items-center text-[11px] gap-1'>
          {Icon && <Icon className='w-3 h-3' />}
          {label}
        </span>
        <span className='px-2 h-full flex items-center'>{current?.label}</span>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-1'>
        <div className='flex flex-col gap-0.5'>
          {options.map(opt => (
            <button
              key={String(opt.value)}
              type='button'
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={cn(
                'px-3 py-1.5 text-xs text-left rounded-md transition-colors cursor-pointer',
                opt.value === value
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Chart Tooltip ───────────────────────────────────────────────────────────

interface ChartPoint {
  date: Date
  values: number[]
}

const ChartTooltip = ({
  data,
  hoverIdx,
  seriesNames,
  granularity,
  xPct,
}: {
  data: ChartPoint[]
  hoverIdx: number
  seriesNames: string[]
  granularity: Granularity
  xPct: number
}) => (
  <div
    className='absolute top-2 pointer-events-none z-10 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm'
    style={{
      left: `${xPct}%`,
      transform: hoverIdx > data.length / 2 ? 'translateX(-100%)' : 'translateX(0)',
    }}
  >
    <p className='text-xs text-muted-foreground mb-1.5 font-medium'>
      {formatTooltipDate(data[hoverIdx].date, granularity)}
    </p>
    {seriesNames.map((name, si) => (
      <div key={si} className='flex items-center gap-2 py-0.5'>
        <span
          className='w-2 h-2 rounded-full shrink-0'
          style={{ background: SERIES_COLORS[si % SERIES_COLORS.length].dot }}
        />
        <span className='text-muted-foreground flex-1'>{name}</span>
        <span className='font-mono font-medium tabular-nums'>
          {(data[hoverIdx].values[si] ?? 0).toLocaleString()}
        </span>
      </div>
    ))}
  </div>
)

// ── SVG Line Chart ──────────────────────────────────────────────────────────

const LineChart = ({
  data,
  seriesNames,
  granularity,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  granularity: Granularity
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length === 0) return null

  const W = 800,
    H = 280
  const pad = { top: 20, right: 24, bottom: 36, left: 52 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom

  const allVals = data.flatMap(d => d.values)
  const rawMax = Math.max(...allVals, 0)
  const yMax = niceMax(rawMax)
  const yTicks = 5
  const yStep = yMax / yTicks

  const xScale = (i: number) => pad.left + (i / Math.max(data.length - 1, 1)) * cw
  const yScale = (v: number) => pad.top + ch - (v / yMax) * ch

  const paths = seriesNames.map((_, si) => {
    const pts = data.map((d, i) => ({ x: xScale(i), y: yScale(d.values[si] ?? 0) }))
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const area = line + ` L${pts[pts.length - 1].x},${yScale(0)} L${pts[0].x},${yScale(0)} Z`
    return { line, area, pts }
  })

  const labelStep = Math.max(1, Math.ceil(data.length / 8))

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round(((mx - pad.left) / cw) * (data.length - 1))
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)))
  }

  return (
    <div className='relative'>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className='w-full h-auto'
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const y = yScale(i * yStep)
          return (
            <g key={i}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke='currentColor' strokeOpacity={0.06} />
              <text x={pad.left - 8} y={y + 4} textAnchor='end' className='fill-muted-foreground' fontSize={10}>
                {formatNum(i * yStep)}
              </text>
            </g>
          )
        })}

        {paths.map((p, si) => (
          <path key={`area-${si}`} d={p.area} fill={SERIES_COLORS[si % SERIES_COLORS.length].fill} />
        ))}

        {paths.map((p, si) => (
          <path
            key={`line-${si}`}
            d={p.line}
            fill='none'
            stroke={SERIES_COLORS[si % SERIES_COLORS.length].line}
            strokeWidth={2}
            strokeLinejoin='round'
          />
        ))}

        {hoverIdx !== null &&
          paths.map((p, si) => (
            <circle
              key={`dot-${si}`}
              cx={p.pts[hoverIdx].x}
              cy={p.pts[hoverIdx].y}
              r={4}
              fill={SERIES_COLORS[si % SERIES_COLORS.length].dot}
              stroke='white'
              strokeWidth={2}
            />
          ))}

        {hoverIdx !== null && (
          <line
            x1={xScale(hoverIdx)}
            x2={xScale(hoverIdx)}
            y1={pad.top}
            y2={pad.top + ch}
            stroke='currentColor'
            strokeOpacity={0.1}
            strokeDasharray='3,3'
          />
        )}

        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null
          return (
            <text key={i} x={xScale(i)} y={H - 8} textAnchor='middle' className='fill-muted-foreground' fontSize={10}>
              {formatAxisDate(d.date, granularity)}
            </text>
          )
        })}

        {data.map((_, i) => (
          <rect
            key={`zone-${i}`}
            x={xScale(i) - cw / data.length / 2}
            y={pad.top}
            width={cw / data.length}
            height={ch}
            fill='transparent'
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
      </svg>

      {hoverIdx !== null && (
        <ChartTooltip data={data} hoverIdx={hoverIdx} seriesNames={seriesNames} granularity={granularity} xPct={(xScale(hoverIdx) / W) * 100} />
      )}
    </div>
  )
}

// ── SVG Bar Chart ──────────────────────────────────────────────────────────

const BarChart = ({
  data,
  seriesNames,
  granularity,
  stacked,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  granularity: Granularity
  stacked: boolean
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length === 0) return null

  const W = 800,
    H = 280
  const pad = { top: 20, right: 24, bottom: 36, left: 52 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom
  const n = data.length
  const sc = seriesNames.length

  const allVals = stacked
    ? data.map(d => d.values.reduce((a, b) => a + b, 0))
    : data.flatMap(d => d.values)
  const rawMax = Math.max(...allVals, 0)
  const yMax = niceMax(rawMax)
  const yTicks = 5
  const yStep = yMax / yTicks

  const yScale = (v: number) => pad.top + ch - (v / yMax) * ch
  const bandW = cw / n
  const barGap = Math.max(1, bandW * 0.15)
  const barArea = bandW - barGap
  const barW = stacked ? barArea : barArea / sc

  const labelStep = Math.max(1, Math.ceil(n / 8))

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.floor((mx - pad.left) / bandW)
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)))
  }

  return (
    <div className='relative'>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className='w-full h-auto'
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const y = yScale(i * yStep)
          return (
            <g key={i}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke='currentColor' strokeOpacity={0.06} />
              <text x={pad.left - 8} y={y + 4} textAnchor='end' className='fill-muted-foreground' fontSize={10}>
                {formatNum(i * yStep)}
              </text>
            </g>
          )
        })}

        {data.map((d, i) => {
          const x0 = pad.left + i * bandW + barGap / 2
          if (stacked) {
            let cumY = 0
            return (
              <g key={i}>
                {d.values.map((v, si) => {
                  const barH = (v / yMax) * ch
                  cumY += barH
                  return (
                    <rect
                      key={si}
                      x={x0}
                      y={pad.top + ch - cumY}
                      width={barArea}
                      height={barH}
                      rx={2}
                      fill={SERIES_COLORS[si % SERIES_COLORS.length].line}
                      opacity={hoverIdx !== null && hoverIdx !== i ? 0.4 : 0.85}
                    />
                  )
                })}
              </g>
            )
          }
          return (
            <g key={i}>
              {d.values.map((v, si) => {
                const barH = (v / yMax) * ch
                return (
                  <rect
                    key={si}
                    x={x0 + si * barW}
                    y={pad.top + ch - barH}
                    width={barW - 1}
                    height={barH}
                    rx={2}
                    fill={SERIES_COLORS[si % SERIES_COLORS.length].line}
                    opacity={hoverIdx !== null && hoverIdx !== i ? 0.4 : 0.85}
                  />
                )
              })}
            </g>
          )
        })}

        {hoverIdx !== null && (
          <line
            x1={pad.left + hoverIdx * bandW + bandW / 2}
            x2={pad.left + hoverIdx * bandW + bandW / 2}
            y1={pad.top}
            y2={pad.top + ch}
            stroke='currentColor'
            strokeOpacity={0.1}
            strokeDasharray='3,3'
          />
        )}

        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null
          return (
            <text
              key={i}
              x={pad.left + i * bandW + bandW / 2}
              y={H - 8}
              textAnchor='middle'
              className='fill-muted-foreground'
              fontSize={10}
            >
              {formatAxisDate(d.date, granularity)}
            </text>
          )
        })}

        {data.map((_, i) => (
          <rect
            key={`zone-${i}`}
            x={pad.left + i * bandW}
            y={pad.top}
            width={bandW}
            height={ch}
            fill='transparent'
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
      </svg>

      {hoverIdx !== null && (
        <ChartTooltip data={data} hoverIdx={hoverIdx} seriesNames={seriesNames} granularity={granularity} xPct={((pad.left + hoverIdx * bandW + bandW / 2) / W) * 100} />
      )}
    </div>
  )
}

// ── Summary Stats ───────────────────────────────────────────────────────────

const SummaryStats = ({ series, data }: { series: string[]; data: ChartPoint[] }) => {
  return (
    <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1'>
      {series.map((name, si) => {
        const vals = data.map(d => d.values[si] ?? 0)
        const total = vals.reduce((a, b) => a + b, 0)
        const avg = vals.length > 0 ? total / vals.length : 0
        const max = Math.max(...vals, 0)
        return (
          <div key={si} className='flex items-start gap-2'>
            <span
              className='w-2 h-2 rounded-full mt-1.5 shrink-0'
              style={{ background: SERIES_COLORS[si % SERIES_COLORS.length].dot }}
            />
            <div className='min-w-0'>
              <p className='text-xs text-muted-foreground truncate'>{name}</p>
              <p className='text-lg font-semibold tabular-nums tracking-tight'>{formatNum(total)}</p>
              <p className='text-[11px] text-muted-foreground'>
                avg {formatNum(Math.round(avg))} &middot; peak {formatNum(max)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Data Table ──────────────────────────────────────────────────────────────

const DataTable = ({
  data,
  seriesNames,
  granularity,
}: {
  data: ChartPoint[]
  seriesNames: string[]
  granularity: Granularity
}) => {
  if (data.length === 0) return null
  return (
    <div className='max-h-64 overflow-y-auto mt-4'>
      <table className='w-full'>
        <thead>
          <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
            <th className='py-2 pr-2 text-left font-medium sticky top-0 bg-background'>Date</th>
            {seriesNames.map((name, i) => (
              <th key={i} className='py-2 pr-2 text-right font-medium sticky top-0 bg-background'>
                <span className='flex items-center gap-1.5 justify-end'>
                  <span
                    className='w-2 h-2 rounded-full'
                    style={{ background: SERIES_COLORS[i % SERIES_COLORS.length].dot }}
                  />
                  {name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} className='border-b border-border/50 transition-colors hover:bg-muted/40'>
              <td className='py-2 pr-2 text-xs text-muted-foreground'>{formatTooltipDate(d.date, granularity)}</td>
              {d.values.map((v, si) => (
                <td key={si} className='py-2 pr-2 text-right font-mono text-sm tabular-nums'>
                  {v.toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const Insights = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const insightsRPC = useAtomValue(insightsRPCAtom)
  const schema = useAtomValue(filterSchemaAtom)
  const schemaError = useAtomValue(filterSchemaErrorAtom)
  const fetchSchema = useSetAtom(fetchFilterSchemaAtom)

  const [eventKinds, setEventKinds] = useState<string[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(() => INSIGHTS_PRESETS[0].resolve())
  const [granularity, setGranularity] = useState(Granularity.DAY)
  const [aggregation, setAggregation] = useState(AggregationType.TOTAL)
  const [viewMode, setViewMode] = useState<ViewMode>('line')
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>([])

  const [series, setSeries] = useState<Series[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (project) fetchSchema()
  }, [project, fetchSchema])

  const updateEvent = (idx: number, val: string) => {
    if (!val) {
      setEventKinds(eventKinds.filter((_, i) => i !== idx))
    } else {
      setEventKinds(eventKinds.map((e, i) => (i === idx ? val : e)))
    }
  }

  const addFilter = (f: ActiveFilter) => setPropFilters(prev => [...prev, f])
  const updateFilter = (idx: number, f: ActiveFilter) => setPropFilters(prev => prev.map((x, i) => i === idx ? f : x))
  const removeFilter = (idx: number) => setPropFilters(prev => prev.filter((_, i) => i !== idx))

  // Auto-run query when params change
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryKey = JSON.stringify({ eventKinds, timeRange, granularity, aggregation, propFilters })

  useEffect(() => {
    const events = eventKinds.filter(e => e.trim())
    if (!project || events.length === 0 || !timeRange) return

    const filters = propFilters.map(f => ({
      property: f.property,
      operator: f.operator,
      value: f.value,
      values: f.values,
    }))

    let cancelled = false
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await insightsRPC.query(
          {
            insightType: InsightType.TRENDS,
            granularity,
            timeRange: { from: timestampFromDate(timeRange.from), to: timestampFromDate(timeRange.to) },
            events: events.map(kind => ({ kind, aggregation, filters })),
          },
          { headers }
        )
        if (!cancelled) setSeries(resp.series)
      } catch (err) {
        console.error('Insights query failed:', err)
        if (!cancelled) { setSeries([]); setError('Failed to load insights') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(debounceRef.current) }
  }, [queryKey, project, insightsRPC, headers])

  const seriesNames = series.map(s => s.eventKind || 'unknown')
  const chartData: ChartPoint[] =
    series.length > 0
      ? series[0].points.map((p, i) => ({
          date: tsToDate(p.time) ?? new Date(),
          values: series.map(s => Number(s.points[i]?.value) || 0),
        }))
      : []
  const allZero = chartData.every(d => d.values.every(v => v === 0))

  const renderChart = () => {
    if (allZero) {
      return (
        <div className='flex items-center justify-center h-48 text-muted-foreground'>
          <p className='text-sm'>No events recorded in this period</p>
        </div>
      )
    }
    if (viewMode === 'line') return <LineChart data={chartData} seriesNames={seriesNames} granularity={granularity} />
    if (viewMode === 'table') return <DataTable data={chartData} seriesNames={seriesNames} granularity={granularity} />
    return <BarChart data={chartData} seriesNames={seriesNames} granularity={granularity} stacked={viewMode === 'bar-stacked'} />
  }

  if (!project) {
    return (
      <Page title='Insights'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <TrendingUp className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title='Insights' description='Analyze event trends'>
      {/* Query config */}
        <div className='space-y-2 mb-5'>
          <div className='flex flex-wrap items-center gap-2'>
            <DateRangePicker value={timeRange} onChange={setTimeRange} presets={INSIGHTS_PRESETS} />
            <OptionChip label='granularity' icon={Clock} options={GRANULARITIES} value={granularity} onChange={setGranularity} />
            <OptionChip label='measure' icon={Ruler} options={AGGREGATIONS} value={aggregation} onChange={setAggregation} />
            <OptionChip label='view' icon={BarChart3} options={VIEW_MODES} value={viewMode} onChange={setViewMode} />
          </div>

          {/* Events + filters */}
          <div className='flex flex-wrap items-center gap-2'>
            {eventKinds.map((kind, i) => (
              <span key={i} className='inline-flex items-center gap-1.5'>
                <span
                  className='w-2 h-2 rounded-full shrink-0'
                  style={{ background: SERIES_COLORS[i % SERIES_COLORS.length].dot }}
                />
                <EventChip
                  value={kind}
                  onChange={v => updateEvent(i, v)}
                  events={schema?.events ?? []}
                  schemaError={schemaError}
                />
              </span>
            ))}
            <EventChip
              value=''
              onChange={v => { if (v) setEventKinds([...eventKinds, v]) }}
              events={schema?.events ?? []}
              schemaError={schemaError}
            />
            {propFilters.map((f, i) => (
              <FilterChip
                key={`f-${i}`}
                filter={f}
                schema={schema}
                onRemove={() => removeFilter(i)}
                onUpdate={next => updateFilter(i, next)}
              />
            ))}
            <FilterBuilder schema={schema} schemaError={schemaError} onAdd={addFilter} />
            {loading && <Loader2 className='w-3.5 h-3.5 animate-spin text-muted-foreground ml-1' />}
          </div>
        </div>

        {error ? (
          <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
            <TrendingUp className='w-10 h-10 mb-4 opacity-15' />
            <p className='text-sm font-medium mb-1'>{error}</p>
          </div>
        ) : chartData.length > 0 ? (
          <div>
            <SummaryStats series={seriesNames} data={chartData} />
            {renderChart()}
            {viewMode !== 'table' && (
              <DataTable data={chartData} seriesNames={seriesNames} granularity={granularity} />
            )}
          </div>
        ) : (
          !loading && (
            <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
              <TrendingUp className='w-10 h-10 mb-4 opacity-15' />
              <p className='text-sm font-medium mb-1'>No data yet</p>
              <p className='text-xs'>Pick an event above to start</p>
            </div>
          )
        )}
    </Page>
  )
}

export default Insights
