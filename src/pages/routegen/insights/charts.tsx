import { Granularity } from '@/api/genproto/dashboard/insights/v1/insights_pb'
import { fmtDate } from '@/components/date-range-picker'
import { compactNumber } from '@/lib/format'
import { useRef, useState } from 'react'

// ── Constants ───────────────────────────────────────────────────────────────

export const SERIES_COLORS = [
  { line: '#5b5bd6', fill: 'rgba(91,91,214,0.08)', dot: '#5b5bd6' },
  { line: '#e5484d', fill: 'rgba(229,72,77,0.08)', dot: '#e5484d' },
  { line: '#30a46c', fill: 'rgba(48,164,108,0.08)', dot: '#30a46c' },
  { line: '#e38c18', fill: 'rgba(227,140,24,0.08)', dot: '#e38c18' },
  { line: '#6e56cf', fill: 'rgba(110,86,207,0.08)', dot: '#6e56cf' },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

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

const niceMax = (v: number): number => {
  if (v <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

// ── Chart Tooltip ───────────────────────────────────────────────────────────

export interface ChartPoint {
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

// ── Chart Layout Constants ──────────────────────────────────────────────────

const W = 800
const H = 280
const PAD = { top: 20, right: 24, bottom: 36, left: 52 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom
const Y_TICKS = 5

const yScale = (v: number, yMax: number) => PAD.top + CH - (v / yMax) * CH

// ── SVG Line Chart ──────────────────────────────────────────────────────────

export const LineChart = ({
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

  const allVals = data.flatMap(d => d.values)
  const rawMax = Math.max(...allVals, 0)
  const yMax = niceMax(rawMax)
  const yStep = yMax / Y_TICKS

  const xScale = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * CW

  const paths = seriesNames.map((_, si) => {
    const pts = data.map((d, i) => ({ x: xScale(i), y: yScale(d.values[si] ?? 0, yMax) }))
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const area = line + ` L${pts[pts.length - 1].x},${yScale(0, yMax)} L${pts[0].x},${yScale(0, yMax)} Z`
    return { line, area, pts }
  })

  const labelStep = Math.max(1, Math.ceil(data.length / 8))

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round(((mx - PAD.left) / CW) * (data.length - 1))
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
        {Array.from({ length: Y_TICKS + 1 }, (_, i) => {
          const y = yScale(i * yStep, yMax)
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke='currentColor' strokeOpacity={0.06} />
              <text x={PAD.left - 8} y={y + 4} textAnchor='end' className='fill-muted-foreground' fontSize={10}>
                {compactNumber(i * yStep)}
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
            y1={PAD.top}
            y2={PAD.top + CH}
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
            x={xScale(i) - CW / data.length / 2}
            y={PAD.top}
            width={CW / data.length}
            height={CH}
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

export const BarChart = ({
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

  const n = data.length
  const sc = seriesNames.length

  const allVals = stacked
    ? data.map(d => d.values.reduce((a, b) => a + b, 0))
    : data.flatMap(d => d.values)
  const rawMax = Math.max(...allVals, 0)
  const yMax = niceMax(rawMax)
  const yStep = yMax / Y_TICKS

  const bandW = CW / n
  const barGap = Math.max(1, bandW * 0.15)
  const barArea = bandW - barGap
  const barW = stacked ? barArea : barArea / sc

  const labelStep = Math.max(1, Math.ceil(n / 8))

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.floor((mx - PAD.left) / bandW)
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
        {Array.from({ length: Y_TICKS + 1 }, (_, i) => {
          const y = yScale(i * yStep, yMax)
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke='currentColor' strokeOpacity={0.06} />
              <text x={PAD.left - 8} y={y + 4} textAnchor='end' className='fill-muted-foreground' fontSize={10}>
                {compactNumber(i * yStep)}
              </text>
            </g>
          )
        })}

        {data.map((d, i) => {
          const x0 = PAD.left + i * bandW + barGap / 2
          if (stacked) {
            let cumY = 0
            return (
              <g key={i}>
                {d.values.map((v, si) => {
                  const barH = (v / yMax) * CH
                  cumY += barH
                  return (
                    <rect
                      key={si}
                      x={x0}
                      y={PAD.top + CH - cumY}
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
                const barH = (v / yMax) * CH
                return (
                  <rect
                    key={si}
                    x={x0 + si * barW}
                    y={PAD.top + CH - barH}
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
            x1={PAD.left + hoverIdx * bandW + bandW / 2}
            x2={PAD.left + hoverIdx * bandW + bandW / 2}
            y1={PAD.top}
            y2={PAD.top + CH}
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
              x={PAD.left + i * bandW + bandW / 2}
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
            x={PAD.left + i * bandW}
            y={PAD.top}
            width={bandW}
            height={CH}
            fill='transparent'
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
      </svg>

      {hoverIdx !== null && (
        <ChartTooltip data={data} hoverIdx={hoverIdx} seriesNames={seriesNames} granularity={granularity} xPct={((PAD.left + hoverIdx * bandW + bandW / 2) / W) * 100} />
      )}
    </div>
  )
}

// ── Summary Stats ───────────────────────────────────────────────────────────

export const SummaryStats = ({ series, data }: { series: string[]; data: ChartPoint[] }) => {
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
              <p className='text-lg font-semibold tabular-nums tracking-tight'>{compactNumber(total)}</p>
              <p className='text-[11px] text-muted-foreground'>
                avg {compactNumber(Math.round(avg))} &middot; peak {compactNumber(max)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Data Table ──────────────────────────────────────────────────────────────

export const DataTable = ({
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
