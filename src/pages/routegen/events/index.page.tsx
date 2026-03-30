import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { FilterOperator } from '@/api/genproto/common/v1/filters_pb'
import { activityRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import HoverSwap from '@/components/hover-swap'
import { formatRelative } from '@/hooks/use-relative-time'
import ProjectLink from '@/components/project-link'
import { structGet, structToEntries } from '@/lib/struct'
import { cn } from '@/lib/utils'
import { useAtomValue } from 'jotai'
import { Toggle } from '@/components/ui/toggle'
import { Braces, Check, ChevronDown, ChevronRight, List, Loader2, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

// ── Helpers ─────────────────────────────────────────────────────────────────

const tsToDate = (ts: Timestamp | undefined): Date | null => {
  if (!ts) return null
  try {
    return timestampDate(ts)
  } catch {
    return null
  }
}

const formatAbsolute = (d: Date): string => {
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })
  )
}

const COLOR_PALETTE = [
  { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  { bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-400' },
  { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400' },
  { bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-700 dark:text-cyan-400' },
  { bg: 'bg-pink-500/10', text: 'text-pink-700 dark:text-pink-400' },
  { bg: 'bg-teal-500/10', text: 'text-teal-700 dark:text-teal-400' },
]

const FIXED_KIND_COLORS: Record<string, number> = {
  click: 0,
  form_start: 1,
  form_submit: 2,
  rage_click: 4,
  dead_click: 6,
  page_view: 3,
  scroll: 5,
}

const hashString = (s: string): number => {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const kindStyle = (kind: string): { bg: string; text: string } => {
  if (kind in FIXED_KIND_COLORS) {
    return COLOR_PALETTE[FIXED_KIND_COLORS[kind]]
  }
  return COLOR_PALETTE[hashString(kind) % COLOR_PALETTE.length]
}

// ── Filter Constants ─────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '14d', ms: 14 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
] as const

const OPERATORS: readonly { value: FilterOperator; label: string; symbol: string; noValue?: boolean }[] = [
  { value: FilterOperator.EQUALS, label: 'equals', symbol: '=' },
  { value: FilterOperator.NOT_EQUALS, label: 'not equals', symbol: '≠' },
  { value: FilterOperator.CONTAINS, label: 'contains', symbol: '~' },
  { value: FilterOperator.NOT_CONTAINS, label: 'not contains', symbol: '!~' },
  { value: FilterOperator.IS_SET, label: 'is set', symbol: 'is set', noValue: true },
  { value: FilterOperator.IS_NOT_SET, label: 'is not set', symbol: 'is not set', noValue: true },
  { value: FilterOperator.GT, label: 'greater than', symbol: '>' },
  { value: FilterOperator.GTE, label: 'greater or equal', symbol: '≥' },
  { value: FilterOperator.LT, label: 'less than', symbol: '<' },
  { value: FilterOperator.LTE, label: 'less or equal', symbol: '≤' },
]

interface ActiveFilter {
  property: string
  operator: FilterOperator
  value: string
}

// ── Filter Pill ──────────────────────────────────────────────────────────────

const FilterPill = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className='inline-flex items-center gap-1.5 text-xs bg-primary/5 border border-primary/15 text-foreground rounded-full px-2.5 py-0.5'>
    {label}
    <button type='button' onClick={onRemove} className='text-muted-foreground hover:text-foreground cursor-pointer'>
      <X className='w-3 h-3' />
    </button>
  </span>
)

// ── Event Row ───────────────────────────────────────────────────────────────

const EventRow = ({ event }: { event: ActivityEvent }) => {
  const [expanded, setExpanded] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)
  const d = tsToDate(event.occurTime)
  const autoProps = structToEntries(event.autoProperties)
  const customProps = structToEntries(event.customProperties)
  const inlineProps = customProps.slice(0, 3)
  const hasMore = autoProps.length > 0 || customProps.length > 3
  const colors = kindStyle(event.kind)
  const platform = structGet(event.autoProperties, '$platform')
  const osVersion = structGet(event.autoProperties, '$os_version')
  const city = structGet(event.autoProperties, '$city')
  const country = structGet(event.autoProperties, '$country')

  return (
    <>
      <tr
        className={cn(
          'group border-b border-border/50 transition-colors',
          hasMore && 'cursor-pointer hover:bg-muted/40'
        )}
        onClick={() => hasMore && setExpanded(!expanded)}
      >
        <td className='py-2.5 pr-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap align-middle w-[120px]'>
          {d && <HoverSwap primary={formatRelative(d)} secondary={formatAbsolute(d)} />}
        </td>
        <td className='py-2.5 pr-2 align-middle'>
          <Badge variant='secondary' className={cn('text-[11px] font-medium px-2 py-0.5', colors.bg, colors.text)}>
            {event.kind}
          </Badge>
        </td>
        <td className='py-2.5 pr-2 text-xs text-muted-foreground whitespace-nowrap align-middle'>
          {(city || country) && [city, country].filter(Boolean).join(', ')}
        </td>
        <td className='py-2.5 pr-2 text-xs text-muted-foreground whitespace-nowrap align-middle'>
          {(platform || osVersion) && [platform, osVersion].filter(Boolean).join(' ')}
        </td>
        <td className='py-2.5 pr-2 align-middle'>
          {inlineProps.length > 0 && (
            <div className='flex items-center gap-2 overflow-hidden'>
              {inlineProps.map(([k, v]) => (
                <span key={k} className='text-[11px] text-muted-foreground whitespace-nowrap'>
                  {k}: <span className='font-mono'>{v}</span>
                </span>
              ))}
            </div>
          )}
        </td>
        <td className='py-2.5 pr-2 text-right whitespace-nowrap align-middle'>
          <ProjectLink
            href={`/activities/${encodeURIComponent(event.distinctId)}`}
            onClick={e => e.stopPropagation()}
            className='text-xs font-mono text-primary hover:underline underline-offset-4'
          >
            {event.distinctId}
          </ProjectLink>
          {event.sessionId && (
            <>
              <span className='text-muted-foreground/40'> / </span>
              <ProjectLink
                href={`/activities/${encodeURIComponent(event.distinctId)}/${encodeURIComponent(event.sessionId)}`}
                onClick={e => e.stopPropagation()}
                className='text-xs font-mono text-primary hover:underline underline-offset-4'
              >
                {event.sessionId.slice(0, 8)}
              </ProjectLink>
            </>
          )}
        </td>
        <td className='py-2.5 w-5 align-middle'>
          {hasMore &&
            (expanded ? (
              <ChevronDown className='w-3.5 h-3.5 text-muted-foreground' />
            ) : (
              <ChevronRight className='w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity' />
            ))}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td className='pb-3 pt-1 align-top w-[120px]' onClick={e => e.stopPropagation()}>
            <Toggle size='sm' pressed={jsonMode} onPressedChange={setJsonMode}>
              <Braces className='w-3.5 h-3.5' />
            </Toggle>
          </td>
          <td colSpan={6} className='pb-3 pt-0'>
            {jsonMode ? (
              <pre className='text-xs font-mono bg-muted/50 rounded-t-none rounded-b-md p-3 overflow-x-auto whitespace-pre-wrap break-all'>
                {JSON.stringify(
                  {
                    event_id: event.eventId,
                    kind: event.kind,
                    distinct_id: event.distinctId,
                    session_id: event.sessionId || undefined,
                    occur_time: d?.toISOString(),
                    auto_properties: event.autoProperties,
                    custom_properties: event.customProperties,
                  },
                  null,
                  2
                )}
              </pre>
            ) : (
              <div className='space-y-2'>
                {autoProps.length > 0 && (
                  <div>
                    <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>
                      System
                    </p>
                    <div className='flex flex-wrap gap-1'>
                      {autoProps.map(([k, v]) => (
                        <span
                          key={k}
                          className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'
                        >
                          <span className='text-muted-foreground'>{k}</span>
                          <span className='font-mono'>{v}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {customProps.length > 0 && (
                  <div>
                    <p className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1'>
                      Custom
                    </p>
                    <div className='flex flex-wrap gap-1'>
                      {customProps.map(([k, v]) => (
                        <span
                          key={k}
                          className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'
                        >
                          <span className='text-muted-foreground'>{k}</span>
                          <span className='font-mono'>{v}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className='text-[10px] text-muted-foreground/40 font-mono'>{event.eventId}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const EventExplorer = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const activityRPC = useAtomValue(activityRPCAtom)

  // Text input state (not applied until Enter)
  const [kindInput, setKindInput] = useState('')
  const [userInput, setUserInput] = useState('')

  // Applied filter state (drives API calls)
  const [kindFilter, setKindFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [rangeIdx, setRangeIdx] = useState(2) // 14d
  const [propFilters, setPropFilters] = useState<ActiveFilter[]>([])

  // Add property filter UI
  const [addingFilter, setAddingFilter] = useState(false)
  const [newProp, setNewProp] = useState('')
  const [newOp, setNewOp] = useState<FilterOperator>(FilterOperator.EQUALS)
  const [newVal, setNewVal] = useState('')

  // Data
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextToken, setNextToken] = useState('')
  const [loading, setLoading] = useState(false)

  const newOpMeta = OPERATORS.find(o => o.value === newOp)

  const commitTextFilters = () => {
    setKindFilter(kindInput)
    setUserFilter(userInput)
  }

  const addFilter = () => {
    if (!newProp.trim()) return
    setPropFilters([
      ...propFilters,
      {
        property: newProp.trim(),
        operator: newOp,
        value: newOpMeta?.noValue ? '' : newVal.trim(),
      },
    ])
    setNewProp('')
    setNewOp(FilterOperator.EQUALS)
    setNewVal('')
    setAddingFilter(false)
  }

  const cancelAddFilter = () => {
    setNewProp('')
    setNewOp(FilterOperator.EQUALS)
    setNewVal('')
    setAddingFilter(false)
  }

  const fetchEvents = useCallback(
    async (pageToken = '') => {
      setLoading(true)
      try {
        const now = new Date()
        const from = new Date(now.getTime() - TIME_RANGES[rangeIdx].ms)
        const resp = await activityRPC.getEventExplorer(
          {
            distinctId: userFilter.trim() || undefined,
            kind: kindFilter.trim() || undefined,
            timeRange: { from: timestampFromDate(from), to: timestampFromDate(now) },
            propertyFilters: propFilters.map(f => ({
              property: f.property,
              operator: f.operator,
              value: f.value,
              values: [],
            })),
            pageSize: 100,
            pageToken,
          },
          { headers }
        )
        if (pageToken) {
          setEvents(prev => [...prev, ...resp.events])
        } else {
          setEvents(resp.events)
        }
        setNextToken(resp.nextPageToken)
      } catch (err) {
        console.error('Event explorer failed:', err)
      } finally {
        setLoading(false)
      }
    },
    [activityRPC, headers, kindFilter, userFilter, rangeIdx, propFilters]
  )

  useEffect(() => {
    if (project) fetchEvents()
  }, [project, fetchEvents])

  const hasActiveFilters = kindFilter || userFilter || propFilters.length > 0

  if (!project) {
    return (
      <Page title='Events'>
        <div className='flex flex-col items-center justify-center py-24 text-muted-foreground'>
          <List className='w-8 h-8 mb-3 opacity-20' />
          <p className='text-sm'>Select a project first</p>
        </div>
      </Page>
    )
  }

  return (
    <Page title='Events' description='Browse raw events across all users'>
      {/* Filter bar */}
      <div className='space-y-3 mb-5'>
        {/* Time range + count */}
        <div className='flex items-center gap-3'>
          <div className='inline-flex rounded-lg border border-border bg-muted/30 p-0.5'>
            {TIME_RANGES.map((range, i) => (
              <button
                key={range.label}
                type='button'
                onClick={() => setRangeIdx(i)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer',
                  i === rangeIdx
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
          {events.length > 0 && (
            <span className='ml-auto text-xs text-muted-foreground tabular-nums'>{events.length} events</span>
          )}
        </div>

        {/* Quick filters + add property */}
        <div className='flex items-center gap-2'>
          <Input
            placeholder='Event name'
            value={kindInput}
            onChange={e => setKindInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitTextFilters()
            }}
            className='w-40 h-7 text-sm'
          />
          <Input
            placeholder='User ID'
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitTextFilters()
            }}
            className='w-40 h-7 text-sm'
          />
          {!addingFilter && (
            <Button variant='outline' size='sm' onClick={() => setAddingFilter(true)} className='h-7 text-xs'>
              <Plus className='w-3 h-3' />
              Property
            </Button>
          )}
        </div>

        {/* Inline add property filter */}
        {addingFilter && (
          <div className='flex items-center gap-2'>
            <Input
              placeholder='e.g. $browser'
              value={newProp}
              onChange={e => setNewProp(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') cancelAddFilter()
              }}
              className='w-40 h-7 text-sm'
              autoFocus
            />
            <select
              value={newOp}
              onChange={e => setNewOp(Number(e.target.value) as FilterOperator)}
              className='h-7 text-xs rounded-md border border-input bg-background px-2 text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer'
            >
              {OPERATORS.map(op => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            {!newOpMeta?.noValue && (
              <Input
                placeholder='Value'
                value={newVal}
                onChange={e => setNewVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addFilter()
                  if (e.key === 'Escape') cancelAddFilter()
                }}
                className='w-40 h-7 text-sm'
              />
            )}
            <Button variant='ghost' size='sm' className='h-7 px-1.5' onClick={addFilter} disabled={!newProp.trim()}>
              <Check className='w-3.5 h-3.5' />
            </Button>
            <Button variant='ghost' size='sm' className='h-7 px-1.5' onClick={cancelAddFilter}>
              <X className='w-3.5 h-3.5' />
            </Button>
          </div>
        )}

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className='flex flex-wrap gap-1.5'>
            {kindFilter && (
              <FilterPill
                label={`event = ${kindFilter}`}
                onRemove={() => {
                  setKindFilter('')
                  setKindInput('')
                }}
              />
            )}
            {userFilter && (
              <FilterPill
                label={`user = ${userFilter}`}
                onRemove={() => {
                  setUserFilter('')
                  setUserInput('')
                }}
              />
            )}
            {propFilters.map((f, i) => {
              const op = OPERATORS.find(o => o.value === f.operator)
              const label = op?.noValue ? `${f.property} ${op.symbol}` : `${f.property} ${op?.symbol ?? '='} ${f.value}`
              return (
                <FilterPill
                  key={i}
                  label={label}
                  onRemove={() => setPropFilters(propFilters.filter((_, j) => j !== i))}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Results */}
      {loading && events.length === 0 ? (
        <div className='flex items-center justify-center py-24'>
          <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
        </div>
      ) : events.length > 0 ? (
        <>
          <table className='w-full'>
            <thead>
              <tr className='border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>
                <th className='py-2 pr-2 text-left font-medium'>Time</th>
                <th className='py-2 pr-2 text-left font-medium'>Event</th>
                <th className='py-2 pr-2 text-left font-medium'>Location</th>
                <th className='py-2 pr-2 text-left font-medium'>Platform</th>
                <th className='py-2 pr-2 text-left font-medium'>Properties</th>
                <th className='py-2 pr-2 text-right font-medium'>User / Session</th>
                <th className='w-5' />
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <EventRow key={event.eventId} event={event} />
              ))}
            </tbody>
          </table>

          {nextToken && (
            <div className='mt-4 mb-8'>
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                onClick={() => fetchEvents(nextToken)}
                disabled={loading}
              >
                {loading ? <Loader2 className='animate-spin' /> : 'Load more events'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className='flex flex-col items-center justify-center py-16'>
          <List className='w-10 h-10 mb-4 opacity-15' />
          <p className='text-sm font-medium mb-1'>No events found</p>
          <p className='text-xs text-muted-foreground'>Try adjusting filters or check a different time range</p>
        </div>
      )}
    </Page>
  )
}

export default EventExplorer
