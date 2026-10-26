import { MotionConfig, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { Link } from 'wouter'
import { AggregationType, TopKQuery_Dimension, type TopKRow } from '@/api/genproto/shared/insights/v1/insights_pb'
import { DEFAULT_CHART_ENTER_TRANSITION } from '@/components/charts/animation'
import { transitionWithDelay } from '@/components/charts/motion-utils'
import { getIndexedColor } from '@/lib/event-colors'
import { compactNumber } from '@/lib/format'
import { useProjectPrefix } from '@/lib/project-path'
import { propertyValueLabel } from '@/lib/property-values'
import { cn } from '@/lib/utils'
import { resolveIdentity } from '../../profiles/_identity'
import { EMPTY_VALUE_LABEL } from '../helpers'
import { topKShareInfo } from '../top-k'

const OTHERS_HINT = '$others: everything outside the top results, aggregated into a single bucket.'
const EMPTY_HINT = 'Events carrying no value for this property. Ranked as a real bucket, not an error.'

const formatValue = (value: number) => {
  if (Number.isInteger(value) || Math.abs(value) >= 1000) return compactNumber(value)
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// Full-precision value for the hover title; compactNumber drops digits ("1.2K").
const exactValue = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 6 })

// A shared dashboard has no project to link into.
const ProfileLink = ({ id, className, children }: { id: string; className?: string; children: ReactNode }) => {
  const prefix = useProjectPrefix()
  if (!prefix) return <span className={cn('block truncate', className)}>{children}</span>
  return (
    <Link
      href={`${prefix}/profiles/${encodeURIComponent(id)}`}
      className={cn('block truncate text-link hover:underline underline-offset-4', className)}
    >
      {children}
    </Link>
  )
}

const RowLabel = ({ row, dimension, property }: { row: TopKRow; dimension: TopKQuery_Dimension; property: string }) => {
  if (row.isOthers) {
    return (
      <span className="truncate font-mono text-muted-foreground" title={OTHERS_HINT}>
        $others
      </span>
    )
  }

  if (dimension === TopKQuery_Dimension.USER) {
    // Only identified profiles are attached; the rest link by raw id.
    if (!row.profile) {
      return (
        <ProfileLink id={row.dimensionValue} className="font-mono">
          {row.dimensionValue}
        </ProfileLink>
      )
    }
    const identity = resolveIdentity(row.profile)
    const secondary = identity.email || row.profile.externalId || row.profile.id
    return (
      <div className="min-w-0">
        <ProfileLink id={row.profile.id} className={identity.isFallback ? 'font-mono' : undefined}>
          {identity.name}
        </ProfileLink>
        {secondary && secondary !== identity.name && (
          <span className={cn('block truncate text-xs text-muted-foreground', !identity.email && 'font-mono')}>
            {secondary}
          </span>
        )}
      </div>
    )
  }

  // An empty value is a real bucket the backend ranks rather than drops (isOthers is
  // false on it), and it is routinely the largest row (untagged traffic outweighs any
  // single $utmSource), so a blank label would leave the top bar unexplained. Muted,
  // like $others, to read as a marker rather than a literal value.
  if (!row.dimensionValue) {
    return (
      <span className="block truncate text-muted-foreground" title={EMPTY_HINT}>
        {EMPTY_VALUE_LABEL}
      </span>
    )
  }

  // Property and event-kind values are arbitrary human-readable strings (search
  // terms, plan names, …), so render them in the regular font, not mono.
  return (
    <span className="block truncate" title={row.dimensionValue}>
      {propertyValueLabel(property, row.dimensionValue)}
    </span>
  )
}

// One-line coverage summary above the list: how many values are ranked and,
// for additive metrics, how much of the total they cover vs the $others bucket.
const CoverageSummary = ({
  rankedCount,
  othersShare,
  showShare,
}: {
  rankedCount: number
  othersShare: number | null
  showShare: boolean
}) => {
  const parts = [`Top ${rankedCount}`]
  if (showShare && othersShare !== null) {
    parts.push(`${((1 - othersShare) * 100).toFixed(1)}% of total`, `${(othersShare * 100).toFixed(1)}% in $others`)
  } else if (showShare) {
    parts.push('all values shown')
  }
  return <p className="shrink-0 text-xs text-muted-foreground tabular-nums">{parts.join(' · ')}</p>
}

// Ranked list for top-k results in the "row is the bar" style (see overview/traffic-ranked-list.tsx),
// with the vendored charts' enter transition and hover dimming. Rows arrive metric-descending with the
// synthetic $others bucket (identified by isOthers, not by label) last.
export const TopKList = ({
  rows,
  dimension,
  property = '',
  metric,
  omitOthers = false,
  compact = false,
}: {
  rows: TopKRow[]
  dimension: TopKQuery_Dimension
  property?: string
  metric: AggregationType
  omitOthers?: boolean
  compact?: boolean
}) => {
  const [hovered, setHovered] = useState<number | null>(null)
  const maxValue = Math.max(...rows.map(row => row.value), 0)
  const { total, rankedCount, showShare, othersShare } = topKShareInfo(rows, metric, omitOthers)
  const revealKey = rows.map(row => `${row.dimensionValue}:${row.value}`).join('|')
  // The rank control keeps its property across a dimension switch, so only property rows are named by it.
  const labelProperty = dimension === TopKQuery_Dimension.PROPERTY ? property : ''

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('flex flex-col gap-2', compact ? 'h-full min-h-0' : 'mt-2')}>
        <CoverageSummary rankedCount={rankedCount} othersShare={othersShare} showShare={showShare} />
        <div
          className={compact ? 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden' : undefined}
          onMouseLeave={() => setHovered(null)}
        >
          {rows.map((row, i) => {
            const fill = row.isOthers ? 'var(--muted-foreground)' : getIndexedColor(i).dot
            const barWidth = maxValue > 0 ? Math.max((row.value / maxValue) * 100, 0.5) : 0
            let barOpacity = row.isOthers ? 0.12 : 0.2
            if (hovered === i) barOpacity += 0.12
            return (
              <div
                key={row.isOthers ? '$__others' : `${i}-${row.dimensionValue}`}
                className={cn(
                  'relative mb-0.5 flex items-center gap-2 overflow-hidden rounded-md px-2 transition-opacity duration-200 last:mb-0',
                  compact ? 'py-1.5' : 'py-2',
                  hovered !== null && hovered !== i && 'opacity-45',
                )}
                onMouseEnter={() => setHovered(i)}
              >
                <motion.span
                  key={revealKey}
                  className="pointer-events-none absolute inset-y-0 left-0 origin-left rounded-md transition-opacity duration-200"
                  style={{ width: `${barWidth}%`, background: fill, opacity: barOpacity }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={transitionWithDelay(DEFAULT_CHART_ENTER_TRANSITION, Math.min(i, 12) * 0.04)}
                />
                <span className="relative w-5 shrink-0 text-right text-xs font-mono tabular-nums text-faint">
                  {row.isOthers ? '·' : i + 1}
                </span>
                <div className="relative min-w-0 flex-1 text-xs">
                  <RowLabel row={row} dimension={dimension} property={labelProperty} />
                </div>
                <span
                  className="relative w-16 shrink-0 text-right text-xs font-medium tabular-nums"
                  title={`${exactValue(row.value)}${row.isOthers ? `. ${OTHERS_HINT}` : ''}`}
                >
                  {formatValue(row.value)}
                </span>
                {showShare && (
                  <span className="relative w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {((row.value / total) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </MotionConfig>
  )
}
