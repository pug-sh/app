import {
  Granularity,
  InsightType,
  AggregationType,
  type Series,
} from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { insightsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import { cn } from '@/lib/utils'
import { useAtomValue } from 'jotai'
import { Loader2, Play, Plus, TrendingUp, Users, X } from 'lucide-react'
import { useRef, useState } from 'react'
import ProjectLink from '@/components/project-link'

// ── Constants ───────────────────────────────────────────────────────────────

const SERIES_COLORS = [
  { line: '#5b5bd6', fill: 'rgba(91,91,214,0.08)', dot: '#5b5bd6' },
  { line: '#e5484d', fill: 'rgba(229,72,77,0.08)', dot: '#e5484d' },
  { line: '#30a46c', fill: 'rgba(48,164,108,0.08)', dot: '#30a46c' },
  { line: '#e38c18', fill: 'rgba(227,140,24,0.08)', dot: '#e38c18' },
  { line: '#6e56cf', fill: 'rgba(110,86,207,0.08)', dot: '#6e56cf' },
]

const timeRanges = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '14d', ms: 14 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
] as const

const granularities = [
  { label: 'Hour', value: Granularity.HOUR },
  { label: 'Day', value: Granularity.DAY },
  { label: 'Week', value: Granularity.WEEK },
  { label: 'Month', value: Granularity.MONTH },
] as const

const aggregations = [
  { label: 'Total events', value: AggregationType.TOTAL },
  { label: 'Unique users', value: AggregationType.UNIQUE_USERS },
  { label: 'Avg per user', value: AggregationType.PER_USER_AVG },
] as const

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
    return (
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ', ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    )
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
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

// ── Pill Selector ───────────────────────────────────────────────────────────

const PillGroup = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) => {
  return (
    <div className='inline-flex rounded-lg border border-border bg-muted/30 p-0.5'>
      {options.map(opt => (
        <button
          key={String(opt.value)}
          type='button'
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer',
            opt.value === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── SVG Line Chart ──────────────────────────────────────────────────────────

interface ChartPoint {
  date: Date
  values: number[]
}

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
        <div
          className='absolute top-2 pointer-events-none z-10 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm'
          style={{
            left: `${(xScale(hoverIdx) / W) * 100}%`,
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
              <td className='py-2 pr-2 text-xs text-muted-foreground'>{formatAxisDate(d.date, granularity)}</td>
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

  const [eventKinds, setEventKinds] = useState<string[]>([''])
  const [rangeIdx, setRangeIdx] = useState(1)
  const [granularity, setGranularity] = useState(Granularity.DAY)
  const [aggregation, setAggregation] = useState(AggregationType.TOTAL)
  const [tab, setTab] = useState('trends')

  const [series, setSeries] = useState<Series[]>([])
  const [segmentIds, setSegmentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const addEvent = () => setEventKinds([...eventKinds, ''])
  const removeEvent = (idx: number) => setEventKinds(eventKinds.filter((_, i) => i !== idx))
  const updateEvent = (idx: number, val: string) => setEventKinds(eventKinds.map((e, i) => (i === idx ? val : e)))

  const validEvents = eventKinds.filter(e => e.trim())

  const handleTrendsQuery = async () => {
    if (validEvents.length === 0) return
    setLoading(true)
    try {
      const now = new Date()
      const from = new Date(now.getTime() - timeRanges[rangeIdx].ms)
      const resp = await insightsRPC.query(
        {
          insightType: InsightType.TRENDS,
          granularity,
          timeRange: { from: timestampFromDate(from), to: timestampFromDate(now) },
          events: validEvents.map(kind => ({ kind, aggregation, filters: [] })),
        },
        { headers }
      )
      setSeries(resp.series)
    } catch (err) {
      console.error('Insights query failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSegmentQuery = async () => {
    if (validEvents.length === 0) return
    setLoading(true)
    try {
      const now = new Date()
      const from = new Date(now.getTime() - timeRanges[rangeIdx].ms)
      const resp = await insightsRPC.segmentUsers(
        {
          timeRange: { from: timestampFromDate(from), to: timestampFromDate(now) },
          events: validEvents.map(kind => ({ kind, aggregation: AggregationType.TOTAL, filters: [] })),
          pageSize: 100,
        },
        { headers }
      )
      setSegmentIds(resp.distinctIds)
    } catch (err) {
      console.error('Segment query failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tab === 'trends') handleTrendsQuery()
    else handleSegmentQuery()
  }

  const seriesNames = series.map(s => s.eventKind || 'unknown')
  const chartData: ChartPoint[] =
    series.length > 0
      ? series[0].points.map((p, i) => ({
          date: tsToDate(p.time) ?? new Date(),
          values: series.map(s => Number(s.points[i]?.value) || 0),
        }))
      : []
  const allZero = chartData.every(d => d.values.every(v => v === 0))

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
    <Page title='Insights' description='Analyze event trends and user segments'>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className='mb-5'>
          <TabsTrigger value='trends'>
            <TrendingUp className='w-3.5 h-3.5' />
            Trends
          </TabsTrigger>
          <TabsTrigger value='segments'>
            <Users className='w-3.5 h-3.5' />
            Segments
          </TabsTrigger>
        </TabsList>

        {/* Query Builder */}
        <div className='mb-5'>
          <div className='flex items-center gap-2 mb-3'>
            <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Query</span>
            <div className='flex-1 h-px bg-border' />
          </div>
          <form onSubmit={handleSubmit}>
            <div className='flex flex-wrap items-center gap-2 mb-3'>
              {eventKinds.map((kind, i) => (
                <div key={i} className='flex items-center gap-1'>
                  <span
                    className='w-2 h-2 rounded-full shrink-0'
                    style={{ background: SERIES_COLORS[i % SERIES_COLORS.length].dot }}
                  />
                  <Input
                    placeholder='event_name'
                    value={kind}
                    onChange={e => updateEvent(i, e.target.value)}
                    className='w-40 h-7 text-sm'
                  />
                  {eventKinds.length > 1 && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-xs'
                      onClick={() => removeEvent(i)}
                      className='hover:bg-destructive/10 hover:text-destructive'
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
              <Button type='button' variant='ghost' size='sm' onClick={addEvent}>
                <Plus className='w-3 h-3' />
                Add
              </Button>
            </div>

            <div className='flex flex-wrap items-center gap-3'>
              <PillGroup
                options={timeRanges.map((t, i) => ({ label: t.label, value: i }))}
                value={rangeIdx}
                onChange={setRangeIdx}
              />

              {tab === 'trends' && (
                <>
                  <div className='w-px h-5 bg-border' />
                  <PillGroup options={granularities} value={granularity} onChange={setGranularity} />
                  <div className='w-px h-5 bg-border' />
                  <PillGroup options={aggregations} value={aggregation} onChange={setAggregation} />
                </>
              )}

              <Button type='submit' size='sm' disabled={loading || validEvents.length === 0} className='ml-auto'>
                {loading ? <Loader2 className='animate-spin' /> : <Play className='w-3.5 h-3.5' />}
                Run query
              </Button>
            </div>
          </form>
        </div>

        {/* Trends results */}
        <TabsContent value='trends'>
          {chartData.length > 0 ? (
            <div>
              <div className='flex items-center gap-2 mb-3'>
                <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>Results</span>
                <div className='flex-1 h-px bg-border' />
              </div>
              <SummaryStats series={seriesNames} data={chartData} />
              {allZero ? (
                <div className='flex items-center justify-center h-48 text-muted-foreground'>
                  <p className='text-sm'>No events recorded in this period</p>
                </div>
              ) : (
                <LineChart data={chartData} seriesNames={seriesNames} granularity={granularity} />
              )}
              <DataTable data={chartData} seriesNames={seriesNames} granularity={granularity} />
            </div>
          ) : (
            !loading && (
              <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
                <TrendingUp className='w-10 h-10 mb-4 opacity-15' />
                <p className='text-sm font-medium mb-1'>No data yet</p>
                <p className='text-xs'>Add event names above and click Run query</p>
              </div>
            )
          )}
        </TabsContent>

        {/* Segments results */}
        <TabsContent value='segments'>
          {segmentIds.length > 0 ? (
            <div>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                  Users found
                </span>
                <div className='flex-1 h-px bg-border' />
                <span className='text-[10px] text-muted-foreground'>{segmentIds.length}</span>
              </div>
              <table className='w-full'>
                <thead>
                  <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
                    <th className='py-2 pr-2 text-left font-medium w-16'>#</th>
                    <th className='py-2 pr-2 text-left font-medium'>Distinct ID</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentIds.map((id, i) => (
                    <tr key={id} className='border-b border-border/50 transition-colors hover:bg-muted/40'>
                      <td className='py-2 pr-2 text-muted-foreground tabular-nums text-xs'>{i + 1}</td>
                      <td className='py-2 pr-2 text-sm'>
                        <ProjectLink
                          href={`/activities/${encodeURIComponent(id)}`}
                          className='font-mono text-primary hover:underline underline-offset-4'
                        >
                          {id}
                        </ProjectLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !loading && (
              <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
                <Users className='w-10 h-10 mb-4 opacity-15' />
                <p className='text-sm font-medium mb-1'>Find your users</p>
                <p className='text-xs'>Add event criteria and run a segment query</p>
              </div>
            )
          )}
        </TabsContent>
      </Tabs>
    </Page>
  )
}

export default Insights
